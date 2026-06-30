// Tower management invariants (docs/TOWER-MANAGEMENT.md): Sell refund math (never punishing,
// never exploitable, future-proof fraction) + Relocation (Build-Phase only, relocates the SAME
// object so all runtime state transfers, returns to Inspect).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { TOWER_DEFS, BRANCH_COSTS, SELL } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function freshGame(): Game {
  const g = new Game(123, NO_META);
  g.biomass = 1_000_000; // plenty to build/upgrade in prep
  return g;
}
/** The first N currently-unlocked, distinct build slots. */
function openSlots(g: Game, n: number) {
  return towerSlots.filter((s) => s.index < g.unlockedSlots).slice(0, n);
}

describe('tower sell', () => {
  it('refunds 75% of the purchase cost, frees the slot, and removes the tower', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.placeTower('needle', s0.x, s0.y);
    const before = g.biomass;
    const id = g.towers[0].id;
    const expected = Math.round(SELL.refundFrac * TOWER_DEFS.needle.cost);

    const q = g.sellQuote(id)!;
    expect(q.investment).toBe(TOWER_DEFS.needle.cost);
    expect(q.towerRefund).toBe(expected);
    expect(q.total).toBe(expected);

    expect(g.sellTower(id)).toBe(true);
    expect(g.biomass).toBe(before + expected);
    expect(g.towers.length).toBe(0); // removed
    expect(g.placeTower('mortar', s0.x, s0.y)).toBe(true); // slot freed immediately (rebuildable)
  });

  it('also refunds 75% of every branch tier bought (rounded cleanly, parts add up)', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.placeTower('needle', s0.x, s0.y);
    const t = g.towers[0];
    t.tier = 3; t.branchId = 'x'; // simulate 3 branch tiers bought

    const ladder = BRANCH_COSTS.needle;
    const branchTotal = ladder[0] + ladder[1] + ladder[2];
    const towerRefund = Math.round(SELL.refundFrac * TOWER_DEFS.needle.cost);
    const branchRefund = Math.round(SELL.refundFrac * branchTotal);

    const q = g.sellQuote(t.id)!;
    expect(q.investment).toBe(TOWER_DEFS.needle.cost + branchTotal);
    expect(q.towerRefund).toBe(towerRefund);
    expect(q.branchRefund).toBe(branchRefund);
    expect(q.total).toBe(towerRefund + branchRefund);

    const before = g.biomass;
    g.sellTower(t.id);
    expect(g.biomass).toBe(before + towerRefund + branchRefund);
  });

  it('is never exploitable — refund is strictly less than the investment', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.placeTower('mortar', s0.x, s0.y);
    const q = g.sellQuote(g.towers[0].id)!;
    expect(q.total).toBeLessThan(q.investment); // buy→sell always loses biomass (frac < 1)
  });

  it('honours a future-modified refund fraction (the extensibility hook)', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.mods.sellRefundFrac = 1.0; // e.g. a Gene Card / prestige perk grants a full refund
    g.placeTower('needle', s0.x, s0.y);
    expect(g.sellQuote(g.towers[0].id)!.total).toBe(TOWER_DEFS.needle.cost);
  });

  it('can sell during combat but not after the run ends; selling closes Inspect', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.placeTower('needle', s0.x, s0.y);
    const id = g.towers[0].id;
    g.selectPlacedTower(id);
    g.startWave(); // → combat
    expect(g.phase).toBe('wave');
    expect(g.sellTower(id)).toBe(true); // allowed mid-run
    expect(g.selectedPlacedId).toBeNull(); // Inspect closed

    const g2 = freshGame();
    const [t0] = openSlots(g2, 1);
    g2.placeTower('needle', t0.x, t0.y);
    g2.phase = 'lost';
    expect(g2.sellTower(g2.towers[0].id)).toBe(false); // blocked once the run is over
  });
});

describe('tower relocation', () => {
  it('relocates the SAME object — all runtime state transfers; slot moves; caches stay coherent', () => {
    const g = freshGame();
    const [s0, s1] = openSlots(g, 2);
    g.placeTower('needle', s0.x, s0.y);
    const t = g.towers[0];
    // Stamp distinctive runtime state — relocation must preserve every field by object identity.
    t.tier = 2; t.branchId = 'evolve'; t.cooldown = 0.37; t.pulseCd = 1.1; t.bornAt = 5; t.mutatedAt = 8;

    g.beginMove(t.id);
    expect(g.movingTowerId).toBe(t.id);
    expect(g.moveTower(s1.x, s1.y)).toBe('ok');

    const after = g.towers[0];
    expect(after).toBe(t); // SAME object (not destroyed + recreated)
    expect(after.slot).toBe(s1.index);
    expect(after.x).toBe(s1.x);
    expect(after.y).toBe(s1.y);
    // Everything preserved:
    expect(after.tier).toBe(2);
    expect(after.branchId).toBe('evolve');
    expect(after.cooldown).toBe(0.37);
    expect(after.pulseCd).toBe(1.1);
    expect(after.bornAt).toBe(5); // visual evolution age NOT reset
    expect(after.mutatedAt).toBe(8);
    // Slots: old freed, new taken → rebuild on the old slot, but not on the new one.
    expect(g.placeTower('mortar', s0.x, s0.y)).toBe(true);
    expect(g.placeTower('mortar', s1.x, s1.y)).toBe(false);
    // Returns to Inspect automatically.
    expect(g.movingTowerId).toBeNull();
    expect(g.selectedPlacedId).toBe(t.id);
  });

  it('is Build-Phase only — disabled during combat', () => {
    const g = freshGame();
    const [s0, s1] = openSlots(g, 2);
    g.placeTower('needle', s0.x, s0.y);
    const id = g.towers[0].id;
    g.startWave(); // → combat
    g.beginMove(id);
    expect(g.movingTowerId).toBeNull(); // pickup refused during combat
    expect(g.moveTower(s1.x, s1.y)).toBe('invalid');
  });

  it('rejects occupied/locked targets and cancels on the tower’s own slot', () => {
    const g = freshGame();
    const [s0, s1] = openSlots(g, 2);
    g.placeTower('needle', s0.x, s0.y);
    g.placeTower('mortar', s1.x, s1.y);
    const needleId = g.towers[0].id;
    g.beginMove(needleId);
    expect(g.moveTower(s1.x, s1.y)).toBe('invalid'); // s1 is occupied
    expect(g.movingTowerId).toBe(needleId); // stays picked up to retry
    expect(g.moveTower(s0.x, s0.y)).toBe('sameSlot'); // dropped back where it was
    expect(g.movingTowerId).toBeNull();
    expect(g.towers.length).toBe(2); // nothing lost
  });

  it('cancelInteractions + inspectAt drive the build-flow shortcuts', () => {
    const g = freshGame();
    const [s0] = openSlots(g, 1);
    g.placeTower('needle', s0.x, s0.y);
    g.selectTower('mortar');
    g.beginMove(g.towers[0].id); // beginMove clears the armed kind
    expect(g.selectedTower).toBeNull();
    g.cancelInteractions();
    expect(g.movingTowerId).toBeNull();
    expect(g.selectedPlacedId).toBeNull();
    expect(g.selectedTower).toBeNull();
    g.inspectAt(s0.x, s0.y); // double-click fast path
    expect(g.selectedPlacedId).toBe(g.towers[0].id);
    g.inspectAt(-999, -999); // empty space → no-op
    expect(g.selectedPlacedId).toBe(g.towers[0].id);
  });
});
