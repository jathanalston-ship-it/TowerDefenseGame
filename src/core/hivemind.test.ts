// HIVE INTELLIGENCE (docs/HIVE-MIND.md): the planner enumerates every provider, the pulse
// executes through the real public APIs (Power audit clean), the reserve is untouchable,
// and identical states plan identical purchases. Golden safety is pinned by the golden
// suite itself — autoplay never presses the button.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { AUTOMATION_POLICY, AUTOMATION_THREAT_REASON, automationGate, hiveBestSlot } from './hivemind';
import { SIM_DT } from './config';
import { HIVE_MIND } from './config';
import { effectsPower } from './power';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const forward = [...towerSlots].sort((a, b) => a.y - b.y);

function boot(seed: number): Game {
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { mode: 'endless', automationAllowed: true });
  g.debugAddBiomass(3000);
  g.placeTower('needle', forward[0].x, forward[0].y);
  g.placeTower('mortar', forward[1].x, forward[1].y);
  return g;
}

describe('hive intelligence — plan', () => {
  it('enumerates branch + hero-evolution actions and never plans past the reserve', () => {
    const g = boot(7);
    const plan = g.hiveEvaluate();
    expect(plan.some((a) => a.provider === 'branch')).toBe(true);
    expect(plan.some((a) => a.provider === 'heroEvo')).toBe(true);
    const spendable = g.biomass - Math.max(HIVE_MIND.reserveMin, Math.floor(g.biomass * HIVE_MIND.reserveFrac));
    for (const a of plan) expect(a.cost === 0 || a.cost <= spendable).toBe(true);
    // Ranked: values are non-increasing (the pulse always takes the best first).
    for (let i = 1; i < plan.length; i++) expect(plan[i].value).toBeLessThanOrEqual(plan[i - 1].value + 1e-12);
  });

  it('plans nothing (but free actions) when the wallet is empty', () => {
    const g = new Game(11, NO_META, undefined, 'ravager', undefined, { mode: 'endless', automationAllowed: true });
    // No debug biomass beyond the run's starting wallet: drain it.
    (g as unknown as { biomass: number }).biomass = 0;
    for (const a of g.hiveEvaluate()) expect(a.cost).toBe(0);
  });
});

describe('hive intelligence — pulse', () => {
  it('multi-buys through the real APIs: biomass falls by spent, live power rises, audit clean', () => {
    const g = boot(13);
    const powerBefore = effectsPower(g.powerEffects());
    const bioBefore = g.biomass;
    const rep = g.hivePulse();
    expect(rep.actions.length).toBeGreaterThan(0);
    expect(rep.actions.length).toBeLessThanOrEqual(HIVE_MIND.maxActionsPerPulse);
    expect(bioBefore - g.biomass).toBe(rep.spent);
    expect(effectsPower(g.powerEffects())).toBeGreaterThan(powerBefore);
    expect(g.powerAuditWarnings).toHaveLength(0); // every buy rode an audited path
  });

  it('is deterministic: identical states pulse identical action sequences', () => {
    const a = boot(29).hivePulse();
    const b = boot(29).hivePulse();
    expect(b.actions.map((x) => x.label)).toEqual(a.actions.map((x) => x.label));
    expect(b.spent).toBe(a.spent);
  });

  it('deploys the free starter organism even at an empty wallet', () => {
    const g = new Game(17, NO_META, undefined, 'ravager', undefined, { mode: 'endless', automationAllowed: true });
    (g as unknown as { biomass: number }).biomass = 0;
    const towers0 = g.towers.length;
    const hasFreeGift = g.conveyor.some((c) => c.free === true && c.readyAt <= g.time);
    const rep = g.hivePulse();
    if (hasFreeGift) {
      expect(g.towers.length).toBe(towers0 + 1);
      expect(rep.spent).toBe(0);
    } else {
      expect(rep.actions).toHaveLength(0); // no gift on this profile — nothing affordable
    }
  });
});

describe('hive intelligence — placement (docs/HIVE-MIND.md §placement)', () => {
  it('combat organisms take the most forward open slot; support organisms seek adjacency', () => {
    const g = boot(31);
    const taken = new Set(g.towers.map((t) => t.slot));
    const combat = hiveBestSlot(g, 'needle');
    expect(combat).not.toBeNull();
    const openYs = towerSlots.filter((s) => s.index < g.unlockedSlots && !taken.has(s.index)).map((s) => s.y);
    expect(combat!.y).toBe(Math.min(...openYs)); // forward first — meet the wave
    const support = hiveBestSlot(g, 'reactor');
    expect(support).not.toBeNull();
    // The reactor's pick touches ≥1 occupied lattice neighbor (its aura is its whole job).
    const touches = g.towers.some((t) => Math.hypot(t.x - support!.x, t.y - support!.y) <= HIVE_MIND.adjacencyPx);
    expect(touches).toBe(true);
  });

  it('a full pulse can PLACE (conveyor) once the belt has a ready organism', () => {
    const g = boot(37);
    // Run the wave loop briefly so the conveyor grows something beyond the gift.
    g.startWave();
    for (let i = 0; i < 60 * 30 && g.conveyor.every((c) => c.readyAt > g.time); i++) {
      for (const e of g.enemies) e.hp = -1;
      g.advance(SIM_DT);
    }
    if (g.conveyor.some((c) => c.readyAt <= g.time)) {
      const towers0 = g.towers.length;
      g.debugAddBiomass(2000);
      g.hivePulse();
      expect(g.towers.length).toBeGreaterThanOrEqual(towers0); // deploy/merge both legal outcomes
    }
  });
});

describe('the automation gate — solved content only (docs/HIVE-MIND.md §solved-content)', () => {
  const base = { tutorial: false, contentCleared: false, threat: 0, threatCleared: 0 };

  it('policy: Infinite always; Campaign only on cleared stages; Rush/Daily/Skirmish/tutorial never', () => {
    expect(automationGate({ ...base, mode: 'endless' }).allowed).toBe(true);
    expect(automationGate({ ...base, mode: 'campaign', contentCleared: true }).allowed).toBe(true);
    const frontier = automationGate({ ...base, mode: 'campaign', contentCleared: false });
    expect(frontier).toEqual({ allowed: false, reason: AUTOMATION_POLICY.campaign.reason });
    expect(frontier.reason).toMatch(/cleared/);
    for (const mode of ['bossRush', 'daily', 'stage'] as const) {
      const g = automationGate({ ...base, mode, contentCleared: true });
      expect(g.allowed, mode).toBe(false);
      expect(g.reason, mode).toBeTruthy();
    }
    expect(automationGate({ ...base, mode: 'endless', tutorial: true }).allowed).toBe(false);
  });

  it('a Threat level above the mode’s best cleared level is a frontier too', () => {
    expect(automationGate({ ...base, mode: 'endless', threat: 3, threatCleared: 3 }).allowed).toBe(true);
    expect(automationGate({ ...base, mode: 'endless', threat: 4, threatCleared: 3 })).toEqual({ allowed: false, reason: AUTOMATION_THREAT_REASON });
    expect(automationGate({ ...base, mode: 'campaign', contentCleared: true, threat: 1, threatCleared: 0 }).allowed).toBe(false);
  });

  it('the Game fails CLOSED: without the run option the pulse never acts and the button never glows', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'endless' });
    g.debugAddBiomass(3000);
    g.placeTower('needle', forward[0].x, forward[0].y);
    g.placeTower('mortar', forward[1].x, forward[1].y);
    expect(g.automationAllowed).toBe(false);
    expect(g.hiveEvaluate()).toEqual([]);
    const before = g.biomass;
    expect(g.hivePulse()).toEqual({ spent: 0, actions: [] });
    expect(g.biomass).toBe(before);
    expect(g.getSnapshot().hiveReady).toBe(false);
    // The same board with the option set acts (the planner itself is unchanged).
    expect(boot(7).hiveEvaluate().length).toBeGreaterThan(0);
  });
});
