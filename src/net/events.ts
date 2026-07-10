// Privacy-friendly event beacon (docs/WEBSITE.md §analytics). Counts, not people:
// no ids, no cookies, no fingerprints — each event is only (kind, +1), batched and
// flushed occasionally to /api/events, where D1 keeps per-day counters. Fail-soft
// and fire-and-forget: offline/errored flushes drop silently and never touch play.
// Page-level analytics (sessions, views, countries) is Cloudflare Web Analytics —
// this lane exists for GAME events dashboards can't see (run starts, research use,
// store funnel steps), so future balancing is data-driven.

const FLUSH_MS = 15_000;
const MAX_BATCH = 40;

/** Allowlisted kinds — the server rejects anything else, so this list is the contract. */
export type EventKind =
  | 'session_start'
  | 'run_start'
  | 'run_end'
  | 'research_view'
  | 'research_abort'
  | 'research_claim'
  | 'store_open'
  | 'checkout_start'
  | 'account_guest'
  | 'account_register'
  | 'account_login'
  | 'sync_push'
  | 'sync_pull'
  | 'sync_conflict'
  | 'sync_fail'
  | 'offline_session';

const pending = new Map<string, number>();
let timer: number | null = null;
let flushing = false;

/** Count one event. `detail` (optional, e.g. `research_claim:core_sample`) becomes its
 *  own counter row alongside the base kind — still just a label, never an identity. */
export function trackEvent(kind: EventKind, detail?: string): void {
  bump(kind);
  if (detail && /^[a-z0-9_:-]{1,64}$/.test(detail)) bump(detail);
  if (timer === null && typeof window !== 'undefined') {
    timer = window.setTimeout(() => { timer = null; void flush(); }, FLUSH_MS);
  }
}

function bump(key: string): void {
  pending.set(key, (pending.get(key) ?? 0) + 1);
  if (pending.size > MAX_BATCH) void flush();
}

export async function flush(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const events = [...pending.entries()].map(([kind, n]) => ({ kind, n }));
  pending.clear();
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true, // survives tab close for the final flush
    });
  } catch {
    /* offline — counts drop; aggregates tolerate gaps by design */
  } finally {
    flushing = false;
  }
}

/** Arm the session lifecycle: one session_start + a best-effort final flush. */
export function initEvents(): void {
  trackEvent('session_start');
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }
}
