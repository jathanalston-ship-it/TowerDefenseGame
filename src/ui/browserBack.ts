// BACK & ESCAPE (docs/HUB-FLOW.md §back) — the browser / Android Back button and the Escape
// key walk the GAME's own history instead of leaving the page or doing nothing:
//   • an open layer (a <Popup>, or any modal that calls useDismiss) closes first — topmost wins;
//   • in the hub, Back is the Hub's goBack (the same walk as the ScreenHeader ‹ and swipe-back);
//   • during a live run, Back opens the Pause sheet — it NEVER exits a run (and a reload/close
//     asks first via `beforeunload`);
//   • at the hub root the browser does its normal thing (previous page / close the PWA).
// Mechanism: ONE "guard" history entry with the SAME URL (deep links — ?replay, ?daily,
// ?checkout, ?session_id — the PWA start_url and the marketing site at the domain root are
// untouched) sits above the app's entry whenever Back has an in-game meaning. Back consumes it →
// popstate → we act and re-arm. The decisions are pure (backStep/wantsGuard, unit-tested in
// browserBack.test.ts); useBrowserBack is the only DOM wiring, mounted once by App.

import { useEffect, useRef } from 'react';
import { runBus } from '../state/navBus';

// ── The dismiss stack ─────────────────────────────────────────────────────────────────────────

type Layer = { close: () => void };
const layers: Layer[] = [];

/** Close the topmost open layer. False when nothing is open. */
export function dismissTop(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** Is any dismissable layer open? (Escape / Back never navigate underneath one.) */
export function hasOpenLayer(): boolean {
  return layers.length > 0;
}

let escArmed = false;
function onEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented || layers.length === 0) return;
  e.preventDefault(); // the Hub's Escape→back reads this: one key, one action
  dismissTop();
}

/** Register a dismissable layer while `active`: Escape and the Back button close it (topmost
 *  first). The latest `onClose` is always the one called. */
export function useDismiss(onClose: (() => void) | null | undefined, active = true): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { close: () => ref.current?.() };
    layers.push(layer);
    if (!escArmed) { escArmed = true; window.addEventListener('keydown', onEscape); }
    syncBackGuard(); // an open layer gives Back a meaning even at the hub root
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      syncBackGuard();
    };
  }, [active]);
}

// ── Pure decisions ────────────────────────────────────────────────────────────────────────────

/** Where the app is: the hub ('menu'), a live battlefield ('run' — the tutorial included), or a
 *  transitional/overlay screen that must not be left by Back ('other' — deploy, results, the
 *  roulette, an arena match). */
export type BackPhase = 'menu' | 'run' | 'other';

export interface BackState {
  phase: BackPhase;
  layerOpen: boolean; // a dismissable layer is up (the dismiss stack)
  modal: boolean; // some OTHER modal is on screen (a ceremony, What's New, the HUD tour…)
  hubAtRoot: boolean; // the Hub's goBack would have nowhere to go
}

export type BackStep = 'pause' | 'hold' | 'dismiss' | 'hub-back' | 'leave';

/** What one Back press means right now. */
export function backStep(s: BackState): BackStep {
  if (s.phase === 'run') return 'pause';
  if (s.phase === 'other') return 'hold';
  if (s.layerOpen) return 'dismiss';
  if (s.modal) return 'hold'; // never navigate the hub underneath a ceremony
  return s.hubAtRoot ? 'leave' : 'hub-back';
}

/** Should a guard entry sit above the app's entry (does Back have an in-game meaning)? A
 *  passing ceremony never arms one on its own — it would linger as a dead Back press. */
export function wantsGuard(s: BackState): boolean {
  return s.phase !== 'menu' || s.layerOpen || !s.hubAtRoot;
}

/** A non-dismiss-stack modal is on screen (DOM read — event time only). */
export function modalOnScreen(): boolean {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')].some((el) => el.getClientRects().length > 0);
}

// ── The guard entry ───────────────────────────────────────────────────────────────────────────

interface HubBack { atRoot(): boolean; back(): void }
let hub: HubBack | null = null;
let phase: BackPhase = 'menu';
let armed = false; // a guard WE pushed is the current entry
let ignorePops = 0; // popstates caused by our own consume (history.back) — not the player's
let consumedHref: string | null = null; // the guard's URL at consume time (a cleanup may have replaced it)

const GUARD = { assimBack: 1 } as const;

function state(): BackState {
  return { phase, layerOpen: hasOpenLayer(), modal: false, hubAtRoot: hub ? hub.atRoot() : true };
}

/** Bring the history in line with the current state: arm a guard while Back means something
 *  in-game, consume a stale one when it no longer does (so Back at the root never dead-ends). */
export function syncBackGuard(): void {
  if (typeof window === 'undefined') return;
  const want = wantsGuard(state());
  if (want && !armed) {
    window.history.pushState(GUARD, '');
    armed = true;
  } else if (!want && armed) {
    armed = false;
    ignorePops++;
    consumedHref = window.location.href;
    window.history.back();
  }
}

/** The Hub hands over its back walk + root test (returns the unregister). */
export function registerHubBack(h: HubBack): () => void {
  hub = h;
  syncBackGuard();
  return () => {
    if (hub === h) hub = null;
  };
}

/** The current phase (the Hub's Escape→back stays out of runs and overlays). */
export function backPhase(): BackPhase {
  return phase;
}

function onPopState(): void {
  if (ignorePops > 0) {
    ignorePops--;
    // A URL cleanup that ran on the guard (?replay stripped on theater exit) must survive the
    // consume — carry it onto the entry we landed on instead of resurrecting the old query.
    if (consumedHref && window.location.href !== consumedHref) window.history.replaceState(window.history.state, '', consumedHref);
    consumedHref = null;
    return;
  }
  armed = false; // Back consumed the guard
  const step = backStep({ ...state(), modal: modalOnScreen() });
  if (step === 'pause') runBus.pause();
  else if (step === 'dismiss') dismissTop();
  else if (step === 'hub-back') hub?.back();
  syncBackGuard(); // re-arm while Back still means something in-game
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  e.preventDefault();
  e.returnValue = ''; // legacy browsers need a value to show the "leave site?" prompt
}

/** Mounted ONCE by App: owns the popstate listener and the live-run `beforeunload` warning. */
export function useBrowserBack(next: BackPhase): void {
  phase = next;
  useEffect(() => {
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    syncBackGuard();
    if (next !== 'run') return;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [next]);
}
