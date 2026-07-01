// Task 4 content contract (docs/GENE-EVOLUTION.md): EVERY gene card carries 3–5 authored permanent
// upgrade levels, every level is meaningful (validated, noted, Power-visible, never boot-dead), and
// magnitudes stay sane. These are the structural "no card bypasses the upgrade system" guarantees.

import { describe, it, expect } from 'vitest';
import { CARD_POOL, cardProblems } from './cards';
import { GENE_UPGRADES } from './geneUpgrades';
import { effectiveGeneEffects, geneMaxLevel, genePermanentPowerMult } from './geneCards';

describe('gene upgrades — every card, no exceptions', () => {
  it('every card in the pool has 3–5 authored levels and passes the validator', () => {
    for (const c of CARD_POOL) {
      expect(c.upgrades?.length ?? 0, `card '${c.id}' upgrade count`).toBeGreaterThanOrEqual(3);
      expect(c.upgrades?.length ?? 0, `card '${c.id}' upgrade count`).toBeLessThanOrEqual(5);
      expect(c.maxLevel, `card '${c.id}' maxLevel`).toBe(c.upgrades!.length);
      expect(cardProblems(c), `card '${c.id}'`).toEqual([]);
    }
  });

  it('has no orphaned upgrade entries (every authored id is a real card)', () => {
    const ids = new Set(CARD_POOL.map((c) => c.id));
    for (const id of Object.keys(GENE_UPGRADES)) expect(ids.has(id), `orphan upgrade '${id}'`).toBe(true);
  });

  it('every LEVEL of every card is Power-visible (strictly rising permanent power)', () => {
    for (const c of CARD_POOL) {
      let prev = genePermanentPowerMult(c, 0);
      expect(prev).toBe(1);
      for (let l = 1; l <= geneMaxLevel(c); l++) {
        const p = genePermanentPowerMult(c, l);
        expect(p, `card '${c.id}' L${l} must raise permanent power`).toBeGreaterThan(prev);
        prev = p;
      }
    }
  });

  it('magnitudes stay sane — no card more than ~doubles its permanent power fully maxed', () => {
    for (const c of CARD_POOL) {
      expect(genePermanentPowerMult(c, geneMaxLevel(c)), `card '${c.id}' maxed`).toBeLessThan(1.9);
    }
  });

  it('levels EVOLVE the card — each track touches ≥2 distinct fields/verbs (not a single-stat treadmill)', () => {
    for (const c of CARD_POOL) {
      const knobs = new Set<string>();
      for (const u of c.upgrades!) {
        for (const e of u.effects) {
          if (e.op === 'mul' || e.op === 'add' || e.op === 'flag' || e.op === 'set') knobs.add(`${e.op}:${e.field}`);
          else if (e.op === 'grant') knobs.add(`grant:${e.grant.kind}`);
          else if (e.op === 'hook') knobs.add(`hook:${e.hook.on}:${e.hook.action.do}`);
          else knobs.add(e.op); // instant ops
        }
      }
      expect(knobs.size, `card '${c.id}' distinct knobs`).toBeGreaterThanOrEqual(2);
    }
  });

  it('the fold applies exactly the authored deltas at max level', () => {
    for (const c of CARD_POOL) {
      const max = geneMaxLevel(c);
      const total = c.effects.length + c.upgrades!.reduce((s, u) => s + u.effects.length, 0);
      expect(effectiveGeneEffects(c, max)).toHaveLength(total);
      expect(effectiveGeneEffects(c, 0)).toEqual(c.effects); // level 0 = base (the golden path)
    }
  });
});
