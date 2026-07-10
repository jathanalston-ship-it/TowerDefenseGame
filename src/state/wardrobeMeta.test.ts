// Wardrobe meta pipeline (docs/COSMETICS.md §wardrobe): the auto-unlock poll (grants +
// persisted ceremony queue), equip slots, favorites, the boutique, milestone claims,
// the reveal drain, payload resolution, and the save sanitizer's guarantees.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta, equippedWardrobe } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { boutiqueItems, starterItems, wardrobeItem, wardrobeRegistry, WARDROBE_MILESTONES } from '../core/wardrobe';

beforeEach(() => meta.reset());

/** Inject an arbitrary save through the REAL import path (parseImport → sanitizers). */
function inject(mutate: (s: SaveData) => SaveData): void {
  const result = meta.importText(serializeExport(mutate(defaultSave())));
  expect(result.ok).toBe(true);
}

describe('the auto-unlock poll', () => {
  it('a fresh account owns exactly the starters; the FIRST poll gifts only the Bronze Fret', () => {
    const save = meta.get();
    expect(new Set(save.wardrobe.owned)).toEqual(new Set(starterItems().map((d) => d.id)));
    // A new account's cache codex already reads Bronze overall → the "first frame" welcomes
    // the player with one earned unlock (and its ceremony) — deliberate onboarding.
    const first = meta.pollWardrobeUnlocks();
    expect(first.map((d) => d.id)).toEqual(['wd_collectionborder_bronze_fret']);
    expect(meta.get().wardrobe.pendingReveal).toEqual(['wd_collectionborder_bronze_fret']);
    expect(meta.pollWardrobeUnlocks()).toHaveLength(0); // idempotent after that
  });

  it('real progress grants the earned lanes ONCE and queues the ceremony', () => {
    inject((s) => ({
      ...s,
      bestWave: 40, // infinite-depth items to 40
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
      expect(save.wardrobe.owned).toContain(id);
      expect(save.wardrobe.pendingReveal).toContain(id);
    }
    expect(meta.pollWardrobeUnlocks()).toHaveLength(0); // idempotent
  });
});

describe('equip / favorites / randomize', () => {
  it('equips only owned items of the right kind; null clears', () => {
    const starter = starterItems()[0];
    expect(meta.equipWardrobe(starter.kind, starter.id)).toBe(true);
    expect(meta.get().wardrobe.equipped[starter.kind]).toBe(starter.id);
    expect(meta.equipWardrobe(starter.kind, null)).toBe(true);
    expect(meta.get().wardrobe.equipped[starter.kind]).toBeUndefined();
    const locked = boutiqueItems()[0];
    expect(meta.equipWardrobe(locked.kind, locked.id)).toBe(false); // unowned refused
    const title = starterItems().find((d) => d.kind === 'title')!;
    expect(meta.equipWardrobe('nucleusSkin', title.id)).toBe(false); // kind mismatch refused
  });

  it('favorites toggle only on owned items; randomize fills every owned kind', () => {
    const starter = starterItems()[0];
    expect(meta.toggleWardrobeFavorite(starter.id)).toBe(true);
    expect(meta.get().wardrobe.favorites).toContain(starter.id);
    expect(meta.toggleWardrobeFavorite(starter.id)).toBe(true);
    expect(meta.get().wardrobe.favorites).not.toContain(starter.id);
    expect(meta.toggleWardrobeFavorite('wd_nope')).toBe(false);
    meta.randomizeWardrobe();
    for (const d of starterItems()) expect(meta.get().wardrobe.equipped[d.kind]).toBeDefined();
  });

  it('markWardrobeSeen clears NEW badges', () => {
    meta.grantWardrobeItem(boutiqueItems()[0].id);
    expect(meta.get().wardrobe.owned.filter((id) => !meta.get().wardrobe.seen.includes(id)).length).toBeGreaterThan(0);
    meta.markWardrobeSeen();
    expect(meta.get().wardrobe.owned.every((id) => meta.get().wardrobe.seen.includes(id))).toBe(true);
  });
});

describe('the boutique', () => {
  it('buys spend Ichor, grant once, queue the ceremony; broke/dupe refused', () => {
    const item = boutiqueItems()[0];
    const price = item.source.kind === 'shop' ? item.source.ichor : 0;
    expect(meta.buyWardrobeItem(item.id)).toBe(false); // broke
    meta.grantIchor('test', price + 5);
    expect(meta.buyWardrobeItem(item.id)).toBe(true);
    const save = meta.get();
    expect(save.ichor).toBe(5);
    expect(save.wardrobe.owned).toContain(item.id);
    expect(save.wardrobe.pendingReveal).toContain(item.id);
    expect(meta.buyWardrobeItem(item.id)).toBe(false); // owned
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

  it('a rank-earned milestone claims ONCE and grants (currency + the exclusive item)', () => {
    // Own every wardrobe item EXCEPT the milestone exclusives → every codex hits max rank.
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
    expect(after.wardrobe.owned).toContain('wd_emblem_curator_s_eye'); // the exclusive lands
    expect(after.wardrobe.milestones).toContain('ms_identity_silver');
    expect(meta.claimWardrobeMilestone('ms_identity_silver')).toBeNull(); // once
  });
});

describe('resolution & sanitizer', () => {
  it('equippedWardrobe resolves payloads; nothing resolves beyond equipped slots', () => {
    const starterTitle = starterItems().find((d) => d.kind === 'title')!;
    meta.equipWardrobe('title', starterTitle.id);
    const w = equippedWardrobe(meta.get());
    expect(w.title?.text).toBe(wardrobeItem(starterTitle.id)!.payload.text);
    expect(w.uiTheme).toBeUndefined();
  });

  it('the sanitizer re-seeds starters, drops junk ids and kind-mismatched equips', () => {
    const title = starterItems().find((d) => d.kind === 'title')!;
    inject((s) => ({
      ...s,
      wardrobe: {
        owned: ['wd_fake_item'],
        equipped: { title: 'wd_fake_item', nucleusSkin: title.id } as SaveData['wardrobe']['equipped'],
        favorites: ['wd_fake_item'],
        seen: ['wd_fake_item'],
        milestones: ['ms_fake'],
        pendingReveal: ['wd_fake_item'],
      },
    }));
    const w = meta.get().wardrobe;
    expect(w.owned).not.toContain('wd_fake_item');
    for (const d of starterItems()) expect(w.owned).toContain(d.id); // starters always return
    expect(w.equipped.title).toBeUndefined();
    expect(w.equipped.nucleusSkin).toBeUndefined(); // a title can't sit in the nucleus slot
    expect(w.favorites).toHaveLength(0);
    expect(w.milestones).toHaveLength(0);
    expect(w.pendingReveal).toHaveLength(0);
  });
});
