// LAYOUT PROFILES (docs/RESPONSIVE-DESIGN.md §profiles) — the three intentional interfaces:
//   desktop   — information-rich, pointer-first (includes landscape tablets / Deck / ultrawide)
//   landscape — phone-landscape band: short viewport, thumbs on the edges, board dominates
//   portrait  — one-column touch layout: readability first, secondary info collapses
//
// The profile is STAMPED on <html> as data-layout (+ data-coarse for touch), so CSS reorganizes
// per profile with plain attribute selectors and any component can branch via useLayoutProfile().
// One resize listener, rAF-debounced, values cached — profile checks are free at frame rate.
// The legacy width breakpoints (860/900/640/Deck) remain as the underlying implementation bands;
// new responsive rules should key on the profile attributes instead.

import { useSyncExternalStore } from 'react';

export type LayoutProfile = 'desktop' | 'landscape' | 'portrait';

export interface LayoutState {
  profile: LayoutProfile;
  coarse: boolean; // primary pointer is touch
  vw: number;
  vh: number;
}

function compute(): LayoutState {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  // Portrait: taller than wide AND phone/tablet-portrait width. Landscape: wider than tall
  // with a SHORT viewport (phone rotated). Everything else is the desktop interface.
  const profile: LayoutProfile = vh >= vw && vw <= 900 ? 'portrait' : vw > vh && vh <= 520 ? 'landscape' : 'desktop';
  return { profile, coarse, vw, vh };
}

let state: LayoutState = typeof window === 'undefined'
  ? { profile: 'desktop', coarse: false, vw: 1280, vh: 800 }
  : compute();
const listeners = new Set<() => void>();
let raf = 0;

// THE APP HEIGHT fallback (docs/RESPONSIVE-DESIGN.md §browser): CSS sizes full-screen shells with
// --app-h (100dvh — the height a phone browser's toolbar actually leaves). An engine without dynamic
// viewport units gets the measured innerHeight instead, refreshed on every resize (a toolbar showing or
// hiding fires one).
const DVH = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '100dvh');

function stamp(): void {
  const el = document.documentElement;
  if (!DVH) el.style.setProperty('--app-h', `${state.vh}px`);
  if (el.dataset.layout !== state.profile) el.dataset.layout = state.profile;
  const coarse = state.coarse ? '1' : '0';
  if (el.dataset.coarse !== coarse) el.dataset.coarse = coarse;
  // Feed the debug visualizer's chip while it's engaged (ResponsiveDebug toggles the attribute).
  if (el.hasAttribute('data-debug-layout')) document.body?.setAttribute('data-debug-label', `${state.profile} ${state.vw}×${state.vh}`);
}

function refresh(): void {
  const next = compute();
  if (next.profile === state.profile && next.coarse === state.coarse && next.vw === state.vw && next.vh === state.vh) return;
  state = next;
  stamp();
  for (const fn of listeners) fn();
}

/** Idempotent boot hook (App imports this module; the stamp lands before first paint). */
export function initLayoutProfile(): void {
  if (typeof window === 'undefined') return;
  stamp();
  const onChange = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(refresh);
  };
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
}

export const layout = {
  get(): LayoutState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** React hook — components branch structure per profile (never re-derive from raw width). */
export function useLayoutProfile(): LayoutState {
  return useSyncExternalStore(layout.subscribe, layout.get);
}

// IN-RUN flag (docs/RESPONSIVE-DESIGN.md §run): GameView marks the battlefield mounted. The run
// screen has real portrait AND landscape phone layouts, so the rotate gate stands down while it
// is up (hub screens stay landscape-only on touch). Shares the profile listeners. Holds are
// NAMED: App also holds the flag across the whole run FLOW (deploy breath → battlefield →
// Results) so the battlefield unmounting never re-gates a portrait player mid-debrief.
const runHolds = new Set<string>();

export function setInRun(on: boolean, holder = 'battlefield'): void {
  if (runHolds.has(holder) === on) return;
  if (on) runHolds.add(holder);
  else runHolds.delete(holder);
  for (const fn of listeners) fn();
}

/** React hook — true while any holder keeps the run layout (GameView mounted, or the run flow). */
export function useInRun(): boolean {
  return useSyncExternalStore(layout.subscribe, () => runHolds.size > 0);
}
