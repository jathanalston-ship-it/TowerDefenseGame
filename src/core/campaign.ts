// Procedural Campaign generator (CAMPAIGN.md). NOT hand-authored: every stage is generated
// deterministically from (stageNumber, difficulty) — same inputs ⇒ same stage, so it's
// predictable enough to balance yet endless without authoring levels. Pure: seeded Rng + smooth
// formulas, no DOM/sim. The Game runs a StageConfig through the existing scripted-wave path
// (`game.ts` 'campaign' mode); stage mode stays byte-identical (golden-safe).

import { clamp } from './math';
import { CAMPAIGN_REWARDS, ENEMY_DEFS, ENEMY_KINDS } from './config';
import type { EnemyDef, SpawnGroup, WaveDef } from './config';
import type { EnemyKind } from './types';
import { Rng } from './rng';
import { assembleBoss, campaignBossFor } from './boss';
import type { BossDef } from './boss';
import { resolveDifficulty } from './difficulty';
import type { DifficultyDef } from './difficulty';
import { composeStageDifficulty } from './difficultyDirector';
import { BIOMES, categoryOf } from './biomes';
import type { Biome, BiomeCategory } from './biomes';
import { POWER_BASE } from './power';
import { campaignEventForStage, campaignEventStamp } from './campaignEvents';
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
  graceFloor: 0.3, graceStages: 8, // stage-1 waves spend 30% of the (rebased) budget; full by stage 8
  openBudget: 11, openCreep: 0, openCap: 24, rampExp: 1.15, // wave-1 anchor: in-run economy RESETS each stage, so wave 1 is answerable by the SAME 220-Biomass opening build at EVERY stage (creep 0 — probes showed any wave-1 growth = systematic chip at all power levels); the stage's difficulty lives in the ramp + hp scaling
  gracePaceStages: 5, gracePaceMax: 0.7, // stage-1 spawns are 70% slower; normal by stage 5
  startAidBase: 170, startAidFade: 5, // +170 opening Biomass at stage 1 (a full 3-tower opening), fading by stage 6
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

function stageScaling(stage: number): StageScaling {
  const s = stage - 1;
  return {
    hpMult: Math.pow(1 + C.hpGrowth, s), // geometric — smooth + strictly monotonic, no spikes
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
export function composeStagePlan(rng: Rng, st: number, biome: Biome, base: DifficultyDef, waveCount: number): StagePlan {
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
    const idx = pool.map((_, i) => i).filter((i) => {
      const d = ENEMY_DEFS[pool[i]];
      if (threatCost(d) > unitCap || d.damage > dmgCap) return false;
      return w > 1 || (d.speed <= 100 && !d.siege);
    });
    const wavePool = idx.length > 0 ? idx.map((i) => pool[i]) : pool;
    const waveWeights = idx.length > 0 ? idx.map((i) => weights[i]) : weights;
    // Elites ramp in with the same progress axis: a ×3-HP body in wave 1–2 meets a 2–3 tower
    // build (an auto-leak at ANY power ratio); by mid-stage the defense has the DPS to answer.
    waves.push(composeWave(rng, budget, wavePool, waveWeights, eliteFrequency * Math.min(1, t / 0.35), pace));
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
  const { waves, enemyPool: pool, eliteFrequency } = composeStagePlan(rng, st, biome, base, waveCount);
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
  const boss = campaignBossFor(st) ?? generatedBoss;

  const cfg: StageConfig = {
    stage: st,
    difficulty: difficultyId,
    biome,
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
  return sc.hpMult * biomeBar * Math.sqrt(sc.damageMult * base.enemyHealthMult * base.enemyDamageMult) * base.powerTargetMult;
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
