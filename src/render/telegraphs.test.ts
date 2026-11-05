// Telegraph language contract (render/telegraphs.ts, docs/BOSS-DESIGN.md §telegraphs): the boss
// wind-up tells ride the sim's REAL module cooldowns, land on the tick the sim acts, and draw
// finite geometry for every module kind. Canvas output can't be pixel-asserted in node, so a
// recording context checks that the right things draw (and nothing draws NaN).

import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import type { BossDef, BossModule, BossModuleKind } from '../core/boss';
import { BOSS, SIM_DT } from '../core/config';
import { viewFeel } from './feel';
import { BOSS_TELLS, __pulseCount, __resetTelegraphsForTests, dashReach, drawBossTells, drawLandingImpact, drawLandingLock, tellTarget } from './telegraphs';
import type { MetaModifiers } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** A recording 2D context: counts strokes/fills and flags any non-finite coordinate. */
function recCtx(): { ctx: CanvasRenderingContext2D; ops: { stroke: number; fill: number; nonFinite: number; arcs: number[] } } {
  const ops = { stroke: 0, fill: 0, nonFinite: 0, arcs: [] as number[] };
  const check = (...a: unknown[]): void => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) ops.nonFinite++; };
  const ctx = {
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', lineCap: 'butt', lineDashOffset: 0,
    beginPath() { /* noop */ }, closePath() { /* noop */ },
    moveTo: check, lineTo: check, quadraticCurveTo: check, bezierCurveTo: check, ellipse: check,
    arc(x: number, y: number, r: number, a0: number, a1: number) { check(x, y, r, a0, a1); ops.arcs.push(r); },
    stroke() { ops.stroke++; }, fill() { ops.fill++; },
    setLineDash() { /* noop */ }, save() { /* noop */ }, restore() { /* noop */ }, translate: check, scale: check, rotate: check,
    createRadialGradient: () => ({ addColorStop() { /* noop */ } }), createLinearGradient: () => ({ addColorStop() { /* noop */ } }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** Field one framework boss with an exact kit (single phase) at a known spot. */
function fieldBoss(game: Game, modules: BossModule[], cd: number[]): ReturnType<Game['getRenderState']>['enemies'][number] {
  const def: BossDef = {
    id: 'proc_bruiser_tell_test', name: 'Tell Test', chassis: 'bruiser', hpMult: 50, radius: 30, color: '#ff5d73',
    bounty: 1, damage: 1, modules, phases: [{ threshold: 1, modules: modules.map((_, i) => i) }], modifiers: [],
  };
  game.spawnBoss(def);
  const e = game.enemies[game.enemies.length - 1];
  e.x = 360; e.y = 360;
  e.boss!.moduleCd = cd.slice();
  return e;
}

const R = (): number => 40;

beforeEach(() => {
  __resetTelegraphsForTests();
  viewFeel.motion = 1;
  viewFeel.flashes = true;
});

describe('BOSS_TELLS — the data', () => {
  it('every tell has a positive wind-up and a hex colour; reach-shaped tells carry a default reach', () => {
    for (const [kind, t] of Object.entries(BOSS_TELLS)) {
      if (t === null) continue;
      expect(t.lead, kind).toBeGreaterThan(0);
      expect(t.color, kind).toMatch(/^#[0-9a-f]{6}$/i);
      if (t.shape === 'zone' || t.shape === 'pool' || t.shape === 'well') expect(t.radius, kind).toBeGreaterThan(0);
    }
  });

  it('dash reach is the sim\'s own fold: speed × chargeSpeedMult × seconds', () => {
    expect(dashReach(34, 1.4)).toBeCloseTo(34 * BOSS.chargeSpeedMult * 1.4, 6);
    expect(dashReach(34, 0)).toBe(0);
  });
});

describe('drawBossTells — wind-ups ride the real cooldown', () => {
  it('a module inside its lead window draws its tell; outside it, nothing beyond the always-on layers', () => {
    const game = new Game(3, NO_META);
    fieldBoss(game, [{ kind: 'healer', cooldown: 30, amount: 1, radius: 160 }], [5]);
    const idle = recCtx();
    drawBossTells(idle.ctx, game.getRenderState(), 1, R);
    expect(idle.ops.arcs).not.toContain(160); // 5 s out — no tell yet
    game.enemies[game.enemies.length - 1].boss!.moduleCd[0] = 0.5; // inside the 1.2 s lead
    const live = recCtx();
    drawBossTells(live.ctx, game.getRenderState(), 1.1, R);
    expect(live.ops.arcs).toContain(160); // the zone rim at the module's own reach
    expect(live.ops.nonFinite).toBe(0);
  });

  it('the release pulse fires on the tick the sim acts (cooldown jump) — and only for an armed tell', () => {
    const game = new Game(3, NO_META);
    const e = fieldBoss(game, [{ kind: 'healer', cooldown: 30, amount: 1, radius: 160 }], [0.1]);
    const { ctx } = recCtx();
    drawBossTells(ctx, game.getRenderState(), 1, R); // arms (cd inside the lead)
    expect(__pulseCount()).toBe(0);
    e.boss!.moduleCd[0] = 30; // the sim fired + paid its cooldown
    drawBossTells(ctx, game.getRenderState(), 1.02, R);
    expect(__pulseCount()).toBe(1);
  });

  it('every module kind draws finite geometry through its wind-up (and a live dash / channel)', () => {
    const kinds = Object.keys(BOSS_TELLS) as BossModuleKind[];
    const game = new Game(3, NO_META);
    game.debugAddBiomass(1e9);
    game.deployTower('needle', 360, 820);
    for (const kind of kinds) {
      __resetTelegraphsForTests();
      const e = fieldBoss(game, [{ kind, cooldown: 30, duration: 2, radius: 120, amount: 1, frac: 0.2 }], [0.4]);
      const rec = recCtx();
      drawBossTells(rec.ctx, game.getRenderState(), 2, R);
      e.boss!.charge = 0.7;
      e.boss!.channel = 1.5;
      drawBossTells(rec.ctx, game.getRenderState(), 2.05, R);
      expect(rec.ops.nonFinite, kind).toBe(0);
      if (BOSS_TELLS[kind] !== null) expect(rec.ops.stroke, kind).toBeGreaterThan(0);
      e.alive = false;
      game.enemies.pop();
    }
  });

  it('a live dash draws its lane to the REAL endpoint (lock at speed × mult × charge left)', () => {
    const game = new Game(3, NO_META);
    const e = fieldBoss(game, [{ kind: 'charger', cooldown: 30, duration: 1.4 }], [30]);
    e.boss!.charge = 1;
    const rec = recCtx();
    drawBossTells(rec.ctx, game.getRenderState(), 1, R);
    expect(rec.ops.stroke).toBeGreaterThan(2);
    expect(rec.ops.nonFinite).toBe(0);
    expect(rec.ops.arcs).toContain(R() * 0.95); // the landing lock at the lane's end
  });

  it('a core-shot that completes while the caster lives lands a strike; one that never started does not', () => {
    const game = new Game(3, NO_META);
    const e = fieldBoss(game, [{ kind: 'channeler', cooldown: 30, duration: 3, amount: 1 }], [30]);
    e.boss!.channel = 0.05;
    const a = recCtx();
    drawBossTells(a.ctx, game.getRenderState(), 1, R);
    e.boss!.channel = 0; // resolved
    const b = recCtx();
    drawBossTells(b.ctx, game.getRenderState(), 1.02, R);
    expect(b.ops.stroke).toBeGreaterThan(0); // strike line + impact ring at the Core
    expect(b.ops.nonFinite).toBe(0);
  });

  it('a phase shift bursts once', () => {
    const game = new Game(3, NO_META);
    const e = fieldBoss(game, [{ kind: 'spawner', cooldown: 30, amount: 1 }], [30]);
    const { ctx } = recCtx();
    drawBossTells(ctx, game.getRenderState(), 1, R);
    e.boss!.phase = 1; // a mutation (single-phase def: the renderer only reads the index edge)
    drawBossTells(ctx, game.getRenderState(), 1.02, R);
    expect(__pulseCount()).toBe(1);
    drawBossTells(ctx, game.getRenderState(), 1.04, R);
    expect(__pulseCount()).toBe(1); // no re-fire on the held phase
  });

  it('pools land on the nearest tower; wells open midway to it (the sim\'s own picks)', () => {
    const game = new Game(3, NO_META);
    game.debugAddBiomass(1e9);
    game.deployTower('needle', 360, 820);
    const tw = game.towers[game.towers.length - 1];
    const e = fieldBoss(game, [{ kind: 'spawner', cooldown: 30 }], [30]);
    const rs = game.getRenderState();
    const out = { x: 0, y: 0 };
    tellTarget('pool', e, rs, out);
    expect(out).toEqual({ x: tw.x, y: tw.y });
    tellTarget('well', e, rs, out);
    expect(out).toEqual({ x: (e.x + tw.x) / 2, y: (e.y + tw.y) / 2 });
  });

  it('stays live through a real fight: wind-up → fire → pulse, with the sim stepping', () => {
    const game = new Game(3, NO_META);
    game.startWave();
    fieldBoss(game, [{ kind: 'healer', cooldown: 2, amount: 1, radius: 150 }], [1]);
    const { ctx } = recCtx();
    let pulsed = false;
    for (let i = 0; i < 120; i++) {
      game.advance(SIM_DT);
      drawBossTells(ctx, game.getRenderState(), game.getRenderState().time, R);
      if (__pulseCount() > 0) pulsed = true;
    }
    expect(pulsed).toBe(true);
  });
});

describe('the shared lock + impact', () => {
  it('reduced motion keeps the information (a static sweep, a still ring) and never NaNs', () => {
    viewFeel.motion = 0;
    viewFeel.flashes = false;
    const rec = recCtx();
    drawLandingLock(rec.ctx, 100, 100, 50, 0.6, '#ff8a3d', 1);
    drawLandingImpact(rec.ctx, 100, 100, 50, 0.05, '#ff8a3d', true);
    expect(rec.ops.stroke).toBeGreaterThanOrEqual(3); // rim + sweep + still ring
    expect(rec.ops.fill).toBe(1); // the zone wash only — no Flashes core
    expect(rec.ops.nonFinite).toBe(0);
  });
});
