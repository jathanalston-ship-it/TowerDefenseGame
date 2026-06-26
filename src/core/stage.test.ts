import { describe, it, expect } from 'vitest';
import { generateStage, generateEndlessWave } from './stage';
import { BIOME_IDS } from './biomes';
import { COLS } from './map';

describe('stage generation', () => {
  it('is deterministic for a fixed (seed, stageNumber)', () => {
    expect(generateStage(1234, 5)).toEqual(generateStage(1234, 5));
    expect(generateStage(99, 1)).toEqual(generateStage(99, 1));
  });

  it('varies across seeds and stage numbers', () => {
    const a = generateStage(1, 1);
    const b = generateStage(2, 1);
    const c = generateStage(1, 2);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('produces thousands of distinct stage combinations', () => {
    const combos = new Set<string>();
    for (let s = 0; s < 1500; s++) {
      const st = generateStage(s * 2654435761 >>> 0, 1 + (s % 8));
      combos.add(`${st.biome}|${st.layout.slotPattern}|${st.mods.join(',')}|${st.layout.obstacles.length}|${st.waves.length}|${st.objective?.kind ?? '-'}`);
    }
    expect(combos.size).toBeGreaterThan(1000);
  });

  it('uses every launch biome across enough seeds', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(generateStage(s, 3).biome);
    for (const id of BIOME_IDS) expect(seen.has(id)).toBe(true);
  });

  it('generates valid, finite stages', () => {
    for (let s = 0; s < 200; s++) {
      const st = generateStage(s, 1 + (s % 10));
      expect(st.waves.length).toBeGreaterThanOrEqual(6);
      expect(st.waves.every((w) => w.length > 0)).toBe(true);
      expect(st.rewardMultiplier).toBeGreaterThanOrEqual(0.8);
      expect(st.rewardMultiplier).toBeLessThanOrEqual(3);
      for (const o of st.layout.obstacles) {
        expect(o.col).toBeGreaterThanOrEqual(1);
        expect(o.col + o.w).toBeLessThanOrEqual(COLS - 1); // flank lanes preserved
      }
      expect(st.layout.spawnZones.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('endless waves are deterministic and escalate', () => {
    expect(generateEndlessWave(7, 3, 'wasteland')).toEqual(generateEndlessWave(7, 3, 'wasteland'));
    const count = (w: ReturnType<typeof generateEndlessWave>) => w.reduce((n, g) => n + g.count, 0);
    const early = count(generateEndlessWave(7, 1, 'wasteland'));
    const late = count(generateEndlessWave(7, 20, 'wasteland'));
    expect(late).toBeGreaterThan(early);
  });
});
