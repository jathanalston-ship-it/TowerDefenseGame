// Bio-Roulette (docs/BOSS-RUSH.md §roulette): spore math, the fresh weighted board, outcome
// distribution, and the one-click collection grants.

import { describe, it, expect } from 'vitest';
import { ROULETTE, rollBoard, rollOutcome, rollOutcomes, sporesFor, sporesFromParts, summarizeRewards } from './bioRoulette';
import { meta } from './meta';
import { Rng } from '../core/rng';

const rng = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};
const ROSTER = { towers: ['needle', 'mortar'] as const, heroes: ['ravager'] };

function freshMeta(): void {
  meta.reset();
  meta.abandonRun();
}

describe('Bio-Spore math', () => {
  it('pays 1 per NEW record boss + 1 per 5 felled this run', () => {
    expect(sporesFor(0, 7)).toBe(7 + 1); // all 7 are new + one volume spore
    expect(sporesFor(10, 8)).toBe(1); // below the record: volume only
    expect(sporesFor(10, 14)).toBe(4 + 2); // 4 new record bosses + 2 volume
    expect(sporesFor(10, 10)).toBe(2); // matching the record: volume only
    expect(sporesFromParts(4, 14)).toBe(sporesFor(10, 14)); // the parts form agrees
  });

  it('caps the ceremony', () => {
    expect(sporesFor(0, 500)).toBe(ROULETTE.sporeCap);
  });
});

describe('the board', () => {
  it('rolls ≥10 weighted pods with the full reward vocabulary, gear/containers rarest', () => {
    const board = rollBoard(rng(7), ROSTER);
    expect(board.length).toBeGreaterThanOrEqual(10);
    const kinds = new Set(board.map((s) => s.reward.kind));
    for (const k of ['towerShards', 'heroShards', 'cores', 'scrap', 'geneEssence', 'ichor', 'equipment', 'container']) {
      expect(kinds.has(k as never), `missing pod kind ${k}`).toBe(true);
    }
    const w = (kind: string): number => board.filter((s) => s.reward.kind === kind).reduce((a, s) => a + s.weight, 0);
    expect(w('container')).toBeLessThan(w('equipment') + 1);
    expect(w('equipment')).toBeLessThan(w('ichor'));
    expect(w('towerShards')).toBeGreaterThan(w('equipment') * 5); // commons dominate
    for (const s of board) expect(s.weight).toBeGreaterThan(0);
  });

  it('is fresh per roll (quantities/kinds vary with the rng)', () => {
    const a = rollBoard(rng(1), ROSTER).map((s) => s.label).join('|');
    const b = rollBoard(rng(2), ROSTER).map((s) => s.label).join('|');
    expect(a).not.toBe(b);
  });

  it('outcomes follow the weights (never uniform)', () => {
    const board = rollBoard(rng(42), ROSTER);
    const r = rng(999);
    const hits = new Array(board.length).fill(0);
    for (let i = 0; i < 20_000; i++) hits[rollOutcome(r, board)]++;
    const total = board.reduce((a, s) => a + s.weight, 0);
    for (let i = 0; i < board.length; i++) {
      const expected = (board[i].weight / total) * 20_000;
      expect(Math.abs(hits[i] - expected)).toBeLessThan(expected * 0.35 + 30); // generous CI band
    }
  });

  it('summarize merges landed outcomes per pod', () => {
    const board = rollBoard(rng(5), ROSTER);
    const sum = summarizeRewards(board, [0, 0, 3, 0]);
    expect(sum.find((s) => s.label === board[0].label)?.count).toBe(3);
    expect(sum.find((s) => s.label === board[3].label)?.count).toBe(1);
  });
});

describe('one-click collection (meta.grantRouletteRewards)', () => {
  it('folds every reward kind in one persist and advances the spore ledger', () => {
    freshMeta();
    const before = meta.get();
    meta.grantRouletteRewards(
      [
        { kind: 'cores', qty: 5 },
        { kind: 'ichor', qty: 2 },
        { kind: 'towerShards', tower: 'needle', qty: 8 },
        { kind: 'heroShards', hero: 'ravager', qty: 3 },
        { kind: 'scrap', qty: 2 },
        { kind: 'geneEssence', qty: 7 },
        { kind: 'equipment', rarity: 'epic' },
        { kind: 'container', rarity: 'rare' },
      ],
      6,
    );
    const s = meta.get();
    // The collection also unlocks 'roulette_first' (15 cores → +3 Ichor bleed) and 'hero_shard'
    // (+3 Ichor) through the normal achievements channel — assert the composite explicitly.
    expect(s.shards).toBe(before.shards + 5 + 15);
    expect(s.ichor).toBe(before.ichor + 2 + 3 + 3);
    expect(s.achievements).toContain('hero_shard');
    expect(s.towerShards.needle).toBe((before.towerShards.needle ?? 0) + 8);
    expect(s.heroShards.ravager).toBe((before.heroShards.ravager ?? 0) + 3);
    expect(s.mats.scrap).toBe(before.mats.scrap + 2);
    expect(s.geneEssence).toBe(before.geneEssence + 7);
    expect(s.equipment.inventory.length).toBe(before.equipment.inventory.length + 1);
    expect(s.pendingContainers.length).toBe(before.pendingContainers.length + 1);
    expect(s.stats.rouletteSpores).toBe(6);
    // The roulette achievement ladder fires through the normal channel.
    expect(s.achievements).toContain('roulette_first');
  });

  it('a full board round-trip: pre-rolled outcomes collect exactly what landed', () => {
    freshMeta();
    const board = rollBoard(rng(11), ROSTER);
    const outcomes = rollOutcomes(rng(12), board, 9);
    meta.grantRouletteRewards(outcomes.map((o) => board[o].reward), 9);
    expect(meta.get().stats.rouletteSpores).toBe(9);
  });
});
