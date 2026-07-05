// Developer Reset invariants (docs/DEV-RESET.md): each scope clears EXACTLY its documented slice
// (to defaults) and leaves every other field byte-identical, the result is always a valid
// current-version save, and EVERYTHING wipes the store's keyspace.

import { describe, it, expect } from 'vitest';
import { DEV_RESETS, applyDevReset, isDevResetId } from './devReset';
import { SaveStore, defaultSave, parseImport, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import type { StorageLike } from '../save/saveStore';
import { HERO_ORDER } from '../core/config';

// The fields each granular scope is documented to reset (the others must stay untouched).
const CHANGED: Record<string, (keyof SaveData)[]> = {
  campaign: ['campaign'],
  infinite: ['bestWave'],
  currency: ['shards', 'lifetimeShards', 'mats', 'ichor', 'lifetimeIchor', 'market'],
  towers: ['towerStars', 'towerForks', 'towerShards', 'towerKills'],
  heroes: ['heroStars', 'heroShards', 'heroKills', 'heroFavEquip', 'selectedHero'],
  equipment: ['equipment'],
  lootboxes: ['lootQueue', 'pendingContainers'],
  achievements: ['achievements'],
  statistics: ['stats', 'totalRuns', 'cardsSeen'],
  mastery: ['towerMasteryXp', 'heroMasteryXp', 'unlockedTitles', 'equippedTitle', 'unlockedLore'],
  ascension: ['prestige'],
};

/** A save with every reset-able slice set to a NON-default value, so a reset is observable. */
function dirtySave(): SaveData {
  const s = defaultSave();
  s.shards = 999; s.lifetimeShards = 1234; s.mats = { mutagen: 5, scrap: 5, catalyst: 5 };
  s.ichor = 77; s.lifetimeIchor = 90; s.market = { window: 3, bought: ['3:1'], seenWindow: 3, starter: true };
  s.bestWave = 42; s.totalRuns = 10; s.cardsSeen = 7;
  s.campaign = { cleared: { standard: 7, brutal: 3 }, bestTime: {} };
  s.towerStars = { ...s.towerStars, needle: 3 }; s.towerForks = { ...s.towerForks, needle: { '3': 'x' } };
  s.towerShards = { ...s.towerShards, needle: 50 }; s.towerKills = { ...s.towerKills, needle: 100 };
  s.heroStars = { ...s.heroStars, ravager: 2 }; s.heroShards = { ...s.heroShards, ravager: 10 };
  s.heroKills = { ...s.heroKills, ravager: 20 }; s.heroFavEquip = { ...s.heroFavEquip, ravager: { blade: 1 } };
  s.selectedHero = HERO_ORDER.find((h) => h !== 'ravager') ?? 'ravager';
  s.equipment = { inventory: [{ uid: 'u1', defId: 'blade', tier: 1, affixes: [] } as never], loadouts: { [s.selectedHero]: { weapon: 'u1', armor: null, relic: null } } };
  s.pendingContainers = [{ kind: 'loot', rarity: 'common' }];
  s.achievements = ['first_star'];
  s.stats = { ...s.stats, lifetimeKills: 555 };
  s.towerMasteryXp = { ...s.towerMasteryXp, needle: 500 }; s.heroMasteryXp = { ...s.heroMasteryXp, ravager: 300 };
  s.unlockedTitles = ['veteran']; s.equippedTitle = 'veteran'; s.unlockedLore = ['lore1'];
  s.bossesSlain = ['bruiser']; s.upgrades = { dmg: 2 };
  s.prestige = { ...s.prestige, cells: 5, molts: 1 };
  return s;
}

describe('developer reset catalog', () => {
  it('has the 13 documented scopes with unique ids', () => {
    expect(DEV_RESETS.length).toBe(13);
    expect(new Set(DEV_RESETS.map((r) => r.id)).size).toBe(13);
    for (const r of DEV_RESETS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.warning.length).toBeGreaterThan(10); // a real warning describing what's erased
      expect(isDevResetId(r.id)).toBe(true);
    }
  });
});

describe('applyDevReset — surgical, version-safe', () => {
  it('each granular scope clears ONLY its slice (to defaults); all else byte-identical', () => {
    const d = defaultSave();
    for (const [id, fields] of Object.entries(CHANGED)) {
      const dirty = dirtySave();
      const out = applyDevReset(dirty, id);
      for (const k of Object.keys(dirty) as (keyof SaveData)[]) {
        if (fields.includes(k)) {
          expect(out[k], `${id}: ${String(k)} should reset to default`).toEqual(d[k]);
        } else {
          expect(out[k], `${id}: ${String(k)} must be untouched`).toBe(dirty[k]); // reference-identical
        }
      }
    }
  });

  it('everything / saveData return a complete fresh save', () => {
    expect(applyDevReset(dirtySave(), 'everything')).toEqual(defaultSave());
    expect(applyDevReset(dirtySave(), 'saveData')).toEqual(defaultSave());
  });

  it('an unknown scope is a no-op', () => {
    const dirty = dirtySave();
    expect(applyDevReset(dirty, 'nope')).toBe(dirty);
  });

  it('every reset result is still a valid, importable current-version save', () => {
    for (const r of DEV_RESETS) {
      const out = applyDevReset(dirtySave(), r.id);
      const round = parseImport(serializeExport(out));
      expect(round.ok, `${r.id} result must round-trip as a valid save`).toBe(true);
    }
  });

  it('Reset Equipment clears inventory AND loadouts together (no orphaned uid)', () => {
    const out = applyDevReset(dirtySave(), 'equipment');
    expect(out.equipment.inventory).toEqual([]);
    expect(out.equipment.loadouts).toEqual({}); // per-hero loadouts all cleared → no dangling ref
  });
});

describe('SaveStore.wipeAll — EVERYTHING storage wipe', () => {
  it('removes the main save, every backup, and the index', () => {
    const mem = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
    const store = new SaveStore(storage);
    store.save(defaultSave());
    store.backup();
    store.backup();
    expect(mem.size).toBeGreaterThan(2); // save + 2 backups + index
    store.wipeAll();
    expect(store.listBackups()).toEqual([]);
    expect(mem.size).toBe(0); // nothing left in this store's keyspace
  });
});
