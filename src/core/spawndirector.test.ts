import { describe, it, expect } from 'vitest';
import { SpawnDirector } from './spawndirector';
import type { QueuedSpawn } from './spawndirector';
import { SPAWN } from './config';
import type { WaveDef } from './config';
import type { DirectorWave } from './director';

const sd = new SpawnDirector();

describe('Spawn Director', () => {
  it('SPAWN defaults equal the historical inline literals (golden-safety guard)', () => {
    // These were hardcoded in the spawn path; the Spawn Director must default to them so
    // the scripted/endless queues stay byte-identical. Changing them is a deliberate act.
    expect(SPAWN.endlessStartOffset).toBe(0.5);
    expect(SPAWN.endlessIntraGroup).toBe(0.5);
    expect(SPAWN.endlessInterGroup).toBe(0.35);
    expect(SPAWN.swarmDelay).toBe(3);
    expect(SPAWN.swarmSpacing).toBe(0.18);
    expect(SPAWN.swarmCount).toBe(12);
    expect(SPAWN.swarmKind).toBe('runner');
  });

  it('scheduleScripted reproduces the legacy per-group arithmetic exactly', () => {
    const def: WaveDef = [
      { kind: 'runner', count: 3, spacing: 0.7, delay: 0.4 },
      { kind: 'brute', count: 2, spacing: 1.6, delay: 3.0 },
    ];
    const now = 5;
    // Legacy: push now+delay+i*spacing for each group member, then sort.
    const expected: QueuedSpawn[] = [];
    for (const g of def) for (let i = 0; i < g.count; i++) expected.push({ kind: g.kind, at: now + g.delay + i * g.spacing, hpMult: 2, bountyMult: 1.5 });
    expected.sort((a, b) => a.at - b.at);
    expect(sd.scheduleScripted(def, now, 2, 1.5, 1)).toEqual(expected);
  });

  it('spawnRateMult compresses spacing (>1 = faster) without touching delays', () => {
    const def: WaveDef = [{ kind: 'runner', count: 3, spacing: 1.0, delay: 0.5 }];
    const fast = sd.scheduleScripted(def, 0, 1, 1, 2); // spacing halved
    expect(fast.map((s) => s.at)).toEqual([0.5, 1.0, 1.5]); // 0.5 + i*(1.0/2)
  });

  it('scheduleDirected reproduces the legacy endless cadence + swarm event', () => {
    const wave: DirectorWave = {
      depth: 1,
      shape: 'mixed',
      groups: [
        { kind: 'runner', count: 3, elite: false },
        { kind: 'brute', count: 2, elite: true },
      ],
      spawnBoss: false,
      swarmEvent: true,
      eliteChance: 0.1,
    };
    const now = 0;
    const expected: QueuedSpawn[] = [];
    let t0 = now + SPAWN.endlessStartOffset;
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) expected.push({ kind: g.kind, at: t0 + i * SPAWN.endlessIntraGroup, hpMult: 1, bountyMult: 1, elite: g.elite });
      t0 += SPAWN.endlessInterGroup;
    }
    const burst = now + SPAWN.swarmDelay;
    for (let i = 0; i < SPAWN.swarmCount; i++) expected.push({ kind: SPAWN.swarmKind, at: burst + i * SPAWN.swarmSpacing, hpMult: 1, bountyMult: 1 });
    expected.sort((a, b) => a.at - b.at);
    expect(sd.scheduleDirected(wave, now, 1, 1, 1)).toEqual(expected);
  });

  it('directed waves carry the elite flag through to the right group', () => {
    const wave: DirectorWave = {
      depth: 2,
      shape: 'elite',
      groups: [{ kind: 'tank', count: 2, elite: true }],
      spawnBoss: false,
      swarmEvent: false,
      eliteChance: 0.5,
    };
    const spawns = sd.scheduleDirected(wave, 0, 1, 1, 1);
    expect(spawns.length).toBe(2);
    expect(spawns.every((s) => s.elite === true && s.kind === 'tank')).toBe(true);
  });

  it('eventsFor only emits a swarm when the wave flags one', () => {
    const base: DirectorWave = { depth: 4, shape: 'rush', groups: [], spawnBoss: false, swarmEvent: false, eliteChance: 0 };
    expect(sd.eventsFor(base, 0)).toEqual([]);
    const ev = sd.eventsFor({ ...base, swarmEvent: true }, 10);
    expect(ev).toEqual([{ kind: 'swarm', at: 10 + SPAWN.swarmDelay, enemyKind: SPAWN.swarmKind, count: SPAWN.swarmCount, spacing: SPAWN.swarmSpacing }]);
  });
});
