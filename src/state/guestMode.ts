// GUEST MODE (docs/ACCOUNTS.md §guest-mode) — the no-strings tryout session. While active the
// game is essentially OFFLINE: the save lives in session-scoped storage (nothing durable — it
// dies with the browser session), no server account is created, cloud sync / leaderboard
// submits / real-money checkout are disabled, and the player is never asked for a name.
// The ONE exit is the existing account flow: creating (or signing into) an account converts
// the session — meta.commitGuestSession() moves the live save onto durable storage and the
// normal account lifecycle takes over, keeping everything earned.
//
// The flag itself rides sessionStorage: a mid-session reload stays in guest mode; closing the
// browser ends the tryout. Storage-less environments (tests, SSR) simply report inactive.

import { useSyncExternalStore } from 'react';

const KEY = 'assimilate.guestMode';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let active = read();

export function guestModeActive(): boolean {
  return active;
}

export function enterGuestMode(): void {
  active = true;
  try { sessionStorage.setItem(KEY, '1'); } catch { /* memory copy carries the session */ }
  for (const fn of listeners) fn();
}

export function exitGuestMode(): void {
  active = false;
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  for (const fn of listeners) fn();
}

/** React hook — account/store/settings surfaces restyle while the tryout is active. */
export function useGuestMode(): boolean {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    guestModeActive,
  );
}
