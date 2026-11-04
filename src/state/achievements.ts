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
import { cardRegistry } from '../core/cards';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { MULLIGAN_RARITY, accountMulliganPower, isMaxLevel, isMulliganActive, mulliganRegistry } from '../core/mulligan';
import { NUCLEUS_CHAMBERS, isChamberActive } from '../core/nucleus';
import { SYMBIOTE_SLOTS, isSlotActive } from '../core/heroSymbiote';
import { WEAK_POINT_DEFS, megaBossRegistry } from '../core/megaboss';
import { ARENA } from '../core/arena';
import { DOCTRINE_RANK_MAX, doctrineRank, doctrineRegistry } from '../core/doctrines';
import type { DoctrineFamily } from '../core/doctrines';
import { highestCampaignStage } from '../save/derive';
import { THREAT_MODES } from '../core/threat';
import type { TowerKind } from '../core/types';
import type { SaveData } from '../save/saveStore';
import { romanNumeral } from '../core/genomeRank';
import { readMeter } from './income';

/** Minimal run summary (structurally a subset of RunResult — avoids a meta import). */
export interface RunSummary {
  wave: number;
  kills: number;
  won: boolean;
  bossKills?: number; // framework bosses slain this run (RunStats.bossKills)
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
  /** Ladder rung (docs/PROGRESSION-SYSTEMS.md §ladders) — generated, not authored. Ladder rows
   *  stay OUT of the authored totals (gallery count, Genome Rank ratio) so an endless family
   *  can never dilute what a player already earned. */
  ladder?: { family: string; tier: number };
}

// ── ACHIEVEMENT LADDERS (docs/PROGRESSION-SYSTEMS.md §ladders) ─────────────────────────────
// The authored set front-loads recognition (18 unlocks in the first 3 hours, none after ~100h).
// Ladders keep it alive at depth: one DATA row per lifetime ledger generates a finite run of
// tiers at GEOMETRIC thresholds — a counter growing at a steady pace crosses a tier at a steady
// trickle forever (cadence ≈ 1 / (t · ln ratio)). Each family starts where the authored ladder for
// that ledger ends. Recognition + a small Core reward only (the shared achievement payout: Cores
// + Ichor bleed + Account/Season XP) — never Power. Meters are the INCOME ledger's own readings
// (state/income.ts), so a ladder tier's ETA on the goal board uses the same live income.
export interface LadderFamily {
  id: string;
  title: string; // rung name = `${title} ${roman tier}`
  meter: string; // INCOME_METERS id — the lifetime ledger the rung reads
  start: number; // tier-I threshold (in meter units)
  ratio: number; // geometric growth per tier
  tiers: number; // finite ladder (the generated set stays bounded)
  reward: number; // tier-I Genome Cores; rung n pays reward·√n
  unit: string; // player-facing unit after the number
  scale?: number; // display divisor (play-seconds → hours)
}

export const LADDER_FAMILIES: LadderFamily[] = [
  { id: 'culling', title: 'Culling Engine', meter: 'kills', start: 150_000, ratio: 1.15, tiers: 40, reward: 30, unit: 'enemies killed (lifetime)' },
  { id: 'carnage', title: 'Carnage Index', meter: 'damage', start: 5_000_000, ratio: 1.2, tiers: 40, reward: 30, unit: 'damage dealt (lifetime)' },
  { id: 'hoard', title: 'Genome Hoard', meter: 'cores', start: 100_000, ratio: 1.15, tiers: 40, reward: 30, unit: 'Genome Cores earned (lifetime)' },
  { id: 'vaults', title: 'Vault Breaker', meter: 'containers', start: 1_000, ratio: 1.15, tiers: 40, reward: 25, unit: 'Bio-Containers opened' },
  { id: 'hours', title: 'Hours in the Hive', meter: 'playSec', start: 50 * 3600, ratio: 1.15, tiers: 40, reward: 25, unit: 'hours of play', scale: 3600 },
  { id: 'molts', title: 'Eternal Molt', meter: 'molts', start: 50, ratio: 1.2, tiers: 30, reward: 50, unit: 'Molts' },
  { id: 'leviathans', title: 'Leviathan Ledger', meter: 'megaKills', start: 20, ratio: 1.3, tiers: 30, reward: 50, unit: 'Mega Bosses felled' },
  { id: 'depth', title: 'Abyssal Record', meter: 'bestWave', start: 160, ratio: 1.1, tiers: 30, reward: 40, unit: 'Infinite Depth' },
  { id: 'gauntlet', title: 'Gauntlet Depth', meter: 'rushWave', start: 15, ratio: 1.2, tiers: 30, reward: 40, unit: 'Boss Rush wave' },
  { id: 'skulls', title: 'Skull Tithe', meter: 'rushBosses', start: 500, ratio: 1.3, tiers: 30, reward: 40, unit: 'Boss Rush bosses (lifetime)' },
  { id: 'anatomy', title: 'Anatomist', meter: 'weakPoints', start: 250, ratio: 1.3, tiers: 30, reward: 30, unit: 'Weak Points destroyed' },
];

/** Two significant figures — thresholds read as round, earned numbers ("220,000", not 216,000). */
function niceNumber(v: number): number {
  if (v < 100) return Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/** Tier thresholds (1-based tier → meter value), strictly increasing. Pure. */
export function ladderThresholds(f: LadderFamily): number[] {
  const out: number[] = [];
  for (let t = 0; t < f.tiers; t++) {
    const v = niceNumber(f.start * Math.pow(f.ratio, t));
    out.push(out.length > 0 && v <= out[out.length - 1] ? out[out.length - 1] + 1 : v);
  }
  return out;
}

const fmtLadder = (f: LadderFamily, n: number): string => Math.round(n / (f.scale ?? 1)).toLocaleString('en-US');

function ladderRows(): AchievementDef[] {
  const rows: AchievementDef[] = [];
  for (const f of LADDER_FAMILIES) {
    ladderThresholds(f).forEach((need, i) => {
      const tier = i + 1;
      rows.push({
        id: `ladder_${f.id}_${tier}`,
        name: `${f.title} ${romanNumeral(tier)}`,
        desc: `Reach ${fmtLadder(f, need)} ${f.unit}.`,
        reward: Math.round(f.reward * Math.sqrt(tier)),
        ladder: { family: f.id, tier },
        test: (c) => readMeter(c.save, f.meter) >= need,
        progress: (c) => ({ cur: Math.floor(readMeter(c.save, f.meter) / (f.scale ?? 1)), max: Math.round(need / (f.scale ?? 1)) }),
      });
    });
  }
  return rows;
}

/** One line of a run's unlocked achievements as Results shows them. */
export interface AchievementLine { id: string; name: string; desc: string; reward?: number }

/** Results read (docs/PROGRESSION-SYSTEMS.md §ladders): a run that crosses several rungs of ONE
 *  ladder — a veteran's first settle after ladders shipped crosses ~17 — reads as one line per
 *  family (its top rung, "· N rungs", the summed reward) so the spotlight never parades rung by
 *  rung. Authored achievements pass through untouched, in order. Pure. */
export function collapseLadderRungs(defs: readonly AchievementDef[]): AchievementLine[] {
  const out: AchievementLine[] = [];
  const families = new Map<string, { line: AchievementLine; top: number; n: number }>();
  for (const a of defs) {
    const line: AchievementLine = { id: a.id, name: a.name, desc: a.desc, reward: a.reward };
    if (!a.ladder) { out.push(line); continue; }
    const g = families.get(a.ladder.family);
    if (!g) { families.set(a.ladder.family, { line, top: a.ladder.tier, n: 1 }); out.push(line); continue; }
    g.n++;
    g.line.reward = (g.line.reward ?? 0) + (a.reward ?? 0);
    if (a.ladder.tier > g.top) { g.top = a.ladder.tier; g.line.id = a.id; g.line.name = a.name; g.line.desc = a.desc; }
  }
  for (const g of families.values()) if (g.n > 1) g.line.name = `${g.line.name} · ${g.n} rungs`;
  return out;
}

/** The NEXT unearned rung of every ladder family (the goal board picks the nearest by ETA). */
export interface LadderGoal {
  family: string;
  name: string;
  remaining: string;
  reward: string;
  progress: number; // 0..1 across THIS rung (previous threshold → this one)
  meter: string;
  need: number; // meter units still to go
}
export function ladderGoals(save: SaveData): LadderGoal[] {
  const out: LadderGoal[] = [];
  for (const f of LADDER_FAMILIES) {
    const now = readMeter(save, f.meter);
    const th = ladderThresholds(f);
    const i = th.findIndex((need) => now < need);
    if (i < 0) continue; // the family is complete
    const prev = i > 0 ? th[i - 1] : 0;
    const left = th[i] - now;
    out.push({
      family: f.id,
      name: `${f.title} ${romanNumeral(i + 1)}`,
      remaining: `${fmtLadder(f, Math.max(f.scale ?? 1, left))} more ${f.unit.replace(/ \(lifetime\)$/, '')}`,
      reward: `Achievement · +${Math.round(f.reward * Math.sqrt(i + 1))} Genome Cores`,
      progress: Math.max(0, Math.min(1, (now - prev) / Math.max(1, th[i] - prev))),
      meter: f.meter,
      need: left,
    });
  }
  return out;
}

const maxStars = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerStars[k] ?? 0));
const maxMastery = (s: SaveData): number => Math.max(0, ...TOWER_ORDER.map((k) => s.towerMasteryXp[k] ?? 0));
/** Real doctrine ids the account has WON under (registry-checked; 'none' is no commitment). */
const doctrinesWon = (s: SaveData): string[] =>
  Object.entries(s.stats.doctrineWins).filter(([id, n]) => id !== 'none' && (n ?? 0) > 0 && doctrineRegistry.get(id)).map(([id]) => id);
/** Doctrine FAMILIES with at least one win — 'Three Schools' coverage. */
const doctrineFamiliesWon = (s: SaveData): Set<DoctrineFamily> =>
  new Set(doctrinesWon(s).map((id) => doctrineRegistry.get(id)!.family));
/** The account's highest doctrine mastery rank (0..DOCTRINE_RANK_MAX), any doctrine. */
const maxDoctrineRank = (s: SaveData): number =>
  Math.max(0, ...doctrineRegistry.ids().filter((id) => id !== 'none')
    .map((id) => doctrineRank(id, s.stats.doctrineWins[id] ?? 0, s.stats.doctrineBestWave[id] ?? 0)));
/** Best cleared Threat level across the ladder modes (docs/THREAT.md). */
const bestThreat = (s: SaveData): number => Math.max(0, ...THREAT_MODES.map((m) => s.threat?.[m] ?? 0));
const towerUse = (s: SaveData, k: TowerKind): number => s.stats.towerUsage[k] ?? 0;
const heroUse = (s: SaveData, k: string): number => s.stats.heroUsage[k] ?? 0;
const towersOwned = (s: SaveData): number => TOWER_ORDER.filter((k) => (TOWER_DEFS[k].unlockShards ?? 0) <= 0 || (s.towerUnlocked ?? []).includes(k)).length;
const heroesFielded = (s: SaveData): number => HERO_ORDER.filter((k) => heroUse(s, k) >= 1).length;
// The Deep-Fauna fusion strains — the 'deep_fauna' Bestiary achievement tracks slaying each one.
const DEEP_FAUNA_KINDS = ['zealot', 'carrier', 'entrencher', 'oracle', 'glutling'] as const;
// The Puzzle Fauna (docs/ENEMIES.md §puzzle) — six fusions that each demand ONE answer.
const PUZZLE_FAUNA_KINDS = ['scuttler', 'blightmoth', 'borer', 'shellback', 'wispmother', 'veilmoth'] as const;
// The answer roster (docs/TOWERS.md §answers) — the barracks, the seeder, the armor-breaker.
const ANSWER_TOWERS = ['warren', 'tick', 'quill'] as const;

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
  // ── Nucleus Mulligans (docs/NUCLEUS.md) — the Hive's own organism ──
  { id: 'nucleus_awake', name: 'The Heart Grows Teeth', desc: 'Awaken a Nucleus chamber (all three organs grafted).', reward: 30, test: (c) => Array.from({ length: NUCLEUS_CHAMBERS }, (_, i) => i).some((i) => isChamberActive(c.save.nucleus, i)) },
  { id: 'nucleus_adapted', name: 'Chamber Symphony', desc: 'Complete a Nucleus class adaptation (three matching organ classes in one chamber).', reward: 55, test: (c) => (c.save.nucleus?.adapted ?? []).length >= 1 },
  { id: 'nucleus_sovereign', name: 'Sovereign Organism', desc: 'Awaken all three Nucleus chambers — the Hive complete.', hidden: true, reward: 120, test: (c) => Array.from({ length: NUCLEUS_CHAMBERS }, (_, i) => i).every((i) => isChamberActive(c.save.nucleus, i)) },
  { id: 'mulligan_overlord', name: 'Biomechanical Overlord', desc: 'Reach ×1.5 account Power from Mulligan organisms.', reward: 100, test: (c) => accountMulliganPower(TOWER_ORDER.map((k) => [c.save.mulligans?.[k], TOWER_DEFS[k].combatClass] as const)) >= 1.5, progress: (c) => ({ cur: Math.round(accountMulliganPower(TOWER_ORDER.map((k) => [c.save.mulligans?.[k], TOWER_DEFS[k].combatClass] as const)) * 100), max: 150 }) },
  // ── Hero Symbiotes (docs/HERO-SYMBIOTES.md) — the champions' grafted organisms ──
  { id: 'symbiote_grafted', name: 'The First Graft', desc: 'Awaken a Symbiote slot on a champion (all three organ seats filled).', reward: 30, test: (c) => Object.values(c.save.heroSymbiotes ?? {}).some((st) => st && Array.from({ length: SYMBIOTE_SLOTS }, (_, i) => i).some((i) => isSlotActive(st, i))) },
  { id: 'symbiote_adapted', name: 'Complete Hero Adaptation', desc: 'Awaken a class adaptation (three matching organ classes in one Symbiote slot).', reward: 55, test: (c) => Object.values(c.save.heroSymbiotes ?? {}).some((st) => (st?.adapted ?? []).length >= 1) },
  { id: 'symbiote_resonant', name: 'The Body Sings', desc: 'Witness a Symbiote Resonance — all three slots grafted on one champion.', reward: 90, test: (c) => Object.values(c.save.heroSymbiotes ?? {}).some((st) => (st?.resonated ?? []).length >= 1) },
  { id: 'symbiote_apex', name: 'More Symbiote Than Champion', desc: 'Fully evolve every fielded champion class — three complete organisms in the roster.', hidden: true, reward: 130, test: (c) => Object.values(c.save.heroSymbiotes ?? {}).filter((st) => st?.evolved).length >= 3 },

  // ── Statistics-driven (integrates with the lifetime stats system) ──
  { id: 'exterminator', name: 'Exterminator', desc: 'Kill 1,000 enemies (lifetime).', reward: 60, test: (c) => c.save.stats.lifetimeKills >= 1000, progress: (c) => ({ cur: c.save.stats.lifetimeKills, max: 1000 }) },
  { id: 'biomass_baron', name: 'Biomass Baron', desc: 'Harvest 50,000 biomass (lifetime).', reward: 60, test: (c) => c.save.stats.totalBiomass >= 50000, progress: (c) => ({ cur: c.save.stats.totalBiomass, max: 50000 }) },
  // Discovery ladder (docs/CARDS.md §discovery) — counts the permanent Archive, so thresholds sit
  // ABOVE the 16 free starters (a fresh save unlocks none).
  { id: 'collector', name: 'Gene Collector', desc: 'Discover 30 Gene strands (starters included).', reward: 40, test: (c) => discovered(c.save) >= 30, progress: (c) => ({ cur: discovered(c.save), max: 30 }) },
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

  // ── Threat ladder (docs/THREAT.md — the opt-in replay axis; recognition only, never Power) ──
  ...([[3, 'Raised the Stakes'], [5, 'Into the Red'], [10, 'The Apex Horde Falls']] as const).map(([n, name], i): AchievementDef => ({
    id: `threat_${n}`, name, desc: `Clear Threat ${n} in any mode (Campaign replay, Infinite or Boss Rush).`, reward: [30, 60, 150][i],
    test: (c) => bestThreat(c.save) >= n,
    progress: (c) => ({ cur: bestThreat(c.save), max: n }),
  })),

  // ── Doctrines (docs/DOCTRINES.md — the run-commitment mastery axis) ──
  { id: 'doctrine_first', name: 'Sworn In', desc: 'Win a run under any Doctrine.', reward: 15, test: (c) => doctrinesWon(c.save).length >= 1 },
  { id: 'doctrine_breadth', name: 'Doctrinaire', desc: 'Win under five different Doctrines.', reward: 40, test: (c) => doctrinesWon(c.save).length >= 5, progress: (c) => ({ cur: doctrinesWon(c.save).length, max: 5 }) },
  { id: 'doctrine_families', name: 'Three Schools', desc: 'Win under a Build doctrine, a Protocol, and a Pact.', reward: 30, test: (c) => doctrineFamiliesWon(c.save).size >= 3, progress: (c) => ({ cur: doctrineFamiliesWon(c.save).size, max: 3 }) },
  { id: 'doctrine_exemplar', name: 'Exemplar', desc: 'Reach the Exemplar mastery rank with any Doctrine.', reward: 60, test: (c) => maxDoctrineRank(c.save) >= DOCTRINE_RANK_MAX, progress: (c) => ({ cur: maxDoctrineRank(c.save), max: DOCTRINE_RANK_MAX }) },

  // ── Champion Contracts (docs/CONTRACTS.md — the weekly constraint board) ──
  { id: 'contract_first', name: 'Under Contract', desc: 'Honour your first Champion Contract.', reward: 15, test: (c) => c.save.contracts.completed.length >= 1 },
  { id: 'contract_12', name: 'Sworn Champion', desc: 'Honour 12 Champion Contracts (lifetime).', reward: 40, test: (c) => c.save.contracts.completed.length >= 12, progress: (c) => ({ cur: c.save.contracts.completed.length, max: 12 }) },
  { id: 'perfect_week', name: 'Perfect Week', desc: 'Honour all three Champion Contracts in one week.', reward: 60, test: (c) => c.save.contracts.perfectWeeks >= 1 },

  // ── Idle Harvest (docs/IDLE-HARVEST.md) — the passive lane's beats. All read the save.idle
  //    lifetime ledger (only ever grows), so a fresh save unlocks none. The hours ladder is the
  //    long-arc axis; the bloom is the surprise beat; the tree goal rewards reinvesting cores. ──
  { id: 'idle_first', name: 'First Secretion', desc: 'Collect your first Idle Harvest.', reward: 15, test: (c) => c.save.idle.harvests >= 1 },
  ...([24, 240, 2400] as const).map((n, i): AchievementDef => ({
    id: `idle_hours${n}`, name: ['Day Distilled', 'Ten Days Below', 'Hundred Days Harvested'][i],
    desc: `Bank ${n.toLocaleString('en-US')} idle hours (lifetime).`, reward: 30 + i * 35,
    test: (c) => c.save.idle.lifetimeHours >= n,
    progress: (c) => ({ cur: Math.floor(c.save.idle.lifetimeHours), max: n }),
  })),
  { id: 'idle_brimmed', name: 'Brimming Hopper', desc: 'Return to a single harvest of 12 banked hours or more.', reward: 40, test: (c) => c.save.idle.bestHours >= 12, progress: (c) => ({ cur: Math.floor(c.save.idle.bestHours), max: 12 }) },
  { id: 'idle_bloom', name: 'The Hive Blooms', desc: 'Witness a Bloom — the Hive doubling its own harvest.', hidden: true, reward: 50, test: (c) => c.save.idle.blooms >= 1 },
  { id: 'idle_tree25', name: 'Cultivated Depths', desc: 'Grow 25 total Hive Evolution levels.', reward: 60, test: (c) => Object.values(c.save.idle.nodes).reduce((a, n) => a + n, 0) >= 25, progress: (c) => ({ cur: Object.values(c.save.idle.nodes).reduce((a, n) => a + n, 0), max: 25 }) },

  // ── Hidden (surprise milestones — concealed until earned) ──
  // Any boss: the run's own boss kills (RunStats.bossKills). Lifetime killsByEnemy.tyrant now books
  // only REAL Brood Tyrants (state/stats.ts strips the boss render proxy); the fallback keeps
  // accounts whose older tyrant tally already counted a boss.
  { id: 'apex_slayer', name: 'Apex Slayer', desc: 'Slay your first boss.', hidden: true, reward: 75, test: (c) => (c.run?.bossKills ?? 0) >= 1 || (c.save.stats.killsByEnemy.tyrant ?? 0) >= 1 },
  { id: 'annihilation', name: 'Annihilation', desc: 'Deal 1,000,000 total damage (lifetime).', hidden: true, reward: 100, test: (c) => c.save.stats.totalDamage >= 1_000_000, progress: (c) => ({ cur: c.save.stats.totalDamage, max: 1_000_000 }) },
  // Bestiary milestone (docs/COLLECTION.md): hunt every Deep-Fauna fusion strain at least once.
  { id: 'deep_fauna', name: 'Deep Fauna', desc: 'Slay all five Deep-Fauna strains.', hidden: true, reward: 90,
    test: (c) => DEEP_FAUNA_KINDS.every((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1),
    progress: (c) => ({ cur: DEEP_FAUNA_KINDS.filter((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1).length, max: DEEP_FAUNA_KINDS.length }) },
  // Bestiary milestone: crack every Puzzle Fauna strain (each demands its own answer).
  { id: 'puzzle_fauna', name: 'The Answer Key', desc: 'Slay all six Puzzle Fauna strains — every puzzle, answered.', hidden: true, reward: 90,
    test: (c) => PUZZLE_FAUNA_KINDS.every((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1),
    progress: (c) => ({ cur: PUZZLE_FAUNA_KINDS.filter((k) => (c.save.stats.killsByEnemy[k] ?? 0) >= 1).length, max: PUZZLE_FAUNA_KINDS.length }) },

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
  { id: 'field_knell', name: 'For Whom the Bell', desc: 'Field the Knell — the resonance cast from your first Molt.', reward: 40, test: (c) => heroUse(c.save, 'knell') >= 1 },
  { id: 'field_myceliarch', name: 'The Gate Holds', desc: 'Field the Myceliarch — the hive\'s immune response, rooted at the Core.', reward: 40, test: (c) => heroUse(c.save, 'myceliarch') >= 1 },
  { id: 'answer_arsenal', name: 'Every Question Answered', desc: 'Deploy all three answer organs — the Gristle Warren, the Tick Battery and the Keening Quill.', reward: 55,
    test: (c) => ANSWER_TOWERS.every((k) => towerUse(c.save, k) >= 1),
    progress: (c) => ({ cur: ANSWER_TOWERS.filter((k) => towerUse(c.save, k) >= 1).length, max: ANSWER_TOWERS.length }) },
  { id: 'full_menagerie', name: 'Full Menagerie', desc: 'Field every hero at least once (lifetime).', reward: 75, test: (c) => heroesFielded(c.save) >= HERO_ORDER.length, progress: (c) => ({ cur: heroesFielded(c.save), max: HERO_ORDER.length }) },
  { id: 'complete_arsenal', name: 'Complete Arsenal', desc: 'Unlock every tower — the launch five, the expansion three, and both beam towers.', reward: 80, test: (c) => towersOwned(c.save) >= TOWER_ORDER.length, progress: (c) => ({ cur: towersOwned(c.save), max: TOWER_ORDER.length }) },
  { id: 'deep_genome', name: 'Deep Genome', desc: 'Discover 60 Gene strands — deep into the sealed pools.', reward: 60, test: (c) => discovered(c.save) >= 60, progress: (c) => ({ cur: discovered(c.save), max: 60 }) },
  // ── Gene discovery (docs/CARDS.md §discovery) — the Bio-Container recovery chase ──
  { id: 'apex_find', name: 'Apex Strand', desc: 'Discover your first LEGENDARY gene card.', reward: 80, test: (c) => discoveredOfRarity(c.save, 'legendary') >= 1 },
  { id: 'common_set', name: 'Baseline Genome', desc: 'Discover every COMMON strand in the Archive.', reward: 60, test: (c) => discoveredOfRarity(c.save, 'common') >= rarityTotal('common'), progress: (c) => ({ cur: discoveredOfRarity(c.save, 'common'), max: rarityTotal('common') }) },
  { id: 'full_genome', name: 'The Complete Genome', desc: 'Discover EVERY strand — the Archive holds nothing more.', hidden: true, reward: 200, test: (c) => discovered(c.save) >= cardRegistry.ids().length, progress: (c) => ({ cur: discovered(c.save), max: cardRegistry.ids().length }) },
  { id: 'return_from_deep', name: 'Return from the Deep', desc: 'Reach Infinite Depth 40 — the abyss that awakens the Revenant.', reward: 45, test: (c) => c.save.bestWave >= 40, progress: (c) => ({ cur: c.save.bestWave, max: 40 }) },
  // ── Mastery Evolution Tracks (docs/MASTERY.md §evolution track) — the endless loop ──
  { id: 'evo_first_loop', name: 'The Helix Reforms', desc: 'EVOLVE a Mastery Evolution Track for the first time — complete a 100-level loop and prestige it.', reward: 60, test: (c) => Object.values(c.save.masteryEvolution ?? {}).some((st) => st.prestige >= 1) },
  { id: 'evo_five_loops', name: 'Serial Mutator', desc: 'Complete five Evolution loops across the roster.', reward: 120, test: (c) => evolutionLoops(c.save) >= 5, progress: (c) => ({ cur: Math.min(5, evolutionLoops(c.save)), max: 5 }) },
  { id: 'evo_ancestral', name: 'Ancestral Strand', desc: 'Carry one organism into its fourth loop (Prestige 4).', hidden: true, reward: 200, test: (c) => Object.values(c.save.masteryEvolution ?? {}).some((st) => st.prestige >= 3) },
  // ── The Proving Grounds (docs/ARENA.md §recognition) — rating watermarks ride `peak`
  //    (lifetime, never resets) so a seasonal soft reset can't strand a division milestone;
  //    streak/placements are live season values (a momentarily-true test latches forever). ──
  { id: 'arena_first_match', name: 'First Trial', desc: 'Settle your first Arena match — win or lose, the Grounds remember.', reward: 15, test: (c) => arenaMatches(c.save) >= 1 },
  { id: 'arena_first_win', name: 'Proven', desc: 'Take your first Arena victory.', reward: 25, test: (c) => c.save.arena.lifetimeWins >= 1 },
  { id: 'arena_placed', name: 'Placed', desc: 'Complete all five placement matches in a season.', reward: 30, test: (c) => c.save.arena.season > 0 && c.save.arena.placements === 0, progress: (c) => ({ cur: c.save.arena.season > 0 ? ARENA.placementMatches - c.save.arena.placements : 0, max: ARENA.placementMatches }) },
  { id: 'arena_streak5', name: 'Rampage', desc: 'Win five Arena matches in a row.', reward: 60, test: (c) => c.save.arena.streak >= 5, progress: (c) => ({ cur: Math.min(5, c.save.arena.streak), max: 5 }) },
  { id: 'arena_larval', name: 'Larval Ascent', desc: 'Reach the Larval division (1000 rating).', reward: 30, test: (c) => c.save.arena.peak >= 1000, progress: (c) => ({ cur: c.save.arena.peak, max: 1000 }) },
  { id: 'arena_chrysalis', name: 'Chrysalis Shell', desc: 'Reach the Chrysalis division (1800 rating) — where the decay bites.', reward: 60, test: (c) => c.save.arena.peak >= 1800, progress: (c) => ({ cur: c.save.arena.peak, max: 1800 }) },
  { id: 'arena_apex', name: 'Apex Strain', desc: 'Reach the Apex Strain division (2800 rating) — the ladder holds nothing higher.', reward: 150, test: (c) => c.save.arena.peak >= 2800, progress: (c) => ({ cur: c.save.arena.peak, max: 2800 }) },
  { id: 'arena_wins25', name: 'Arena Veteran', desc: 'Win 25 Arena matches (lifetime).', reward: 60, test: (c) => c.save.arena.lifetimeWins >= 25, progress: (c) => ({ cur: c.save.arena.lifetimeWins, max: 25 }) },
  { id: 'arena_wins100', name: 'Warlord of the Grounds', desc: 'Win 100 Arena matches (lifetime).', reward: 120, test: (c) => c.save.arena.lifetimeWins >= 100, progress: (c) => ({ cur: c.save.arena.lifetimeWins, max: 100 }) },
  { id: 'arena_crown', name: 'The Season Crown', desc: 'Claim Arena Pass level 100 — a permanently arena-exclusive strain is yours forever.', reward: 150, test: (c) => c.save.arena.exclusives.length >= 1 },
  { id: 'arena_perennial', name: 'Perennial', desc: 'Close three Arena seasons with a record on the books.', reward: 50, test: (c) => c.save.arena.history.length >= 3, progress: (c) => ({ cur: c.save.arena.history.length, max: 3 }) },
  // ── Ladders (generated — docs/PROGRESSION-SYSTEMS.md §ladders) ──
  ...ladderRows(),
];

/** The AUTHORED set (ladders excluded) — the gallery's count and the Genome Rank ratio read it. */
export const AUTHORED_ACHIEVEMENTS: AchievementDef[] = ACHIEVEMENTS.filter((a) => !a.ladder);
const AUTHORED_IDS = new Set(AUTHORED_ACHIEVEMENTS.map((a) => a.id));
/** How many of the save's earned ids are authored (non-ladder) achievements. */
export function authoredEarned(ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) if (AUTHORED_IDS.has(id)) n++;
  return n;
}

/** Total completed Evolution loops (prestiges) across every tower and hero. */
function evolutionLoops(s: SaveData): number {
  return Object.values(s.masteryEvolution ?? {}).reduce((a, st) => a + Math.max(0, st.prestige), 0);
}

/** Lifetime Arena matches settled (docs/ARENA.md — wins + losses; draws pay neither ledger). */
function arenaMatches(s: SaveData): number {
  return s.arena.lifetimeWins + s.arena.lifetimeLosses;
}

/** Strands permanently DISCOVERED (docs/CARDS.md §discovery) — the Archive count. */
function discovered(s: SaveData): number {
  return (s.genesDiscovered ?? []).length;
}
function discoveredOfRarity(s: SaveData, rarity: string): number {
  let n = 0;
  for (const id of s.genesDiscovered ?? []) if (cardRegistry.get(id)?.rarity === rarity) n++;
  return n;
}
function rarityTotal(rarity: string): number {
  return cardRegistry.active().filter((c) => c.rarity === rarity).length;
}

/** Achievements whose condition is now met but which aren't yet unlocked. */
export function checkAchievements(ctx: AchievementCtx): AchievementDef[] {
  const have = new Set(ctx.save.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(ctx));
}

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export function achievementById(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

/** Total Genome Cores a set of newly-unlocked achievements grants. */
export function rewardFor(defs: AchievementDef[]): number {
  return defs.reduce((sum, a) => sum + (a.reward ?? 0), 0);
}
