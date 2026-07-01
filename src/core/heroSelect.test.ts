// Hero selection (docs/HERO-SELECTION.md): a tap picks the hero, the snapshot exposes its live view
// (health / cooldowns / state / target), selection is NON-MODAL (the sim keeps advancing), and an
// unselected / autoplay run carries no selection (so the golden autoplay never sees one).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('hero selection', () => {
  it('selects the hero under a tap and exposes its live view — without pausing', () => {
    const g = new Game(5, NO_META);
    g.startWave();
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // let the hero move / engage
    const h = g.getRenderState().heroes[0];

    expect(g.selectHeroAt(h.x, h.y)).toBe(true); // a tap on the hero body hits
    const view = g.getSnapshot().selectedHero;
    expect(view).not.toBeNull();
    expect(view!.kind).toBe(h.kind);
    expect(view!.maxHp).toBeGreaterThan(0);
    expect(view!.hp).toBeLessThanOrEqual(view!.maxHp);
    expect(view!.cooldowns.length).toBeGreaterThan(0); // at least the signature ability gauge
    // Effective combat stats — the Ravager is an attacker, so all three read positive.
    expect(view!.damage).toBeGreaterThan(0);
    expect(view!.attackSpeed).toBeGreaterThan(0);
    expect(view!.moveSpeed).toBeGreaterThan(0);
    expect(['idle', 'moving', 'attacking', 'retreating', 'downed']).toContain(view!.state);
    expect(g.getRenderState().selectedHero).toBe(h.kind); // drives the selection ring

    // NON-MODAL: the sim keeps advancing while selected, and the selection persists.
    const t0 = g.getRenderState().time;
    for (let i = 0; i < 10; i++) g.advance(SIM_DT);
    expect(g.getRenderState().time).toBeGreaterThan(t0);
    expect(g.getSnapshot().selectedHero).not.toBeNull();
  });

  it('a tap on empty space misses; selectHero(null) / cancelInteractions deselects', () => {
    const g = new Game(5, NO_META);
    expect(g.selectHeroAt(5, 5)).toBe(false); // corner — no hero there

    const h = g.getRenderState().heroes[0];
    g.selectHeroAt(h.x, h.y);
    expect(g.getSnapshot().selectedHero).not.toBeNull();
    g.selectHero(null);
    expect(g.getSnapshot().selectedHero).toBeNull();

    g.selectHeroAt(h.x, h.y);
    g.cancelInteractions(); // Escape path
    expect(g.getRenderState().selectedHero).toBeNull();
  });

  it('getSelectedHero returns the live instance (the seam future abilities act through)', () => {
    const g = new Game(5, NO_META);
    const h = g.getRenderState().heroes[0];
    g.selectHeroAt(h.x, h.y);
    expect(g.getSelectedHero()?.kind).toBe(h.kind);
    g.selectHero(null);
    expect(g.getSelectedHero()).toBeNull();
  });

  it('golden-safety: an unselected / autoplay run carries no selection', () => {
    const g = new Game(1, NO_META);
    expect(g.getRenderState().selectedHero).toBeNull();
    expect(g.getSnapshot().selectedHero).toBeNull();
    g.startWave();
    for (let i = 0; i < 30; i++) g.advance(SIM_DT);
    expect(g.getRenderState().selectedHero).toBeNull(); // nothing selects itself
  });
});
