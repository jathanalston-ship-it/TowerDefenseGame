// LIVING ORGANISM framework laws (docs/LIVING-BATTLEFIELD.md §organisms) — profile
// completeness/bounds for the whole roster, and the runtime state machine: approach-alert
// rises while enemies close in OUTSIDE range, exhales when they pass; a heavy nearby death
// slams tremor into neighbours; a fire edge arms the recovery settle; the ambience
// director stays sparse. All render-side — the sim is never constructed here.
import { beforeEach, describe, expect, it } from 'vitest';
import { TOWER_ORDER } from '../core/config';
import type { RenderState } from '../core/game';
import {
  __resetOrganisms,
  battlefieldNerves,
  ORGANISM,
  organismOf,
  organismPose,
  organismProblems,
  organismProfile,
  pollAmbientCue,
  updateOrganisms,
} from './organism';

function rsWith(over: Partial<RenderState>): RenderState {
  // Minimal snapshot carrying only the fields the organism layer reads.
  return {
    enemies: [],
    towers: [],
    deathEvents: [],
    castEvents: [],
    megaBoss: null,
    hiveHitPulse: 0,
    phase: 'wave',
    time: 0,
    effectiveRanges: Object.fromEntries(TOWER_ORDER.map((k) => [k, 300])),
    ...over,
  } as unknown as RenderState;
}

function needleAt(x: number, y: number, id = 1): RenderState['towers'][number] {
  return { id, kind: 'needle', x, y, cooldown: 0, prep: 1 } as unknown as RenderState['towers'][number];
}
function enemyAt(x: number, y: number, id = 50): RenderState['enemies'][number] {
  return { id, x, y, alive: true } as unknown as RenderState['enemies'][number];
}

/** Advance the layer over simulated seconds (60fps steps so staggered scans fire). */
function advance(rs: RenderState, from: number, seconds: number): number {
  let t = from;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    t += 1 / 60;
    (rs as { time: number }).time = t;
    updateOrganisms(rs);
  }
  return t;
}

beforeEach(() => __resetOrganisms());

describe('organism profiles', () => {
  it('every roster kind resolves a bounded profile with a live twitch', () => {
    expect(organismProblems(TOWER_ORDER)).toEqual([]);
  });

  it('per-kind identity rows land (maw gapes, needle orients, roost sends drones)', () => {
    expect(organismProfile('maw').gape).toBe(1);
    expect(organismProfile('needle').orient).toBe(1);
    expect(organismProfile('roost').emission).toBe('drones');
    expect(organismProfile('lung').voice).toBe('breath');
    // Class re-voicing: Caustic kinds hiss unless overridden.
    expect(organismProfile('chrysalis').voice).toBe('acid');
  });
});

describe('approach alert (the anticipation bridge)', () => {
  it('rises while an enemy closes in OUTSIDE range, and exhales after it leaves', () => {
    const tower = needleAt(360, 900);
    const enemy = enemyAt(360, 900 - 300 * 1.4); // inside the approach band, outside range
    const rs = rsWith({ towers: [tower], enemies: [enemy] });
    let t = advance(rs, 0, 1.5);
    const alerted = organismOf(1)!.alert;
    expect(alerted).toBeGreaterThan(0.3);
    expect(battlefieldNerves()).toBeCloseTo(alerted, 5);
    // The pose leans up-field (dy < 0) once alert is up — the body turns to meet it.
    const pose = organismPose('needle', 1, 16, t);
    expect(pose.dy).toBeLessThan(0);
    rs.enemies.length = 0;
    t = advance(rs, t, 2);
    expect(organismOf(1)!.alert).toBeLessThan(0.08);
  });

  it('an enemy INSIDE range zeroes the alert target (combat owns the body)', () => {
    const rs = rsWith({ towers: [needleAt(360, 900)], enemies: [enemyAt(360, 900 - 150)] });
    advance(rs, 0, 1.5);
    expect(organismOf(1)!.alert).toBeLessThan(0.1);
  });
});

describe('environmental tremor + recovery', () => {
  it('a heavy nearby death slams tremor into the neighbour; a distant one does not', () => {
    const near = needleAt(360, 900, 1);
    const far = needleAt(360, 300, 2);
    const rs = rsWith({ towers: [near, far] });
    advance(rs, 0, 0.1);
    (rs as { deathEvents: unknown[] }).deathEvents = [
      { seq: 1, x: 400, y: 900, color: '#fff', overkill: 1, bounty: 10, killerKind: null, flying: false },
    ];
    advance(rs, 0.1, 0.05);
    expect(organismOf(1)!.tremor).toBeGreaterThan(0.2);
    expect(organismOf(2)!.tremor).toBeLessThan(0.02);
  });

  it('a fire edge (cooldown jump) arms the recovery settle, which decays', () => {
    const tower = needleAt(360, 900);
    const rs = rsWith({ towers: [tower] });
    advance(rs, 0, 0.1);
    (tower as { cooldown: number }).cooldown = 0.5; // needle fireInterval-scale jump
    advance(rs, 0.1, 0.05);
    const armed = organismOf(1)!.recover;
    expect(armed).toBeGreaterThan(0.5);
    advance(rs, 0.15, 1.5);
    expect(organismOf(1)!.recover).toBeLessThan(armed * 0.1);
  });
});

describe('ambience director', () => {
  it('cues an alert tower voice, then holds the gap floor', () => {
    const rs = rsWith({ towers: [needleAt(360, 900)], enemies: [enemyAt(360, 900 - 300 * 1.3)] });
    advance(rs, 0, 1.5);
    const cue = pollAmbientCue(rs, 100000);
    expect(cue).toBe(`org_${organismProfile('needle').voice}`);
    expect(pollAmbientCue(rs, 100000 + ORGANISM.ambientGapMs - 100)).toBeNull();
  });

  it('stays silent under heavy combat din', () => {
    const enemies = Array.from({ length: ORGANISM.ambientDinCap + 1 }, (_, i) => enemyAt(100 + i, 200, 100 + i));
    const rs = rsWith({ towers: [needleAt(360, 900)], enemies });
    advance(rs, 0, 1);
    expect(pollAmbientCue(rs, 200000)).toBeNull();
  });
});
