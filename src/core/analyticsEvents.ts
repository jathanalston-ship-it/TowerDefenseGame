// ANALYTICS EVENT REGISTRY (docs/ANALYTICS.md §events) — the unified event architecture.
// ONE registry row declares an event completely: its dimension/value contract, whether the
// server writes daily rollups (and keeps a per-version split for patch impact), whether the
// raw row survives pruning ('durable' — player timelines read these), whether extras ride
// along, and the client sample rate. The client emitter validates against it, the server
// ingest validates against it, the rollup router derives its writes from it, and the sims
// stress it — so a NEW event is exactly one row here plus one emit call.
//
// Wire shape (bandwidth-first): the BATCH carries the shared context once (player, session,
// platform, version, language, power, stage); each event carries only what changes per
// event (kind, at, screen, mode, dim, value, extras). Region and device class are enriched
// SERVER-side from the request — never client-claimed.
//
// Privacy contract (docs/ANALYTICS.md §privacy): player ids are the game's existing
// pseudonymous UUIDs; no names, no emails, no free-text from players ever rides an event.
// Dimensions are bounded machine tokens; extras are allowlisted per kind and length-capped.
//
// Pure data module: no DOM, no state imports, no Math.random.

export interface AnEvent {
  k: string; // registry kind
  at: number; // client epoch ms (server clamps into a sane window)
  sc?: string; // screen key at emit (nav vocabulary)
  md?: string; // game mode at emit ('campaign' | 'endless' | …)
  d?: string; // dimension token (registry-gated)
  v?: number; // integer value (registry-bounded)
  x?: Record<string, string | number>; // extras (durable/timeline kinds only, allowlisted)
}

export interface AnBatch {
  playerId: string;
  session: string; // client-minted session uuid
  platform: string;
  ver: string; // app version (patch-impact dimension)
  lang: string;
  power: number;
  stage: number;
  events: AnEvent[];
}

export interface AnEventDef {
  kind: string;
  doc: string;
  /** Dimension contract: 'none' | 'token' (bounded machine token) — rollups key on it. */
  dim: 'none' | 'token';
  /** Value contract (integers): absent ⇒ no value; otherwise clamped-or-rejected bounds. */
  value?: { min: number; max: number };
  /** Daily rollup rows (day, kind, dim, version → n/sum/sum²). Almost everything rolls up. */
  rollup: boolean;
  /** Raw row survives the prune window — player timelines and audits read these. */
  durable: boolean;
  /** Extras allowlist (key → max string length; numbers share the value bounds ±1e9). */
  extras?: Record<string, number>;
  /** Client-side sampling (1 = always; 0.1 = one in ten sessions emits this kind). */
  sample?: number;
}

export const AN_LIMITS = {
  batchEvents: 80,
  batchBytes: 24_576,
  dimPattern: /^[a-z0-9_.:\-]{1,48}$/,
  extraStringMax: 160,
  /** Raw retention (days) for non-durable rows; durable rows keep DURABLE_DAYS. */
  rawDays: 30,
  durableDays: 400,
  /** Heartbeat cadence (live-player counting) + flush cadence, seconds. */
  pingSec: 60,
  flushSec: 20,
} as const;

const E = (
  kind: string, doc: string, over: Partial<AnEventDef> = {},
): AnEventDef => ({ kind, doc, dim: 'none', rollup: true, durable: false, ...over });

/** The complete launch taxonomy — "track everything practical", each one row. */
export const AN_EVENTS: AnEventDef[] = [
  // ── Sessions & retention (activity rows derive D1/D7/D30 server-side) ──
  E('ses_start', 'Session began (one per boot).', { durable: true }),
  E('ses_ping', 'Liveness heartbeat (live-player counting; no dim).'),
  E('ses_end', 'Session ended — value = duration sec.', { value: { min: 0, max: 86_400 }, durable: true, extras: { ev: 8 } }),
  E('quit_loc', 'Last screen at exit (pagehide) — dim = screen.', { dim: 'token' }),

  // ── Screens & navigation ──
  E('nav', 'Screen view — dim = screen key; value = previous screen dwell ms.', { dim: 'token', value: { min: 0, max: 3_600_000 } }),
  E('heat', 'Interaction heat cell — dim = screen:cellIndex; value = taps folded client-side.', { dim: 'token', value: { min: 1, max: 5_000 } }),
  E('notif', 'Badge interaction — dim = channel:act|seen|ignore.', { dim: 'token' }),
  E('tut', 'Tutorial checkpoint — dim = step id, or abandon:step.', { dim: 'token', durable: true }),

  // ── Runs & progression ──
  E('run_start', 'Run launched — dim = mode.', { dim: 'token' }),
  E('run_end', 'Run finished — dim = mode; value = wave; extras carry the summary.', {
    dim: 'token', value: { min: 0, max: 10_000 }, durable: true,
    extras: { won: 1, stage: 6, diff: 24, hero: 24, towers: 160, dur: 8, doctrine: 24 },
  }),
  E('run_loss', 'Defeat location — dim = mode:stageOrWaveBand.', { dim: 'token' }),
  E('run_quit', 'Mid-run abandon — dim = mode:stageOrWaveBand.', { dim: 'token' }),
  E('stage_clear', 'Campaign stage first-clear — dim = stage number token.', { dim: 'token', durable: true }),
  E('power', 'Power Score checkpoint — value = score.', { value: { min: 0, max: 100_000_000 } }),
  E('xp', 'Account XP gained (session fold) — value = xp.', { value: { min: 0, max: 1_000_000 } }),
  E('rank', 'Genome Rank reached — dim = rank index token.', { dim: 'token', durable: true }),
  E('unlock', 'Feature revealed — dim = feature id.', { dim: 'token', durable: true }),

  // ── Towers / heroes / loadout usage ──
  E('tw_field', 'Tower fielded in a finished run — dim = tower id; value = placements.', { dim: 'token', value: { min: 1, max: 500 } }),
  E('tw_win', 'Tower fielded in a WON run — dim = tower id.', { dim: 'token' }),
  E('tw_up', 'Tower upgrade taken — dim = towerId:branch.', { dim: 'token' }),
  E('tw_strain', 'Strain chosen — dim = strain id.', { dim: 'token' }),
  E('hero_pick', 'Hero taken into a run — dim = hero id.', { dim: 'token' }),
  E('hero_win', 'Hero in a WON run — dim = hero id.', { dim: 'token' }),
  E('ability', 'Hero ability casts (run fold) — dim = ability id; value = casts.', { dim: 'token', value: { min: 1, max: 10_000 } }),
  E('equip_use', 'Equipment worn in a finished run — dim = def id.', { dim: 'token' }),
  E('mull_use', 'Mulligan organism active in a run — dim = tower id.', { dim: 'token' }),
  E('gene_use', 'Gene card drafted in a run — dim = card id.', { dim: 'token' }),

  // ── Loot & economy ──
  E('box_open', 'Container opened — dim = rarity; value = count.', { dim: 'token', value: { min: 1, max: 200 } }),
  E('loot_rare', 'Rare+ find — dim = kind:rarity.', { dim: 'token' }),
  E('cos_claim', 'Cosmetic claimed (account-bind) — dim = item id. Feeds the future network census (TRADING-PREP.md §census).', { dim: 'token', durable: true }),
  E('cur_gain', 'Currency earned (session fold) — dim = currency:source; value = amount.', { dim: 'token', value: { min: 1, max: 10_000_000 } }),
  E('cur_spend', 'Currency spent (session fold) — dim = currency:sink; value = amount.', { dim: 'token', value: { min: 1, max: 10_000_000 } }),
  E('idle_collect', 'Hive Production collected — value = banked hours ×10.', { value: { min: 0, max: 10_000 } }),

  // ── Performance / stability / network ──
  E('fps', 'Session FPS summary — value = avg ×10; extras p01/p99 ×10.', { value: { min: 0, max: 2_400 }, extras: { p01: 6, p99: 6 }, sample: 0.5 }),
  E('load', 'Boot-to-hub time — value = ms.', { value: { min: 0, max: 120_000 } }),
  E('net', 'Network quality band — dim = good|ok|poor|offline.', { dim: 'token', sample: 0.5 }),
  E('err', 'Runtime error — dim = stable hash; extras carry truncated message/stack.', {
    dim: 'token', durable: true, extras: { msg: 160, stack: 160 },
  }),

  // ── Money & ads ──
  E('buy', 'Completed purchase — dim = offer id; value = cents.', { dim: 'token', value: { min: 0, max: 1_000_000 }, durable: true }),
  E('ad', 'Ad placement interaction — dim = placement:offered|start|complete|abort.', { dim: 'token' }),

  // ── Experiments ──
  E('ab_assign', 'Experiment bucket assigned — dim = experiment:bucket.', { dim: 'token', durable: true }),
];

export const AN_EVENT_BY_KIND: Record<string, AnEventDef> = Object.fromEntries(AN_EVENTS.map((e) => [e.kind, e]));

/** Validate ONE event against the registry (shared client/server/sim). Null = valid;
 *  otherwise a machine reason. Enforcement is reject-the-event, never reject-the-batch —
 *  a beacon must degrade, not explode. */
export function eventProblem(e: AnEvent): string | null {
  const def = AN_EVENT_BY_KIND[e.k];
  if (!def) return 'unknown-kind';
  if (!Number.isFinite(e.at)) return 'bad-at';
  if (def.dim === 'token') {
    if (typeof e.d !== 'string' || !AN_LIMITS.dimPattern.test(e.d)) return 'bad-dim';
  } else if (e.d !== undefined) return 'unexpected-dim';
  if (def.value) {
    if (typeof e.v !== 'number' || !Number.isInteger(e.v) || e.v < def.value.min || e.v > def.value.max) return 'bad-value';
  } else if (e.v !== undefined) return 'unexpected-value';
  if (e.x !== undefined) {
    if (!def.extras) return 'unexpected-extras';
    const entries = Object.entries(e.x);
    if (entries.length > 8) return 'extras-overflow';
    for (const [key, val] of entries) {
      if (!(key in def.extras)) return 'unknown-extra';
      if (typeof val === 'string') {
        if (val.length > Math.min(def.extras[key] * 20, AN_LIMITS.extraStringMax)) return 'extra-too-long';
      } else if (typeof val === 'number') {
        if (!Number.isFinite(val) || Math.abs(val) > 1e9) return 'extra-out-of-range';
      } else return 'bad-extra-type';
    }
  }
  if (typeof e.sc === 'string' && !AN_LIMITS.dimPattern.test(e.sc)) return 'bad-screen';
  if (typeof e.md === 'string' && !AN_LIMITS.dimPattern.test(e.md)) return 'bad-mode';
  return null;
}

/** Batch envelope shape check (ids validated by the host's own validators). */
export function batchProblem(b: AnBatch): string | null {
  if (!Array.isArray(b.events) || b.events.length === 0) return 'empty';
  if (b.events.length > AN_LIMITS.batchEvents) return 'too-many-events';
  if (typeof b.session !== 'string' || b.session.length < 8 || b.session.length > 64) return 'bad-session';
  if (typeof b.ver !== 'string' || b.ver.length > 24) return 'bad-version';
  if (typeof b.platform !== 'string' || b.platform.length > 16) return 'bad-platform';
  if (typeof b.lang !== 'string' || b.lang.length > 12) return 'bad-lang';
  if (typeof b.power !== 'number' || typeof b.stage !== 'number') return 'bad-context';
  return null;
}

// ── Session-side folds (the performance contract: hot signals NEVER leave raw) ──────────
/** Fold interaction points into a coarse grid so a whole session's heatmap is ≤ a few
 *  dozen counters, not thousands of coordinates. 12×8 per screen. */
export const HEAT_GRID = { cols: 12, rows: 8 } as const;

export function heatCell(xFrac: number, yFrac: number): number {
  const cx = Math.max(0, Math.min(HEAT_GRID.cols - 1, Math.floor(xFrac * HEAT_GRID.cols)));
  const cy = Math.max(0, Math.min(HEAT_GRID.rows - 1, Math.floor(yFrac * HEAT_GRID.rows)));
  return cy * HEAT_GRID.cols + cx;
}

/** Streaming FPS accumulator — O(1) memory via a 61-bucket histogram (0..60+). */
export interface FpsAccumulator { buckets: number[]; frames: number }
export function newFpsAccumulator(): FpsAccumulator {
  return { buckets: new Array(61).fill(0) as number[], frames: 0 };
}
export function fpsSample(acc: FpsAccumulator, dtSec: number): void {
  if (dtSec <= 0 || dtSec > 2) return; // tab-suspend gaps are not frames
  const fps = Math.max(0, Math.min(60, Math.round(1 / dtSec)));
  acc.buckets[fps]++;
  acc.frames++;
}
export function fpsSummary(acc: FpsAccumulator): { avg10: number; p01x10: number; p99x10: number } | null {
  if (acc.frames < 300) return null; // <5s of frames is noise, not telemetry
  let sum = 0;
  for (let f = 0; f <= 60; f++) sum += f * acc.buckets[f];
  const pct = (p: number): number => {
    const target = Math.max(1, Math.floor(acc.frames * p));
    let seen = 0;
    for (let f = 0; f <= 60; f++) { seen += acc.buckets[f]; if (seen >= target) return f; }
    return 60;
  };
  return { avg10: Math.round((sum / acc.frames) * 10), p01x10: pct(0.01) * 10, p99x10: pct(0.99) * 10 };
}

/** Currency flow fold: (currency:source → amount) counters, flushed as cur_gain/cur_spend
 *  events once per flush — a whole grind session is a handful of rows. */
export type FlowFold = Map<string, number>;
export function foldFlow(fold: FlowFold, dimension: string, amount: number): void {
  if (amount <= 0 || !AN_LIMITS.dimPattern.test(dimension)) return;
  fold.set(dimension, Math.min(10_000_000, (fold.get(dimension) ?? 0) + Math.floor(amount)));
}
export function drainFlow(fold: FlowFold, kind: 'cur_gain' | 'cur_spend', at: number): AnEvent[] {
  const out: AnEvent[] = [];
  for (const [d, v] of fold) out.push({ k: kind, at, d, v });
  fold.clear();
  return out;
}

/** Stable tiny hash for error dedupe dims (djb2 → base36, client + server identical). */
export function errorHash(message: string, stackHead: string): string {
  const s = `${message}|${stackHead}`.slice(0, 400);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `e${(h >>> 0).toString(36)}`;
}

/** Wave → coarse loss-location band ('w1-5', 'w6-10', …) so loss dims stay bounded. */
export function waveBand(wave: number): string {
  const lo = Math.floor(Math.max(0, wave - 1) / 5) * 5 + 1;
  return `w${lo}-${lo + 4}`;
}

/** Registry integrity (content-integrity suite): unique kinds, sane bounds, doc'd. */
export function analyticsRegistryProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of AN_EVENTS) {
    if (seen.has(e.kind)) problems.push(`duplicate analytics kind: ${e.kind}`);
    seen.add(e.kind);
    if (!AN_LIMITS.dimPattern.test(e.kind)) problems.push(`kind is not a valid token: ${e.kind}`);
    if (!e.doc) problems.push(`undocumented analytics kind: ${e.kind}`);
    if (e.value && e.value.min > e.value.max) problems.push(`inverted value bounds: ${e.kind}`);
    if (e.sample !== undefined && (e.sample <= 0 || e.sample > 1)) problems.push(`bad sample rate: ${e.kind}`);
  }
  return problems;
}
