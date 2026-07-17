// REMOTE CONFIG & EXPERIMENTS (docs/ANALYTICS.md §ab) — the A/B-testing-ready layer.
// The server serves ONE sanitized document (flags + numeric configs + experiments); the
// client applies it through THIS whitelist so an edited or malicious payload can never
// reach outside its lane. HARD RULE (determinism): remote values may steer META and UI
// presentation only — nothing here may feed the deterministic sim, replays, or goldens.
// The whitelist is the enforcement: every key names a meta/UI seam, and the bounds keep
// even those seams inside design tolerances.
//
// Experiment assignment is a pure deterministic hash of (playerId, salt): the same player
// always lands in the same bucket on every device with no server round-trip, and the
// bucket is emitted once as an `ab_assign` analytics event so every dashboard series can
// segment by it. Pure module: no DOM, no fetch, no Math.random.

export interface RemoteFlagDef { key: string; doc: string; def: boolean }
export interface RemoteNumberDef { key: string; doc: string; def: number; min: number; max: number }

/** Feature flags the client will honor (UI/meta seams only — the determinism whitelist). */
export const REMOTE_FLAGS: RemoteFlagDef[] = [
  { key: 'ui.flashOffers', doc: 'Flash offer popups may appear at all.', def: true },
  { key: 'ui.whatsNew', doc: 'What’s-New briefing surfaces on login.', def: true },
  { key: 'ui.recommendations', doc: 'Hub landing recommendation panels render.', def: true },
  { key: 'meta.doubleDailyBanner', doc: 'Show the daily-run double-reward banner experiment.', def: false },
  { key: 'market.authorityBanner', doc: 'Show the "market running hot" fee banner in the Auction House.', def: true },
];

/** Numeric remote configs (bounded — even a compromised document stays inside tolerances). */
export const REMOTE_NUMBERS: RemoteNumberDef[] = [
  { key: 'ui.placardMax', doc: 'Max simultaneous reward placards.', def: 4, min: 2, max: 8 },
  { key: 'ui.arrivalMinMinutes', doc: 'Banked minutes before the Hive arrival banner offers.', def: 30, min: 5, max: 240 },
  { key: 'store.flashCooldownMin', doc: 'Minutes between flash-offer popups.', def: 240, min: 60, max: 2880 },
  { key: 'an.sampleFps', doc: 'FPS telemetry session sample rate ×100.', def: 50, min: 0, max: 100 },
];

export interface ExperimentDef {
  id: string; // token
  salt: string; // reassignment = change the salt
  buckets: { id: string; pct: number }[]; // pcts sum ≤ 100; remainder = 'control'
}

export interface RemoteConfigDoc {
  rev: number;
  flags: Record<string, boolean>;
  numbers: Record<string, number>;
  experiments: ExperimentDef[];
}

export function defaultRemoteConfig(): RemoteConfigDoc {
  return {
    rev: 0,
    flags: Object.fromEntries(REMOTE_FLAGS.map((f) => [f.key, f.def])),
    numbers: Object.fromEntries(REMOTE_NUMBERS.map((n) => [n.key, n.def])),
    experiments: [],
  };
}

const TOKEN = /^[a-z0-9_.:\-]{1,48}$/i;

/** Sanitize an untrusted document into the whitelisted, bounded shape. Unknown keys drop;
 *  out-of-bounds numbers clamp; malformed experiments drop; bucket pcts clamp to ≤100. */
export function sanitizeRemoteConfig(raw: unknown): RemoteConfigDoc {
  const out = defaultRemoteConfig();
  if (!raw || typeof raw !== 'object') return out;
  const doc = raw as Partial<RemoteConfigDoc>;
  out.rev = Number.isInteger(doc.rev) && (doc.rev as number) >= 0 ? (doc.rev as number) : 0;
  if (doc.flags && typeof doc.flags === 'object') {
    for (const def of REMOTE_FLAGS) {
      const v = (doc.flags as Record<string, unknown>)[def.key];
      if (typeof v === 'boolean') out.flags[def.key] = v;
    }
  }
  if (doc.numbers && typeof doc.numbers === 'object') {
    for (const def of REMOTE_NUMBERS) {
      const v = (doc.numbers as Record<string, unknown>)[def.key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out.numbers[def.key] = Math.max(def.min, Math.min(def.max, v));
      }
    }
  }
  if (Array.isArray(doc.experiments)) {
    for (const e of doc.experiments.slice(0, 12)) {
      if (!e || typeof e !== 'object') continue;
      const { id, salt, buckets } = e as ExperimentDef;
      if (typeof id !== 'string' || !TOKEN.test(id)) continue;
      if (typeof salt !== 'string' || salt.length === 0 || salt.length > 32) continue;
      if (!Array.isArray(buckets) || buckets.length === 0 || buckets.length > 8) continue;
      const clean: { id: string; pct: number }[] = [];
      let used = 0;
      for (const b of buckets) {
        if (!b || typeof b.id !== 'string' || !TOKEN.test(b.id)) continue;
        const pct = Math.max(0, Math.min(100 - used, Math.floor(Number(b.pct) || 0)));
        if (pct <= 0) continue;
        used += pct;
        clean.push({ id: b.id, pct });
      }
      if (clean.length > 0) out.experiments.push({ id, salt, buckets: clean });
    }
  }
  return out;
}

/** FNV-1a over (playerId|salt) → 0..9999 — the deterministic assignment coin. */
export function assignmentRoll(playerId: string, salt: string): number {
  const s = `${playerId}|${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 10_000;
}

/** The player's bucket for an experiment ('control' when outside every rollout slice).
 *  Same inputs ⇒ same bucket, forever, on every device. */
export function bucketFor(playerId: string, exp: ExperimentDef): string {
  const roll = assignmentRoll(playerId, exp.salt) / 100; // 0..99.99
  let edge = 0;
  for (const b of exp.buckets) {
    edge += b.pct;
    if (roll < edge) return b.id;
  }
  return 'control';
}

/** Registry integrity (content-integrity suite). */
export function remoteConfigProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of [...REMOTE_FLAGS.map((f) => f.key), ...REMOTE_NUMBERS.map((n) => n.key)]) {
    if (seen.has(f)) problems.push(`duplicate remote key: ${f}`);
    seen.add(f);
    // The determinism whitelist: every remote key must live in a UI/meta/analytics/store/
    // market namespace — a sim-touching key must never appear here.
    if (!/^(ui|meta|store|market|an)\./.test(f)) problems.push(`remote key outside the UI/meta lane: ${f}`);
  }
  for (const n of REMOTE_NUMBERS) if (n.min > n.max || n.def < n.min || n.def > n.max) problems.push(`bad bounds: ${n.key}`);
  return problems;
}
