// Arena Pass (docs/ARENA.md §pass) — the seasonal-track contracts:
//   • the XP curve: 100 levels, banded costs, wins-only progression (10 XP/win ⇒ ~145 wins);
//   • the table: every level on BOTH tracks is non-empty; level 100 carries the exclusive;
//   • determinism: the same season builds a byte-identical table forever; different seasons
//     genuinely rotate (some level differs);
//   • the exclusive rotation: Tower A → Tower B → Hero, alternating by season, forever;
//   • the economy law: each track's total Ichor stays under its HARD cap by construction
//     (premium cap = 50% of the premium price — a pass can never fund the next one);
//   • the seasonal identity: deterministic theme per season, distinct across neighbors.

import { describe, expect, it } from 'vitest';
import {
  ARENA_EXCLUSIVES, ARENA_PASS, ARENA_PASS_ICHOR_CAP, arenaExclusiveForSeason,
  arenaExclusiveLabel, arenaPassLevelOf, arenaPassTrack, arenaPassXpForLevel,
  arenaPassXpToReach, arenaSeasonInfo, arenaTrackIchorTotal,
} from './arenaPass';
import { ARENA } from './arena';

describe('the XP curve (wins-only)', () => {
  it('level costs follow the authored bands and never fall', () => {
    expect(arenaPassXpForLevel(1)).toBe(10);
    expect(arenaPassXpForLevel(40)).toBe(10);
    expect(arenaPassXpForLevel(41)).toBe(15);
    expect(arenaPassXpForLevel(70)).toBe(15);
    expect(arenaPassXpForLevel(71)).toBe(20);
    expect(arenaPassXpForLevel(100)).toBe(20);
    for (let l = 1; l < ARENA_PASS.levels; l++) {
      expect(arenaPassXpForLevel(l + 1)).toBeGreaterThanOrEqual(arenaPassXpForLevel(l));
    }
  });

  it('a full clear costs ~145 wins at the per-win rate (the 30-day pacing anchor)', () => {
    const total = arenaPassXpToReach(ARENA_PASS.levels);
    expect(total).toBe(1450);
    const wins = total / ARENA.winPassXp;
    expect(wins).toBe(145);
    expect(wins / 30).toBeLessThan(5.1); // ≤ ~5 wins/day for the dedicated clear
  });

  it('levelOf inverts the curve with correct into/need at every band edge', () => {
    expect(arenaPassLevelOf(0)).toEqual({ level: 0, into: 0, need: 10 });
    expect(arenaPassLevelOf(arenaPassXpToReach(40))).toMatchObject({ level: 40, need: 15 });
    expect(arenaPassLevelOf(arenaPassXpToReach(100))).toEqual({ level: 100, into: 0, need: 0 });
    expect(arenaPassLevelOf(arenaPassXpToReach(100) + 999)).toMatchObject({ level: 100 });
  });
});

describe('the table', () => {
  it('every level on both tracks is non-empty across several seasons', () => {
    for (const season of [1, 2, 3, 7, 12]) {
      const track = arenaPassTrack(season);
      expect(track).toHaveLength(ARENA_PASS.levels);
      for (const row of track) {
        expect(row.free.length).toBeGreaterThan(0);
        expect(row.premium.length).toBeGreaterThan(0);
      }
    }
  });

  it('level 100 (and ONLY level 100) carries the season exclusive', () => {
    for (const season of [1, 2, 3]) {
      const track = arenaPassTrack(season);
      expect(track[ARENA_PASS.levels - 1].exclusive).toBe(arenaExclusiveForSeason(season));
      for (let i = 0; i < ARENA_PASS.levels - 1; i++) expect(track[i].exclusive).toBeUndefined();
    }
  });

  it('is deterministic per season and genuinely rotates between seasons', () => {
    const a = JSON.stringify(arenaPassTrack(4));
    // Cache-bypass determinism: rebuild via a fresh module state is impossible here, so
    // assert the cached table serializes identically on repeat reads…
    expect(JSON.stringify(arenaPassTrack(4))).toBe(a);
    // …and neighbors differ somewhere (the rotation is real).
    expect(JSON.stringify(arenaPassTrack(5))).not.toBe(a);
  });
});

describe('the exclusive rotation', () => {
  it('alternates Tower A → Tower B → Hero forever', () => {
    expect(arenaExclusiveForSeason(1)).toBe('tower:basilisk');
    expect(arenaExclusiveForSeason(2)).toBe('tower:ossuary');
    expect(arenaExclusiveForSeason(3)).toBe('hero:chimera');
    expect(arenaExclusiveForSeason(4)).toBe('tower:basilisk');
    expect(arenaExclusiveForSeason(301)).toBe(arenaExclusiveForSeason(1));
  });

  it('every exclusive has a label', () => {
    for (const id of ARENA_EXCLUSIVES) expect(arenaExclusiveLabel(id).length).toBeGreaterThan(4);
  });
});

describe('the economy law (hard-capped Ichor)', () => {
  it('holds by construction across 40 seasons', () => {
    for (let season = 1; season <= 40; season++) {
      expect(arenaTrackIchorTotal(season, 'free')).toBeLessThanOrEqual(ARENA_PASS_ICHOR_CAP.free);
      expect(arenaTrackIchorTotal(season, 'premium')).toBeLessThanOrEqual(ARENA_PASS_ICHOR_CAP.premium);
    }
    expect(ARENA_PASS_ICHOR_CAP.premium).toBeLessThanOrEqual(ARENA_PASS.premiumIchor * 0.5);
  });
});

describe('seasonal identity', () => {
  it('is deterministic per season and distinct across neighbors', () => {
    const a = arenaSeasonInfo(3);
    const b = arenaSeasonInfo(3);
    expect(a).toEqual(b);
    const c = arenaSeasonInfo(4);
    expect(`${a.name}|${a.accent}|${a.glyph}` === `${c.name}|${c.accent}|${c.glyph}`).toBe(false);
    expect(a.exclusive).toBe(arenaExclusiveForSeason(3));
    expect(a.name.startsWith('The ')).toBe(true);
  });
});
