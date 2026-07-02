// Tower Codex read-model (docs/TOWER-CODEX.md §3): every tower yields previewable star stages
// (1/3/5/7/9) + both branch specializations (T1-5), with ownership/cap state — all without owning.

import { describe, it, expect } from 'vitest';
import { STAR_PREVIEW_STAGES, towerCodex } from './towerCodexModel';
import { TOWER_ORDER } from '../core/config';
import { defaultSave } from '../save/saveStore';

describe('tower codex model', () => {
  it('exposes the five preview star stages for every tower', () => {
    const save = defaultSave();
    for (const k of TOWER_ORDER) {
      const cx = towerCodex(save, k);
      expect(cx.stages.map((s) => s.star)).toEqual([...STAR_PREVIEW_STAGES]);
    }
  });

  it('previews BOTH branch specializations, each with tiers 1-5', () => {
    const cx = towerCodex(defaultSave(), 'needle');
    expect(cx.branches.length).toBe(2);
    for (const b of cx.branches) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
      for (const t of b.tiers) expect(t.name.length).toBeGreaterThan(0); // viewable without owning
    }
  });

  it('tags stages owned / reachable / locked by stars + the Campaign Evolution Cap', () => {
    const save = defaultSave();
    save.campaign.cleared = { standard: 50 }; // EVOLUTION_CAPS → cap ◈5
    save.towerStars.needle = 3; // owns up to ◈3
    const cx = towerCodex(save, 'needle');
    expect(cx.starCap).toBe(5);
    const byStar = Object.fromEntries(cx.stages.map((s) => [s.star, s]));
    expect(byStar[1].state).toBe('owned');
    expect(byStar[3].state).toBe('owned');
    expect(byStar[5].state).toBe('reachable'); // ≤ cap, not yet owned
    expect(byStar[7].state).toBe('locked'); // beyond the campaign-unlocked cap
    expect(byStar[9].state).toBe('locked');
    expect(byStar[7].unlockHint).toMatch(/Campaign Stage/); // tells the player how to unlock it

    save.campaign.cleared = { standard: 300 }; // all caps cleared → cap ◈10
    const cx2 = towerCodex(save, 'needle');
    expect(cx2.starCap).toBe(10);
    expect(cx2.stages.find((s) => s.star === 9)!.state).toBe('reachable'); // now unlocked
  });

  it('reports the current form: stars, branch, mastery, unlocked abilities', () => {
    const save = defaultSave();
    save.towerStars.needle = 5;
    const cx = towerCodex(save, 'needle');
    expect(cx.stars).toBe(5);
    expect(typeof cx.currentBranch).toBe('string');
    expect(cx.mastery.level).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(cx.abilities)).toBe(true); // ability-granting steps owned so far
  });
});
