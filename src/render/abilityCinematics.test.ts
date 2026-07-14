// ABILITY CINEMATICS — the renderer contract (docs/HERO-CINEMATICS.md). Pins:
//   • COMPLETENESS: every actor + motion the content (HERO_DEFS cinematic rows) names is
//     implemented — a new hero's row can't reference a puppet that doesn't exist;
//   • every content pairing actually PAINTS through a real frame (recording-ctx pattern,
//     statusVfx.test.ts) across travel → impact → linger without throwing;
//   • the performance list ingests each cast exactly once, expires on schedule, and resets
//     itself when a new run restarts the seq counter (the gore/DeathEvent lifecycle).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTOR_PAINTERS,
  computePose,
  drawAbilityCinematics,
  __perfCount,
  __resetCinematicsForTests,
} from './abilityCinematics';
import { HERO_DEFS, HERO_ORDER } from '../core/config';
import type { CinematicActor, CinematicMotion, HeroAbilityDef } from '../core/config';
import type { CastEvent, RenderState } from '../core/game';

function fakeEvent(over: Partial<CastEvent> = {}): CastEvent {
  return {
    seq: 0, hero: 'wyrm', name: 'Pyroclastic Breath', slot: 'ult',
    x: 300, y: 260, fromX: 180, fromY: 420, radius: 118, color: '#ffab4a',
    actor: 'serpent', motion: 'swoop', delay: 0.55, at: 10,
    ...over,
  };
}

/** drawAbilityCinematics reads only castEvents + time off the RenderState. */
function fakeRs(evs: CastEvent[], time: number): RenderState {
  return { castEvents: evs, time } as unknown as RenderState;
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; ops: () => number } {
  let fills = 0;
  let strokes = 0;
  const store: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', lineDashOffset: 0,
  };
  const grad = { addColorStop(): void {} };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop in store) return store[prop];
      if (prop === 'fill') return () => { fills++; };
      if (prop === 'stroke') return () => { strokes++; };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      return () => {}; // every other method: no-op
    },
    set(_t, prop: string, value) { store[prop] = value; return true; },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, ops: () => fills + strokes };
}

/** Every distinct (actor, motion, delay) row the shipped content actually uses. */
function contentRows(): { actor: CinematicActor; motion: CinematicMotion; delay: number; ab: HeroAbilityDef; hero: string }[] {
  const rows: { actor: CinematicActor; motion: CinematicMotion; delay: number; ab: HeroAbilityDef; hero: string }[] = [];
  for (const k of HERO_ORDER) {
    const d = HERO_DEFS[k];
    for (const ab of [d.ability, ...(d.skills ?? [])]) {
      const c = ab.cinematic;
      if (c) rows.push({ actor: c.actor, motion: c.motion, delay: c.impactDelay, ab, hero: k });
    }
  }
  return rows;
}

beforeEach(() => __resetCinematicsForTests());

describe('completeness — the content can only name what exists', () => {
  it('every cinematic actor in HERO_DEFS has a painter', () => {
    for (const row of contentRows()) {
      expect(typeof ACTOR_PAINTERS[row.actor], `${row.hero}: ${row.ab.name} → ${row.actor}`).toBe('function');
    }
  });

  it('every motion in HERO_DEFS computes a finite pose across the whole performance', () => {
    for (const row of contentRows()) {
      const ev = fakeEvent({ actor: row.actor, motion: row.motion, delay: row.delay, radius: Math.max(60, row.ab.radius) });
      const T = row.delay > 0 ? row.delay : 0.55;
      for (const t of [0, T * 0.5, T, T + 0.3]) {
        const pose = computePose(row.motion, ev, t, T);
        expect(Number.isFinite(pose.x), `${row.motion} x @${t}`).toBe(true);
        expect(Number.isFinite(pose.y), `${row.motion} y @${t}`).toBe(true);
        expect(Number.isFinite(pose.angle), `${row.motion} angle @${t}`).toBe(true);
        expect(pose.alpha).toBeGreaterThanOrEqual(0);
        expect(pose.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a degenerate cast-on-self event (from == to) still poses finitely for every motion', () => {
    for (const row of contentRows()) {
      const ev = fakeEvent({ motion: row.motion, fromX: 300, fromY: 260, x: 300, y: 260 });
      const pose = computePose(row.motion, ev, 0.2, 0.4);
      expect(Number.isFinite(pose.x) && Number.isFinite(pose.y)).toBe(true);
    }
  });
});

describe('every shipped pairing paints — travel, impact, linger', () => {
  it('draws real ops for each distinct (actor, motion) row across its timeline', () => {
    const seen = new Set<string>();
    let seq = 0;
    for (const row of contentRows()) {
      const key = `${row.actor}/${row.motion}/${row.delay}`;
      if (seen.has(key)) continue;
      seen.add(key);
      __resetCinematicsForTests();
      const ev = fakeEvent({ seq: seq++, actor: row.actor, motion: row.motion, delay: row.delay, radius: Math.max(56, row.ab.radius) });
      const T = row.delay > 0 ? row.delay : 0.55;
      const { ctx, ops } = recordingCtx();
      // mid-travel/mid-flourish must paint SOMETHING for every pairing
      drawAbilityCinematics(ctx, fakeRs([ev], ev.at + T * 0.5));
      expect(ops(), `${row.hero}: ${key} painted nothing mid-performance`).toBeGreaterThan(0);
      // impact + linger frames must not throw (and impact rings draw for travelers)
      drawAbilityCinematics(ctx, fakeRs([ev], ev.at + T + 0.05));
      drawAbilityCinematics(ctx, fakeRs([ev], ev.at + T + 0.35));
    }
  });
});

describe('the performance list — ingest once, expire, reset with the run', () => {
  it('the same buffer ingests once; a new cast appends', () => {
    const a = fakeEvent({ seq: 0 });
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([a], 10.1));
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([a], 10.15));
    expect(__perfCount()).toBe(1); // seq 0 staged exactly once
    const b = fakeEvent({ seq: 1, at: 10.2 });
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([a, b], 10.25));
    expect(__perfCount()).toBe(2);
  });

  it('performances expire once their linger ends', () => {
    const ev = fakeEvent({ seq: 0, delay: 0.4, at: 10 }); // swoop linger 0.7 ⇒ dead past ~11.1
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([ev], 10.2));
    expect(__perfCount()).toBe(1);
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([ev], 11.4));
    expect(__perfCount()).toBe(0);
  });

  it('a new run (seq restart) drops the previous run\'s performances', () => {
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([fakeEvent({ seq: 8 })], 10.1));
    expect(__perfCount()).toBe(1);
    const fresh = fakeEvent({ seq: 0, at: 0.5 }); // buffer max BELOW the high-water mark ⇒ new run
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([fresh], 0.6));
    expect(__perfCount()).toBe(1); // only the new run's cast remains
  });

  it('an instant flourish (delay 0) lives its fixed beat and expires', () => {
    const ev = fakeEvent({ seq: 0, delay: 0, motion: 'self', actor: 'bloomheart', at: 5 });
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([ev], 5.2));
    expect(__perfCount()).toBe(1);
    drawAbilityCinematics(recordingCtx().ctx, fakeRs([ev], 5.6)); // FLOURISH_T (0.55) elapsed
    expect(__perfCount()).toBe(0);
  });
});
