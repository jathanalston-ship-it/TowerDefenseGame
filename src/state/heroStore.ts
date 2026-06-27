// Selected hero — a persistent loadout choice, kept in its OWN localStorage key (not the
// save blob), so it survives reloads without a save-schema migration. Reactive via the
// shared store bridge so the picker + any consumer re-render on change. Validated against
// the roster, so an unknown/edited value falls back to the default hero.

import { createStore } from './store';
import { HEROES, DEFAULT_HERO_ID } from '../core/config';
import type { HeroId } from '../core/types';

const KEY = 'assimilate.hero';

function isHeroId(v: unknown): v is HeroId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(HEROES, v);
}

function load(): HeroId {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (isHeroId(v)) return v;
  } catch {
    /* storage unavailable — use the default */
  }
  return DEFAULT_HERO_ID;
}

const store = createStore<HeroId>(load());

export const heroSelect = {
  use: store.use,
  get: store.get,
  /** Choose a hero (no-op for an unknown id). Persists across reloads. */
  select(id: HeroId): void {
    if (!isHeroId(id)) return;
    store.set(id);
    try {
      localStorage?.setItem(KEY, id);
    } catch {
      /* not persisted — selection still applies this session */
    }
  },
};
