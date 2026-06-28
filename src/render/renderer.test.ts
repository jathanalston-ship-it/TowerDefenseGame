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
});
