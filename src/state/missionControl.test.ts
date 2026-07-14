// MISSION CONTROL (docs/MISSION-CONTROL.md — Foundation #1): the Command Center's centerpiece
// read-model. Pins the coalescing contract: PRIMARY is always the campaign frontier (deploy when
// ready, the exact Power path when not); SECONDARY unifies the anticipation spine + banked value
// + the Advisor's best move (one fact, one value — no re-derived numbers); LONG-TERM walks the
// unlock learning curve in its authored order. Every row is actionable: progress + reward + nav.

import { describe, it, expect } from 'vitest';
import { missionControl } from './missionControl';
import { nextGoals } from './nextGoal';
import { defaultSave } from '../save/saveStore';

describe('Mission Control — the one derivation that answers "what should I do?"', () => {
  it('PRIMARY is the campaign frontier, with progress/reward/nav always present', () => {
    const m = missionControl(defaultSave());
    expect(m.primary.title).toBe('Descend: Stage 1');
    expect(m.primary.nav).toBe('campaign');
    expect(m.primary.progress).toBeGreaterThan(0);
    expect(m.primary.reward).toMatch(/◆/); // the first-clear payout is previewed
    expect(m.primary.remaining.length).toBeGreaterThan(0);
  });

  it('SECONDARY carries the anticipation spine verbatim — one fact, one value', () => {
    const s = { ...defaultSave(), heroShards: { ...defaultSave().heroShards, shepherd: 42 } };
    const m = missionControl(s);
    const spine = nextGoals(s, 3);
    const row = m.secondary.find((o) => o.id === spine[0].id);
    expect(row).toBeTruthy();
    expect(row!.progress).toBe(spine[0].progress); // never re-derived
    expect(row!.nav).toBe(spine[0].nav);
  });

  it('banked value surfaces: pending containers become a claim objective', () => {
    const s = { ...defaultSave(), pendingContainers: [{}, {}] as never };
    const m = missionControl(s);
    const vault = m.secondary.find((o) => o.id === 'vault:pending');
    expect(vault).toBeTruthy();
    expect(vault!.remaining).toBe('2 ready');
    expect(vault!.nav).toBe('vault');
  });

  it('a funded account gets the Advisor top move as a secondary, with its EXACT gain', () => {
    const m = missionControl({ ...defaultSave(), shards: 800 });
    const adv = m.secondary.find((o) => o.id === 'advisor:top');
    expect(adv).toBeTruthy();
    expect(adv!.powerGain).toBe(m.plan.moves[0].powerDelta); // same engine, same number
  });

  it('LONG-TERM walks the unlock learning curve in authored order, capped at 3', () => {
    const m = missionControl(defaultSave());
    expect(m.longterm.length).toBeGreaterThan(0);
    expect(m.longterm.length).toBeLessThanOrEqual(3);
    for (const o of m.longterm) {
      expect(o.id.startsWith('unlock:')).toBe(true);
      expect(o.remaining.length).toBeGreaterThan(0); // the requirement is always spelled out
      expect(o.why.length).toBeGreaterThan(0); // the anticipation hook rides along
    }
  });
});
