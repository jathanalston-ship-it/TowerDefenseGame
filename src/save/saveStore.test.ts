import { describe, it, expect } from 'vitest';
import { SaveStore, defaultSave, parseImport, serializeExport } from './saveStore';
import type { SaveData, StorageLike } from './saveStore';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('SaveStore', () => {
  it('round-trips data', () => {
    const store = new SaveStore(mem());
    const data: SaveData = { ...defaultSave(), shards: 123, bestWave: 7, upgrades: { lethality: 3 } };
    store.save(data);
    const loaded = store.load();
    expect(loaded.shards).toBe(123);
    expect(loaded.bestWave).toBe(7);
    expect(loaded.upgrades.lethality).toBe(3);
  });

  it('returns defaults when empty', () => {
    expect(new SaveStore(mem()).load()).toEqual(defaultSave());
  });

  it('recovers to defaults from invalid JSON without throwing', () => {
    const s = mem();
    s.map.set('assimilate.save', '{not valid json');
    expect(new SaveStore(s).load()).toEqual(defaultSave());
  });

  it('recovers from a tampered checksum by falling back (no valid backup -> defaults)', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 50 });
    const raw = JSON.parse(s.map.get('assimilate.save')!);
    raw.data.shards = 999999; // tamper with the body, leave checksum stale
    s.map.set('assimilate.save', JSON.stringify(raw));
    expect(store.load()).toEqual(defaultSave());
  });

  it('swapStorage({purgePrevious}) re-points writes and scrubs the old driver (Guest Mode enter/convert)', () => {
    const a = mem();
    const b = mem();
    const store = new SaveStore(a);
    store.save({ ...defaultSave(), shards: 42 });
    expect(a.map.has('assimilate.save')).toBe(true);

    // Enter: durable → session; the durable copy is purged, writes land only on the new driver.
    store.swapStorage(b, { purgePrevious: true });
    expect(a.map.has('assimilate.save')).toBe(false);
    store.save({ ...defaultSave(), shards: 7 });
    expect(b.map.has('assimilate.save')).toBe(true);
    expect(a.map.has('assimilate.save')).toBe(false);

    // Convert: session → durable; the live snapshot survives, the stale session copy is scrubbed.
    store.swapStorage(a, { purgePrevious: true });
    store.save({ ...defaultSave(), shards: 7 });
    expect(b.map.has('assimilate.save')).toBe(false);
    expect(store.load().shards).toBe(7);
  });
});

describe('tower unlock gate (docs/TOWERS.md §expansion)', () => {
  it('a fresh profile owns ONLY the starters — the expansion trio is dormant', () => {
    const d = defaultSave();
    expect(d.towerUnlocked).not.toContain('maw');
    expect(d.towerUnlocked).not.toContain('chrysalis');
    expect(d.towerUnlocked).not.toContain('effigy');
    expect(d.towerUnlocked).toContain('needle'); // the launch five are starters
    expect(d.towerUnlocked).toContain('obelisk');
  });

  it('a pre-gate save (no field) migrates to starters + grandfathers engaged towers', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.towerUnlocked;
    (legacy.towerStars as Record<string, number>).maw = 2; // the player had starred it
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.towerUnlocked).toContain('maw'); // no access stripped
      expect(r.data.towerUnlocked).not.toContain('chrysalis'); // untouched stays dormant
    }
  });

  it('a LOCKED conveyor favorite falls back to the starter default on load', () => {
    const tampered = { ...defaultSave(), favoriteTower: 'effigy' } as Record<string, unknown>;
    const r = parseImport(JSON.stringify(tampered));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.favoriteTower).toBe('needle'); // locked kinds can't anchor the belt
  });
});

describe('save export / import', () => {
  it('round-trips through serializeExport -> parseImport', () => {
    const data: SaveData = { ...defaultSave(), shards: 321, bestWave: 9, upgrades: { apex: 4 } };
    // A REAL save always carries a started idle clock — the default 0 is the migration trigger
    // (the sanitizer seeds it to now), so round-trip identity needs a sanitizer-stable stamp.
    data.idle = { ...data.idle, lastCollect: Date.now() - 60_000 };
    const r = parseImport(serializeExport(data));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(data);
  });

  it('accepts a bare, hand-edited SaveData object', () => {
    const r = parseImport(JSON.stringify({ ...defaultSave(), shards: 7 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.shards).toBe(7);
  });

  it('rejects garbage without throwing', () => {
    expect(parseImport('not json').ok).toBe(false);
    expect(parseImport('{"nope":true}').ok).toBe(false);
  });

  it('fills a loot queue for a pre-v4 save (additive migration)', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.lootQueue; // a save written before the loot queue existed
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lootQueue.queue.length).toBeGreaterThanOrEqual(2);
      expect(r.data.lootQueue.progress).toBe(0);
    }
  });

  it('fills the Gene Evolution fields for a pre-v18 save (additive migration)', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.genes; delete legacy.geneEssence; delete legacy.geneSlots; delete legacy.geneLoadout;
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.genes).toEqual({});
      expect(r.data.geneEssence).toBe(0);
      expect(r.data.geneSlots).toBe(1); // slot 1 is free
      expect(r.data.geneLoadout).toEqual([null, null, null, null, null]);
    }
  });

  it('sanitizes manipulated gene state on import (clamps + drops, never corrupts)', () => {
    const bad = {
      ...defaultSave(),
      genes: { __junk__: { level: 9 }, sharpened_needles: { level: 99, ascension: 7 } },
      geneEssence: -50, geneSlots: 99,
      geneLoadout: ['sharpened_needles', 'sharpened_needles', '__junk__', null],
    } as unknown as Record<string, unknown>;
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.genes.__junk__).toBeUndefined(); // unknown card dropped
      expect(r.data.genes.sharpened_needles.level).toBeLessThanOrEqual(5); // clamped to the authored ceiling
      expect(r.data.genes.sharpened_needles.ascension).toBeUndefined(); // no tiers authored ⇒ clamps to 0 (sparse)
      expect(r.data.geneEssence).toBe(0); // negative wallet floors at 0
      expect(r.data.geneSlots).toBeLessThanOrEqual(5); // slot count clamps to the ladder
      expect(r.data.geneLoadout.filter((id) => id === 'sharpened_needles')).toHaveLength(1); // deduped
      expect(r.data.geneLoadout).not.toContain('__junk__'); // unknown card dropped
    }
  });

  it('sanitizes the Bio-Spore bank (v48: 0 for pre-v48 saves, floors junk, caps at 999)', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.bioSpores;
    const r0 = parseImport(JSON.stringify(legacy));
    expect(r0.ok).toBe(true);
    if (r0.ok) expect(r0.data.bioSpores).toBe(0);
    const bad = { ...defaultSave(), bioSpores: 1e9 } as unknown as Record<string, unknown>;
    const r1 = parseImport(JSON.stringify(bad));
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.data.bioSpores).toBe(999); // forged bank clamps
    const neg = { ...defaultSave(), bioSpores: -4.5 } as unknown as Record<string, unknown>;
    const r2 = parseImport(JSON.stringify(neg));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.data.bioSpores).toBe(0);
  });

  it('sanitizes the expedition mastery ledger (v27: known ids, whole counts; pre-v27 deep-fills)', () => {
    const bad = {
      ...defaultSave(),
      expeditions: { active: [], mastery: { exp_patrol: 3.9, __junk__: 5, exp_relic: -2, exp_hunt: 'nope' } },
    } as unknown as Record<string, unknown>;
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.expeditions.mastery).toEqual({ exp_patrol: 3 }); // floored; junk/negative/NaN dropped
    }
    // A pre-v27 save (no mastery field) deep-fills an empty ledger.
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    legacy.expeditions = { active: [] };
    const l = parseImport(JSON.stringify(legacy));
    expect(l.ok).toBe(true);
    if (l.ok) expect(l.data.expeditions.mastery).toEqual({});
  });
});

describe('backups & corruption recovery', () => {
  it('backs up and restores a snapshot', () => {
    const store = new SaveStore(mem());
    store.save({ ...defaultSave(), shards: 100 });
    const b = store.backup();
    expect(b).not.toBeNull();
    store.save({ ...defaultSave(), shards: 0 }); // overwrite
    const restored = store.restoreBackup(b!.id);
    expect(restored?.shards).toBe(100);
    expect(store.load().shards).toBe(100);
  });

  it('recovers from a corrupt main save using the newest valid backup', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 250 });
    store.backup(); // snapshot the good state
    s.map.set('assimilate.save', '{corrupt'); // main save goes bad
    expect(store.load().shards).toBe(250); // recovered from backup, not defaults
  });

  it('keeps backups capped', () => {
    const store = new SaveStore(mem());
    for (let i = 0; i < 12; i++) {
      store.save({ ...defaultSave(), shards: i });
      store.backup();
    }
    expect(store.listBackups().length).toBeLessThanOrEqual(8);
  });
});

describe('v46→v47 migration — arena record + provenance ledger (docs/ONLINE-FOUNDATION.md)', () => {
  const V46ish = (): SaveData => {
    // A pre-v47 blob: the fields simply do not exist (JSON.stringify drops undefined),
    // with owned tradables in every category so the reconcile pass has work to do.
    const d = defaultSave() as unknown as Record<string, unknown>;
    delete d.arena;
    delete d.provenance;
    const save = d as unknown as SaveData;
    save.equipment = {
      inventory: [{ uid: 'it_legacy_1', defId: 'x', rarity: 'common', affixes: [], source: 'Genetic Vault' } as unknown as SaveData['equipment']['inventory'][number]],
      loadouts: {},
    };
    return save;
  };

  it('a pre-v47 save gains a fresh inert arena record and a fully-stamped provenance ledger', () => {
    const store = new SaveStore(mem());
    store.save(V46ish());
    const loaded = store.load();
    expect(loaded.arena).toEqual(defaultSave().arena);
    expect(loaded.arena.rating).toBe(0); // inert — no rating minted by migration
    // COVERAGE INVARIANT: every owned tradable is stamped (equipment + wardrobe + genes)
    expect(loaded.provenance['eq:it_legacy_1']).toMatchObject({ source: 'legacy', at: 0, bound: false });
    for (const id of loaded.wardrobe.owned) expect(loaded.provenance[`cos:${id}`]).toBeTruthy();
    for (const id of loaded.genesDiscovered) expect(loaded.provenance[`gene:${id}`]).toBeTruthy();
  });

  it('provenance prunes stamps for equipment that no longer exists and keeps real sources', () => {
    const store = new SaveStore(mem());
    const data = defaultSave();
    data.provenance = {
      'eq:gone_uid': { source: 'Genetic Vault', at: 5, season: 1, bound: false, transfers: 0, history: [] },
      [`gene:${data.genesDiscovered[0]}`]: { source: 'arena-pass', at: 9, season: 2, bound: true, transfers: 1, history: ['prev'] },
    };
    store.save(data);
    const loaded = store.load();
    expect(loaded.provenance['eq:gone_uid']).toBeUndefined(); // instance died ⇒ stamp pruned
    expect(loaded.provenance[`gene:${data.genesDiscovered[0]}`]).toMatchObject({ source: 'arena-pass', at: 9, season: 2, bound: true, transfers: 1 });
  });

  it('a junk arena blob degrades to a sane record (never crashes, never mints)', () => {
    const store = new SaveStore(mem());
    const data = defaultSave() as unknown as Record<string, unknown>;
    data.arena = { rating: -50, peak: 'NaN', wins: 3.9, placements: 99, exclusives: [7, 'tower:basilisk'], history: [null, { season: 2, rating: 1e12 }], settledMatchIds: 'nope' };
    store.save(data as unknown as SaveData);
    const loaded = store.load();
    expect(loaded.arena.rating).toBe(0);
    expect(loaded.arena.peak).toBe(0);
    expect(loaded.arena.wins).toBe(3);
    expect(loaded.arena.placements).toBeLessThanOrEqual(defaultSave().arena.placements);
    expect(loaded.arena.exclusives).toEqual(['tower:basilisk']);
    expect(loaded.arena.history).toEqual([{ season: 2, rating: 20_000, division: '', wins: 0, losses: 0 }]);
    expect(loaded.arena.settledMatchIds).toEqual([]);
  });

  it('a live arena record round-trips byte-exactly', () => {
    const store = new SaveStore(mem());
    const data = defaultSave();
    data.arena = {
      ...data.arena, season: 3, rating: 1712, peak: 1800, wins: 9, losses: 4, lifetimeWins: 40,
      lifetimeLosses: 22, placements: 0, streak: 2, lastPlayedAt: 1234567, passXp: 260,
      passPremium: true, passClaimedFree: [1, 2, 3], passClaimedPremium: [1],
      exclusives: ['tower:basilisk'], settledMatchIds: ['m_abcdefgh'],
      history: [{ season: 2, rating: 1500, division: 'Larval I', wins: 20, losses: 11 }],
    };
    store.save(data);
    expect(store.load().arena).toEqual(data.arena);
  });
});
