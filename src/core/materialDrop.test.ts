import { describe, it, expect } from 'vitest';
import { rollMaterialDrop, MATERIAL_META, RARE_MATERIAL } from './materialDrop';
import { MATERIAL_DROP } from './config';

/** A scripted rng: returns each queued value in order, then holds the last (defaults to 0.5). */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : (vals[vals.length - 1] ?? 0.5));
}

const base = { containerRarity: 'common' as const, power: 0, campaignStage: 0 };

describe('crafting-material drops (pity-protected, scaled)', () => {
  it('a dry container drops nothing and increments the pity counter', () => {
    const r = rollMaterialDrop({ ...base, pity: 3, rng: seq(1) }); // 1 ≥ dropChance ⇒ no drop
    expect(r.drop).toBeNull();
    expect(r.pity).toBe(4);
  });

  it('materials stay SECONDARY — the base drop chance is below the equipment chance', () => {
    // (documents intent; EQUIP_DROP_CHANCE is 0.5)
    expect(MATERIAL_DROP.baseChance).toBeLessThan(0.5);
  });

  it('a common drop yields mutagen/scrap in a small stack and still advances pity', () => {
    const r = rollMaterialDrop({ ...base, pity: 0, rng: seq(0, 0.999, 0, 0) }); // drop, not-rare, mat[0], amount lo
    expect(r.drop).not.toBeNull();
    expect(['mutagen', 'scrap']).toContain(r.drop!.mat);
    expect(r.drop!.amount).toBeGreaterThanOrEqual(1);
    expect(r.drop!.amount).toBeLessThanOrEqual(MATERIAL_DROP.commonMax);
    expect(r.pity).toBe(1); // a common drop does NOT reset the rare pity
  });

  it('the RARE catalyst is pity-protected: guaranteed on the Nth dry container, and resets pity', () => {
    const onThreshold = rollMaterialDrop({ ...base, pity: MATERIAL_DROP.rarePity - 1, rng: seq(1, 1) }); // even hostile rng
    expect(onThreshold.drop!.mat).toBe(RARE_MATERIAL);
    expect(onThreshold.drop!.rarity).toBe('legendary');
    expect(onThreshold.pity).toBe(0); // guarantee spent → counter reset
  });

  it('a natural catalyst (high roll) also resets pity to 0', () => {
    const r = rollMaterialDrop({ ...base, power: 20000, campaignStage: 200, pity: 5, rng: seq(0, 0) }); // drop, rare
    expect(r.drop!.mat).toBe(RARE_MATERIAL);
    expect(r.pity).toBe(0);
  });

  it('common-stack quantity scales up with account strength', () => {
    const rng = () => 0; // deterministic: drop, not-rare, mat[0], amount lo
    const low = rollMaterialDrop({ containerRarity: 'common', power: 0, campaignStage: 0, pity: 1, rng: seq(0, 0.999, 0, 0) });
    const high = rollMaterialDrop({ containerRarity: 'exotic', power: 30000, campaignStage: 300, pity: 1, rng: seq(0, 0.999, 0, 0) });
    expect(high.drop!.amount).toBeGreaterThan(low.drop!.amount);
    void rng;
  });

  it('each material has a distinct identity (name/color/icon) for the reveal', () => {
    const colors = Object.values(MATERIAL_META).map((m) => m.color);
    expect(new Set(colors).size).toBe(colors.length); // all distinct
    expect(MATERIAL_META.catalyst.tier).toBe('rare');
    expect(MATERIAL_META.mutagen.tier).toBe('common');
  });
});
