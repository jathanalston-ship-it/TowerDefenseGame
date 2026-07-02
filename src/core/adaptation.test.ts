// Adaptation / Antigen invariants (docs/ADAPTATION.md): the generated per-tower trees are
// well-formed at ANY roster size, the multi-source Antigen economy is capped exactly as
// designed (never infinitely farmable), picking obeys ladder + campaign gates + fork
// exclusivity, and the whole system is golden-safe — a unit with nothing chosen folds to
// the NEUTRAL effect, so a fresh save simulates byte-identically.

import { describe, it, expect } from 'vitest';
import {
  ADAPT_NODES,
  ADAPT_RESPEC,
  ADAPT_STAGE_GATES,
  ANTIGEN,
  TOWER_ADAPT_BRANCHES,
  adaptNodesFor,
  adaptStageGate,
  adaptVisualTier,
  adaptationEffect,
  antigenEarned,
  canPickAdapt,
  neutralAdaptEffect,
  respecCost,
} from './adaptation';
import { meta } from '../state/meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { TOWER_ORDER } from './config';

describe('generated per-tower trees (a future tower = one theme row)', () => {
  it('every tower ships 4 branches × 12 nodes with globally unique ids', () => {
    expect(ADAPT_NODES.length).toBe(new Set(ADAPT_NODES.map((n) => n.id)).size);
    for (const k of TOWER_ORDER) {
      const mine = ADAPT_NODES.filter((n) => n.kind === k);
      expect(mine.length).toBe(TOWER_ADAPT_BRANCHES.length * 12); // 10 tiers + 2 fork siblings
      for (const b of TOWER_ADAPT_BRANCHES) {
        const branch = mine.filter((n) => n.branch === b);
        for (let tier = 1; tier <= 10; tier++) {
          expect(branch.filter((n) => n.tier === tier).length).toBe(tier === 4 || tier === 7 ? 2 : 1);
        }
      }
    }
  });

  it('forks are SYMMETRICALLY exclusive and mark visual stages; capstones are stage 3', () => {
    for (const n of ADAPT_NODES.filter((x) => x.kind)) {
      if (n.tier === 4 || n.tier === 7) {
        expect(n.exclusiveWith?.length).toBe(1);
        const sib = ADAPT_NODES.find((x) => x.id === n.exclusiveWith![0])!;
        expect(sib.exclusiveWith).toEqual([n.id]); // symmetry — sealing works both ways
        expect(n.visualTier).toBe(n.tier === 4 ? 1 : 2);
      } else if (n.tier === 10) {
        expect(n.visualTier).toBe(3);
      } else {
        expect(n.exclusiveWith).toBeUndefined();
      }
    }
  });

  it('deep tiers carry the campaign gates (late-game pacing by construction)', () => {
    expect(ADAPT_STAGE_GATES.map((g) => g.tier)).toEqual([4, 7, 10]);
    for (const n of ADAPT_NODES.filter((x) => x.kind)) {
      expect(n.campaignStage).toBe(adaptStageGate(n.tier) || undefined);
    }
    expect(adaptStageGate(3)).toBe(0);
    expect(adaptStageGate(4)).toBe(15);
    expect(adaptStageGate(9)).toBe(30);
    expect(adaptStageGate(10)).toBe(50);
  });

  it('adaptNodesFor: a tower sees ITS tree; legacy shared picks surface only if owned', () => {
    const needle = adaptNodesFor('tower', 'needle');
    expect(needle.length).toBe(TOWER_ADAPT_BRANCHES.length * 12);
    expect(needle.every((n) => n.kind === 'needle')).toBe(true);
    const withLegacy = adaptNodesFor('tower', 'needle', ['t.vir.1']);
    expect(withLegacy.some((n) => n.id === 't.vir.1')).toBe(true);
    expect(adaptNodesFor('hero', 'vanguard').every((n) => n.subject === 'hero')).toBe(true);
  });
});

describe('Antigen economy — every source slow or CAPPED (never farmable)', () => {
  it('sums mastery ranks + campaign bands + capped traces + capped achievements', () => {
    expect(antigenEarned({ masteryLevel: 0, campaignStage: 0, containerAntigen: 0, achievementCount: 0 })).toBe(0);
    expect(antigenEarned({ masteryLevel: 25, campaignStage: 0, containerAntigen: 0, achievementCount: 0 })).toBe(1);
    expect(antigenEarned({ masteryLevel: 0, campaignStage: ANTIGEN.stagePer * 2, containerAntigen: 0, achievementCount: 0 })).toBe(2);
    // caps: 99 container traces still pay containerCap; 100 achievements still pay achievementCap
    expect(antigenEarned({ masteryLevel: 0, campaignStage: 0, containerAntigen: 99, achievementCount: 0 })).toBe(ANTIGEN.containerCap);
    expect(antigenEarned({ masteryLevel: 0, campaignStage: 0, containerAntigen: 0, achievementCount: 100 })).toBe(ANTIGEN.achievementCap);
    expect(antigenEarned({ masteryLevel: 50, campaignStage: 30, containerAntigen: 10, achievementCount: 25 }))
      .toBe(2 + 2 + ANTIGEN.containerCap + ANTIGEN.achievementCap);
  });

  it('meta.adaptation reports the budget provenance (and caps container traces)', () => {
    meta.importText(serializeExport({ ...defaultSave(), antigen: 9, achievements: ['extract', 'first_run', 'wave_10', 'wave_25', 'unlock_tower'] }));
    const v = meta.adaptation('tower', 'needle');
    expect(v.sources.containers).toBe(ANTIGEN.containerCap);
    expect(v.sources.achievements).toBe(1);
    expect(v.pointsEarned).toBe(ANTIGEN.containerCap + 1);
  });
});

describe('picking rules — ladder, campaign gates, fork exclusivity', () => {
  const t1 = 'needle.predation.1';
  const t2 = 'needle.predation.2';
  const t3 = 'needle.predation.3';
  const ladder = [t1, t2, t3];

  it('tiers unlock in order within a branch; owned nodes never re-buy', () => {
    expect(canPickAdapt(t1, [])).toBe(true);
    expect(canPickAdapt(t2, [])).toBe(false);
    expect(canPickAdapt(t2, [t1])).toBe(true);
    expect(canPickAdapt(t1, [t1])).toBe(false);
    // another tower's ladder does NOT satisfy this tower's (per-kind trees)
    expect(canPickAdapt(t2, ['mortar.predation.1'])).toBe(false);
  });

  it('tier 4 gates on the campaign stage — farming mastery alone cannot rush depth', () => {
    expect(canPickAdapt('needle.predation.4a', ladder, 14)).toBe(false);
    expect(canPickAdapt('needle.predation.4a', ladder, 15)).toBe(true);
  });

  it('picking one fork sibling permanently seals the other (until respec)', () => {
    const chosen = [...ladder, 'needle.predation.4a'];
    expect(canPickAdapt('needle.predation.4b', chosen, 99)).toBe(false);
    // and the ladder continues off EITHER sibling
    expect(canPickAdapt('needle.predation.5', chosen, 99)).toBe(true);
  });

  it('visual FORM stages rise at keystones/apex', () => {
    expect(adaptVisualTier([])).toBe(0);
    expect(adaptVisualTier([...ladder, 'needle.predation.4a'])).toBe(1);
    expect(adaptVisualTier(['needle.predation.7b'])).toBe(2);
    expect(adaptVisualTier(['needle.predation.10'])).toBe(3);
  });
});

describe('effects — golden-safe fold into the existing per-kind kit', () => {
  it('an empty pick set folds to the NEUTRAL effect (fresh save byte-identical)', () => {
    expect(adaptationEffect([])).toEqual(neutralAdaptEffect());
  });

  it('folds mults multiplicatively and stacks mutators/projectiles', () => {
    const e = adaptationEffect(['needle.predation.1', 'needle.predation.2', 'needle.predation.10']);
    expect(e.damageMult).toBeCloseTo(1.04 * 1.04 * 1.25, 6);
    expect(e.projectileMutators).toEqual(['pierce3']);
    const volley = adaptationEffect(['needle.predation.4b']);
    expect(volley.extraProjectiles).toBe(1);
  });
});

describe('meta layer — spends, campaign gating, PRICED + GATED respec', () => {
  const xp = { ...defaultSave().towerMasteryXp, needle: 1e9 }; // deep mastery ⇒ plenty of ranks

  it('spend refused at 0 points; succeeds with budget; deep tiers wait for the campaign', () => {
    meta.importText(serializeExport(defaultSave()));
    expect(meta.spendAdaptation('tower', 'needle', 'needle.predation.1')).toBe(false);
    meta.importText(serializeExport({ ...defaultSave(), towerMasteryXp: xp }));
    for (const id of ['needle.predation.1', 'needle.predation.2', 'needle.predation.3']) {
      expect(meta.spendAdaptation('tower', 'needle', id)).toBe(true);
    }
    // stage 0 account: the tier-4 keystone is campaign-gated even with points free
    expect(meta.spendAdaptation('tower', 'needle', 'needle.predation.4a')).toBe(false);
    meta.importText(serializeExport({
      ...meta.get(), campaign: { cleared: { standard: 15 }, bestTime: {} },
    }));
    expect(meta.spendAdaptation('tower', 'needle', 'needle.predation.4a')).toBe(true);
    expect(meta.spendAdaptation('tower', 'needle', 'needle.predation.4b')).toBe(false); // sealed
  });

  it('respec: refused before the stage gate; then PRICED in Genome Cores and refunds all', () => {
    meta.importText(serializeExport({ ...defaultSave(), towerMasteryXp: xp, shards: 1000 }));
    meta.spendAdaptation('tower', 'needle', 'needle.predation.1');
    meta.spendAdaptation('tower', 'needle', 'needle.mutation.1');
    expect(meta.respecAdaptation('tower', 'needle')).toBe(false); // stage 0 < gate
    expect(meta.get().adaptation['tower:needle']).toHaveLength(2);
    meta.importText(serializeExport({
      ...meta.get(), campaign: { cleared: { standard: ADAPT_RESPEC.stageGate }, bestTime: {} },
    }));
    meta.importText(serializeExport({ ...meta.get(), shards: respecCost(2) - 1 }));
    expect(meta.respecAdaptation('tower', 'needle')).toBe(false); // can't afford
    meta.importText(serializeExport({ ...meta.get(), shards: respecCost(2) + 5 }));
    expect(meta.respecAdaptation('tower', 'needle')).toBe(true);
    expect(meta.get().adaptation['tower:needle']).toBeUndefined();
    expect(meta.get().shards).toBe(5); // cost deducted
    expect(meta.adaptation('tower', 'needle').pointsAvailable).toBeGreaterThan(0); // points refunded
  });
});
