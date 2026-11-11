// PER-SAVE MEMOIZATION — the hub's pure models (Power parts, advisor candidates, adaptation picks)
// are read by several panels at once (Growth, Mission Control, the feed, notification badges), and
// each save change re-rendered all of them: one quick-buy recomputed the same Power math 3–5 times
// (~600 ms of long tasks — the 2026-11-11 playtest lag).
//
// The caches key on COMMITTED store snapshots only: the meta layer marks every object it commits
// to the store (markSnapshot — boot, persist, the two direct store writes), and a committed snapshot
// is never mutated afterwards (the store's identity-based change detection depends on that). Any
// other save — an advisor's hypothetical `{ ...save, x }`, a harness's scratch save it edits in place
// (premiumEconomy.test.ts does) — computes fresh every time, exactly as before. Pure functions of
// the save only — anything that reads the clock or other state must not use this.

import type { SaveData } from '../save/saveStore';

const snapshots = new WeakSet<SaveData>();

/** Mark a save as a COMMITTED store snapshot (immutable from here on). Returns it. */
export function markSnapshot<S extends SaveData>(save: S): S {
  snapshots.add(save);
  return save;
}

/** A shared (cached) result is read-only: freezing it (shallow) makes an in-place sort/push by a
 *  future caller throw at once instead of silently corrupting every other panel's copy. */
function freeze<R>(r: R): R {
  if (typeof r === 'object' && r !== null) Object.freeze(r);
  return r;
}

/** Memoize `fn(save)` per save snapshot. */
export function memoPerSave<R>(fn: (save: SaveData) => R): (save: SaveData) => R {
  const cache = new WeakMap<SaveData, R>();
  return (save) => {
    if (!snapshots.has(save)) return fn(save); // not a committed snapshot ⇒ never cached
    if (cache.has(save)) return cache.get(save) as R;
    const r = freeze(fn(save));
    cache.set(save, r);
    return r;
  };
}

/** Memoize `fn(save, key)` per save snapshot and (primitive) key. */
export function memoPerSaveKeyed<K extends string | number, R>(fn: (save: SaveData, key: K) => R): (save: SaveData, key: K) => R {
  const cache = new WeakMap<SaveData, Map<K, R>>();
  return (save, key) => {
    if (!snapshots.has(save)) return fn(save, key); // not a committed snapshot ⇒ never cached
    let m = cache.get(save);
    if (!m) { m = new Map(); cache.set(save, m); }
    if (m.has(key)) return m.get(key) as R;
    const r = freeze(fn(save, key));
    m.set(key, r);
    return r;
  };
}
