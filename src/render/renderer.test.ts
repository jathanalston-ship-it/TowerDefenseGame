// Renderer smoke test — drives EVERY tower branch (all 10 paths, maxed to tier 5) through the
// real drawGame path against a stub 2D context, asserting the per-branch cosmetics + projectile
// skins execute without throwing. Canvas output can't be pixel-asserted in jsdom, so this guards
// the one thing a unit test can: that the new draw code runs end-to-end with live branch state.

import { describe, it, expect } from 'vitest';
import { Game } from '../core/game';
import { drawGame } from './renderer';
import { SIM_DT } from '../core/config';
import { towerSlots } from '../core/map';
import type { MetaModifiers, TowerKind } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

// A recursive no-op Canvas2D stub: every property read returns the callable proxy (so chained
// calls like createRadialGradient().addColorStop() work) and every call returns it too.
function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, {
    get: () => proxy,
    set: () => true,
    apply: () => proxy,
  });
  return proxy as CanvasRenderingContext2D;
}

// The ten authored paths, two per tower kind.
const BRANCHES: { kind: TowerKind; id: string }[] = [
  { kind: 'needle', id: 'needle_swarm' }, { kind: 'needle', id: 'needle_rail' },
  { kind: 'mortar', id: 'mortar_siege' }, { kind: 'mortar', id: 'mortar_cauldron' },
  { kind: 'reactor', id: 'reactor_heart' }, { kind: 'reactor', id: 'reactor_brood' },
  { kind: 'parasite', id: 'parasite_apex' }, { kind: 'parasite', id: 'parasite_ravager' },
  { kind: 'obelisk', id: 'obelisk_tyrant' }, { kind: 'obelisk', id: 'obelisk_mindrender' },
];

describe('renderer branch cosmetics (smoke)', () => {
  it('draws every branch maxed to tier 5 — cosmetics + skinned shots — without throwing', () => {
    const game = new Game(7, NO_META);
    game.debugAddBiomass(1e12);

    // Place one tower per branch and lock+climb it to tier 5.
    let slot = 0;
    for (const b of BRANCHES) {
      while (slot < towerSlots.length && !game.placeTower(b.kind, towerSlots[slot].x, towerSlots[slot].y)) slot++;
      const id = game.towers[game.towers.length - 1].id;
      slot++;
      for (let tier = 1; tier <= 5; tier++) expect(game.buyBranchTier(id, b.id)).toBe('ok');
    }

    const ctx = stubCtx();
    // Run a stretch of the wave so projectiles (skinned shots), pools, and particles populate,
    // sampling the renderer across time so animated/capstone branches all execute.
    game.startWave();
    expect(() => {
      for (let i = 0; i < 400; i++) {
        game.advance(SIM_DT);
        if (i % 25 === 0) drawGame(ctx, game.getRenderState(), null, {});
      }
    }).not.toThrow();

    // We actually exercised skinned projectiles at least once during the run.
    let sawSkinnedShot = false;
    for (let i = 0; i < 200 && !sawSkinnedShot; i++) {
      game.advance(SIM_DT);
      sawSkinnedShot = game.projectiles.some((p) => p.skin !== undefined);
      drawGame(ctx, game.getRenderState(), { x: 200, y: 300 }, { needle: 3 });
    }
    expect(sawSkinnedShot).toBe(true);
  });

  it('draws the full ROLE-TRAIT layer + boss runtime + artillery shells without throwing', () => {
    const game = new Game(11, NO_META);
    game.startWave();
    // One of every visual role: shield bubble, regen motes, womb, aura, payload warning, standoff.
    for (const kind of ['bulwark', 'knitter', 'broodmother', 'mender', 'cantor', 'bomber', 'siegeworm', 'spitter'] as const) {
      game.debugSpawn(kind, 1);
    }
    // Park the artillery in its standoff band so shells launch; wound the knitter so motes rise;
    // walk the bomber into its warning band.
    for (const e of game.enemies) {
      if (e.kind === 'siegeworm' || e.kind === 'spitter') { e.y = 700; e.speed = 0; }
      if (e.kind === 'knitter') e.hp = 40;
      if (e.kind === 'bomber') { e.y = 850; e.speed = 0; }
    }
    // A framework boss exercising the runtime layer (shield window + phases + charge fields).
    game.spawnBoss({
      id: 'smoke_boss', name: 'Smoke Boss', chassis: 'controller', hpMult: 1, radius: 28, color: '#f0f',
      bounty: 10, damage: 8, modifiers: [],
      modules: [{ kind: 'shieldSelf', cooldown: 1, duration: 1 }],
      phases: [{ threshold: 1, modules: [0] }, { threshold: 0.5, modules: [0] }],
    } as never);
    const ctx = stubCtx();
    let sawShell = false;
    expect(() => {
      for (let i = 0; i < 300; i++) {
        game.advance(SIM_DT);
        sawShell ||= game.enemyShells.length > 0;
        if (i % 20 === 0) drawGame(ctx, game.getRenderState(), null, {});
      }
    }).not.toThrow();
    expect(sawShell).toBe(true); // the bombardment actually flew through the draw path
  });
});
