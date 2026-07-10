// CONNECTIVITY + SERVER-FEATURE GATING (docs/ACCOUNTS.md §offline) — offline play
// is FIRST-CLASS: every gameplay system runs local-first, and this module is how
// the few server-authoritative surfaces know to stand down gracefully. One store,
// one registry — no scattered navigator.onLine reads.

export interface ServerFeature {
  id: 'cloudSync' | 'leaderboards' | 'daily' | 'store' | 'events';
  label: string;
  /** Shown on the disabled surface — WHY this needs a server. */
  why: string;
}

/** Everything that needs a server. Anything not listed here MUST work offline —
 *  that's the contract gameplay code is written against. */
export const SERVER_FEATURES: readonly ServerFeature[] = [
  { id: 'cloudSync', label: 'Cloud Sync', why: 'Backs your save up to your account.' },
  { id: 'leaderboards', label: 'Leaderboards', why: 'Scores are verified and ranked server-side.' },
  { id: 'daily', label: 'Daily Run refresh', why: 'The daily seed is issued by the server so every player gets the same run.' },
  { id: 'store', label: 'Splice Market purchases', why: 'Payments are verified server-side.' },
  { id: 'events', label: 'Analytics', why: 'Aggregate counters only — never gameplay.' },
];

let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; emit(); });
  window.addEventListener('offline', () => { online = false; emit(); });
}

export const connectivity = {
  /** Best-effort connectivity truth (navigator.onLine + browser events). */
  isOnline(): boolean {
    return online;
  },

  /** A server feature is available iff we're online. Per-feature backend health
   *  (e.g. unconfigured Stripe) is still each lane's own fail-soft response. */
  isAvailable(_id: ServerFeature['id']): boolean {
    return online;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
