// Command Center read-models + widget registry (docs/COMMAND-CENTER.md). The Home screen is
// a REGISTRY of widgets over pure read-models — the shell renders whatever the registry
// yields into its zones, so a future system adds a home presence with one `homeRegistry
// .register(...)` + one renderer entry (no shell surgery, no hardcoded widget lists). The
// models here are pure functions of the save (plus an injected clock for feed recency) —
// no DOM, no store, trivially testable.

import type { SaveData } from '../save/saveStore';
import type { TimelineEvent } from '../core/types';
import { CAMPAIGN_REWARDS, campaignSurveyBonus, HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { adaptVisualTier } from '../core/adaptation';
import { isHeroUnlocked, isTowerUnlocked, masteryLevel, accountPowerParts, collectionContextOf } from '../state/meta';
import { composePower } from '../core/power';
import { collectionView } from '../core/collection';
import { highestCampaignStage } from '../save/derive';
import { featureRevealed } from '../state/unlocks';
import { labEra, labIntensity, labScore } from './homeBaseTiers';
import { generateStage, recommendedPowerScore } from '../core/campaign';
import type { StageConfig } from '../core/campaign';
import { difficultyPref } from '../state/prefs';
import { deployReadiness } from '../state/progressionLoop';
import type { DeployReadiness } from '../state/progressionLoop';
import { nextGoals } from '../state/nextGoal';
import type { NextGoal } from '../state/nextGoal';

// ── World Status — the living organism's vitals (the centerpiece's data) ─────────────────

export interface WorldStatusView {
  era: 0 | 1 | 2 | 3;
  eraName: string;
  intensity: number; // 0..1 — ambient particle/glow density
  stage: number; // deepest campaign stage cleared
  bestWave: number;
  molts: number;
  power: number; // universal Power Score
  ready: boolean; // power meets the campaign frontier's recommendation
  readiness: string; // the organism's one-line posture
  frontierBiome: string; // where the war goes next
  organs: { kind: string; color: string; stars: number; form: number }[]; // the strains, as organelles
}

const ERA_NAMES = ['NASCENT', 'GROWING', 'THRIVING', 'ASCENDANT'] as const;

export function worldStatus(save: SaveData): WorldStatusView {
  const power = composePower(accountPowerParts(save)).score;
  return worldStatusFrom(save, homeFrontier(save, power), power);
}

/** worldStatus over an already-computed frontier + power (buildHomeView's single-compute path). */
function worldStatusFrom(save: SaveData, frontier: HomeFrontier, power: number): WorldStatusView {
  const score = labScore(save);
  const era = labEra(score);
  return {
    era,
    eraName: ERA_NAMES[era],
    intensity: labIntensity(score),
    stage: highestCampaignStage(save),
    bestWave: save.bestWave,
    molts: save.prestige?.molts ?? 0,
    power,
    ready: frontier.ready,
    readiness: frontier.ready ? 'PRIMED FOR DESCENT' : 'GATHERING STRENGTH',
    frontierBiome: frontier.cfg.biome.name,
    // the organism only carries organs it has actually synthesized — dormant strains are absent
    organs: TOWER_ORDER.filter((kind) => isTowerUnlocked(save, kind)).map((kind) => ({
      kind,
      color: TOWER_DEFS[kind].color,
      stars: save.towerStars[kind] ?? 0,
      form: adaptVisualTier(save.adaptation?.[`tower:${kind}`] ?? []),
    })),
  };
}

// ── The campaign frontier — the next stage on the selected difficulty track ──────────────

export interface HomeFrontier {
  diff: string;
  stage: number; // the stage the CTA deploys into (cleared + 1 on this track)
  cleared: number; // stages cleared on this track
  cfg: StageConfig;
  rec: number; // recommended Power for the frontier
  ready: boolean;
  /** What the deploy CTA should SAY (docs/PROGRESSION-LOOP.md §readiness): only 'under' warns. */
  band: DeployReadiness;
  isMilestone: boolean; // clearing it raises the Evolution Cap
  firstClearCore: number; // ◆ paid on first clear
}

export function homeFrontier(save: SaveData, power: number): HomeFrontier {
  const diff = difficultyPref('campaign');
  const cleared = save.campaign.cleared[diff] ?? 0;
  const stage = cleared + 1;
  const rec = recommendedPowerScore(stage, diff);
  const isMilestone = stage % CAMPAIGN_REWARDS.milestoneEvery === 0;
  return {
    diff,
    stage,
    cleared,
    cfg: generateStage(stage, diff),
    rec,
    ready: power >= rec,
    band: deployReadiness(power, rec, stage, diff),
    isMilestone,
    firstClearCore: Math.round(
      CAMPAIGN_REWARDS.firstClearCore +
      CAMPAIGN_REWARDS.firstClearCorePerStage * stage +
      campaignSurveyBonus(stage)), // the dripped milestone lump — must mirror meta.finishRun
  };
}

// ── The home view-model — every number the board shows, computed ONCE per save ───────────
// Widgets read slices of THIS (via WidgetCtx.view) instead of re-deriving models; that is
// what keeps the board coherent — one fact has one value — and cheap (nextGoals, campaign
// generation and the Power fold each run once per save change, not once per widget).

export interface HomeView {
  power: number;
  frontier: HomeFrontier;
  goals: NextGoal[]; // nearest first — the banner owns [0], the roadmap the rest
  collectionPct: number; // canonical codex completion (same number the Collection screen leads with)
  collectionDiscovered: number;
  collectionTotal: number;
  vaultReady: number; // unopened containers
  world: WorldStatusView;
}

export function buildHomeView(save: SaveData): HomeView {
  const power = composePower(accountPowerParts(save)).score;
  const frontier = homeFrontier(save, power);
  const codex = collectionView(collectionContextOf(save));
  return {
    power,
    frontier,
    goals: nextGoals(save, 5),
    collectionPct: codex.pct,
    collectionDiscovered: codex.discovered,
    collectionTotal: codex.total,
    vaultReady: save.pendingContainers.length,
    world: worldStatusFrom(save, frontier, power),
  };
}

// ── Command feed — the account's recent milestones (save.timeline, newest first) ─────────

export interface FeedEntry extends TimelineEvent {
  ago: string; // human recency ("2h ago" / "just now")
}

export function agoLabel(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function commandFeed(save: SaveData, now: number, limit = 8): FeedEntry[] {
  return [...(save.timeline ?? [])]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((e) => ({ ...e, ago: agoLabel(e.at, now) }));
}

// ── Live army — every strain + champion at a glance ──────────────────────────────────────

export interface ArmyUnit {
  kind: string;
  name: string;
  color: string;
  stars: number;
  mastery: number; // mastery level
  form: number; // adaptation FORM stage (towers)
  fielded: boolean; // heroes: in the loadout; towers: owned (every owned kind rides the conveyor)
  unlocked: boolean;
}

export function armyView(save: SaveData): { towers: ArmyUnit[]; heroes: ArmyUnit[] } {
  return {
    towers: TOWER_ORDER.map((kind) => {
      const owned = isTowerUnlocked(save, kind); // dormant strains show LOCKED, not fielded
      return {
        kind,
        name: TOWER_DEFS[kind].name,
        color: TOWER_DEFS[kind].color,
        stars: save.towerStars[kind] ?? 0,
        mastery: masteryLevel(save.towerMasteryXp[kind] ?? 0),
        form: adaptVisualTier(save.adaptation?.[`tower:${kind}`] ?? []),
        fielded: owned,
        unlocked: owned,
      };
    }),
    heroes: HERO_ORDER.map((kind) => ({
      kind,
      name: HERO_DEFS[kind].name,
      color: HERO_DEFS[kind].color,
      stars: save.heroStars[kind] ?? 0,
      mastery: masteryLevel(save.heroMasteryXp[kind] ?? 0),
      form: 0,
      fielded: save.heroLoadout.includes(kind),
      unlocked: isHeroUnlocked(save, kind), // milestone heroes (Vitriol/Revenant) derive — never in the array
    })),
  };
}

// ── Widget registry — the shell renders THIS, never a hardcoded list ─────────────────────

/** The shell's layout bands, top to bottom. `main`+`side` share a row (mission | rail). */
export type HomeZone = 'strip' | 'world' | 'main' | 'side' | 'army' | 'ops' | 'feed' | 'foot';

export interface HomeWidgetDef {
  id: string; // must have a renderer in CommandCenter's WIDGETS map
  zone: HomeZone;
  order: number; // ascending within the zone
  when?: (save: SaveData) => boolean; // omit = always shown
}

class HomeRegistry {
  private defs: HomeWidgetDef[] = [];
  register(def: HomeWidgetDef): void {
    this.defs = [...this.defs.filter((d) => d.id !== def.id), def];
  }
  /** The zone's visible widgets for this save, in order. */
  zone(save: SaveData, zone: HomeZone): HomeWidgetDef[] {
    return this.defs
      .filter((d) => d.zone === zone && (!d.when || d.when(save)))
      .sort((a, b) => a.order - b.order);
  }
  all(): readonly HomeWidgetDef[] {
    return this.defs;
  }
}

export const homeRegistry = new HomeRegistry();

// The launch board. `when` guards keep a fresh account's board calm (no empty panels) and ride
// the progression-gating reveals (docs/PROGRESSION-GATING.md) — a home widget showcasing a wing
// appears WITH that wing, so minute-0 Home is the campaign card, the next goal, and little else.
// HIERARCHY CONTRACT (docs/COMMAND-CENTER.md §zones): the primary decision — Mission
// Control's deploy — leads the main zone; intel (goals, events, contracts) supports below
// it; the Infestation conquest map rides with operations, not above the deploy button.
homeRegistry.register({ id: 'vitals', zone: 'strip', order: 10 });
homeRegistry.register({ id: 'world-status', zone: 'world', order: 10 });
homeRegistry.register({ id: 'mission-control', zone: 'main', order: 10 }); // Foundation #1: the deploy card + the objective ledger (absorbed the old next-goal banner — docs/MISSION-CONTROL.md)
homeRegistry.register({ id: 'bio-cache', zone: 'main', order: 25, when: (s) => s.totalRuns > 0 }); // Daily Bio-Cache (docs/DAILY-LOGIN.md) — the day's first beat; held back from the minute-0 board so the first-boot funnel stays clean
homeRegistry.register({ id: 'live-events', zone: 'main', order: 30 }); // LiveOps calendar strip (docs/LIVEOPS.md)
homeRegistry.register({ id: 'directives', zone: 'main', order: 35, when: (s) => featureRevealed(s, 'daily') }); // Weekly Directives ladder (docs/LIVEOPS.md §directives) — arrives with the weekly rhythm
homeRegistry.register({ id: 'contracts', zone: 'main', order: 40, when: (s) => featureRevealed(s, 'daily') }); // Champion Contracts board (docs/CONTRACTS.md) — the weekly rhythm arrives with the daily one
homeRegistry.register({ id: 'recommend', zone: 'side', order: 5, when: (s) => s.totalRuns > 0 }); // Recommended-now panel (docs/NOTIFICATIONS.md §recommendations) — the loop's next step leads the side column
homeRegistry.register({ id: 'forecast', zone: 'side', order: 10, when: (s) => s.totalRuns > 0 });
homeRegistry.register({ id: 'growth', zone: 'side', order: 15, when: (s) => featureRevealed(s, 'towers') }); // Power Atlas organ (docs/POWER-SCORE.md §atlas) — arrives with the first upgrade wing
homeRegistry.register({ id: 'roadmap', zone: 'side', order: 20 });
homeRegistry.register({ id: 'army', zone: 'army', order: 10, when: (s) => featureRevealed(s, 'towers') }); // the roster strip appears with the Tower Lab
homeRegistry.register({ id: 'modes', zone: 'ops', order: 10 });
homeRegistry.register({ id: 'infestation', zone: 'ops', order: 20, when: (s) => featureRevealed(s, 'infestation') }); // Infestation conquest map (docs/INFESTATION.md) — arrives WITH The Front (stage 20), never before its wing
// Hive Intelligence (docs/HIVE-INTEL.md) mounts whenever it has ANYTHING to say — banked
// containers and ready Power moves count, not just timeline history (the old gate hid a fresh
// account's first ACT rows). The widget itself renders null when the feed is empty.
homeRegistry.register({ id: 'command-feed', zone: 'feed', order: 10, when: (s) => (s.timeline ?? []).length > 0 || (s.pendingContainers ?? []).length > 0 || s.shards > 0 });
homeRegistry.register({ id: 'dashboard', zone: 'feed', order: 20 });
homeRegistry.register({ id: 'tip', zone: 'foot', order: 10 });
