// Hero selection (docs/HERO-SELECTION.md): a tap picks the hero, the snapshot exposes its live view
// (health / cooldowns / state / target), selection is NON-MODAL (the sim keeps advancing), and an
// unselected / autoplay run carries no selection (so the golden autoplay never sees one).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, HERO_DEFS, HERO_ORDER, HERO_SKILL_DEFS } from './config';
import type { MetaModifiers, HeroProgress } from './types';

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

describe('selected hero cooldown readout', () => {
  it('matches the cooldown applied by a cast after gear and progression modifiers', () => {
    const progress = Object.fromEntries(HERO_ORDER.map((kind) => [kind, { damageMult: 1, cooldownMult: 0.5, skillCount: 1 }])) as HeroProgress;
    const g = new Game(5, NO_META, undefined, 'ravager', progress, {
      heroEquip: { ravager: [{ op: 'mul', field: 'heroCooldownMult', value: 0.8 }] },
    });
    g.selectHero('ravager');
    const before = g.getSnapshot().selectedHero!;
    expect(before.cooldowns.find((cd) => cd.id === 'ability')!.total).toBeCloseTo(g.getSnapshot().hero.abilityCdMax);
    expect(before.cooldowns.find((cd) => cd.id === 'skill0')!.total).toBeCloseTo(HERO_SKILL_DEFS.ravager[0].cooldown * 0.5);
    g.startWave();
    g.armAbility();
    g.click(300, 300);
    g.selectHero('ravager');
    const ability = g.getSnapshot().selectedHero!.cooldowns.find((cd) => cd.id === 'ability')!;
    expect(ability.remaining).toBeGreaterThan(0);
    expect(ability.total).toBeCloseTo(ability.remaining);
    const state = JSON.stringify(g.getRenderState());
    g.getSnapshot();
    expect(JSON.stringify(g.getRenderState())).toBe(state);
  });
});
describe('selected hero observed attack and pulse cadence', () => {
  it.each(HERO_ORDER)('%s gauges match the interval actually started in combat', (kind) => {
    const g = new Game(7, NO_META, undefined, kind, undefined, {
      heroEquip: { [kind]: [{ op: 'mul', field: 'heroAttackSpeedMult', value: 2 }] },
    });
    g.startWave();
    g.debugSpawn('tank');
    const h = g.heroes[0];
    const def = HERO_DEFS[kind];
    const timer = def.attackRange > 0 ? 'attackCd' : 'pulseCd';
    const id = def.attackRange > 0 ? 'attack' : 'pulse';
    h[timer] = 0;
    for (let i = 0; i < 600 && h[timer] <= 0; i++) {
      const enemy = g.enemies.find((e) => e.alive);
      if (enemy) { enemy.x = h.x + 10; enemy.y = h.y - 10; }
      g.advance(SIM_DT);
    }
    expect(h[timer]).toBeGreaterThan(0);
    g.selectHero(kind);
    const view = g.getSnapshot().selectedHero!;
    const cd = view.cooldowns.find((c) => c.id === id)!;
    expect(cd.total).toBeCloseTo(h[timer], 5);
    if (id === 'attack') expect(view.attackSpeed).toBeCloseTo(1 / cd.total);
    // A partially elapsed timer still reports the full observed interval, not remaining time.
    h[timer] *= 0.5;
    expect(g.getSnapshot().selectedHero!.cooldowns.find((c) => c.id === id)!.total).toBe(cd.total);
  });
});
it('tracks the siege hero switching from a hasted mega raid to its normal siege cadence', () => {
  const g = new Game(21, NO_META, undefined, 'vitriol', undefined, {
    megaDaily: { defId: 'voraxis', tier: 1 },
    heroEquip: { vitriol: [{ op: 'mul', field: 'heroAttackSpeedMult', value: 2 }] },
  });
  g.startWave();
  const h = g.heroes[0];
  h.attackCd = 0;
  for (let i = 0; i < 900 && h.attackCd <= 0; i++) g.advance(SIM_DT);
  g.selectHero('vitriol');
  const read = () => g.getSnapshot().selectedHero!.cooldowns.find((cd) => cd.id === 'attack')!;
  expect(h.attackCd).toBeGreaterThan(0);
  expect(read().total).toBeCloseTo(HERO_DEFS.vitriol.attackInterval / 2);
  g.debugSpawn('tank');
  const enemy = g.enemies.find((e) => e.alive)!;
  enemy.x = h.x; enemy.y = h.y - 10;
  h.attackCd = 0;
  g.advance(SIM_DT);
  expect(h.attackCd).toBeGreaterThan(0);
  expect(read().total).toBeCloseTo(HERO_DEFS.vitriol.attackInterval);
  expect(g.getSnapshot().selectedHero!.attackSpeed).toBeCloseTo(1 / HERO_DEFS.vitriol.attackInterval);
});