// Procedural Campaign generator (CAMPAIGN.md). NOT hand-authored: every stage is generated
// deterministically from (stageNumber, difficulty) — same inputs ⇒ same stage, so it's
// predictable enough to balance yet endless without authoring levels. Pure: seeded Rng + smooth
// formulas, no DOM/sim. The Game runs a StageConfig through the existing scripted-wave path
// (`game.ts` 'campaign' mode); stage mode stays byte-identical (golden-safe).

import { clamp } from './math';
import { CAMPAIGN_ONBOARDING, CAMPAIGN_OPENING, CAMPAIGN_REWARDS, COVERAGE, ENEMY_DEFS, ENEMY_KINDS } from './config';
import type { EnemyDef, SpawnGroup, WaveDef } from './config';
import type { EnemyKind, TowerKind } from './types';
import { Rng } from './rng';
import { coverageGap } from './coverage';
import type { CoverageAxis } from './coverage';
import { assembleBoss, campaignBossFor, epithetFor } from './boss';
import type { BossDef } from './boss';
import { resolveDifficulty } from './difficulty';
import type { DifficultyDef } from './difficulty';
import { campaignBossStrength, composeStageDifficulty, scaleBossStrength } from './difficultyDirector';
import { BIOMES, categoryOf } from './biomes';
import type { Biome, BiomeCategory } from './biomes';
import { campaignMegaFor } from './megaboss';
import { POWER_BASE } from './power';
import { campaignEventForStage, campaignEventStamp } from './campaignEvents';
import { pickLayoutId } from './mapLayouts';
import type { CampaignEventDef, CampaignEventStamp } from './campaignEvents';

// Biomes are the shared ecosystem layer (docs/BIOMES.md), used by BOTH Campaign and Infinite
// mode. Re-exported here for the campaign test + any campaign-facing consumer.
export { BIOMES } from './biomes';

// ── Tunables (all smooth/continuous in `stage` ⇒ no spikes) ──────────────────────────────────
const C = {
  baseWaves: 6, waveIncEvery: 4, waveMax: 14, // wave count grows a step every few stages
  hpGrowth: 0.05, dmgGrowth: 0, // per-stage growth: EHP only. Leak/contact damage is a UNIT property
  // (classic TD): integrity never scales, so a leak must cost the same at stage 1 and stage 40 —
  // stage danger is expressed through hp/speed/count/elites instead (docs/DIFFICULTY.md §contract).
  // ── COMPENSATION BAND (docs/DIFFICULTY.md §curve, 2026-07 re-anchor): the early economy
  // multiplies a reinvesting account ~×25 across its first ~10 stages of income, so a flat
  // 5%/stage curve is trivial for ~55 stages (live data: 45k power vs a 1.9k stage-10 bar).
  // Stages compFromStage+1..compToStage grow at compGrowth instead — a one-time steep climb
  // that re-anchors the curve to the post-container-gate arrival medians (BALANCE_REPORT) —
  // then 5%/stage resumes from the elevated baseline (the late tail already converges).
  // recommendedPower derives from the SAME hpMult, so the bar stays honest by construction.
  compFromStage: 8, // last stage of the unchanged 5% onboarding ramp
  compToStage: 25, // last compensation-band stage (the optimized-account wall lives here)
  compGrowth: 0.2, // per-stage EHP growth inside the band (fit via the progression simulator)
  // Mega-hosting stages (every MEGA.campaignEvery-th) carry a RAID on top of their waves. The
  // premium keeps the DISPLAYED bar honest (label only — enemy stats never read it; safe error
  // direction, same principle as the biome ratchet). 2026-11 re-measure (docs/DIFFICULTY.md §curve;
  // real runs on progression-simulated 8h/60h/100h accounts): a mega stage wins exactly as often as
  // the SAME stage with its mega suppressed (9/18 vs 9/18) and as its neighbours at equal Power —
  // the old ×1.8 (a pre-raid-targeting probe) walled every 10th stage for ~a day of play with no
  // real threat behind it. ×1.15 keeps an authored spike for the finale's longer hold + Hive lash.
  megaStagePremium: 1.15,
  speedGrowth: 0.012, speedCap: 1.6, // capped so fast enemies stay fair
  spawnGrowth: 0.01, spawnCap: 1.5,
  rewardGrowth: 0.05,
  eliteBase: 0.04, elitePerStage: 0.012, eliteCap: 0.45,
  mbBase: 0.1, mbPerStage: 0.03, mbCap: 0.8, mbTierFrac: 0.5, mbMinStage: 4, // mini-boss (never in the grace window — a wave-3 summoner vs an opening build is unanswerable)
  baseBudget: 34, stageBudgetGrowth: 0, budgetCap: 2.2, // wave threat budget: density is FLAT across stages (mirrors ENDLESS-SCALING) — per-enemy hp growth carries the whole curve, so recommendedPower stays an HONEST difficulty index
  threatDivisor: 28, groupMax: 16,
  regenWeight: 12, armorWeight: 6, // EHP terms: 1 regen/s ≈ 12 hp, 1 armor ≈ 6 hp of threat
  unitCapBase: 3, unitCapRamp: 22, dmgCapBase: 8, dmgCapRamp: 40, // per-wave unit gates (ramp over wave progress t)
  // ── Early-stage GRACE (docs/CAMPAIGN.md §grace): the first stages are a fresh account's first
  // minutes — the difficulty CONTRACT (docs/DIFFICULTY.md §contract) says a player AT the
  // recommended Power clears with chip damage. Wave budgets, spawn pacing, and the opening
  // economy all ramp to the full curve over the first stages instead of starting there.
  // Re-tuned 2026-11 (docs/CAMPAIGN.md §curve — the fresh-account probe): 0.3 / ×1.7 / +170 made Stages
  // 1–3 flawless for a 5-tower board (600–900 Biomass banked), so the first real test was the finale.
  graceFloor: 0.8, graceStages: 8, // stage-1 waves spend 80% of the (rebased) budget; full by stage 8
  openBudget: 11, openCreep: 0, openCap: 24, rampExp: 1.15, // wave-1 anchor: in-run economy RESETS each stage, so wave 1 is answerable by the SAME 220-Biomass opening build at EVERY stage (creep 0 — probes showed any wave-1 growth = systematic chip at all power levels); the stage's difficulty lives in the ramp + hp scaling
  gracePaceStages: 5, gracePaceMax: 0.15, // stage-1 spawns are 15% slower; normal by stage 5
  startAidBase: 50, startAidFade: 5, // +50 opening Biomass at stage 1 (the free gift + 2 deploys still open), fading by stage 6
  baseHp: 20, hpPerTier: 72, // enemy unlock-stage gating (tougher enemies arrive later)
  signatureBoost: 3, // a biome's signature kinds are heavily up-weighted in their home biome
} as const;

const BOSS_VISUAL_KIND: EnemyKind = 'tyrant'; // reserved as the framework-boss render; excluded from the pool


// Biome data + `categoryOf` now live in the shared biome framework (biomes.ts), consumed by
// BOTH Campaign (here) and Infinite mode. Campaign picks the biome by rotation order and reads
// its mechanical modifiers (roster bias / signatures / elite / boss flavour) during generation.

function unlockStage(e: EnemyDef): number {
  const hpTier = clamp(1 + Math.floor((effectiveHp(e) - C.baseHp) / C.hpPerTier), 1, 80);
  // MECHANICS gate (docs/CAMPAIGN.md §grace): special roles are learning cliffs, so they enter
  // the campaign staggered — a stage-3 player should not face artillery + shields + summoners
  // at once just because those kinds have low HP. Derived from the def's traits (no authoring).
  let mech = 1;
  if (e.behavior.flying) mech = Math.max(mech, 3);
  if (e.explodeDamage) mech = Math.max(mech, 3);
  if (e.regenPerSec) mech = Math.max(mech, 4);
  if (e.shieldHp) mech = Math.max(mech, 5);
  if (e.behavior.burrowing) mech = Math.max(mech, 6);
  if (e.siege) mech = Math.max(mech, 7);
  if (e.auraRegenPerSec || e.auraShield) mech = Math.max(mech, 8);
  if (e.summon) mech = Math.max(mech, 9);
  return Math.max(hpTier, mech);
}
function spacingFor(cat: BiomeCategory): number {
  return cat === 'swarm' ? 0.5 : cat === 'fast' ? 0.45 : cat === 'heavy' ? 1.3 : 0.9;
}

// ── Combined scaling ──────────────────────────────────────────────────────────────────────────
export interface StageScaling { hpMult: number; damageMult: number; spawnMult: number; rewardMult: number; speedMult: number }

/** Piecewise-geometric EHP curve (docs/DIFFICULTY.md §curve): 5%/stage through compFromStage,
 *  compGrowth/stage across the compensation band, then 5%/stage again from the elevated
 *  baseline. Strictly monotonic; each segment is smooth geometric growth. */
function hpMultFor(stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  const a = Math.min(s, C.compFromStage) - 1; // onboarding steps (5%)
  const b = Math.max(0, Math.min(s, C.compToStage) - C.compFromStage); // compensation steps
  const c = Math.max(0, s - C.compToStage); // deep steps (5% resumes)
  return Math.pow(1 + C.hpGrowth, a + c) * Math.pow(1 + C.compGrowth, b);
}

function stageScaling(stage: number): StageScaling {
  const s = stage - 1;
  return {
    hpMult: hpMultFor(stage),
    damageMult: Math.pow(1 + C.dmgGrowth, s),
    spawnMult: Math.min(C.spawnCap, 1 + C.spawnGrowth * s),
    rewardMult: 1 + C.rewardGrowth * s,
    speedMult: Math.min(C.speedCap, 1 + C.speedGrowth * s),
  };
}

/** Fold the per-stage scalars onto the chosen difficulty VARIANT → the DifficultyDef the Game
 *  runs. The composition itself is Difficulty Director policy (docs/DIFFICULTY_DIRECTOR.md). */
function combineDifficulty(base: DifficultyDef, sc: StageScaling): DifficultyDef {
  return composeStageDifficulty(base, sc);
}

// ── The generated stage ─────────────────────────────────────────────────────────────────────
export interface StageConfig {
  stage: number;
  difficulty: string;
  biome: Biome; // the full ecosystem; its mechanical modifiers are read by the Game at the spawn/tower/hero/hazard hooks
  modifierName: string;
  hazardName: string;
  hazardDesc: string;
  waveCount: number;
  waves: WaveDef[];
  enemyPool: EnemyKind[];
  eliteFrequency: number;
  miniBoss: BossDef | null;
  miniBossWave: number;
  /** OPTIONAL per-wave boss overrides (docs/DAILY-RUN.md §bosses): the Game spawns the boss mapped
   *  to a wave index when that wave starts. Campaign leaves this undefined (boss+miniBoss suffice);
   *  the Daily Run uses it for its mid-boss roster. Undefined/empty ⇒ no extra spawns (golden-safe). */
  bossWaves?: Record<number, BossDef>;
  /** Early-stage opening-economy aid (docs/CAMPAIGN.md §grace) — extra starting Biomass. */
  startBiomassBonus: number;
  boss: BossDef;
  scaling: DifficultyDef; // combined variant×stage → Game's `this.diff`
  enemySpeedMult: number;
  rewardMult: number; // end-of-run shard/loot multiplier (currency + loot quality)
  /** The arena layout id (docs/MAP-LAYOUTS.md) — the battlefield's obstacle geometry. Optional:
   *  a hand-built StageConfig without one plays the classic arena. */
  layout?: string;
  /** OPTIONAL authored campaign event (docs/CAMPAIGN-EVENTS.md) — an Elite Rush / Boss Gauntlet /
   *  Genome Cache / Mutation choice this stage carries. Undefined on most stages (and always on the
   *  golden/stage path). Its mechanical levers are already folded into the fields above; this stamp
   *  carries what the renderer / payout / mission-card choice still need. */
  event?: CampaignEventStamp;
}

// hashStr lives in core/hash.ts (shared with the Pages Functions backend) and is
// re-exported here so sibling generators (daily.ts) keep their original import path.
export { hashStr } from './hash';
import { hashStr } from './hash';

/** Deterministic seed from (stage, difficulty) — same inputs ⇒ the same stage forever. */
export function stageSeed(stage: number, difficultyId: string): number {
  return (Math.imul(stage >>> 0, 2654435761) ^ hashStr(difficultyId)) >>> 0;
}

/** A stage's total wave count (the same formula generateStage authors). Exported so the
 *  attempt-consolation payout can scale by depth survived without regenerating the stage. */
export function stageWaveCount(stage: number): number {
  const st = Math.max(1, stage);
  return Math.min(C.waveMax, C.baseWaves + Math.floor((st - 1) / C.waveIncEvery));
}

function weightedPick(rng: Rng, pool: EnemyKind[], weights: number[]): EnemyKind {
  let total = 0;
  for (const w of weights) total += w;
  let u = rng.next() * total;
  for (let i = 0; i < pool.length; i++) { u -= weights[i]; if (u < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** EFFECTIVE HP: raw hp + what regen/armor/shields deny in practice. Regen is brutal against
 *  the low DPS of an opening build; armor subtracts per hit — both must eat wave budget, or a
 *  "cost 5" knitter walls like a "cost 17" tank (the stage-5 wipe bug this model fixed). */
export function effectiveHp(def: EnemyDef): number {
  return def.hp + C.regenWeight * (def.regenPerSec ?? 0) + C.armorWeight * (def.armor ?? 0) + (def.shieldHp ?? 0);
}

/** Speed-aware threat cost: EHP × √(speed/60) — a 150-speed darter grants half the reaction
 *  time of a 60-speed walker, so it eats more of the wave's budget. Budget units ≈ "chaff". */
function threatCost(def: EnemyDef): number {
  return Math.max(1, Math.round((effectiveHp(def) / C.threatDivisor) * Math.sqrt(Math.max(20, def.speed) / 60)));
}

/** Spend a threat budget on weighted picks from the pool → an ordered WaveDef.
 *  `pace` (≥1) stretches spacing + inter-group gaps — the early-stage breathing room. */
function composeWave(rng: Rng, budget: number, pool: EnemyKind[], weights: number[], eliteFreq: number, pace = 1): WaveDef {
  const groups: SpawnGroup[] = [];
  let remaining = budget;
  let delay = rng.range(0.4, 0.7);
  let guard = 0;
  while (remaining > 0 && guard++ < 10) {
    const kind = weightedPick(rng, pool, weights);
    const def = ENEMY_DEFS[kind];
    const cost = threatCost(def);
    // Counts are INTEGERS (rng.range is a float — flooring also fixes fractional group sizes
    // that previously leaked into spawn math).
    let count = clamp(Math.min(C.groupMax, Math.floor(remaining / cost), Math.floor(rng.range(3, 9))), 1, C.groupMax);
    remaining -= count * cost;
    // Elites are FEWER-BUT-STRONGER: an elite group halves its count, and exploders never
    // roll elite at all — a full squad of elite suicide bombers was a one-hit run ender.
    const elite = !def.explodeDamage && rng.chance(eliteFreq);
    if (elite) count = Math.max(1, Math.ceil(count / 2));
    groups.push({ kind, count, spacing: spacingFor(categoryOf(def)) * pace, delay, elite: elite || undefined });
    delay += rng.range(1.6, 3.2) * pace;
  }
  if (groups.length === 0) groups.push({ kind: pool[0], count: 6, spacing: 0.6 * pace, delay: 0.5 });
  return groups;
}

/** LIVE COMPOSITION (docs/DIFFICULTY_DIRECTOR.md §6a v3): promote round(share × eligible) of a wave's
 *  groups to ELITE with the campaign's own fewer-but-stronger rule (count halved, rounded up). Eligible
 *  = not already elite and not an exploder (a squad of elite bombers is an instant wipe — composeWave's
 *  rule). Deterministic — the largest groups first, ties in spawn order — and a COPY: the stage's plan
 *  is never mutated, so the prep preview and the launch read the same transform. share ≤ 0 ⇒ `wave`. */
export function promoteEliteShare(wave: WaveDef, share: number): WaveDef {
  if (!(share > 0)) return wave;
  const eligible: number[] = [];
  for (let i = 0; i < wave.length; i++) if (!wave[i].elite && !ENEMY_DEFS[wave[i].kind].explodeDamage) eligible.push(i);
  const n = Math.round(share * eligible.length);
  if (n <= 0) return wave;
  eligible.sort((a, b) => wave[b].count - wave[a].count || a - b);
  const pick = new Set(eligible.slice(0, n));
  return wave.map((g, i) => (pick.has(i) ? { ...g, elite: true, count: Math.max(1, Math.ceil(g.count / 2)) } : g));
}

/** LIVE PROBE roles (§6a v3 → v4 coverage gap) — threat by COMPOSITION: what the Hive sends to test a
 *  runaway board. Both sides are DATA: a role is a predicate over the enemy def plus the coverage AXIS
 *  (coverage.ts) that answers it. The board's GAP on that axis (how far its Strain-weighted coverage sits
 *  below the roster's mean) grades the role; the largest gap with kinds in the stage's pool wins, ties
 *  in table order. Never a per-enemy
 *  list: a new enemy joins by its traits, a new tower by its numbers. */
export const LIVE_PROBE_ROLES: readonly { id: string; label: string; is: (e: EnemyDef) => boolean; axis: CoverageAxis }[] = [
  { id: 'air-pack', label: 'Air pack', is: (e) => e.behavior.flying === true, axis: 'area' }, // fliers skip the maze — packs need area
  { id: 'artillery', label: 'Artillery', is: (e) => e.siege !== undefined, axis: 'reach' }, // bombards from standoff range
  { id: 'burrower', label: 'Burrowers', is: (e) => e.behavior.burrowing === true, axis: 'reach' }, // the straight line under the maze
  { id: 'armored', label: 'Armored', is: (e) => e.armor >= COVERAGE.armoredFrom, axis: 'pierce' },
  { id: 'sprinter', label: 'Sprinters', is: (e) => e.speed >= COVERAGE.fastFrom, axis: 'control' },
  { id: 'sustain', label: 'Sustain', is: (e) => (e.shieldHp ?? 0) > 0 || (e.regenPerSec ?? 0) > 0, axis: 'burst' }, // a shield / regen on the BODY outlasts chip hits
];

/** A board's live probe: the enemy kind, its role, the axis that answers it and the board's gap there. */
export interface LiveProbe { kind: EnemyKind; role: string; label: string; axis: CoverageAxis; gap: number }

/** The probe for a board: the LIVE_PROBE_ROLES role with the largest coverage gap whose kinds are in
 *  `pool` (ties in table order), and of that role the LIGHTEST body (lowest effective HP — the probe
 *  threatens by its role, not its bulk, so it adds chip damage without lengthening the wave). Exploders
 *  never probe. null ⇒ the pool fields no probe role. */
export function liveProbe(pool: readonly EnemyKind[], towers: readonly { kind: TowerKind; strain: number }[]): LiveProbe | null {
  let best: LiveProbe | null = null;
  for (const role of LIVE_PROBE_ROLES) {
    const gap = coverageGap(towers, role.axis);
    if (best !== null && !(gap > best.gap)) continue;
    let kind: EnemyKind | null = null;
    for (const k of pool) {
      const d = ENEMY_DEFS[k];
      if (!role.is(d) || d.explodeDamage) continue;
      if (kind === null || effectiveHp(d) < effectiveHp(ENEMY_DEFS[kind])) kind = k;
    }
    if (kind !== null) best = { kind, role: role.id, label: role.label, axis: role.axis, gap };
  }
  return best;
}

/** Swap a share of a wave's PLAIN groups (not elite, not an exploder, not already the probe) for the
 *  probe kind at the SAME threat budget (count × cost ratio, ≥ 1), keeping each group's delay; largest
 *  groups first, ties in spawn order. A COPY — share ≤ 0 or no probe ⇒ `wave`.
 *  byGroups (v3): round(share × eligible) whole groups — a 1-group wave never probes below share 0.5.
 *  byBudget (v4): share × the plain THREAT BUDGET, in units — the largest group gives up what it can and
 *  the probe rides beside what is left of it, so every live wave carries a probe in proportion. */
export function swapInProbe(wave: WaveDef, probe: EnemyKind | null, share: number, byBudget = false): WaveDef {
  if (probe === null || !(share > 0)) return wave;
  const eligible: number[] = [];
  for (let i = 0; i < wave.length; i++) {
    const g = wave[i];
    if (!g.elite && g.kind !== probe && !ENEMY_DEFS[g.kind].explodeDamage) eligible.push(i);
  }
  const pd = ENEMY_DEFS[probe];
  const pc = threatCost(pd);
  const probeGroup = (units: number, cost: number, delay: number): SpawnGroup =>
    ({ kind: probe, count: Math.max(1, Math.round((units * cost) / pc)), spacing: spacingFor(categoryOf(pd)), delay });
  if (!byBudget) {
    const n = Math.round(share * eligible.length);
    if (n <= 0) return wave;
    eligible.sort((a, b) => wave[b].count - wave[a].count || a - b);
    const pick = new Set(eligible.slice(0, n));
    return wave.map((g, i) => (pick.has(i) ? probeGroup(g.count, threatCost(ENEMY_DEFS[g.kind]), g.delay) : g));
  }
  const cost = (i: number): number => threatCost(ENEMY_DEFS[wave[i].kind]);
  let left = 0;
  for (const i of eligible) left += wave[i].count * cost(i);
  left *= share;
  eligible.sort((a, b) => wave[b].count * cost(b) - wave[a].count * cost(a) || a - b);
  const taken = new Map<number, number>(); // group index → units handed to the probe
  for (const i of eligible) {
    const take = Math.min(wave[i].count, Math.round(left / cost(i)));
    if (take <= 0) break;
    taken.set(i, take);
    left -= take * cost(i);
  }
  if (taken.size === 0) return wave;
  const out: WaveDef = [];
  for (let i = 0; i < wave.length; i++) {
    const g = wave[i];
    const take = taken.get(i) ?? 0;
    if (take < g.count) out.push(take > 0 ? { ...g, count: g.count - take } : g);
    if (take > 0) out.push(probeGroup(take, cost(i), g.delay));
  }
  return out;
}

/** Trim a composed wave's AIRBORNE groups to at most `cap` units in total (in spawn order), dropping
 *  emptied groups. Pure post-pass — no rng — so the stage's stream is unchanged by the trim. */
function trimFlying(wave: WaveDef, cap: number): WaveDef {
  let left = cap;
  const out: WaveDef = [];
  for (const g of wave) {
    if (!ENEMY_DEFS[g.kind].behavior.flying) { out.push(g); continue; }
    const count = Math.min(g.count, left);
    left -= count;
    if (count > 0) out.push(count === g.count ? g : { ...g, count });
  }
  return out.length > 0 ? out : wave;
}

/** Early-stage budget grace: stage 1 spends `graceFloor` of the base budget, ramping to the
 *  full curve by `graceStages` (linear). ×1 from there — the long curve is untouched. */
function budgetGrace(stage: number): number {
  if (stage >= C.graceStages) return 1;
  return C.graceFloor + (1 - C.graceFloor) * ((stage - 1) / (C.graceStages - 1));
}

/** Early-stage pacing stretch (≥1): stage 1 spawns are `1+gracePaceMax`× slower, normal by
 *  `gracePaceStages`. */
function paceGrace(stage: number): number {
  if (stage >= C.gracePaceStages) return 1;
  return 1 + C.gracePaceMax * (1 - (stage - 1) / (C.gracePaceStages - 1));
}

/** Opening-economy aid for the first stages: bonus starting Biomass so the answer to the
 *  opening wave is buildable (the Power multiplier can't help a player who can only afford
 *  one tower). Fades to 0 by `startAidFade` stages in. */
export function stageStartAid(stage: number): number {
  return Math.max(0, Math.round(C.startAidBase * (1 - (stage - 1) / C.startAidFade)));
}

/** The wave-composition core shared by Campaign (`generateStage`) and the Daily Run (daily.ts):
 *  spend per-wave threat budgets over a stage-gated, biome-biased roster into ordered WaveDefs.
 *  Extracted verbatim from generateStage (same rng sequence + math ⇒ campaign generation unchanged)
 *  so daily waves feel authored, not parallel. `waveCount` is an OVERRIDE — campaign passes
 *  stageWaveCount(st); daily passes DAILY.waveCount (20). Pure + deterministic in `rng`. */
export interface StagePlan { waves: WaveDef[]; enemyPool: EnemyKind[]; eliteFrequency: number }
/** Opening-wave safety rules (CAMPAIGN_OPENING): per-wave airborne unit caps. Campaign passes them;
 *  the Daily (and any caller that omits them) composes exactly as before. */
export interface OpeningRules { flyingUnitCap: readonly number[] }
export function composeStagePlan(rng: Rng, st: number, biome: Biome, base: DifficultyDef, waveCount: number, opening?: OpeningRules): StagePlan {
  // Roster: stage-gated, biome-biased (exclude the boss-visual kind).
  const pool = (ENEMY_KINDS as EnemyKind[]).filter((k) => k !== BOSS_VISUAL_KIND && unlockStage(ENEMY_DEFS[k]) <= st);
  if (pool.length === 0) pool.push('runner');
  // Biome bias (by category) × a heavy boost for the biome's signature kinds (BIOMES.md §2):
  // signatures dominate their home biome's roster without hard-locking it (the pool stays valid).
  const sig = new Set<EnemyKind>(biome.mods.signature);
  const weights = pool.map((k) => (biome.mods.bias[categoryOf(ENEMY_DEFS[k])] ?? 1) * (sig.has(k) ? C.signatureBoost : 1));

  // Elite frequency: the biome eliteMult is applied BEFORE the cap, so the 0.45 invariant holds.
  const eliteFrequency = clamp((C.eliteBase + C.elitePerStage * st) * biome.mods.eliteMult, 0, C.eliteCap) * base.eliteChanceMult;

  // OPENING-ANCHORED wave budgets (docs/CAMPAIGN.md §grace): the run economy resets every
  // stage, so wave 1 must always be answerable by an opening build — near-constant across
  // stages. Each stage then RAMPS to its true budget (top), which carries the stage identity
  // together with the per-enemy hp/dmg scaling that recommendedPower tracks.
  const top = C.baseBudget * Math.min(C.budgetCap, 1 + C.stageBudgetGrowth * (st - 1)) * budgetGrace(st);
  const open = Math.min(top, Math.min(C.openCap, C.openBudget + C.openCreep * (st - 1)));
  const pace = paceGrace(st);
  const waves: WaveDef[] = [];
  for (let w = 1; w <= waveCount; w++) {
    const finale = w === waveCount;
    const t = waveCount > 1 ? (w - 1) / (waveCount - 1) : 1;
    const budget = (open + (top - open) * Math.pow(t, C.rampExp)) * (finale ? 0.55 : 1); // boss carries the finale
    // Per-wave UNIT gates (the granularity ramp): early waves are fought with the opening build,
    // so they must be made of SMALL units — budget alone can't see that one 25-cost apex ≠
    // 25 mites against two towers. Unit size (threat cost) and leak punishment (damage) both
    // ramp with wave progress; wave 1 additionally excludes fast/siege kinds (still building).
    const unitCap = C.unitCapBase + Math.round(t * C.unitCapRamp);
    const dmgCap = C.dmgCapBase + Math.round(t * C.dmgCapRamp);
    // Opening airborne cap (CAMPAIGN_OPENING — campaign only): 0 keeps fliers out of the wave's
    // pool; a positive cap trims flying groups after composition (below). Undefined ⇒ no rule.
    const flyCap = opening?.flyingUnitCap[w - 1];
    const idx = pool.map((_, i) => i).filter((i) => {
      const d = ENEMY_DEFS[pool[i]];
      if (threatCost(d) > unitCap || d.damage > dmgCap) return false;
      if (flyCap === 0 && d.behavior.flying) return false;
      return w > 1 || (d.speed <= 100 && !d.siege);
    });
    const wavePool = idx.length > 0 ? idx.map((i) => pool[i]) : pool;
    const waveWeights = idx.length > 0 ? idx.map((i) => weights[i]) : weights;
    // Elites ramp in with the same progress axis: a ×3-HP body in wave 1–2 meets a 2–3 tower
    // build (an auto-leak at ANY power ratio); by mid-stage the defense has the DPS to answer.
    const wave = composeWave(rng, budget, wavePool, waveWeights, eliteFrequency * Math.min(1, t / 0.35), pace);
    waves.push(flyCap !== undefined && flyCap > 0 ? trimFlying(wave, flyCap) : wave);
  }
  return { waves, enemyPool: pool, eliteFrequency };
}

/**
 * Generate a campaign stage. Pure + deterministic in (stage, difficultyId). See CAMPAIGN.md.
 */
export function generateStage(stage: number, difficultyId = 'standard'): StageConfig {
  const st = Math.max(1, Math.floor(stage));
  const rng = new Rng(stageSeed(st, difficultyId));
  const biome = biomeForStage(st); // contiguous biome regions (BIOME_REGION stages each)
  const base = resolveDifficulty(difficultyId);
  const sc = stageScaling(st);

  const waveCount = stageWaveCount(st);
  const { waves, enemyPool: pool, eliteFrequency } = composeStagePlan(rng, st, biome, base, waveCount, CAMPAIGN_OPENING);
  const miniBossChance = clamp(C.mbBase + C.mbPerStage * st, 0, C.mbCap) * base.bossFrequencyMult;

  // Mini-boss (a middle wave) + the finale boss — both via the framework boss assembler, so the
  // pool/selection/difficulty all come from boss.ts (difficulty rides the tier `tl`).
  const rngFn = (): number => rng.next();
  // Bosses carry the biome's chassis flavour (juggernaut in Frostbound, swarmlord in Verdant, …).
  const hasMiniBoss = rng.chance(miniBossChance) && waveCount >= 3 && st >= C.mbMinStage;
  const miniBoss = hasMiniBoss ? assembleBoss(rngFn, Math.max(1, st * C.mbTierFrac), biome.mods.bossChassisBias) : null;
  const miniBossWave = Math.max(2, Math.ceil(waveCount / 2));
  // Always roll the procedural finale (keeps the rng stream identical), then let an authored
  // Milestone-1 boss OVERRIDE it at its pinned stage (docs/BOSS-DESIGN §4). Non-milestone stages
  // keep the generated boss — so the campaign stays procedural everywhere else.
  const generatedBoss = assembleBoss(rngFn, st, biome.mods.bossChassisBias);
  // Onboarding stages field a reduced finale (the director's campaignBossStrength — ×1 from its
  // full stage, so every deeper/authored boss keeps its exact def).
  const strength = campaignBossStrength(st);
  const finale = campaignBossFor(st) ?? generatedBoss;
  const boss = strength < 1 ? scaleBossStrength(onboardingKit(finale), strength) : finale;

  const cfg: StageConfig = {
    stage: st,
    difficulty: difficultyId,
    biome,
    layout: layoutForStage(st),
    modifierName: biome.modifierName,
    hazardName: biome.mods.hazard.name,
    hazardDesc: biome.mods.hazard.desc,
    waveCount,
    waves,
    enemyPool: pool,
    eliteFrequency,
    miniBoss,
    miniBossWave,
    boss,
    scaling: combineDifficulty(base, sc),
    enemySpeedMult: sc.speedMult, // stage's own speed scaling; the DIFFICULTY speed axis is applied in the sim
    rewardMult: sc.rewardMult * base.rewardMult,
    startBiomassBonus: stageStartAid(st),
  };

  // Authored campaign event (docs/CAMPAIGN-EVENTS.md): sampled deterministically, folded through a
  // DEDICATED rng so the base wave/scaling stream above is untouched (a no-event stage is unchanged).
  const event = campaignEventForStage(st, difficultyId);
  if (event) applyCampaignEvent(cfg, event, new Rng((stageSeed(st, difficultyId) ^ 0x7ea51001) >>> 0));
  return cfg;
}

/** Onboarding finale kit (docs/CAMPAIGN.md §curve): every onboarding finale CHANNELS the telegraphed
 *  core-shot (the first boss lesson — burst it before the cast lands), and never fields unanswerable
 *  SUSTAIN (CAMPAIGN_ONBOARDING.sustainKinds): the first sustain slot becomes the core-shot, any
 *  other becomes a plain enrager; a kit with neither gains the core-shot in every phase. Integrity
 *  loss then grades with the board's kill speed instead of flipping a coin. The epithet is
 *  re-derived from the new kit. A copy — the input def is never mutated. */
function onboardingKit(def: BossDef): BossDef {
  const { sustainKinds, coreShot, spareSlot } = CAMPAIGN_ONBOARDING;
  let shot = def.modules.some((m) => m.kind === 'channeler');
  const modules = def.modules.map((m) => {
    if (!sustainKinds.includes(m.kind)) return m;
    if (!shot) { shot = true; return { ...coreShot }; }
    return { ...spareSlot };
  });
  let phases = def.phases;
  if (!shot) {
    modules.push({ ...coreShot });
    phases = phases.map((p) => ({ ...p, modules: [...p.modules, modules.length - 1] }));
  }
  return { ...def, modules, phases, epithet: epithetFor(def.chassis, modules) };
}

/** Fold an authored event's mechanical levers onto a finished StageConfig — writing ONLY separate
 *  event fields + the group-elite / bossWaves / startBiomass levers the sim already consumes, never
 *  the base scaling/rewardMult curve (so the smooth-progression invariants hold). `rng` is dedicated. */
function applyCampaignEvent(cfg: StageConfig, def: CampaignEventDef, rng: Rng): void {
  if (def.kind === 'eliteRush') {
    // Force-promote composed groups (the REAL in-sim lever — elites are baked into group flags) with
    // the standard fewer-but-stronger tradeoff; exploders never roll elite (a squad of elite bombers
    // is an instant wipe — the same rule composeWave enforces).
    const promote = def.elitePromote ?? 0.5;
    for (const wave of cfg.waves) {
      for (const g of wave) {
        if (g.elite || ENEMY_DEFS[g.kind].explodeDamage) continue;
        if (rng.chance(promote)) { g.elite = true; g.count = Math.max(1, Math.ceil(g.count / 2)); }
      }
    }
    if (def.eliteMult) cfg.eliteFrequency = clamp(cfg.eliteFrequency * def.eliteMult, 0, C.eliteCap);
  } else if (def.kind === 'gauntlet' && def.gauntletBosses) {
    // Extra mid-stage bosses via the existing per-wave boss lever (StageConfig.bossWaves, from Daily).
    const n = def.gauntletBosses;
    const tierFrac = def.gauntletTierFrac ?? 0.45;
    const rngFn = (): number => rng.next();
    const bossWaves: Record<number, BossDef> = { ...(cfg.bossWaves ?? {}) };
    for (let i = 1; i <= n; i++) {
      const wave = Math.max(2, Math.round((cfg.waveCount * i) / (n + 1)));
      if (wave >= cfg.waveCount || bossWaves[wave]) continue; // leave the finale to the stage boss
      bossWaves[wave] = assembleBoss(rngFn, Math.max(1, cfg.stage * tierFrac), cfg.biome.mods.bossChassisBias);
    }
    cfg.bossWaves = bossWaves;
  } else if (def.kind === 'cache' && def.startBiomassBonus) {
    // A fat opening economy (the reward × rides the stamp, folded at payout by App — not the base curve).
    cfg.startBiomassBonus += def.startBiomassBonus;
  }
  // mutation: purely a player CHOICE resolved at launch — no wave/boss change here.
  cfg.event = campaignEventStamp(def);
}

// ── World-map read models (CAMPAIGN-MAP / docs/MODE-IDENTITY.md §3) ────────────────────────────
// Pure, LIGHT (no wave generation) + deterministic in stage number, so the living map is a windowed
// view over an unbounded procedural ladder — thousands of stages, zero authoring, no redesign.

/** Stages per biome REGION — biomes occupy contiguous bands of the map (a region, not every-other
 *  stage), so the world reads as zones you cross. Appending a biome extends the planet's depth. */
export const BIOME_REGION = 5;

/** The biome a stage belongs to. Regions cycle through BIOMES; appending a biome extends the world. */
export function biomeForStage(stage: number): Biome {
  return BIOMES[Math.floor((Math.max(1, Math.floor(stage)) - 1) / BIOME_REGION) % BIOMES.length];
}

// ── Arena layouts (docs/MAP-LAYOUTS.md §selection) ──────────────────────────────────────────────
/** Authored onboarding pins (the CAMPAIGN_BOSSES pattern): the tutorial's arena opens the Descent,
 *  then each early stage introduces ONE new routing idea. Every other stage rolls biome-flavored. */
export const CAMPAIGN_LAYOUT_PINS: Record<number, string> = { 1: 'classic', 2: 'open_maw', 3: 'twin_lanes' };
const stageLayoutMemo: string[] = []; // [stage-1] → layout id, filled forward (no-repeat reads the previous pick)
const LAYOUT_MEMO_CAP = 10_000; // the Campaign screen previews ANY typed stage — never build a billion-entry ladder

/** The arena layout a campaign stage plays — deterministic in the stage alone (every difficulty
 *  shares the battlefield), biome-native layouts weighted up, never the previous stage's layout. */
export function layoutForStage(stage: number): string {
  const st = Math.max(1, Math.floor(stage));
  if (st > LAYOUT_MEMO_CAP) {
    // Beyond any reachable depth: an O(1) roll that still dodges its neighbour's own roll.
    const roll = (s: number, exclude?: string): string => pickLayoutId(new Rng(stageSeed(s, 'layout')), s, biomeForStage(s).id, exclude);
    return roll(st, roll(st - 1));
  }
  for (let s = stageLayoutMemo.length + 1; s <= st; s++) {
    const prev = stageLayoutMemo[s - 2];
    stageLayoutMemo.push(CAMPAIGN_LAYOUT_PINS[s] ?? pickLayoutId(new Rng(stageSeed(s, 'layout')), s, biomeForStage(s).id, prev));
  }
  return stageLayoutMemo[st - 1];
}

/** Recommended account Power Score for a stage — SAME scale as meta.powerScore() (1.0 = fresh),
 *  derived from the stage's combined HP×damage scaling so "am I strong enough?" is a glance. */
export function recommendedPower(stage: number, difficultyId = 'standard'): number {
  const sc = stageScaling(Math.max(1, Math.floor(stage)));
  const base = resolveDifficulty(difficultyId);
  // The index answers "what damage multiple keeps time-to-kill stage-invariant?" — that is the
  // stage's EHP growth (hpMult; stage dmgGrowth is 0 — leaks cost the same at every depth), times
  // the VARIANT's combined hazard (√(hp×dmg) heuristic) × its power target (a harder track raises
  // the "am I strong enough?" bar). At ratio r of recommended, kill speed is r× at EVERY stage —
  // the difficulty contract (docs/DIFFICULTY.md §contract) holds by construction.
  // × the biome toughness RATCHET — the hardest region encountered so far. A harsh region
  // (Frostbound armor/hazard ≈ ×1.22) raises the bar the player sees instead of silently running
  // ~25% over its index (the stage-12 probe finding); the ratchet (not the current biome's own
  // factor) keeps the ladder strictly rising — a softer region after a harsh one reads as a
  // small power cushion, never as "this later stage needs less power" (the safe error direction).
  const seen = Math.min(Math.floor((Math.max(1, Math.floor(stage)) - 1) / BIOME_REGION) + 1, BIOMES.length);
  let biomeBar = 1;
  for (let i = 0; i < seen; i++) biomeBar = Math.max(biomeBar, BIOMES[i].mods.difficulty);
  // Mega-hosting stages read HIGHER than their waves alone (C.megaStagePremium): the raid is
  // real threat the wave budget never priced in, and the bar must not understate it.
  const megaBar = campaignMegaFor(Math.max(1, Math.floor(stage))) ? C.megaStagePremium : 1;
  return sc.hpMult * biomeBar * megaBar * Math.sqrt(sc.damageMult * base.enemyHealthMult * base.enemyDamageMult) * base.powerTargetMult;
}

/** Recommended Power on the UNIVERSAL index (docs/POWER-SCORE.md) — POWER_BASE × the damage-multiple
 *  target, so it compares directly against `meta.power().score`, the player-facing number. This is
 *  what the Campaign / Play / Infinite readiness UI shows (no more "×1.x" legacy multiples). */
export function recommendedPowerScore(stage: number, difficultyId = 'standard'): number {
  return Math.round(POWER_BASE * recommendedPower(stage, difficultyId));
}

export interface CampaignMapNode {
  stage: number;
  biome: { id: string; name: string; accent: string };
  state: 'cleared' | 'current' | 'locked';
  milestone: boolean; // a CAMPAIGN_REWARDS.milestoneEvery checkpoint (bonus reward + a map landmark)
  recommendedPower: number;
  /** OPTIONAL authored event this stage carries (docs/CAMPAIGN-EVENTS.md) — drives the map node badge. */
  event?: { id: string; kind: string; name: string; icon: string; accent: string };
}

/** A WINDOWED slice of the campaign for the map — `cleared` = highest cleared on this difficulty
 *  track; renders `count` nodes from `viewStart` (1-based). O(count), independent of total depth. */
export function campaignMapView(cleared: number, difficultyId: string, viewStart: number, count: number): CampaignMapNode[] {
  const start = Math.max(1, Math.floor(viewStart));
  const out: CampaignMapNode[] = [];
  for (let i = 0; i < count; i++) {
    const stage = start + i;
    const b = biomeForStage(stage);
    const ev = campaignEventForStage(stage, difficultyId); // authored event (or null) — a node badge
    out.push({
      stage,
      biome: { id: b.id, name: b.name, accent: b.accent },
      state: stage <= cleared ? 'cleared' : stage === cleared + 1 ? 'current' : 'locked',
      milestone: stage % CAMPAIGN_REWARDS.milestoneEvery === 0,
      recommendedPower: recommendedPower(stage, difficultyId),
      ...(ev ? { event: { id: ev.id, kind: ev.kind, name: ev.name, icon: ev.icon, accent: ev.accent } } : {}),
    });
  }
  return out;
}

// ── Account-wide gates a Campaign stage opens (docs/MODE-IDENTITY.md §campaign) ──────────
// Pure lookups over the three gate tables — the mission card shows what CLEARING the focused
// stage unlocks, and the map's milestone chips jump to the next gate of each family.

import { EVOLUTION_CAPS, HERO_SLOTS } from './config';
import { GENE_LEVEL_GATES } from './geneCards';

export interface StageUnlock { kind: 'evolution' | 'hero-slot' | 'gene-tier'; label: string }

/** Everything clearing `stage` unlocks (empty for most stages — gates are sparse). */
export function stageUnlocks(stage: number): StageUnlock[] {
  const out: StageUnlock[] = [];
  for (const e of EVOLUTION_CAPS) if (e.stage === stage) out.push({ kind: 'evolution', label: `Evolution Cap ◈${e.maxStar}` });
  for (const h of HERO_SLOTS) if (h.campaignStage === stage) out.push({ kind: 'hero-slot', label: `${h.name} (Hero Slot ${h.slot})` });
  for (const g of GENE_LEVEL_GATES) if (g.stage === stage) out.push({ kind: 'gene-tier', label: `Gene Tier L${g.level}` });
  return out;
}

/** The NEXT gate of each family past `cleared` — the map's quick-jump chips. */
export function upcomingGates(cleared: number): { stage: number; label: string; kind: StageUnlock['kind'] }[] {
  const out: { stage: number; label: string; kind: StageUnlock['kind'] }[] = [];
  const evo = EVOLUTION_CAPS.find((e) => e.stage > cleared);
  if (evo) out.push({ stage: evo.stage, label: `◈${evo.maxStar} cap`, kind: 'evolution' });
  const slot = HERO_SLOTS.find((h) => h.campaignStage > cleared);
  if (slot) out.push({ stage: slot.campaignStage, label: `Hero Slot ${slot.slot}`, kind: 'hero-slot' });
  const gene = GENE_LEVEL_GATES.filter((g) => g.stage > cleared).sort((a, b) => a.stage - b.stage)[0];
  if (gene) out.push({ stage: gene.stage, label: `Gene L${gene.level}`, kind: 'gene-tier' });
  return out.sort((a, b) => a.stage - b.stage);
}
