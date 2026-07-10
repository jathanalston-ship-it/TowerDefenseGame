// Data-driven achievement framework — pure milestone checks over the save (+ the
// optional last-run summary). Unlocking is recognition/feedback (and an optional
// Genome Cores reward); it never touches the sim or grants combat power, so it adds zero
// gameplay drift. Add an entry to grow the set — persistence, toasts, rewards,
// progress bars, and hidden reveals are all generic.
//
// Architecture (per the brief — build the framework, not hundreds of entries):
//   • hidden   — concealed until unlocked (surprise milestones).
//   • reward   — Genome Cores granted once on unlock (0/absent = recognition only).
//   • progress — optional lifetime tracker {cur,max} → drives the panel's bar.
//   • test     — the unlock predicate. Reads `save` (incl. lifetime `save.stats`,
//                the statistics-system integration) and the optional run summary.

import { HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { MULLIGAN_RARITY, accountMulliganPower, isMaxLevel, isMulliganActive, mulliganRegistry } from '../core/mulligan';
import { WEAK_POINT_DEFS, megaBossRegistry } from '../core/megaboss';
import { highestCampaignStage } from '../save/derive';
import type { TowerKind } from '../core/types';
import type { SaveData } from '../save/saveStore';

/** Minimal run summary (structurally a subset of RunResult — avoids a meta import). */
export interface RunSummary {
  wave: number;
  kills: number;
  won: boolean;
}

export interface AchievementCtx {
  save: SaveData; // the save AFTER the run/change is applied (incl. save.stats)
  run?: RunSummary; // present when evaluating at run end
}

export interface AchievementProgress {
  cur: number;
  max: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean; // concealed in the gallery until unlocked
  reward?: number; // Genome Cores granted on unlock
  test: (c: AchievementCtx) => boolean;
  /** Optional lifetime progress for the gallery bar (run-only goals omit it). */
  progress?: (c: AchievementCtx) => AchievementProgress;
}

const maxStars = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerStars[k] ?? 0));
const maxMastery = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerMasteryXp[k] ?? 0));
const towerUse = (s: SaveData, k: TowerKind): number => s.stats.towerUsage[k] ?? 0;
const heroUse = (s: SaveData, k: string): number => s.stats.heroUsage[k] ?? 0;
const towersOwned = (s: SaveData): number => TOWER_ORDER.filter((k) => (TOWER_DEFS[k].unlockShards ?? 0) <= 0 || (s.towerUnlocked ?? []).includes(k)).length;
const heroesFielded = (s: SaveData): number => HERO_ORDER.filter((k) => heroUse(s, k) >= 1).length;
// The Deep-Fauna fusion strains — the 'deep_fauna' Bestiary achievement tracks slaying each one.
const DEEP_FAUNA_KINDS = ['zealot', 'carrier', 'entrencher', 'oracle', 'glutling'] as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Milestones (visible, save/run based) ──
  { id: 'tutorial_complete', name: 'Assimilation Protocol', desc: 'Complete the Combat Tutorial.', reward: 20, test: (c) => c.save.tutorial.completed.includes('combat') },
  { id: 'first_run', name: 'First Contact', desc: 'Finish your first run.', reward: 10, test: (c) => c.save.totalRuns >= 1 },
  { id: 'wave5', name: 'Holding the Line', desc: 'Reach wave 5.', reward: 15, test: (c) => c.save.bestWave >= 5, progress: (c) => ({ cur: c.save.bestWave, max: 5 }) },
  { id: 'extract', name: 'Extraction', desc: 'Survive every wave and extract.', reward: 50, test: (c) => !!c.run?.won },
  { id: 'centurion', name: 'Centurion', desc: 'Score 100 kills in a single run.', reward: 25, test: (c) => (c.run?.kills ?? 0) >= 100 },
  { id: 'veteran', name: 'Veteran', desc: 'Complete 10 runs.', reward: 50, test: (c) => c.save.totalRuns >= 10, progress: (c) => ({ cur: c.save.totalRuns, max: 10 }) },
  { id: 'hoarder', name: 'Hoarder', desc: `Bank 500 lifetime ${ACCOUNT_CURRENCY.name}.`, reward: 40, test: (c) => c.save.lifetimeShards >= 500, progress: (c) => ({ cur: c.save.lifetimeShards, max: 500 }) },

  // ── Progression (towers) ──
  { id: 'first_star', name: 'Ascendant', desc: 'Upgrade a tower to one star.', reward: 10, test: (c) => maxStars(c.save) >= 1, progress: (c) => ({ cur: maxStars(c.save), max: 1 }) },
  { id: 'star3', name: 'Star Forged', desc: 'Bring a tower to three stars.', reward: 30, test: (c) => maxStars(c.save) >= 3, progress: (c) => ({ cur: maxStars(c.save), max: 3 }) },
  { id: 'specialist', name: 'Specialist', desc: 'Reach 2,000 Mastery XP on a tower.', reward: 25, test: (c) => maxMastery(c.save) >= 2000, progress: (c) => ({ cur: maxMastery(c.save), max: 2000 }) },
  { id: 'hero_shard', name: 'Champion Fragment', desc: 'Collect a Hero Shard.', test: (c) => Object.values(c.save.heroShards).some((n) => n > 0) },
  // ── Mulligans (docs/MULLIGANS.md) — the biomechanical organism pillar ──
  { id: 'mulligan_grafted', name: 'Grafted', desc: 'Fully assemble a Mulligan (all three modifier slots) on a tower.', reward: 25, test: (c) => TOWER_ORDER.some((k) => isMulliganActive(c.save.mulligans?.[k])) },
  { id: 'mulligan_splicer', name: 'Gene Splicer', desc: 'Discover 12 distinct Mulligan modifiers.', reward: 40, test: (c) => Object.keys(c.save.mulliganDex ?? {}).length >= 12, progress: (c) => ({ cur: Object.keys(c.save.mulliganDex ?? {}).length, max: 12 }) },
  { id: 'mulligan_transcendent', name: 'Transcendent Graft', desc: 'Bring a slotted modifier to Legendary rarity or beyond.', reward: 60, hidden: true, test: (c) => TOWER_ORDER.some((k) => (c.save.mulligans?.[k]?.slots ?? []).some((s) => s && MULLIGAN_RARITY[s.rarity].tier >= MULLIGAN_RARITY.legendary.tier)) },
  { id: 'mulligan_dex', name: 'Complete Sequence', desc: 'Discover every known Mulligan modifier.', reward: 100, test: (c) => mulliganRegistry.ids().every((id) => !!c.save.mulliganDex?.[id]), progress: (c) => ({ cur: Object.keys(c.save.mulliganDex ?? {}).length, max: mulliganRegistry.size }) },
  { id: 'mulligan_perfected', name: 'Perfected Strain', desc: 'Grow a slotted modifier to its rarity level cap.', reward: 55, test: (c) => TOWER_ORDER.some((k) => (c.save.mulligans?.[k]?.slots ?? []).some((s) => s && isMaxLevel(s))) },
  { id: 'mulligan_ascendant', name: 'Ascendant Symbiosis', desc: 'Slot an Ascendant-rarity modifier — the apex strain.', hidden: true, reward: 90, test: (c) => TOWER_ORDER.some((k) => (c.save.mulligans?.[k]?.slots ?? []).some((s) => s && s.rarity === 'ascendant')) },
  { id: 'mulligan_overlord', name: 'Biomechanical Overlord', desc: 'Reach ×1.5 account Power from Mulligan organisms.', reward: 100, test: (c) => accountMulliganPower(TOWER_ORDER.map((k) => [c.save.mulligans?.[k], TOWER_DEFS[k].combatClass] as const)) >= 1.5, progress: (c) => ({ cur: Math.round(accountMulliganPower(TOWER_ORDER.map((k) => [c.save.mulligans?.[k], TOWER_DEFS[k].combatClass] as const)) * 100), max: 150 }) },

  // ── Statistics-driven (integrates with the lifetime stats system) ──
  { id: 'exterminator', name: 'Exterminator', desc: 'Kill 1,000 enemies (lifetime).', reward: 60, test: (c) => c.save.stats.lifetimeKills >= 1000, progress: (c) => ({ cur: c.save.stats.lifetimeKills, max: 1000 }) },
  { id: 'biomass_baron', name: 'Biomass Baron', desc: 'Harvest 50,000 biomass (lifetime).', reward: 60, test: (c) => c.save.stats.totalBiomass >= 50000, progress: (c) => ({ cur: c.save.stats.totalBiomass, max: 50000 }) },
  { id: 'collector', name: 'Gene Collector', desc: 'Collect 12 distinct Gene Cards.', reward: 40, test: (c) => c.save.stats.uniqueCards.length >= 12, progress: (c) => ({ cur: c.save.stats.uniqueCards.length, max: 12 }) },
  { id: 'persistent', name: 'Persistence', desc: 'Complete 5 runs to extraction.', reward: 40, test: (c) => c.save.stats.runsCompleted >= 5, progress: (c) => ({ cur: c.save.stats.runsCompleted, max: 5 }) },

  // ── Strain evolution (docs/STRAIN.md §7 — the in-run conveyor-merge layer) ──
  { id: 'first_strain', name: 'Mutagenesis', desc: 'Evolve a tower to Strain II.', reward: 20, test: (c) => c.save.stats.bestStrain >= 2 },
  { id: 'strain5', name: 'Apex Strain', desc: 'Evolve a tower to Strain V.', reward: 75, test: (c) => c.save.stats.bestStrain >= 5, progress: (c) => ({ cur: Math.max(1, c.save.stats.bestStrain), max: 5 }) },
  ...([10, 50] as const).map((n, i): AchievementDef => ({
    id: `strains${n}`, name: ['Serial Mutator', 'Colony Alchemist'][i],
    desc: `Commit ${n} strain evolutions (lifetime).`, reward: 40 + i * 50,
    test: (c) => c.save.stats.strainsEvolved >= n,
    progress: (c) => ({ cur: c.save.stats.strainsEvolved, max: n }),
  })),

  // ── Boss Rush (docs/BOSS-RUSH.md — the gauntlet's own ladder) ──
  { id: 'rush_first', name: 'Gauntlet Runner', desc: 'Settle a Boss Rush run.', reward: 15, test: (c) => c.save.stats.rushRuns >= 1 },
  { id: 'rush_wave5', name: 'Five Sieges Deep', desc: 'Reach wave 5 in Boss Rush.', reward: 30, test: (c) => c.save.rushBestWave >= 5, progress: (c) => ({ cur: c.save.rushBestWave, max: 5 }) },
  { id: 'rush_wave10', name: 'Decimation Line', desc: 'Reach wave 10 in Boss Rush.', reward: 75, test: (c) => c.save.rushBestWave >= 10, progress: (c) => ({ cur: c.save.rushBestWave, max: 10 }) },
  { id: 'rush_boss15', name: 'Fifteen Skulls', desc: 'Defeat 15 bosses in a single Boss Rush run.', reward: 50, test: (c) => c.save.rushBestBoss >= 15, progress: (c) => ({ cur: c.save.rushBestBoss, max: 15 }) },
  { id: 'roulette_first', name: 'Spore Bearer', desc: 'Launch a Bio-Spore into the Bio-Roulette.', reward: 15, test: (c) => c.save.stats.rouletteSpores >= 1 },
  { id: 'roulette_50', name: 'Wheel of Flesh', desc: 'Absorb 50 lifetime Bio-Spores.', reward: 40, test: (c) => c.save.stats.rouletteSpores >= 50, progress: (c) => ({ cur: c.save.stats.rouletteSpores, max: 50 }) },
  ...([50, 250] as const).map((n, i): AchievementDef => ({
    id: `rush_bosses${n}`, name: ['Boss Breaker', 'Extinction Event'][i],
    desc: `Defeat ${n} bosses in Boss Rush (lifetime).`, reward: 40 + i * 60,
    test: (c) => c.save.stats.rushBossKills >= n,
    progress: (c) => ({ cur: c.save.stats.rushBossKills, max: n }),
  })),

  // ── Champion Contracts (docs/CONTRACTS.md — the weekly constraint board) ──
  { id: 'contract_first', name: 'Under Contract', desc: 'Honour your first Champion Contract.', reward: 15, test: (c) => c.save.contracts.completed.length >= 1 },
  { id: 'contract_12', name: 'Sworn Champion', desc: 'Honour 12 Champion Contracts (lifetime).', reward: 40, test: (c) => c.save.contracts.completed.length >= 12, progress: (c) => ({ cur: c.save.contracts.completed.length, max: 12 }) },
  { id: 'perfect_week', name: 'Perfect Week', desc: 'Honour all three Champion Contracts in one week.', reward: 60, test: (c) => c.save.contracts.perfectWeeks >= 1 },

  // ── Hidden (surprise milestones — concealed until earned) ──
  { id: 'apex_slayer', name: 'Apex Slayer', desc: 'Slay a Brood Tyrant.', hidden: true, reward: 75, test: (c) => (c.save.stats.killsByEnemy.tyrant ?? 0) >= 1 },
  { id: 'annihilation', name: 'Annihilation', desc: 'Deal 1,000,000 total damage (lifetime).', hidden: true, reward: 100, test: (c) => c.save.stats.totalDamage >= 1_000_000, progress: (c) => ({ cur: c.save.stats.totalDamage, max: 1_000_000 }) },
  // Bestiary milestone (docs/COLLECTION.md): hunt every Deep-Fauna fusion strain at least once.
  { id: 'deep_fauna', name: 'Deep Fauna', desc: 'Slay all five Deep-Fauna strains.', hidden: true, reward: 90,
    test: (c) => DEEP_FAUNA_KINDS.every((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1),
    progress: (c) => ({ cur: DEEP_FAUNA_KINDS.filter((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1).length, max: DEEP_FAUNA_KINDS.length }) },

  // ── Deep-band ladder (BALANCE_REPORT unlock-cadence gap: the 150–400h band had almost no
  //    authored beats — every unlock below is a mid/late-game milestone with a progress bar,
  //    spacing the acquisition cadence across the long arc instead of ending at the tutorial
  //    scales above). Generated ladders keep the set data-driven: one rung per threshold. ──
  ...([15, 30, 50, 75, 100, 150] as const).map((n, i): AchievementDef => ({
    id: `stage${n}`, name: ['Descender', 'Deep Descender', 'Abyssal Pioneer', 'Void Cartographer', 'Centurial Descent', 'The Long Dark'][i],
    desc: `Clear Campaign Stage ${n}.`, reward: 25 + i * 15,
    test: (c) => highestCampaignStage(c.save) >= n,
    progress: (c) => ({ cur: highestCampaignStage(c.save), max: n }),
  })),
  ...([25, 50, 75, 100, 140] as const).map((n, i): AchievementDef => ({
    id: `wave${n}`, name: ['Survivor', 'Depth Runner', 'Abyss Swimmer', 'Century Survivor', 'Beyond the Charts'][i],
    desc: `Reach Infinite Depth ${n}.`, reward: 25 + i * 15,
    test: (c) => c.save.bestWave >= n,
    progress: (c) => ({ cur: c.save.bestWave, max: n }),
  })),
  ...([1, 5, 10, 20, 35] as const).map((n, i): AchievementDef => ({
    id: `molt${n}`, name: ['First Molt', 'Serial Shedder', 'Ascendant Cycle', 'Perpetual Rebirth', 'The Eternal Return'][i],
    desc: `Molt ${n === 1 ? 'for the first time' : `${n} times`}.`, reward: 30 + i * 15,
    test: (c) => (c.save.prestige?.molts ?? 0) >= n,
    progress: (c) => ({ cur: c.save.prestige?.molts ?? 0, max: n }),
  })),
  ...([5, 7, 9] as const).map((n, i): AchievementDef => ({
    id: `star${n}`, name: ['Constellation', 'Stellar Forge', 'Supernova'][i],
    desc: `Bring a tower to ${n} stars.`, reward: 40 + i * 20,
    test: (c) => maxStars(c.save) >= n,
    progress: (c) => ({ cur: maxStars(c.save), max: n }),
  })),
  ...([1, 12, 30] as const).map((n, i): AchievementDef => ({
    id: `adapt${n}`, name: ['First Rewrite', 'Divergent Strain', 'Total Speciation'][i],
    desc: `Commit ${n === 1 ? 'an Adaptation' : `${n} Adaptations`} across your strains.`, reward: 30 + i * 20,
    test: (c) => Object.values(c.save.adaptation ?? {}).reduce((a, p) => a + p.length, 0) >= n,
    progress: (c) => ({ cur: Object.values(c.save.adaptation ?? {}).reduce((a, p) => a + p.length, 0), max: n }),
  })),
  ...([10_000, 100_000] as const).map((n, i): AchievementDef => ({
    id: `kills${n}`, name: ['Purge Protocol', 'Extinction Event'][i],
    desc: `Kill ${n.toLocaleString('en-US')} enemies (lifetime).`, reward: 75 + i * 50,
    test: (c) => c.save.stats.lifetimeKills >= n,
    progress: (c) => ({ cur: c.save.stats.lifetimeKills, max: n }),
  })),

  // ── Mega Bosses + Weak Points (docs/MEGA-BOSS.md §achievements). All read the megaProgress
  //    ledger; the roster/kind goals are REGISTRY-driven so future content raises them itself. ──
  { id: 'mega_first', name: 'Leviathan Slayer', desc: 'Fell your first Mega Boss.', reward: 75, test: (c) => c.save.megaProgress.kills >= 1 },
  { id: 'mega_perfect', name: 'Untouchable', desc: 'Fell a Mega Boss without losing a point of Integrity.', reward: 100, test: (c) => c.save.megaProgress.perfect.length >= 1 },
  { id: 'mega_speed', name: 'Swift Execution', desc: 'Fell a Mega Boss faster than expected of your Power.', reward: 100, test: (c) => c.save.megaProgress.speed.length >= 1 },
  { id: 'mega_all', name: 'Apex Extinction', desc: 'Fell every known Mega Boss.', reward: 150, test: (c) => megaBossRegistry.active().every((d) => c.save.megaProgress.slain.includes(d.id)), progress: (c) => ({ cur: c.save.megaProgress.slain.length, max: megaBossRegistry.active().length }) },
  { id: 'mega_10', name: 'Leviathan Hunter', desc: 'Fell 10 Mega Bosses (lifetime).', reward: 120, test: (c) => c.save.megaProgress.kills >= 10, progress: (c) => ({ cur: c.save.megaProgress.kills, max: 10 }) },
  { id: 'wp_first', name: 'Surgical Strike', desc: 'Destroy your first Weak Point.', reward: 20, test: (c) => c.save.megaProgress.weakPoints >= 1 },
  { id: 'wp_100', name: 'Vivisectionist', desc: 'Destroy 100 Weak Points (lifetime).', reward: 80, test: (c) => c.save.megaProgress.weakPoints >= 100, progress: (c) => ({ cur: c.save.megaProgress.weakPoints, max: 100 }) },
  { id: 'wp_all_kinds', name: 'Complete Anatomy', desc: 'Destroy every kind of Weak Point.', reward: 100, test: (c) => Object.keys(WEAK_POINT_DEFS).every((k) => c.save.megaProgress.wpKinds.includes(k)), progress: (c) => ({ cur: c.save.megaProgress.wpKinds.length, max: Object.keys(WEAK_POINT_DEFS).length }) },
  { id: 'interrupt_50', name: 'Silence the Chorus', desc: 'Interrupt 50 Mega Boss abilities (lifetime).', reward: 90, test: (c) => c.save.megaProgress.interrupts >= 50, progress: (c) => ({ cur: c.save.megaProgress.interrupts, max: 50 }) },
  { id: 'mega_attrition', name: 'War of Attrition', desc: 'Outlast a Mega Boss in a battle of ten minutes or more.', hidden: true, reward: 90, test: (c) => Object.values(c.save.megaProgress.fastestSec).some((s) => s >= 600) },
  { id: 'mega_survivor', name: 'Weathered the Storm', desc: 'Survive 100 Mega Boss abilities (lifetime).', reward: 60, test: (c) => c.save.megaProgress.abilitiesSurvived >= 100, progress: (c) => ({ cur: c.save.megaProgress.abilitiesSurvived, max: 100 }) },

  // ── Deep-Strain roster (docs/SIPHON.md · HEROES.md) — the recent beam towers, the gated heroes,
  //    and the "collect it all" goals raised past the new content. All read lifetime usage/ownership
  //    (towerUsage / heroUsage / towerUnlocked / uniqueCards), so a fresh save unlocks none. ──
  { id: 'deploy_coil', name: 'Resonance Cascade', desc: 'Deploy the Resonance Coil in a run.', reward: 30, test: (c) => towerUse(c.save, 'coil') >= 1 },
  { id: 'deploy_siphon', name: 'Exsanguination', desc: 'Deploy the Marrow Siphon in a run.', reward: 30, test: (c) => towerUse(c.save, 'siphon') >= 1 },
  { id: 'beam_arsenal', name: 'Directed Energy', desc: 'Deploy BOTH beam towers — the Resonance Coil and the Marrow Siphon.', reward: 50, test: (c) => towerUse(c.save, 'coil') >= 1 && towerUse(c.save, 'siphon') >= 1, progress: (c) => ({ cur: (towerUse(c.save, 'coil') >= 1 ? 1 : 0) + (towerUse(c.save, 'siphon') >= 1 ? 1 : 0), max: 2 }) },
  { id: 'beam_veteran', name: 'Focused Fire', desc: 'Deploy a beam tower 25 times (the Coil or Siphon Veteran tier).', reward: 55, test: (c) => towerUse(c.save, 'coil') >= 25 || towerUse(c.save, 'siphon') >= 25, progress: (c) => ({ cur: Math.max(towerUse(c.save, 'coil'), towerUse(c.save, 'siphon')), max: 25 }) },
  { id: 'field_vitriol', name: 'Scorched Earth', desc: 'Field Vitriol, the siege caste, in a run.', reward: 30, test: (c) => heroUse(c.save, 'vitriol') >= 1 },
  { id: 'field_revenant', name: 'The Wraith Walks', desc: 'Field the Revenant — the phase-stalking assassin.', reward: 40, test: (c) => heroUse(c.save, 'revenant') >= 1 },
  { id: 'full_menagerie', name: 'Full Menagerie', desc: 'Field every hero at least once (lifetime).', reward: 75, test: (c) => heroesFielded(c.save) >= HERO_ORDER.length, progress: (c) => ({ cur: heroesFielded(c.save), max: HERO_ORDER.length }) },
  { id: 'complete_arsenal', name: 'Complete Arsenal', desc: 'Unlock every tower — the launch five, the expansion three, and both beam towers.', reward: 80, test: (c) => towersOwned(c.save) >= TOWER_ORDER.length, progress: (c) => ({ cur: towersOwned(c.save), max: TOWER_ORDER.length }) },
  { id: 'deep_genome', name: 'Deep Genome', desc: 'Collect 25 distinct Gene Cards (the Deep-Strain set and beyond).', reward: 60, test: (c) => c.save.stats.uniqueCards.length >= 25, progress: (c) => ({ cur: c.save.stats.uniqueCards.length, max: 25 }) },
  { id: 'return_from_deep', name: 'Return from the Deep', desc: 'Reach Infinite Depth 40 — the abyss that awakens the Revenant.', reward: 45, test: (c) => c.save.bestWave >= 40, progress: (c) => ({ cur: c.save.bestWave, max: 40 }) },
];

/** Achievements whose condition is now met but which aren't yet unlocked. */
export function checkAchievements(ctx: AchievementCtx): AchievementDef[] {
  const have = new Set(ctx.save.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(ctx));
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Total Genome Cores a set of newly-unlocked achievements grants. */
export function rewardFor(defs: AchievementDef[]): number {
  return defs.reduce((sum, a) => sum + (a.reward ?? 0), 0);
}
