// Command Center read-models + widget registry (docs/COMMAND-CENTER.md). The Home screen is
// a REGISTRY of widgets over pure read-models — the shell renders whatever the registry
// yields into its zones, so a future system adds a home presence with one `homeRegistry
// .register(...)` + one renderer entry (no shell surgery, no hardcoded widget lists). The
// models here are pure functions of the save (plus an injected clock for feed recency) —
// no DOM, no store, trivially testable.

import type { SaveData } from '../save/saveStore';
import type { TimelineEvent } from '../core/types';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { adaptVisualTier } from '../core/adaptation';
import { isTowerUnlocked, masteryLevel, accountPowerParts } from '../state/meta';
import { composePower } from '../core/power';
import { highestCampaignStage } from '../save/derive';
import { labEra, labIntensity, labScore } from './homeBaseTiers';
import { generateStage, recommendedPowerScore } from '../core/campaign';
import { difficultyPref } from '../state/prefs';

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
  const score = labScore(save);
  const era = labEra(score);
  const diff = difficultyPref('campaign');
  const frontier = (save.campaign.cleared[diff] ?? 0) + 1;
  const power = composePower(accountPowerParts(save)).score;
  const ready = power >= recommendedPowerScore(frontier, diff);
  return {
    era,
    eraName: ERA_NAMES[era],
    intensity: labIntensity(score),
    stage: highestCampaignStage(save),
    bestWave: save.bestWave,
    molts: save.prestige?.molts ?? 0,
    power,
    ready,
    readiness: ready ? 'PRIMED FOR DESCENT' : 'GATHERING STRENGTH',
    frontierBiome: generateStage(frontier, diff).biome.name,
    // the organism only carries organs it has actually synthesized — dormant strains are absent
    organs: TOWER_ORDER.filter((kind) => isTowerUnlocked(save, kind)).map((kind) => ({
      kind,
      color: TOWER_DEFS[kind].color,
      stars: save.towerStars[kind] ?? 0,
      form: adaptVisualTier(save.adaptation?.[`tower:${kind}`] ?? []),
    })),
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
      unlocked: save.heroUnlocked.includes(kind),
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

// The launch board. `when` guards keep a fresh account's board calm (no empty panels).
homeRegistry.register({ id: 'vitals', zone: 'strip', order: 10 });
homeRegistry.register({ id: 'world-status', zone: 'world', order: 10 });
homeRegistry.register({ id: 'next-goal', zone: 'main', order: 5 });
homeRegistry.register({ id: 'live-events', zone: 'main', order: 7 }); // LiveOps calendar strip (docs/LIVEOPS.md)
homeRegistry.register({ id: 'contracts', zone: 'main', order: 8 }); // Champion Contracts board (docs/CONTRACTS.md)
homeRegistry.register({ id: 'infestation', zone: 'main', order: 9 }); // Infestation conquest map (docs/INFESTATION.md)
homeRegistry.register({ id: 'mission-control', zone: 'main', order: 10 });
homeRegistry.register({ id: 'forecast', zone: 'side', order: 10, when: (s) => s.totalRuns > 0 });
homeRegistry.register({ id: 'roadmap', zone: 'side', order: 20 });
homeRegistry.register({ id: 'army', zone: 'army', order: 10 });
homeRegistry.register({ id: 'modes', zone: 'ops', order: 10 });
homeRegistry.register({ id: 'command-feed', zone: 'feed', order: 10, when: (s) => (s.timeline ?? []).length > 0 });
homeRegistry.register({ id: 'dashboard', zone: 'feed', order: 20 });
homeRegistry.register({ id: 'tip', zone: 'foot', order: 10 });
