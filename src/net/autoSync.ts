// AUTO CLOUD SYNC (docs/DEPLOYMENT.md §cloud saves) — the "account" half of naming
// yourself: once a Commander name exists, the save quietly mirrors to the cloud slot
// (the same TOFU-token blob the manual Backup button uses). Fail-soft everywhere:
// offline, unconfigured backend, or rate limits change nothing about play.
//
// Cadence: any save change marks DIRTY; a slow ticker flushes at most once per
// MIN_INTERVAL (the server allows 12 PUTs / 10 min — we use a fraction of that), and
// a tab going hidden flushes immediately (the classic "player closed the game" save).

import { meta } from '../state/meta';
import { backupToCloud } from './cloudSave';

export const MIN_INTERVAL_MS = 150_000; // ≤4 PUTs / 10 min — well inside the server budget
const TICK_MS = 30_000;
const LAST_KEY = 'assimilate.cloud.lastAuto';

/** The pure gate — unit-tested; the ticker just feeds it reality. */
export function shouldAutoSync(s: { dirty: boolean; named: boolean; online: boolean; now: number; last: number }): boolean {
  return s.dirty && s.named && s.online && s.now - s.last >= MIN_INTERVAL_MS;
}

let started = false;
let dirty = false;
let inFlight = false;

function lastAuto(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

async function flush(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const r = await backupToCloud();
    if (r.ok) {
      dirty = false;
      try {
        localStorage.setItem(LAST_KEY, String(Date.now()));
      } catch {
        /* storage unavailable — next tick just retries sooner */
      }
    }
  } finally {
    inFlight = false;
  }
}

/** Idempotent boot hook (App calls once). */
export function startAutoCloudSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  meta.subscribe(() => {
    dirty = true;
  });
  window.setInterval(() => {
    if (shouldAutoSync({ dirty, named: meta.get().profileName.length > 0, online: navigator.onLine, now: Date.now(), last: lastAuto() })) {
      void flush();
    }
  }, TICK_MS);
  // Tab hidden = the mobile "closed the game" moment — flush NOW if there's anything new.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty && meta.get().profileName.length > 0 && navigator.onLine) {
      void flush();
    }
  });
}

/** For the Cloud panel: when the last automatic mirror landed (0 = never). */
export function lastAutoSyncAt(): number {
  return lastAuto();
}
