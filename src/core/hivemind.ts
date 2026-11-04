// HIVE INTELLIGENCE — the in-run best-upgrade executive (docs/HIVE-MIND.md). A PURE planner
// over a structural view of the live Game: providers enumerate every legal Biomass purchase
// with an exact-or-honest gain, context multipliers shape the ranking, and the pulse loop in
// game.ts executes winners through the SAME public APIs the player's clicks use (Power audit,
// ceremonies, stats and determinism all ride the normal path).
//
// FOUNDATION RULE (docs/HIVE-MIND.md §architecture): a future Biomass sink joins by calling
// registerHiveProvider() next to its system — the planner, ranking, pulse loop, HUD button
// and validation sim never change. Distinct from state/hiveIntel.ts (the HUB's standing
// intel FEED) — same fiction, different organ.
//
// GOLDEN SAFETY: nothing here runs unless the player presses the button (Game.hivePulse) —
// golden autoplay never does, so every golden seed is untouched by construction.

import { ENEMY_DEFS, HERO_AUTOCAST, HIVE_MIND, TOWER_DEFS } from './config';
import { branchesFor } from './branches';
import { deployCost, strainCost, type ConveyorItem } from './conveyor';
import { HERO_EVO, HERO_EVO_CATEGORIES, heroEvoCost, heroEvoEffects, heroEvoTotalOwned, type HeroEvoLevels } from './heroEvolution';
import { branchPowerEffects, effectsPower } from './power';
import { strainPowerEffects } from './strains';
import { nucleusPoint, towerSlots } from './map';
import type { Tower, TowerKind, WavePreviewEntry } from './types';
import type { CardEffect } from './cards';

/** The structural slice of Game the planner reads and the actions act through. Game satisfies
 *  it with PUBLIC members only (type-only coupling — no runtime import, no cycle). */
export interface HiveGame {
  biomass: number;
  time: number;
  towers: Tower[];
  conveyor: readonly ConveyorItem[];
  deployments: number;
  favoriteTower: TowerKind;
  unlockedKinds: ReadonlySet<TowerKind>;
  unlockedSlots: number;
  autocastUnlocked: boolean;
  heroes: { length: number };
  branchTierCost(kind: TowerKind, tier: number): number;
  heroEvoLevelsView(): Readonly<HeroEvoLevels>;
  powerEffects(): CardEffect[];
  getNextWavePreview(): WavePreviewEntry[] | null;
  buyBranchTier(towerId: number, branchId: string): 'ok' | 'locked' | 'maxed' | 'poor' | 'badTower';
  buyHeroEvolution(catId: string): boolean;
  buyAutocast(): boolean;
  deployTower(kind: TowerKind, px: number, py: number): boolean;
  deployFromConveyor(itemId: number, px: number, py: number): boolean;
  strainFromConveyor(itemId: number): 'ok' | 'noTarget' | 'poor' | 'badItem';
}

export interface HiveAction {
  id: string; // stable + unique within a plan (deterministic tie-break)
  provider: string;
  label: string; // the toast verb-phrase, e.g. "Evolved Bone Mortar → tier 3"
  detail: string; // WHY (context notes fold in here — the honest explanation)
  cost: number;
  gain: number; // strength estimate (exact power delta where power exists — §scoring)
  value: number; // gain/cost after context — the ranking key
  exec(g: HiveGame): boolean;
}

export interface HiveProvider {
  id: string;
  enumerate(g: HiveGame): HiveAction[];
}

const providers: HiveProvider[] = [];

/** The extension point (docs/HIVE-MIND.md): one call per purchasable system. Idempotent by id. */
export function registerHiveProvider(p: HiveProvider): void {
  if (providers.some((q) => q.id === p.id)) return;
  providers.push(p);
}

// ── Shared scoring helpers ───────────────────────────────────────────────────

/** EXACT live-power delta of a hypothetical purchase. effectsPower is a pure product over
 *  effects, so the run's power decomposes as (fixed card part) × (variable purchases part) —
 *  swapping the variable part scales the real base by the ratio. Pure; nothing moves. */
function powerDelta(g: HiveGame, mutate: (parts: { branchTiers: number; strainLevels: number; evo: HeroEvoLevels }) => { branchTiers: number; strainLevels: number; evo: HeroEvoLevels }): number {
  const branchTiers = g.towers.reduce((n, t) => n + t.tier, 0);
  const strainLevels = g.towers.reduce((n, t) => n + (t.strain - 1), 0);
  const evo = { ...g.heroEvoLevelsView() };
  const m = mutate({ branchTiers, strainLevels, evo });
  const oldVar = effectsPower([...heroEvoEffects(evo), ...branchPowerEffects(branchTiers), ...strainPowerEffects(strainLevels)]);
  const newVar = effectsPower([...heroEvoEffects(m.evo), ...branchPowerEffects(m.branchTiers), ...strainPowerEffects(m.strainLevels)]);
  const base = effectsPower(g.powerEffects());
  return oldVar > 0 ? Math.max(0, base * (newVar / oldVar - 1)) : 0;
}

/** Authored combat weight of a fresh organism — the honest heuristic where the temp-Power
 *  bucket is deliberately silent (a deployment's strength is inherent, not purchased power). */
function deployGain(kind: TowerKind, strain: number): number {
  const def = TOWER_DEFS[kind];
  const dps = def.fireInterval > 0 ? def.damage / def.fireInterval : 0;
  const base = def.damage <= 0
    ? HIVE_MIND.supportDeployGain // aura/economy organisms: no dps, whole-board value
    : dps * (1 + def.splash / 150);
  return (base * HIVE_MIND.deployGainScale) * (1 + (strain - 1) * 0.35);
}

/** Orthogonal lattice neighbors (80 px pitch) — the SAME pixel rule the reactor's overcharge
 *  radius encodes (≤ 90 px catches orthogonal neighbors, excludes ≈113 px diagonals). */
function adjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= HIVE_MIND.adjacencyPx;
}

/** A THIN board (docs/HIVE-MIND.md §opening): fewer towers than HIVE_MIND.thinBoardTowers (capped at the
 *  open slots) — the opening, where towers come before anything else. */
function thinBoard(g: HiveGame): boolean {
  return g.towers.length < Math.min(HIVE_MIND.thinBoardTowers, g.unlockedSlots);
}

/** Does the next wave's preview carry FLIERS? (they ignore the lanes and dive the Nucleus) */
function fliersIncoming(g: HiveGame): boolean {
  const preview = g.getNextWavePreview();
  return preview !== null && preview.some((e) => ENEMY_DEFS[e.kind]?.behavior.flying === true);
}

/** Best open slot for a kind (docs/HIVE-MIND.md §placement) — deterministic, data-driven. */
export function hiveBestSlot(g: HiveGame, kind: TowerKind): { x: number; y: number } | null {
  const taken = new Set(g.towers.map((t) => t.slot));
  const support = TOWER_DEFS[kind].damage <= 0;
  // Fliers next wave ⇒ combat organisms guard the Nucleus itself (G1: anti-air came too late).
  const coreBias = !support && fliersIncoming(g) ? HIVE_MIND.flierCoreBias : 0;
  const centerX = towerSlots.reduce((a, s) => a + s.x, 0) / Math.max(1, towerSlots.length);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (const s of towerSlots) {
    if (s.index >= g.unlockedSlots || taken.has(s.index)) continue;
    let score: number;
    if (support) {
      // Aura organisms live on adjacency: count occupied lattice neighbors.
      score = g.towers.filter((t) => adjacent(t.x, t.y, s.x, s.y)).length * 100 - s.index * 0.001;
    } else {
      // Combat organisms: forward first (meet the wave), centered, spread same kinds.
      const sameKindAdjacent = g.towers.some((t) => t.kind === kind && adjacent(t.x, t.y, s.x, s.y));
      const reach = (1 - coreBias) * -s.y - coreBias * Math.hypot(s.x - nucleusPoint.x, s.y - nucleusPoint.y);
      score = reach - Math.abs(s.x - centerX) * 0.03 - (sameKindAdjacent ? HIVE_MIND.monoculturePenalty : 0) - s.index * 0.001;
    }
    if (score > bestScore) { bestScore = score; best = { x: s.x, y: s.y }; }
  }
  return best;
}

// ── Built-in providers (docs/HIVE-MIND.md §architecture) ─────────────────────

registerHiveProvider({
  id: 'branch',
  enumerate(g) {
    const out: HiveAction[] = [];
    for (const t of g.towers) {
      if (t.tier >= 5) continue;
      // Committed towers climb their branch; uncommitted ones take the strongest opening
      // lane by authored tier-1 power weight (deterministic — registry order breaks ties).
      const lanes = t.branchId ? branchesFor(t.kind).filter((b) => b.id === t.branchId) : branchesFor(t.kind);
      const branch = lanes[0];
      if (!branch) continue;
      const cost = g.branchTierCost(t.kind, t.tier);
      const gain = powerDelta(g, (p) => ({ ...p, branchTiers: p.branchTiers + 1 }));
      out.push({
        id: `branch:${t.id}`,
        provider: 'branch',
        label: `Evolved ${TOWER_DEFS[t.kind].name} → ${branch.name} ${['I', 'II', 'III', 'IV', 'V'][t.tier]}`,
        detail: `branch tier ${t.tier + 1}/5`,
        cost,
        gain,
        value: 0,
        exec: (gg) => gg.buyBranchTier(t.id, branch.id) === 'ok',
      });
    }
    return out;
  },
});

registerHiveProvider({
  id: 'heroEvo',
  enumerate(g) {
    if (g.heroes.length === 0) return [];
    const levels = g.heroEvoLevelsView();
    const total = heroEvoTotalOwned(levels);
    const out: HiveAction[] = [];
    for (const cat of HERO_EVO_CATEGORIES) {
      const level = levels[cat.id] ?? 0;
      if (level >= HERO_EVO.maxLevel) continue;
      const cost = heroEvoCost(cat, level, total);
      const gain = powerDelta(g, (p) => ({ ...p, evo: { ...p.evo, [cat.id]: level + 1 } }));
      out.push({
        id: `heroEvo:${cat.id}`,
        provider: 'heroEvo',
        label: `Purchased ${cat.icon} ${cat.name} ${level + 1}`,
        detail: `hero evolution · ${cat.blurb.toLowerCase()}`,
        cost,
        gain,
        value: 0,
        exec: (gg) => gg.buyHeroEvolution(cat.id),
      });
    }
    return out;
  },
});

registerHiveProvider({
  id: 'autocast',
  enumerate(g) {
    if (g.autocastUnlocked || g.heroes.length === 0) return [];
    return [{
      id: 'autocast',
      provider: 'autocast',
      label: 'Unlocked hero Auto-Cast',
      detail: 'the hero fires its signature on cooldown',
      cost: HERO_AUTOCAST.cost,
      gain: HIVE_MIND.autocastGain,
      value: 0,
      exec: (gg) => gg.buyAutocast(),
    }];
  },
});

registerHiveProvider({
  id: 'deploy',
  enumerate(g) {
    const out: HiveAction[] = [];
    for (const item of g.conveyor) {
      if (item.readyAt > g.time) continue;
      const slot = hiveBestSlot(g, item.kind);
      if (!slot) continue;
      const cost = item.free === true ? 0 : deployCost(g.deployments);
      const strainBonus = item.strain > 1 ? powerDelta(g, (p) => ({ ...p, strainLevels: p.strainLevels + (item.strain - 1) })) : 0;
      out.push({
        id: `deploy:${item.id}`,
        provider: 'deploy',
        label: `Placed ${TOWER_DEFS[item.kind].name}${item.strain > 1 ? ` (Strain ${['I', 'II', 'III', 'IV', 'V'][item.strain - 1]})` : ''}`,
        detail: item.free === true ? 'the free starter organism' : 'conveyor deployment',
        cost,
        gain: deployGain(item.kind, item.strain) + strainBonus,
        value: 0,
        exec: (gg) => gg.deployFromConveyor(item.id, slot.x, slot.y),
      });
    }
    return out;
  },
});

// The FAVORITE organism (docs/HIVE-MIND.md §opening): always deployable on the universal curve — the
// opening the mind used to skip (it could only place what the conveyor offered). OPENING ONLY: past a
// thin board the conveyor supplies the rest (variety — a favorite monoculture measured worse, sim:hive).
registerHiveProvider({
  id: 'favorite',
  enumerate(g) {
    const kind = g.favoriteTower;
    if (!g.unlockedKinds.has(kind) || !thinBoard(g)) return [];
    const slot = hiveBestSlot(g, kind);
    if (!slot) return [];
    return [{
      id: 'favorite',
      provider: 'favorite',
      label: `Placed ${TOWER_DEFS[kind].name} (favorite)`,
      detail: 'favorite organism — always deployable',
      cost: deployCost(g.deployments),
      gain: deployGain(kind, 1),
      value: 0,
      exec: (gg) => gg.deployTower(kind, slot.x, slot.y),
    }];
  },
});

registerHiveProvider({
  id: 'merge',
  enumerate(g) {
    const out: HiveAction[] = [];
    for (const item of g.conveyor) {
      if (item.readyAt > g.time || item.free === true) continue;
      // Mirror strainFromConveyor's target rule so the plan prices the REAL merge.
      let target: Tower | null = null;
      for (const t of g.towers) {
        if (t.kind !== item.kind || t.strain >= 5) continue;
        if (target === null || t.tier > target.tier || (t.tier === target.tier && t.strain > target.strain) || (t.tier === target.tier && t.strain === target.strain && t.id < target.id)) target = t;
      }
      if (!target) continue;
      const cost = strainCost(g.deployments, target.strain);
      const gain = powerDelta(g, (p) => ({ ...p, strainLevels: p.strainLevels + 1 }));
      out.push({
        id: `merge:${item.id}`,
        provider: 'merge',
        label: `Strain-merged ${TOWER_DEFS[item.kind].name} → Strain ${['I', 'II', 'III', 'IV', 'V'][target.strain]}`,
        detail: 'duplicate consumed — the fielded organism evolves',
        cost,
        gain,
        value: 0,
        exec: (gg) => gg.strainFromConveyor(item.id) === 'ok',
      });
    }
    return out;
  },
});

// ── The planner ──────────────────────────────────────────────────────────────

/** Context multipliers (docs/HIVE-MIND.md §scoring) — every adjustment names its reason.
 *  The battlefield reads (sparse board, heavy incoming wave) are computed ONCE per plan. */
function applyContext(a: HiveAction, ctx: { sparse: boolean; heavy: boolean; thin: boolean }): HiveAction {
  let mult = 1;
  const reasons: string[] = [];
  if (ctx.thin && HIVE_MIND.thinHoldProviders.includes(a.provider)) {
    mult *= HIVE_MIND.thinHoldMult;
    reasons.push('board too thin — towers first');
  }
  if ((a.provider === 'deploy' || a.provider === 'favorite' || a.provider === 'merge') && ctx.sparse) {
    mult *= HIVE_MIND.sparseDeployMult;
    reasons.push('sparse board — guns first');
  }
  if (ctx.heavy) {
    mult *= HIVE_MIND.bossPrepMult;
    reasons.push('heavy wave incoming');
  }
  const value = a.cost > 0 ? (a.gain / a.cost) * mult : a.gain * mult * 10; // free actions rank by raw gain, generously
  return { ...a, value, detail: reasons.length > 0 ? `${a.detail} · ${reasons.join(' · ')}` : a.detail };
}

/** Rank every affordable-above-reserve action, best value first (deterministic).
 *  `reserveFloor` pins the untouchable amount for a whole PULSE (computed once from the
 *  wallet at pulse start) — without it, per-iteration recomputation on a shrinking wallet
 *  would asymptotically spend toward zero (the cohort sim caught exactly that). */
export function hivePlan(g: HiveGame, opts?: { reserveFloor?: number }): HiveAction[] {
  const reserve = opts?.reserveFloor ?? Math.max(HIVE_MIND.reserveMin, Math.floor(g.biomass * HIVE_MIND.reserveFrac));
  const spendable = g.biomass - reserve;
  const preview = g.getNextWavePreview();
  const ctx = {
    sparse: g.towers.length < HIVE_MIND.sparseBoardCount,
    thin: thinBoard(g),
    heavy: preview !== null && preview.some((e) => (ENEMY_DEFS[e.kind]?.hp ?? 0) >= HIVE_MIND.heavyHpThreshold),
  };
  const out: HiveAction[] = [];
  for (const p of providers) {
    for (const a of p.enumerate(g)) {
      if (a.cost > spendable && a.cost > 0) continue; // the reserve is untouchable (free always allowed)
      const scored = applyContext(a, ctx);
      if (scored.value <= HIVE_MIND.minValue) continue; // never buy noise
      out.push(scored);
    }
  }
  out.sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
  return out;
}

// ── THE AUTOMATION GATE (docs/HIVE-MIND.md §solved-content) ──────────────────────────────
// Hive Intelligence (the pulse) and Auto Gene (automatic draft picks) replace DECISIONS, so they
// run only on SOLVED content: content the account has already beaten. On a frontier the best play
// must never be "press one button". The meta layer evaluates this from the save and threads ONE
// explicit run option (RunOptions.automationAllowed) — the sim never reads the save. Auto Wave and
// game speed are pure convenience and stay available everywhere (not governed here).

/** Run modes the gate knows (mirrors game.ts RunMode — a type-only echo keeps this module cycle-free). */
export type AutomationMode = 'stage' | 'endless' | 'campaign' | 'bossRush' | 'daily';

/** Per-mode policy: `always` (the content is solved by definition), `cleared` (only content the
 *  account has beaten — the meta layer says which), `never` (every run is a frontier / a fair
 *  shared board / hand practice). `reason` is the player-facing line shown when it is off. */
export const AUTOMATION_POLICY: Record<AutomationMode, { allow: 'always' | 'cleared' | 'never'; reason: string }> = {
  endless: { allow: 'always', reason: '' }, // Infinite is the farm — solved content by design
  campaign: { allow: 'cleared', reason: 'Unlocks on stages you’ve cleared' }, // replays yes, frontier no
  bossRush: { allow: 'never', reason: 'Off in Boss Rush — every run chases a record' }, // record lanes pay; each run is a frontier
  daily: { allow: 'never', reason: 'Off on the Daily — one shared, fair board' }, // a worldwide leaderboard
  stage: { allow: 'never', reason: 'Off in Quick Skirmish — practice is played by hand' }, // the practice sandbox
};

/** The Threat-ladder twin of the frontier rule: a Threat level above the mode's best cleared level
 *  is a frontier too, even on cleared content (docs/THREAT.md §automation). */
export const AUTOMATION_THREAT_REASON = 'Unlocks at Threat levels you’ve cleared';
export const AUTOMATION_TUTORIAL_REASON = 'Unlocks after the tutorial';

export interface AutomationContext {
  mode: AutomationMode;
  tutorial: boolean;
  /** Campaign: the stage being played is already cleared at this difficulty (meta-computed). */
  contentCleared: boolean;
  /** The run's Threat level (0 = baseline) and the mode's best CLEARED Threat level. */
  threat: number;
  threatCleared: number;
}

/** Pure policy: may this run use Hive Intelligence + Auto Gene, and if not, why. */
export function automationGate(c: AutomationContext): { allowed: boolean; reason: string | null } {
  if (c.tutorial) return { allowed: false, reason: AUTOMATION_TUTORIAL_REASON };
  const p = AUTOMATION_POLICY[c.mode];
  if (p.allow === 'never' || (p.allow === 'cleared' && !c.contentCleared)) return { allowed: false, reason: p.reason };
  if (c.threat > c.threatCleared) return { allowed: false, reason: AUTOMATION_THREAT_REASON };
  return { allowed: true, reason: null };
}
