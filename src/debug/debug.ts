// Debug system. Enabled in dev (`npm run dev`) automatically, and on deployed
// builds only via an explicit `?debug` opt-in (persisted) — so it is OFF by
// default in production. RELEASE HARDENING (docs/SECURITY.md §debug): building
// with VITE_RELEASE_HARDENED=1 compiles the entire debug surface to a dead
// branch — no ?debug door, no debug meta mutators, no window.__game handle —
// for store releases; CI/preview harnesses keep the opt-in.

import type { Game } from '../core/game';

const ALLOW_DEBUG = import.meta.env.VITE_RELEASE_HARDENED !== '1';
const FLAG_KEY = 'assimilate.debug';

export function isDebugEnabled(): boolean {
  if (!ALLOW_DEBUG) return false;
  if (import.meta.env.DEV) return true; // always on with the dev server
  try {
    if (new URLSearchParams(window.location.search).has('debug')) {
      window.localStorage.setItem(FLAG_KEY, '1'); // persist the opt-in across reloads
    }
    return window.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableDebug(): void {
  try {
    window.localStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}

// ── Active-run registry ────────────────────────────────────────────────────
// GameView registers the live Game so the debug panel can drive the current run.

let active: Game | null = null;
const listeners = new Set<() => void>();

export function setActiveGame(g: Game | null): void {
  active = g;
  // Debug-gated window handle so headless playtests (and the console) can drive the live run.
  if (isDebugEnabled()) (globalThis as { __game?: Game | null }).__game = g;
  for (const l of listeners) l();
}

export function getActiveGame(): Game | null {
  return active;
}

export function subscribeActiveGame(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
