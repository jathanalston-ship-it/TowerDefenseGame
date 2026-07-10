// GAME ACTION SECURITY LAYER — the guard engine (docs/SECURITY.md). Every meaningful player
// action passes `guard(actionId)` before executing: a token-bucket rate limit, a hard
// cooldown, and a duplicate-request window, all declared as DATA in security/registry.ts.
// The engine is deliberately tiny and allocation-light (a Map of small mutable states), and
// it lives entirely OUTSIDE the deterministic sim:
//
//   · In-run sim inputs are never wall-clock gated here — replays and the golden runs are a
//     pure function of seed + inputs, so spam absorption for THOSE happens at the UI input
//     boundary (a blocked click simply never becomes a sim input).
//   · Meta/economy/network actions (persistent state) are gated at their domain entry
//     points (state/meta.ts, net/*) — one `guard()` line each, policies in the registry.
//
// INERT OUTSIDE THE BROWSER by default: the deterministic test suite, economy personas and
// balance sims hammer meta methods thousands of times per second by design — they run in
// Node, where the layer stays off unless a test explicitly enables it with a fake clock.

import { SECURITY_ACTIONS } from './registry';
import type { ActionPolicy } from './registry';

export type BlockReason = 'rate' | 'cooldown' | 'duplicate' | 'flood';

export interface BlockInfo {
  id: string;
  reason: BlockReason;
  retryInMs: number; // when the action would next be accepted (0 = unknown/window-based)
  at: number; // clock time of the block
}

export type GuardResult = { ok: true } | { ok: false; block: BlockInfo };

interface BucketState {
  tokens: number;
  refilledAt: number; // last refill timestamp
  lastAcceptAt: number; // cooldown anchor
  lastKey: string | null; // duplicate detection payload key
  lastKeyAt: number;
}

// ── Engine state (module-scoped; one browser tab = one player session) ──
let enabled = typeof window !== 'undefined';
let clock: () => number = Date.now;
const buckets = new Map<string, BucketState>();

// Blocked-action log — a small ring the debug tools and analytics read (docs/SECURITY.md
// §logging). Never grows past LOG_CAP; never touches the save.
const LOG_CAP = 200;
const blockLog: BlockInfo[] = [];

/** Explicitly enable/disable the layer (tests enable it with a fake clock; a test that
 *  hammers domain methods leaves it off — the Node default). */
export function setSecurityEnabled(on: boolean): void {
  enabled = on;
}

export function securityEnabled(): boolean {
  return enabled;
}

/** Inject a clock (tests). Production uses Date.now — guards are UX pacing, not sim time. */
export function setSecurityClock(fn: () => number): void {
  clock = fn;
}

/** Reset all buckets + the log (profile reset / tests). */
export function resetSecurity(): void {
  buckets.clear();
  blockLog.length = 0;
}

/** The blocked-action log, newest last (read-only view). */
export function securityLog(): readonly BlockInfo[] {
  return blockLog;
}

// One UI subscriber (App) surfaces blocks as a subtle "hold on" pulse — feedback without
// modal friction; legitimate players essentially never see it.
let blockListener: ((b: BlockInfo) => void) | null = null;

export function onSecurityBlock(fn: ((b: BlockInfo) => void) | null): void {
  blockListener = fn;
}

function logBlock(b: BlockInfo): void {
  blockLog.push(b);
  if (blockLog.length > LOG_CAP) blockLog.splice(0, blockLog.length - LOG_CAP);
  blockListener?.(b);
}

function stateOf(id: string): BucketState {
  let s = buckets.get(id);
  if (!s) {
    s = { tokens: -1, refilledAt: 0, lastAcceptAt: -Infinity, lastKey: null, lastKeyAt: -Infinity };
    buckets.set(id, s);
  }
  return s;
}

/**
 * The gate. `key` (optional) is a payload identity — the same key inside the policy's
 * `dedupeMs` window is a DUPLICATE (double-click, lag re-submit, second tab) and is blocked
 * without consuming a token. Unknown ids fail open with a console warning in dev — the
 * registry test makes an unknown id unshippable anyway.
 */
export function guard(id: string, key?: string): GuardResult {
  if (!enabled) return { ok: true };
  const policy: ActionPolicy | undefined = SECURITY_ACTIONS[id];
  if (!policy) {
    if (import.meta.env?.DEV) console.warn(`[security] unregistered action '${id}' — add it to security/registry.ts`);
    return { ok: true };
  }
  const now = clock();
  const s = stateOf(id);

  // Duplicate window (checked first — a duplicate is not "too fast", it is the SAME request).
  if (key !== undefined && policy.dedupeMs && s.lastKey === key && now - s.lastKeyAt < policy.dedupeMs) {
    const block: BlockInfo = { id, reason: 'duplicate', retryInMs: policy.dedupeMs - (now - s.lastKeyAt), at: now };
    logBlock(block);
    return { ok: false, block };
  }

  // Hard cooldown between accepted actions.
  if (policy.cooldownMs && now - s.lastAcceptAt < policy.cooldownMs) {
    const block: BlockInfo = { id, reason: 'cooldown', retryInMs: policy.cooldownMs - (now - s.lastAcceptAt), at: now };
    logBlock(block);
    return { ok: false, block };
  }

  // Token bucket: `limit.count` actions per `limit.perMs`, burst up to the full count.
  const { count, perMs } = policy.limit;
  if (s.tokens < 0) {
    s.tokens = count; // lazy init at full burst
    s.refilledAt = now;
  } else {
    const refill = ((now - s.refilledAt) / perMs) * count;
    if (refill > 0) {
      s.tokens = Math.min(count, s.tokens + refill);
      s.refilledAt = now;
    }
  }
  if (s.tokens < 1) {
    const needMs = ((1 - s.tokens) * perMs) / count;
    const block: BlockInfo = { id, reason: 'rate', retryInMs: Math.ceil(needMs), at: now };
    logBlock(block);
    return { ok: false, block };
  }

  s.tokens -= 1;
  s.lastAcceptAt = now;
  if (key !== undefined) {
    s.lastKey = key;
    s.lastKeyAt = now;
  }
  return { ok: true };
}

/** Convenience: guard + boolean (for `if (!guardOk('x')) return false;` call sites). */
export function guardOk(id: string, key?: string): boolean {
  return guard(id, key).ok;
}

// ── Persist flood control (docs/SECURITY.md §flood) ──────────────────────────
// The meta store funnels EVERY persistent mutation — current and future — through one
// persist() call. This throttle coalesces runaway DISK writes (a spammed button, a buggy
// loop, scripted input flooding) while keeping in-memory state exact: the caller always
// commits to the store; only the localStorage write is deferred to a trailing flush.
// Legitimate play never notices (a human can't click faster than the budget).

const FLOOD_WINDOW_MS = 1000;
const FLOOD_MAX_WRITES = 20; // disk writes allowed per rolling second before coalescing
let floodTimes: number[] = [];
let floodLogged = 0;

/** Should this disk write proceed now (true), or be coalesced into a trailing flush (false)?
 *  Pure bookkeeping — the CALLER owns scheduling the flush. */
export function admitWrite(): boolean {
  if (!enabled) return true;
  const now = clock();
  floodTimes = floodTimes.filter((t) => now - t < FLOOD_WINDOW_MS);
  if (floodTimes.length >= FLOOD_MAX_WRITES) {
    if (now - floodLogged > FLOOD_WINDOW_MS) {
      floodLogged = now;
      logBlock({ id: 'meta.persist', reason: 'flood', retryInMs: FLOOD_WINDOW_MS, at: now });
    }
    return false;
  }
  floodTimes.push(now);
  return true;
}

// ── Clock-rollback detection (docs/SECURITY.md §offline) ─────────────────────
// Device-local, deliberately OUTSIDE the save (a clock is a device property — it must not
// sync, merge, or export). Time-keyed systems (daily, market windows, stamina, expeditions)
// already self-heal on rollback (done-flags + stored timestamps pause rather than duplicate);
// this detector makes the anomaly OBSERVABLE for analytics and support instead of silent.

const CLOCK_KEY = 'assimilate.clockGuard';
const CLOCK_SLACK_MS = 5 * 60_000; // small backward drift (NTP, DST edges) is not an anomaly

/** Pure check: given the persisted high-water mark, is `now` anomalously in the past? */
export function clockAnomalyOf(maxSeen: number, now: number): boolean {
  return maxSeen > 0 && now < maxSeen - CLOCK_SLACK_MS;
}

let clockAnomaly = false;

/** Advance the high-water mark and (re)evaluate the anomaly flag. Call at boot + on saves. */
export function noteClock(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    const maxSeen = Number(window.localStorage.getItem(CLOCK_KEY) ?? '0');
    if (clockAnomalyOf(maxSeen, now)) clockAnomaly = true;
    if (now > maxSeen) window.localStorage.setItem(CLOCK_KEY, String(now));
  } catch {
    /* storage unavailable — nothing to guard */
  }
}

/** True when this device's clock has been observed running backwards this session. */
export function securityClockAnomaly(): boolean {
  return clockAnomaly;
}
