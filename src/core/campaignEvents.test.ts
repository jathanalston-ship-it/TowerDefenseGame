// CAMPAIGN EVENTS (docs/CAMPAIGN-EVENTS.md) — the authoring seam that punctuates the procedural
// campaign with authored stages. This pins: registry integrity, deterministic + gated sampling, that
// each archetype folds onto the RIGHT lever, that the base scaling/reward curve is NEVER touched
// (the smooth-progression invariants stay in campaign.test), and that a stamped stage drives the sim.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { generateStage, stageStartAid } from './campaign';
import {
  CAMPAIGN_EVENTS, campaignEventForStage, campaignEventEligible, resolveCampaignBoon,
} from './campaignEvents';
import type { CampaignEventKind } from './campaignEvents';
import { CAMPAIGN_REWARDS } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 } as MetaModifiers;

/** The first stage (scanning up) whose authored event is of `kind` — deterministic, so the assertion
 *  below always lands on the same concrete stage. Throws if none is found in a generous window. */
function firstStageOfKind(kind: CampaignEventKind): number {
  for (let s = 4; s <= 600; s++) {
    if (campaignEventForStage(s, 'standard')?.kind === kind) return s;
  }
  throw new Error(`no ${kind} stage found`);
}

describe('campaign events — registry integrity', () => {
  it('every def is well-formed and each archetype carries its own lever', () => {
    const ids = new Set<string>();
    for (const e of CAMPAIGN_EVENTS) {
      expect(ids.has(e.id)).toBe(false); // unique ids
      ids.add(e.id);
      expect(e.weight).toBeGreaterThan(0);
      expect(e.minStage).toBeGreaterThanOrEqual(1);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.icon.length).toBeGreaterThan(0);
      if (e.kind === 'eliteRush') expect((e.elitePromote ?? 0) > 0 || (e.eliteMult ?? 0) > 0).toBe(true);
      if (e.kind === 'gauntlet') expect(e.gauntletBosses).toBeGreaterThan(0);
      if (e.kind === 'cache') expect((e.rewardMult ?? 0) > 1 || (e.startBiomassBonus ?? 0) > 0).toBe(true);
      if (e.kind === 'mutation') {
        expect(e.boons && e.boons.length).toBeGreaterThanOrEqual(2); // a real A/B choice
        for (const b of e.boons!) expect(b.effects.length).toBeGreaterThan(0);
      }
    }
    // the seam covers all four archetypes from 0
    expect(new Set(CAMPAIGN_EVENTS.map((e) => e.kind))).toEqual(new Set(['eliteRush', 'gauntlet', 'cache', 'mutation']));
  });
});

describe('campaign events — deterministic, gated sampling', () => {
  it('is deterministic in (stage, difficulty)', () => {
    for (const s of [7, 12, 40, 123]) {
      expect(campaignEventForStage(s, 'standard')?.id).toBe(campaignEventForStage(s, 'standard')?.id);
    }
  });

  it('never fires on onboarding, milestone, or authored-boss stages', () => {
    expect(campaignEventForStage(1)).toBeNull();
    expect(campaignEventForStage(3)).toBeNull(); // onboarding floor
    expect(campaignEventEligible(CAMPAIGN_REWARDS.milestoneEvery)).toBe(false); // milestone finale stays authored
    expect(campaignEventForStage(5)).toBeNull(); // authored Milestone-1 boss stage
    expect(campaignEventForStage(25)).toBeNull(); // authored boss stage
  });

  it('is sparse — most stages carry no event (punctuation, not noise)', () => {
    let events = 0;
    for (let s = 4; s <= 120; s++) if (campaignEventForStage(s, 'standard')) events++;
    expect(events).toBeGreaterThan(0);
    expect(events).toBeLessThan(120 * 0.5); // well under half of stages
  });
});

describe('campaign events — each archetype folds onto its lever (base curve untouched)', () => {
  it('a NO-event stage is a clean StageConfig (no stamp)', () => {
    // stage 3 is below the event floor ⇒ guaranteed clean.
    expect(generateStage(3, 'standard').event).toBeUndefined();
  });

  it('Elite Rush promotes composed groups and keeps the elite cap', () => {
    const s = firstStageOfKind('eliteRush');
    const cfg = generateStage(s, 'standard');
    expect(cfg.event?.kind).toBe('eliteRush');
    const eliteGroups = cfg.waves.flat().filter((g) => g.elite).length;
    expect(eliteGroups).toBeGreaterThan(0); // real in-sim promotion (elites are baked into group flags)
    expect(cfg.eliteFrequency).toBeLessThanOrEqual(0.45 + 1e-9); // the 0.45 invariant still holds
  });

  it('Boss Gauntlet populates the per-wave boss lever (StageConfig.bossWaves)', () => {
    const s = firstStageOfKind('gauntlet');
    const cfg = generateStage(s, 'standard');
    const def = CAMPAIGN_EVENTS.find((e) => e.id === cfg.event?.id)!;
    const bossWaves = cfg.bossWaves ?? {};
    expect(Object.keys(bossWaves).length).toBeGreaterThanOrEqual(1);
    for (const w of Object.keys(bossWaves)) expect(Number(w)).toBeLessThan(cfg.waveCount); // never the finale wave
    expect(Object.keys(bossWaves).length).toBeLessThanOrEqual(def.gauntletBosses!);
  });

  it('Genome Cache fattens the opening economy + stamps a reward × WITHOUT moving the base curve', () => {
    const s = firstStageOfKind('cache');
    const cfg = generateStage(s, 'standard');
    expect(cfg.startBiomassBonus).toBeGreaterThan(stageStartAid(s)); // opening aid boosted
    expect(cfg.event?.rewardMult).toBeGreaterThan(1); // the bonus rides the stamp…
    // …and the BASE reward curve is pristine: monotonic vs the next non-event stage's base.
    const base = cfg.rewardMult;
    expect(base).toBeGreaterThan(0);
    expect(generateStage(s + 1, 'standard').rewardMult).toBeGreaterThan(base - 1e-9);
  });

  it('Mutation offers a real A/B boon choice', () => {
    const s = firstStageOfKind('mutation');
    const cfg = generateStage(s, 'standard');
    expect(cfg.event?.boons?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('campaign events — boon resolution + end-to-end sim consumption', () => {
  it('resolveCampaignBoon picks the chosen option, else the first, else null', () => {
    const boons = CAMPAIGN_EVENTS.find((e) => e.kind === 'mutation')!.boons!;
    expect(resolveCampaignBoon(boons, boons[1].id)?.id).toBe(boons[1].id); // chosen
    expect(resolveCampaignBoon(boons, 'nonsense')?.id).toBe(boons[0].id); // default = first
    expect(resolveCampaignBoon(boons)?.id).toBe(boons[0].id);
    expect(resolveCampaignBoon(undefined)).toBeNull();
    expect(resolveCampaignBoon([])).toBeNull();
  });

  it('a Cache stage drives the sim — its opening Biomass reaches the battlefield', () => {
    const s = firstStageOfKind('cache');
    const cfg = generateStage(s, 'standard');
    const game = new Game(123, NO_META, undefined, 'ravager', undefined, { mode: 'campaign', stage: cfg });
    // startBiomass folds the stage's (event-boosted) startBiomassBonus — the cache is real in-run.
    expect(game.getSnapshot().biomass).toBeGreaterThanOrEqual(cfg.startBiomassBonus);
  });
});
