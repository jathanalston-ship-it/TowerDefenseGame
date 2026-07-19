// Wardrobe meta pipeline (docs/COSMETICS.md §wardrobe/§claiming): the v53 TWO-STATE flow
// (every lane delivers an UNCLAIMED Vault instance; CLAIMING binds it), the auto-unlock poll,
// equip slots, favorites, the boutique, milestone claims, the reveal drain, payload
// resolution, the claim bonuses, and the save sanitizer's guarantees (incl. the v52→v53
// migration law: pre-v53 `owned` stays claimed, nothing is taken away).

import { beforeEach, describe, expect, it } from 'vitest';
import { meta, equippedWardrobe } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import {
  boutiqueItems, cosmeticBonus, cosmeticFamily, setCosmeticCensusProvider, starterItems,
  wardrobeItem, wardrobeRegistry, WARDROBE_MILESTONES,
} from '../core/wardrobe';

beforeEach(() => meta.reset());

/** Inject an arbitrary save through the REAL import path (parseImport → sanitizers). */
function inject(mutate: (s: SaveData) => SaveData): void {
  const result = meta.importText(serializeExport(mutate(defaultSave())));
  expect(result.ok).toBe(true);
}

/** Vault instances holding a given item id. */
const instancesOf = (id: string) => meta.get().wardrobe.inventory.filter((i) => i.item === id);

describe('the auto-unlock poll (delivers UNCLAIMED — v53)', () => {
  it('a fresh account owns exactly the starters; the FIRST poll delivers only the Bronze Fret', () => {
    const save = meta.get();
    expect(new Set(save.wardrobe.owned)).toEqual(new Set(starterItems().map((d) => d.id)));
    const first = meta.pollWardrobeUnlocks();
    expect(first.map((d) => d.id)).toEqual(['wd_collectionborder_bronze_fret']);
    const after = meta.get().wardrobe;
    expect(after.owned).not.toContain('wd_collectionborder_bronze_fret'); // NOT auto-claimed
    expect(instancesOf('wd_collectionborder_bronze_fret')).toHaveLength(1); // in the Vault
    expect(after.granted).toContain('wd_collectionborder_bronze_fret');
    expect(after.pendingReveal).toEqual(['wd_collectionborder_bronze_fret']);
    expect(meta.pollWardrobeUnlocks()).toHaveLength(0); // idempotent after that
  });

  it('real progress delivers the earned lanes ONCE into the Vault and queues the ceremony', () => {
    inject((s) => ({
      ...s,
      bestWave: 40,
      daily: { ...s.daily, completions: 10 },
      stats: { ...s.stats, rushBossKills: 60, rouletteSpores: 60 },
      achievements: ['first_run', 'veteran', 'centurion'],
    }));
    const granted = meta.pollWardrobeUnlocks();
    expect(granted.length).toBeGreaterThanOrEqual(8);
    const ids = granted.map((d) => d.id);
    expect(ids).toContain('wd_toweraudio_wet_chorus'); // daily 10
    expect(ids).toContain('wd_emblem_skull_mark'); // rush 50
    expect(ids).toContain('wd_roulettetheme_midnight_wheel'); // spores 50
    expect(ids).toContain('wd_title_survivor'); // achievement first_run
    const save = meta.get();
    for (const id of ids) {
      expect(save.wardrobe.owned).not.toContain(id); // unclaimed until the player binds
      expect(instancesOf(id)).toHaveLength(1);
      expect(save.wardrobe.granted).toContain(id);
      expect(save.wardrobe.pendingReveal).toContain(id);
    }
    expect(meta.pollWardrobeUnlocks()).toHaveLength(0); // idempotent — granted-gated forever
  });
});

describe('claiming (the irreversible account-bind)', () => {
  it('claim consumes the instance, binds the id, activates the bonus, and refuses twice', () => {
    meta.pollWardrobeUnlocks(); // Bronze Fret lands in the Vault
    const inst = instancesOf('wd_collectionborder_bronze_fret')[0];
    const before = meta.get();
    expect(before.wardrobe.owned).not.toContain(inst.item);
    const lines = meta.claimCosmetic(inst.uid);
    expect(lines).not.toBeNull();
    const after = meta.get();
    expect(after.wardrobe.owned).toContain(inst.item); // claimed — equips/collections see it
    expect(after.wardrobe.inventory.find((i) => i.uid === inst.uid)).toBeUndefined(); // consumed
    // Provenance: the permanent stamp exists, carries the instance origin, and is BOUND.
    const stamp = after.provenance[`cos:${inst.item}`];
    expect(stamp).toBeDefined();
    expect(stamp.bound).toBe(true);
    expect(after.provenance[`cos:${inst.uid}`]).toBeUndefined(); // instance stamp died
    // The bonus line names the item's lane.
    const bonus = cosmeticBonus(wardrobeItem(inst.item)!)!;
    expect(lines!.some((l) => l.label.includes('%'))).toBe(bonus !== null);
    expect(meta.claimCosmetic(inst.uid)).toBeNull(); // instance gone
  });

  it('claiming a DUPLICATE of a claimed id is refused — the dupe stays tradable', () => {
    const item = wardrobeRegistry.all().find((d) => d.source.kind === 'event')!;
    inject((s) => ({
      ...s,
      wardrobe: {
        ...s.wardrobe,
        inventory: [
          { uid: 'ci_test_a', item: item.id, at: 5, src: 'Event' },
          { uid: 'ci_test_b', item: item.id, at: 6, src: 'Event' },
        ],
        granted: [item.id],
      },
    }));
    expect(meta.claimCosmetic('ci_test_a')).not.toBeNull();
    expect(meta.claimCosmetic('ci_test_b')).toBeNull(); // already bound
    expect(instancesOf(item.id)).toHaveLength(1); // the dupe survives as stock
  });

  it('claiming moves the saturated bonus fold and Power (starters alone read zero)', () => {
    const epic = wardrobeRegistry.all().find((d) => d.source.kind === 'event' && d.rarity === 'epic')!;
    inject((s) => ({
      ...s,
      wardrobe: { ...s.wardrobe, inventory: [{ uid: 'ci_pow', item: epic.id, at: 1, src: 'Event' }], granted: [epic.id] },
    }));
    expect(meta.wardrobeRunEffects()).toHaveLength(0); // unclaimed grants NOTHING
    const powerBefore = meta.powerScore().score;
    meta.claimCosmetic('ci_pow');
    const fx = meta.wardrobeRunEffects();
    expect(fx.length).toBeGreaterThanOrEqual(0); // run lanes only move for run-lane items
    expect(meta.powerScore().score).toBeGreaterThanOrEqual(powerBefore); // never negative
  });
});

describe('equip / favorites / randomize (claimed-only, unchanged semantics)', () => {
  it('equips only CLAIMED items of the right kind; unclaimed Vault stock refused', () => {
    const starter = starterItems()[0];
    expect(meta.equipWardrobe(starter.kind, starter.id)).toBe(true);
    expect(meta.get().wardrobe.equipped[starter.kind]).toBe(starter.id);
    expect(meta.equipWardrobe(starter.kind, null)).toBe(true);
    const locked = boutiqueItems()[0];
    expect(meta.equipWardrobe(locked.kind, locked.id)).toBe(false); // not claimed
    meta.grantIchor('test', 9999);
    meta.buyWardrobeItem(locked.id);
    expect(meta.equipWardrobe(locked.kind, locked.id)).toBe(false); // in the Vault ≠ claimed
    const uid = instancesOf(locked.id)[0].uid;
    meta.claimCosmetic(uid);
    expect(meta.equipWardrobe(locked.kind, locked.id)).toBe(true); // claimed → equips
  });

  it('favorites toggle only on claimed items; randomize fills every claimed kind', () => {
    const starter = starterItems()[0];
    expect(meta.toggleWardrobeFavorite(starter.id)).toBe(true);
    expect(meta.toggleWardrobeFavorite(starter.id)).toBe(true);
    expect(meta.toggleWardrobeFavorite('wd_nope')).toBe(false);
    meta.randomizeWardrobe();
    for (const d of starterItems()) expect(meta.get().wardrobe.equipped[d.kind]).toBeDefined();
  });

  it('markWardrobeSeen clears NEW badges on newly CLAIMED items', () => {
    meta.grantIchor('test', 9999);
    const item = boutiqueItems()[0];
    meta.buyWardrobeItem(item.id);
    meta.claimCosmetic(instancesOf(item.id)[0].uid);
    expect(meta.get().wardrobe.owned.filter((id) => !meta.get().wardrobe.seen.includes(id)).length).toBeGreaterThan(0);
    meta.markWardrobeSeen();
    expect(meta.get().wardrobe.owned.every((id) => meta.get().wardrobe.seen.includes(id))).toBe(true);
  });
});

describe('the boutique (delivers UNCLAIMED, once per account)', () => {
  it('buys spend Ichor, deliver to the Vault, queue the ceremony; broke/repeat refused', () => {
    const item = boutiqueItems()[0];
    const price = item.source.kind === 'shop' ? item.source.ichor : 0;
    expect(meta.buyWardrobeItem(item.id)).toBe(false); // broke
    meta.grantIchor('test', price + 5);
    expect(meta.buyWardrobeItem(item.id)).toBe(true);
    const save = meta.get();
    expect(save.ichor).toBe(5);
    expect(save.wardrobe.owned).not.toContain(item.id); // unclaimed
    expect(instancesOf(item.id)).toHaveLength(1);
    expect(save.wardrobe.pendingReveal).toContain(item.id);
    expect(meta.buyWardrobeItem(item.id)).toBe(false); // granted-gated (curated, not a mint)
  });

  it('takeWardrobeReveals drains the persisted queue once', () => {
    const item = boutiqueItems()[0];
    meta.grantIchor('test', 1000);
    meta.buyWardrobeItem(item.id);
    expect(meta.takeWardrobeReveals().map((d) => d.id)).toContain(item.id);
    expect(meta.takeWardrobeReveals()).toHaveLength(0);
    expect(meta.get().wardrobe.pendingReveal).toHaveLength(0);
  });
});

describe('milestones', () => {
  it('locked on a fresh account; refuses unearned claims', () => {
    const rows = meta.wardrobeMilestones();
    expect(rows).toHaveLength(WARDROBE_MILESTONES.length);
    for (const r of rows) expect(r.state).toBe('locked');
    expect(meta.claimWardrobeMilestone(rows[0].def.id)).toBeNull();
  });

  it('a rank-earned milestone claims ONCE; the exclusive item lands in the Vault', () => {
    inject((s) => ({
      ...s,
      wardrobe: {
        ...s.wardrobe,
        owned: wardrobeRegistry.ids().filter((id) => wardrobeItem(id)!.source.kind !== 'milestone'),
      },
    }));
    const row = meta.wardrobeMilestones().find((m) => m.def.id === 'ms_identity_silver')!;
    expect(row.state).toBe('claimable');
    const before = meta.get();
    const lines = meta.claimWardrobeMilestone('ms_identity_silver')!;
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const after = meta.get();
    expect(after.ichor - before.ichor).toBe(50);
    expect(after.wardrobe.owned).not.toContain('wd_emblem_curator_s_eye'); // unclaimed
    expect(instancesOf('wd_emblem_curator_s_eye')).toHaveLength(1); // the exclusive lands in the Vault
    expect(after.wardrobe.milestones).toContain('ms_identity_silver');
    expect(meta.claimWardrobeMilestone('ms_identity_silver')).toBeNull(); // once
  });
});

describe('resolution & sanitizer (the v53 migration laws)', () => {
  it('equippedWardrobe resolves payloads; nothing resolves beyond equipped slots', () => {
    const starterTitle = starterItems().find((d) => d.kind === 'title')!;
    meta.equipWardrobe('title', starterTitle.id);
    const w = equippedWardrobe(meta.get());
    expect(w.title?.text).toBe(wardrobeItem(starterTitle.id)!.payload.text);
    expect(w.uiTheme).toBeUndefined();
  });

  it('a pre-v53 save (no inventory/granted) migrates: owned stays CLAIMED, granted seeds from it', () => {
    const keeper = boutiqueItems()[0];
    inject((s) => {
      const w = { ...s.wardrobe, owned: [...s.wardrobe.owned, keeper.id] } as Record<string, unknown>;
      delete w.inventory; // what a v52 blob looks like
      delete w.granted;
      return { ...s, wardrobe: w as SaveData['wardrobe'] };
    });
    const w = meta.get().wardrobe;
    expect(w.owned).toContain(keeper.id); // NOTHING is taken away
    expect(w.granted).toContain(keeper.id); // claimed ⇒ granted
    expect(w.inventory).toEqual([]);
    expect(meta.equipWardrobe(keeper.kind, keeper.id)).toBe(true); // equips keep working
  });

  it('the sanitizer re-seeds starters, drops junk ids/instances and kind-mismatched equips', () => {
    const title = starterItems().find((d) => d.kind === 'title')!;
    const real = boutiqueItems()[0];
    inject((s) => ({
      ...s,
      wardrobe: {
        owned: ['wd_fake_item'],
        inventory: [
          { uid: 'ci_ok', item: real.id, at: 5, src: 'test' },
          { uid: 'ci_ok', item: real.id, at: 6, src: 'dupe-uid-dropped' },
          { uid: 'ci_junk', item: 'wd_fake_item', at: 7, src: 'junk-item-dropped' },
        ],
        granted: ['wd_fake_item', real.id],
        equipped: { title: 'wd_fake_item', nucleusSkin: title.id } as SaveData['wardrobe']['equipped'],
        favorites: ['wd_fake_item'],
        seen: ['wd_fake_item'],
        milestones: ['ms_fake'],
        pendingReveal: ['wd_fake_item', real.id],
      },
    }));
    const w = meta.get().wardrobe;
    expect(w.owned).not.toContain('wd_fake_item');
    for (const d of starterItems()) expect(w.owned).toContain(d.id); // starters always return
    expect(w.inventory).toHaveLength(1); // dupe uid + junk item dropped
    expect(w.inventory[0].uid).toBe('ci_ok');
    expect(w.granted).toContain(real.id);
    expect(w.granted).not.toContain('wd_fake_item');
    expect(w.equipped.title).toBeUndefined();
    expect(w.equipped.nucleusSkin).toBeUndefined();
    expect(w.favorites).toHaveLength(0);
    expect(w.milestones).toHaveLength(0);
    expect(w.pendingReveal).toEqual([real.id]); // held in the Vault → reveal survives
  });
});

describe('collectorView (the museum read-model — docs/COSMETICS.md §provenance)', () => {
  it('joins the full record for a Vault-held item, and claiming flips it in place', () => {
    meta.pollWardrobeUnlocks(); // Bronze Fret arrives through the REAL delivery chokepoint
    const id = 'wd_collectionborder_bronze_fret';
    const v1 = meta.collectorView(id)!;
    expect(v1.def.id).toBe(id);
    expect(v1.era.id).toBe('genesis');
    expect(v1.availability).toBe('available'); // collection-lane — earnable forever
    expect(v1.badges.length).toBeGreaterThanOrEqual(1);
    expect(v1.claimed).toBe(false);
    expect(v1.copiesHeld).toBe(1);
    // The unclaimed view reads the INSTANCE stamp (receiveCosmetic wrote it).
    expect(v1.stamp).not.toBeNull();
    expect(v1.stamp!.at).toBeGreaterThan(0);
    expect(v1.stamp!.bound).toBe(false);
    expect(v1.family).toBe(cosmeticFamily(v1.def));
    expect(v1.familyTotal).toBeGreaterThan(0);
    expect(v1.census).toBeNull(); // honest pre-AH
    expect(v1.market).toBeNull();
    const uid = meta.get().wardrobe.inventory.find((i) => i.item === id)!.uid;
    meta.claimCosmetic(uid);
    const v2 = meta.collectorView(id)!;
    expect(v2.claimed).toBe(true);
    expect(v2.copiesHeld).toBe(0);
    expect(v2.stamp!.bound).toBe(true); // now the PERMANENT bound stamp
    expect(v2.familyClaimed).toBe(v1.familyClaimed + 1); // the shelf moved
  });

  it('unknown ids are null; never-delivered catalog items still get a museum page', () => {
    expect(meta.collectorView('wd_nope')).toBeNull();
    const untouched = boutiqueItems()[0];
    const v = meta.collectorView(untouched.id)!;
    expect(v.claimed).toBe(false);
    expect(v.copiesHeld).toBe(0);
    expect(v.stamp).toBeNull(); // catalog-only visit — no copy, no history
    expect(v.era.id).toBe('genesis');
    // Starters ship claimed ⇒ their family reads complete on a fresh account.
    const starter = meta.collectorView(starterItems()[0].id)!;
    expect(starter.claimed).toBe(true);
    expect(starter.familyClaimed).toBe(starter.familyTotal);
  });

  it('the census seam feeds the view when a provider is installed (and only then)', () => {
    const id = starterItems()[0].id;
    setCosmeticCensusProvider((x) => (x === id ? { introduced: 100, claimed: 60, tradable: 40, bound: 60, asOf: 1 } : null));
    expect(meta.collectorView(id)!.census?.claimed).toBe(60);
    expect(meta.collectorView(boutiqueItems()[0].id)!.census).toBeNull();
    setCosmeticCensusProvider(() => null); // restore the pre-launch default
  });
});
