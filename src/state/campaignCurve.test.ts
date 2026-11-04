// THE STAGE 1–3 CURVE PIN (docs/CAMPAIGN.md §curve). A fresh post-tutorial account — built through
// the REAL meta layer exactly as App.begin + GameView boot a campaign run — plays Stages 1–3 (on
// their pinned arena layouts) as two personas (core/sim.testutil.ts):
//   • modest  — the playtest persona (free gift + the favorite to a 5-tower board, then banks):
//               must WIN every stage with real chip damage — mean integrity inside the 60–90 % band
//               (± noise), never a flawless median — and feel the curve RISE (medians non-increasing,
//               stage 3 the hardest, no 15-point wall);
//   • builder — spends every prep: must clear all three comfortably (investment is rewarded).
// Before this pin the same persona went 100 % / 100 % / coin-flip (flawless waves, then a binary
// finale boss). Deterministic seeds ⇒ exact; a drift here means the onboarding curve moved —
// re-measure with the probe (docs/CAMPAIGN.md §curve) and re-pin deliberately.

import { beforeAll, describe, expect, it } from 'vitest';
import { meta, metaModifiers } from './meta';
import { Game } from '../core/game';
import type { RunOptions } from '../core/game';
import { CAMPAIGN_LAYOUT_PINS, generateStage, recommendedPowerScore } from '../core/campaign';
import { playPersona } from '../core/sim.testutil';
import type { CampaignPersona, PersonaOutcome } from '../core/sim.testutil';

const SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + (i + 1) * 7919);

beforeAll(() => {
  meta.reset();
  meta.completeTutorial('combat');
  meta.grantTutorialRewards('combat'); // post-tutorial: the commissioning payout lands (nothing equipped)
});

/** A campaign Game booted the way the app boots one for the CURRENT (fresh) account. */
function freshCampaignGame(stageNum: number, seed: number): Game {
  const save = meta.get();
  const opts: RunOptions = {
    runEffects: [...meta.genomeRunEffects(), ...meta.collectionRunEffects(), ...meta.trophyRunEffects(), ...meta.infestationRunEffects(), ...meta.cutsceneRunEffects(), ...meta.mulliganGlobalEffects(), ...meta.battlePassRunEffects(), ...meta.wardrobeRunEffects()],
    mode: 'campaign',
    stage: generateStage(stageNum, 'standard'),
    difficulty: 'standard',
    heroRoster: meta.fieldedLoadout(),
    heroEquip: meta.heroRosterEquip(),
    setEffects: meta.fieldedSetEffects(),
    heroAbilityKits: meta.heroAbilityKits(),
    favorite: meta.favoriteTower(),
    unlocked: meta.unlockedTowers(),
    geneLevels: meta.geneLevels(),
    geneTranscends: meta.geneTranscends(),
    nucleusEffects: meta.nucleusEffects(),
    startingGenes: meta.startingGenes(),
    unlockedCardIds: meta.unlockedCardIds(),
    draftPool: meta.discoveredGeneIds(),
    // GameView's grind levers (docs/EARLY-CALL.md, docs/DIFFICULTY_DIRECTOR.md §6a) — booted as the app boots them.
    earlyCall: true,
    livePowerBase: meta.power().score / recommendedPowerScore(stageNum, 'standard'),
  };
  return new Game(seed, metaModifiers(save), meta.towerProgress(), meta.selectedHero(), meta.heroProgress(), opts);
}

function sweep(stageNum: number, persona: CampaignPersona, seeds: number[]): { wins: number; meanIntegrity: number; runs: PersonaOutcome[] } {
  const runs = seeds.map((s) => playPersona(freshCampaignGame(stageNum, s), persona, meta.favoriteTower()));
  return { wins: runs.filter((r) => r.won).length, meanIntegrity: runs.reduce((a, r) => a + r.integrity, 0) / runs.length, runs };
}

describe('Campaign Stages 1–3 — the fresh-account curve', () => {
  it('the onboarding stages play their pinned layouts', () => {
    for (const st of [1, 2, 3]) expect(generateStage(st).layout).toBe(CAMPAIGN_LAYOUT_PINS[st]);
  });

  it('modest persona: wins every stage with chip damage, and the curve rises', () => {
    const s = [1, 2, 3].map((st) => sweep(st, 'modest', SEEDS));
    const median = (r: { runs: PersonaOutcome[] }): number => [...r.runs.map((x) => x.integrity)].sort((a, b) => a - b)[Math.floor(r.runs.length / 2)];
    const report = s.map((r, i) => `stage ${i + 1}: ${r.wins}/${SEEDS.length} wins, mean ${(r.meanIntegrity * 100).toFixed(0)}% median ${(median(r) * 100).toFixed(0)}%`).join('; ');
    for (const r of s) {
      expect(r.wins, report).toBeGreaterThanOrEqual(SEEDS.length - 2); // ≥ 10/12 — Stage 3 clears on the 1st or 2nd attempt
      expect(r.meanIntegrity, report).toBeGreaterThanOrEqual(0.6); // the 60–90 % band (± a few points of 12-seed noise)
      expect(r.meanIntegrity, report).toBeLessThanOrEqual(0.93);
      expect(median(r), report).toBeLessThan(1); // no longer flawless-trivial (before: median 100 %)
    }
    // The curve RISES: the typical run (median — one binary loss swings a 12-seed mean ~8 points)
    // never gets easier stage to stage, stage 3 is the hardest of the three, and no step is a wall.
    expect(median(s[1]), report).toBeLessThanOrEqual(median(s[0]));
    expect(median(s[2]), report).toBeLessThanOrEqual(median(s[1]));
    expect(s[2].meanIntegrity, report).toBeLessThan(s[0].meanIntegrity);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].meanIntegrity - s[i].meanIntegrity, report).toBeLessThan(0.15);
  }, 120_000);

  it('builder persona: clears all three comfortably (spending is rewarded)', () => {
    const seeds = SEEDS.slice(0, 6);
    for (const st of [1, 2, 3]) {
      const r = sweep(st, 'builder', seeds);
      const modest = sweep(st, 'modest', seeds);
      expect(r.wins).toBe(seeds.length);
      expect(r.meanIntegrity).toBeGreaterThanOrEqual(modest.meanIntegrity);
    }
  }, 120_000);
});
