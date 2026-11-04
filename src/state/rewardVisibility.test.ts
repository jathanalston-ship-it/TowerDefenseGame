// PLAYER-FACING CURRENCIES (docs/ECONOMY.md §player-facing) — the presentation gate: a currency
// never shows before the system that spends it, early drops bank silently, and the secondary
// wallets read as ONE Materials group. The economy itself is untouched (asserted below).

import { describe, expect, it } from 'vitest';
import { defaultSave, type SaveData } from '../save/saveStore';
import {
  MATERIAL_KEYS, materialWallets, playerFacingCurrencies, presentRewardEvent, rewardItemVisible, rewardVisible, visibleChests,
} from './rewardVisibility';
import { FEATURE_BY_ID } from './unlocks';
import { REWARD_TYPES } from './rewardToast';
import type { ChestResult } from './lootbox';

function at(stage: number, over: Partial<SaveData> = {}): SaveData {
  const s = defaultSave();
  return { ...s, totalRuns: Math.max(1, stage), campaign: { ...s.campaign, cleared: stage > 0 ? { standard: stage } : {} }, ...over };
}

describe('player-facing currency budget', () => {
  it('the first stages show ≤4 currencies: Biomass, Cores, Samples/Apex — Ichor joins with the Market', () => {
    for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
      const v = playerFacingCurrencies(at(stage));
      expect(v.currencies.length, `stage ${stage}: ${v.currencies.join(', ')}`).toBeLessThanOrEqual(3);
    }
    const market = playerFacingCurrencies(at(8));
    expect(market.currencies).toEqual(['Biomass', 'Genome Cores', 'Strain Samples / Apex Genome', 'Ichor']);
    // …and it stays at four through the first hours (Boss Rush opens at 12 and brings Bio-Spores).
    expect(playerFacingCurrencies(at(11)).currencies.length).toBe(4);
  });

  it('banked wallets surface AT the reveal — never before, never lost', () => {
    const rich = { geneEssence: 300, ichor: 40, lifetimeIchor: 40, antigen: 2, bioSpores: 3, hiveMaterials: 50, mulliganTissue: 25 };
    const early = at(3, { ...rich, mats: { mutagen: 4, scrap: 2, catalyst: 1 } });
    expect(rewardVisible(early, 'ichor')).toBe(false);
    expect(rewardVisible(early, 'geneEssence')).toBe(false);
    expect(materialWallets(early)).toEqual([]);
    expect(playerFacingCurrencies(early).materialsChip).toBe(false);
    // The economy is untouched: the balances are all still there…
    expect(early.geneEssence + early.ichor + early.antigen + early.mats.catalyst).toBe(343);
    // …and the reveal hands them over as one balance.
    const archive = at(4, { ...rich, mats: { mutagen: 4, scrap: 2, catalyst: 1 } });
    expect(materialWallets(archive).map((w) => [w.key, w.amount])).toEqual([['geneEssence', 300]]);
    const armory = at(6, { ...rich, mats: { mutagen: 4, scrap: 2, catalyst: 1 } });
    expect(materialWallets(armory).map((w) => w.key)).toEqual(['geneEssence', 'mutagen', 'scrap', 'catalyst']);
    expect(rewardVisible(at(8), 'ichor')).toBe(true);
  });

  it('every gate names a real unlock-registry feature, and every Materials member is a toastable kind', () => {
    for (const k of MATERIAL_KEYS) expect(REWARD_TYPES.some((t) => t.id === k), k).toBe(true);
    expect(REWARD_TYPES.some((t) => t.id === 'materials')).toBe(true);
    for (const k of ['geneEssence', 'ichor', 'cells', 'antigen', 'mutagen', 'hiveMaterials', 'mulliganTissue', 'bpXp', 'equipment', 'bioSpores', 'cosmetic']) {
      // rewardVisible must resolve without throwing (an unknown feature id would throw in featureView).
      expect(() => rewardVisible(at(0), k)).not.toThrow();
    }
    expect(FEATURE_BY_ID.has('cur:mats')).toBe(true);
  });
});

describe('toasts, vault reveals and run summaries', () => {
  it('a hidden kind toasts nothing; a Materials member toasts as one grouped Materials card', () => {
    expect(presentRewardEvent(at(2), { type: 'geneEssence', qty: 40, source: 'Vault' })).toBeNull();
    expect(presentRewardEvent(at(2), { type: 'bpXp', qty: 100, source: 'Run' })).toBeNull();
    expect(presentRewardEvent(at(2), { type: 'genomeCores', qty: 100, source: 'Run' })?.type).toBe('genomeCores');
    const mat = presentRewardEvent(at(6), { type: 'scrap', qty: 3, source: 'Vault' });
    expect(mat).toMatchObject({ type: 'materials', name: 'Scrap', qty: 3 });
    const ess = presentRewardEvent(at(6), { type: 'geneEssence', qty: 40, source: 'Vault' });
    expect(ess).toMatchObject({ type: 'materials', name: 'Gene Essence' });
    expect(ess?.nav?.key).toBe('genes'); // the member keeps its own jump
  });

  it('the Vault ceremony hides pulls whose system is sealed, keeps new strands and core loot', () => {
    const chest: ChestResult = {
      chestId: 'run', topRarity: 'common', items: [
        { type: 'tower', rarity: 'common', kind: 'spitter' as never, amount: 3 },
        { type: 'event', rarity: 'common', currency: 'geneEssence', amount: 20, note: 'Gene Bleed' },
        { type: 'material', rarity: 'common', mat: 'scrap', amount: 2 },
        { type: 'gene', rarity: 'rare', cardRarity: 'rare', cardId: 'x', isNew: true },
        { type: 'gene', rarity: 'rare', cardRarity: 'rare', cardId: 'y', isNew: false, echoEssence: 9 },
        { type: 'event', rarity: 'epic', currency: 'ichor', amount: 5, note: 'Ichor Bleed' },
      ],
    } as unknown as ChestResult;
    const [early] = visibleChests(at(1), [chest]);
    expect(early.items.map((i) => i.type)).toEqual(['tower', 'gene']);
    const [late] = visibleChests(at(8), [chest]);
    expect(late.items.length).toBe(6);
    expect(rewardItemVisible(at(1), { type: 'equipment', rarity: 'common', item: {} as never })).toBe(false);
  });
});
