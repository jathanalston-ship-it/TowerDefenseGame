// LIVE EVENT OPERATIONS (docs/LIVE-EVENTS.md §8) — the remote-control layer OVER the
// deterministic calendar. The rotation itself needs NO server (standard rotations ship in
// data, forever — that is the "no client update" guarantee); this module defines the
// OVERRIDE contract a remote config document can apply on top: future scheduling, manual
// activation, emergency shutdown, hotfix tuning, previews. Absent/offline/invalid config
// ⇒ the pure calendar, unchanged — ops can only be additive or subtractive, never break
// determinism for players without config.
//
// Delivery seam: the accounts backend's config channel (functions/ — same origin as save
// sync) serves ONE JSON document matching EventOpsConfig; state-side fetch caches it and
// hands it to resolveEvents(). eventOpsProblems() validates a document BEFORE publish —
// the ops dashboard runs the same function the client runs (one truth).

import type { EventHorizon, LiveEventDefV2, ActiveLiveEvent } from './liveEvents';
import { LIVE_EVENTS_V2, activeLiveEvents } from './liveEvents';

/** Hotfix tuning knobs — multiplicative, clamped, value-guarded. */
export interface EventTuning {
  trackScale?: number; // scales generated-filler quantities (0.5..1.5)
  tokenScale?: number; // scales challenge token payouts (0.5..1.5)
  shopStockDelta?: number; // -2..+2 per-row stock adjustment
  modsScale?: number; // scales the event's reward-lane boost distance from ×1 (0..1.5)
}

export interface EventScheduleEntry {
  eventId: string;
  startsAt: number; // UTC ms — future scheduling / holiday & anniversary placement
  endsAt: number;
  /** Replaces the horizon's ring event while live (manual activation / crossover slot). */
  horizon: EventHorizon;
}

export interface EventOpsConfig {
  /** Monotonic version — clients ignore documents older than the one they hold. */
  rev: number;
  /** EMERGENCY SHUTDOWN — event ids to suppress immediately (ring rotation fills the slot
   *  with the next ring member via the disable path; theme falls back cleanly). */
  kill?: string[];
  /** Scheduled placements (holiday/crossover/anniversary/community windows). */
  schedule?: EventScheduleEntry[];
  /** Per-event hotfix tuning. */
  tuning?: Record<string, EventTuning>;
  /** DEVELOPER PREVIEW — event ids visible only when the client runs with ?debug. */
  preview?: string[];
  /** Future-category bags (community challenge / global boss / faction war / PvP season
   *  documents) — namespaced, ignored by clients that don't know them (forward-compat). */
  future?: Record<string, unknown>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Resolve the live events under an ops document. Pure; null/undefined config ⇒ calendar. */
export function resolveEvents(now: number, config?: EventOpsConfig | null, debug = false): ActiveLiveEvent[] {
  const base = activeLiveEvents(now);
  if (!config) return base;
  const byId = new Map(LIVE_EVENTS_V2.map((e) => [e.id, e]));
  const killed = new Set(config.kill ?? []);
  const preview = new Set(config.preview ?? []);
  return base.map((a) => {
    // Scheduled placement wins the horizon slot while its window is live.
    const sched = (config.schedule ?? []).find(
      (s) => s.horizon === a.def.horizon && now >= s.startsAt && now < s.endsAt
        && byId.has(s.eventId) && !killed.has(s.eventId) && (debug || !preview.has(s.eventId)),
    );
    if (sched) {
      const def = byId.get(sched.eventId) as LiveEventDefV2;
      return { ...a, def, endsAt: Math.min(a.endsAt, sched.endsAt), key: `${def.id}:${a.window}` };
    }
    if (!killed.has(a.def.id) && (debug || !preview.has(a.def.id))) return a;
    // Killed/preview-gated: the ring's NEXT member fills the slot (never an empty horizon).
    const ring = LIVE_EVENTS_V2.filter((e) => e.horizon === a.def.horizon && !killed.has(e.id) && (debug || !(config.preview ?? []).includes(e.id)));
    const fallback = ring.length > 0 ? ring[a.window % ring.length] : a.def;
    return { ...a, def: fallback, key: `${fallback.id}:${a.window}` };
  });
}

/** Effective tuning for an event under a document (clamped to the guard rails). */
export function effectiveTuning(config: EventOpsConfig | null | undefined, eventId: string): Required<EventTuning> {
  const t = config?.tuning?.[eventId] ?? {};
  return {
    trackScale: clamp(t.trackScale ?? 1, 0.5, 1.5),
    tokenScale: clamp(t.tokenScale ?? 1, 0.5, 1.5),
    shopStockDelta: clamp(Math.round(t.shopStockDelta ?? 0), -2, 2),
    modsScale: clamp(t.modsScale ?? 1, 0, 1.5),
  };
}

/** Publish-gate validation — the dashboard runs THIS before serving a document. */
export function eventOpsProblems(config: EventOpsConfig): string[] {
  const out: string[] = [];
  const ids = new Set(LIVE_EVENTS_V2.map((e) => e.id));
  if (!Number.isFinite(config.rev) || config.rev < 0) out.push('rev must be a non-negative number');
  for (const k of config.kill ?? []) if (!ids.has(k)) out.push(`kill: unknown event '${k}'`);
  for (const p of config.preview ?? []) if (!ids.has(p)) out.push(`preview: unknown event '${p}'`);
  for (const s of config.schedule ?? []) {
    if (!ids.has(s.eventId)) out.push(`schedule: unknown event '${s.eventId}'`);
    if (s.endsAt <= s.startsAt) out.push(`schedule ${s.eventId}: endsAt ≤ startsAt`);
    const def = LIVE_EVENTS_V2.find((e) => e.id === s.eventId);
    if (def && def.horizon !== s.horizon) out.push(`schedule ${s.eventId}: horizon mismatch (${s.horizon} ≠ ${def.horizon})`);
  }
  for (const [id, t] of Object.entries(config.tuning ?? {})) {
    if (!ids.has(id)) out.push(`tuning: unknown event '${id}'`);
    for (const [k, v] of Object.entries(t)) if (!Number.isFinite(v)) out.push(`tuning ${id}.${k}: not a number`);
  }
  // Every horizon must survive the kill list (a killed ring member falls back; an entire
  // dead ring cannot).
  for (const h of ['short', 'medium', 'major'] as const) {
    const alive = LIVE_EVENTS_V2.filter((e) => e.horizon === h && !(config.kill ?? []).includes(e.id));
    if (alive.length === 0) out.push(`kill list empties the ${h} ring — at least one event must survive`);
  }
  return out;
}

/** The post-event report shape (docs/LIVE-EVENTS.md §8-analytics) — a pure aggregator over
 *  the analytics platform's rollup rows (AN_EVENTS dims carry the event id; cardinality
 *  stays bounded by the same structural rule as every other kind). The functions/ report
 *  job fills this after each window closes and files it per `eventId:window`. */
export interface EventWindowReport {
  eventId: string;
  window: number;
  participation: number; // accounts that earned ≥1 token
  completionPct: number; // average track depth / track length
  claims: number; // milestone + shop claims
  tokensMinted: number;
  tokensExpired: number; // unspent at rotation (the anti-inflation drain, observed)
  coreEqGranted: number; // realized mint vs windowMintBudget (economy impact)
  d1RetentionPct: number; // participants returning next UTC day
  satisfactionProxy: number; // completion-weighted repeat participation
  avgTrackDepth: number;
  difficultyProxy: number; // challenge completion rate spread
}
