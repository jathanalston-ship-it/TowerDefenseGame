// TELEMETRY PIPE (docs/ANALYTICS.md §client) — the one lane every gameplay signal rides.
// Design contract:
//   • EXTREMELY cheap at emit time: push-to-array or fold-into-counter, nothing else. Hot
//     signals (frames, taps, currency) fold into O(1) session accumulators and leave as a
//     handful of summary events per flush (core/analyticsEvents.ts owns the folds).
//   • Batched + fail-soft: flushes every AN_LIMITS.flushSec via fetch keepalive; pagehide
//     drains through sendBeacon; a failed flush parks in a small localStorage outbox and
//     retries next session. A telemetry problem can never touch play.
//   • Auto-context: every batch carries player/session/platform/version/language/power/
//     stage once; each event stamps only its screen + mode. Emitting a new event anywhere
//     is ONE call — the registry row it names is the whole contract.
//   • Privacy: pseudonymous player id only, Guest Mode sends nothing, the Settings toggle
//     ('telemetry') turns the lane off entirely, and region/device stay server-derived.
// The legacy anonymous counter beacon (net/events.ts) is unchanged — different promise
// (counts, not people), different lane.

import {
  AN_EVENT_BY_KIND, AN_LIMITS, drainFlow, eventProblem, errorHash, foldFlow, fpsSample,
  fpsSummary, heatCell, newFpsAccumulator,
} from '../core/analyticsEvents';
import type { AnBatch, AnEvent, FlowFold, FpsAccumulator } from '../core/analyticsEvents';
import { guestModeActive } from '../state/guestMode';
import { rewardToast } from '../state/rewardToast';
import { account } from '../account/accountStore';
import { getLocale } from '../i18n';

const OUTBOX_KEY = 'assimilation.an.outbox';
const OPTOUT_KEY = 'assimilation.an.optout';
const QUEUE_MAX = 200;
const OUTBOX_MAX = 3;

declare const __APP_VERSION__: string | undefined;

interface ContextProvider { power: () => number; stage: () => number }

const startedAt = Date.now();
let sessionId = '';
let provider: ContextProvider = { power: () => 0, stage: () => 0 };
let queue: AnEvent[] = [];
let screenKey = 'boot';
let modeKey = 'menu';
let screenSince = startedAt;
let lastFlush = 0;
let flushing = false;
let started = false;
const gainFold: FlowFold = new Map();
const spendFold: FlowFold = new Map();
const heatFold = new Map<string, Map<number, number>>();
let fpsAcc: FpsAccumulator = newFpsAccumulator();
const sessionRoll = Math.random(); // per-session sampling coin (per-kind rates compare to it)

function enabled(): boolean {
  if (guestModeActive()) return false; // the tryout is silent, same as every net lane
  try { return localStorage.getItem(OPTOUT_KEY) !== '1'; } catch { return true; }
}

/** Display source ("Campaign Stage 12") → bounded dim token ('campaign_stage'). Digits are
 *  stripped on purpose: they would explode dim cardinality (stage numbers, wave counts). */
function slugSource(source: string): string {
  const s = source.toLowerCase().replace(/[0-9]/g, '').replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return s || 'misc';
}

/** Reward-toast type id → currency token for cur_gain dims (non-currency types skip). */
const CURRENCY_TYPE: Record<string, string> = {
  genomeCores: 'cores', ichor: 'ichor', cells: 'cells', geneEssence: 'essence',
  towerShards: 'tshards', heroShards: 'hshards', mutagen: 'mutagen', scrap: 'scrap',
  catalyst: 'catalyst', stamina: 'stamina', bpXp: 'bpxp', masteryXp: 'mxp',
};
const RARE_BANDS = new Set(['epic', 'legendary', 'exotic', 'mythic']);

function version(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

function push(e: AnEvent): void {
  if (!enabled()) return;
  const def = AN_EVENT_BY_KIND[e.k];
  if (!def) return;
  if (def.sample !== undefined && sessionRoll >= def.sample) return; // sampled out this session
  if (import.meta.env?.DEV) {
    const problem = eventProblem(e);
    if (problem) { console.warn(`[telemetry] dropped ${e.k}: ${problem}`); return; }
  }
  if (queue.length >= QUEUE_MAX) {
    const idx = queue.findIndex((q) => !AN_EVENT_BY_KIND[q.k]?.durable);
    queue.splice(idx >= 0 ? idx : 0, 1); // durable events survive backpressure
  }
  queue.push(e);
}

function ctxEvent(k: string, rest: Partial<AnEvent> = {}): AnEvent {
  return { k, at: Date.now(), sc: screenKey, md: modeKey, ...rest };
}

function readOutbox(): AnBatch[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as AnBatch[]; } catch { return []; }
}
function writeOutbox(batches: AnBatch[]): void {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(batches.slice(-OUTBOX_MAX))); } catch { /* full — drop */ }
}

function drainFolds(now: number): void {
  for (const e of drainFlow(gainFold, 'cur_gain', now)) push(e);
  for (const e of drainFlow(spendFold, 'cur_spend', now)) push(e);
  for (const [screen, cells] of heatFold) {
    for (const [cell, taps] of cells) push({ k: 'heat', at: now, sc: screen, md: modeKey, d: `${screen}:${cell}`, v: Math.min(5_000, taps) });
  }
  heatFold.clear();
}

function buildBatch(): AnBatch | null {
  drainFolds(Date.now());
  if (queue.length === 0) return null;
  const events = queue.slice(0, AN_LIMITS.batchEvents);
  queue = queue.slice(events.length);
  return {
    playerId: account.get().accountId,
    session: sessionId,
    platform: 'web',
    ver: version(),
    lang: getLocale(),
    power: provider.power(),
    stage: provider.stage(),
    events,
  };
}

async function send(batch: AnBatch, useBeacon: boolean): Promise<boolean> {
  const body = JSON.stringify(batch);
  if (body.length > AN_LIMITS.batchBytes) return true; // oversize safety valve: drop, never wedge
  try {
    if (useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      return navigator.sendBeacon('/api/an/ingest', new Blob([body], { type: 'text/plain' }));
    }
    const res = await fetch('/api/an/ingest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true,
    });
    return res.ok || res.status === 400; // a rejected batch is DONE, not retryable
  } catch {
    return false;
  }
}

async function flushNow(useBeacon = false): Promise<void> {
  if (flushing || !enabled()) return;
  flushing = true;
  try {
    for (const parked of readOutbox()) {
      if (!(await send(parked, false))) { flushing = false; return; } // still offline — keep the outbox
      writeOutbox(readOutbox().slice(1));
    }
    const batch = buildBatch();
    if (batch && !(await send(batch, useBeacon))) writeOutbox([...readOutbox(), batch]);
    lastFlush = Date.now();
  } finally {
    flushing = false;
  }
}

// ── Public surface ────────────────────────────────────────────────────────────
export const telemetry = {
  /** Boot the pipe (App calls once). Providers keep meta out of this module (no cycles). */
  start(p: ContextProvider): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    provider = p;
    sessionId = crypto.randomUUID();
    push(ctxEvent('ses_start'));
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    const netband = nav.connection?.effectiveType;
    if (netband) push(ctxEvent('net', { d: netband === '4g' ? 'good' : netband === '3g' ? 'ok' : 'poor' }));
    window.addEventListener('error', (e) => {
      this.error(String(e.message ?? 'error'), String(e.error?.stack ?? '').slice(0, 200));
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.error(`unhandled: ${String(e.reason).slice(0, 120)}`, '');
    });
    document.addEventListener('pointerdown', (e) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.tap(e.clientX / w, e.clientY / h);
    }, { capture: true, passive: true });
    window.addEventListener('pagehide', () => {
      push(ctxEvent('quit_loc', { d: screenKey }));
      const s = fpsSummary(fpsAcc);
      if (s) push(ctxEvent('fps', { v: s.avg10, x: { p01: s.p01x10, p99: s.p99x10 } }));
      push(ctxEvent('ses_end', { v: Math.round((Date.now() - startedAt) / 1000), x: { ev: queue.length } }));
      void flushNow(true);
    });
    // EVERY reward in the game announces on the toast bus (state/rewardToast.ts) — one
    // subscription covers all currency gains + rare-find telemetry, forever. New reward
    // surfaces inherit tracking the same way they inherit placards: for free.
    rewardToast.tap((e) => {
      const cur = CURRENCY_TYPE[e.type];
      if (cur && typeof e.qty === 'number') this.flowGain(`${cur}:${slugSource(e.source)}`, e.qty);
      if (e.rarity && RARE_BANDS.has(e.rarity)) {
        push(ctxEvent('loot_rare', { d: `${e.type.toLowerCase()}:${e.rarity}` }));
      }
    });
    window.setInterval(() => {
      push(ctxEvent('ses_ping'));
      if (Date.now() - lastFlush >= AN_LIMITS.flushSec * 1000) void flushNow();
    }, AN_LIMITS.pingSec * 1000);
    window.setTimeout(() => void flushNow(), 5_000); // first flush soon (boot events + outbox)
  },

  /** One-line event emit — the registry row is the whole contract. */
  emit(k: string, rest: Partial<AnEvent> = {}): void {
    push(ctxEvent(k, rest));
  },

  /** Screen change (Hub drives this): emits the nav event with the previous dwell. */
  screen(next: string): void {
    if (next === screenKey) return;
    const now = Date.now();
    push({ k: 'nav', at: now, sc: next, md: modeKey, d: next, v: Math.min(3_600_000, now - screenSince) });
    screenKey = next;
    screenSince = now;
  },

  mode(m: string): void {
    modeKey = m;
  },

  /** Boot-to-hub load time (App emits once when the menu first mounts). */
  loaded(): void {
    push(ctxEvent('load', { v: Math.min(120_000, Math.round(performance.now())) }));
  },

  // ── Session folds (O(1) hot paths) ──
  flowGain(dim: string, amount: number): void {
    if (enabled()) foldFlow(gainFold, dim, amount);
  },
  flowSpend(dim: string, amount: number): void {
    if (enabled()) foldFlow(spendFold, dim, amount);
  },
  fpsTick(dtSec: number): void {
    fpsSample(fpsAcc, dtSec);
  },
  tap(xFrac: number, yFrac: number): void {
    if (!enabled()) return;
    const cells = heatFold.get(screenKey) ?? new Map<number, number>();
    const cell = heatCell(xFrac, yFrac);
    cells.set(cell, (cells.get(cell) ?? 0) + 1);
    heatFold.set(screenKey, cells);
  },

  error(message: string, stackHead: string): void {
    push(ctxEvent('err', {
      d: errorHash(message, stackHead),
      x: { msg: message.slice(0, 150), stack: stackHead.slice(0, 150) },
    }));
  },

  /** Settings toggle (docs/ANALYTICS.md §privacy). Off drops the queue immediately. */
  setEnabled(on: boolean): void {
    try { localStorage.setItem(OPTOUT_KEY, on ? '0' : '1'); } catch { /* fine */ }
    if (!on) {
      queue = [];
      gainFold.clear();
      spendFold.clear();
      heatFold.clear();
      fpsAcc = newFpsAccumulator();
    }
  },
  isEnabled(): boolean {
    return enabled();
  },

  flush(): Promise<void> {
    return flushNow();
  },

  /** Test/debug introspection (never used by product code). */
  _debug(): { queued: number; session: string } {
    return { queued: queue.length, session: sessionId };
  },
};
