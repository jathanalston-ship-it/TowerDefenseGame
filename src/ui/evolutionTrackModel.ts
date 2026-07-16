// Evolution Track VIEW model (docs/MASTERY.md §evolution track) — derives everything the labs'
// helix panel shows from the pure generator + the save's claim state. Pure (no React/DOM),
// shared by TowerLab and HeroLab, and cheap enough to sweep the whole roster for badges/sorting.

import { MASTERY_EVOLUTION, canPrestige, masteryEvolutionTrack, trackLevelOf } from '../core/masteryEvolution';
import type { EvolutionGrant, EvolutionSubject } from '../core/masteryEvolution';
import { masteryProgress } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import type { HeroKind, TowerKind } from '../core/types';

export type EvolutionNodeState = 'claimed' | 'ready' | 'upcoming';

export interface EvolutionNodeView {
  level: number; // track level 1..100
  major: boolean;
  state: EvolutionNodeState;
  label: string; // "+12 Strain Samples · Bio Container (Epic)" — the hover/claim receipt
}

export interface EvolutionPanelModel {
  masteryLevel: number; // lifetime — NEVER regresses (prestige only re-windows the track)
  prestige: number; // 0-based loop index; display as "P{prestige + 1}"
  trackLevel: number; // 0..100 inside the current loop
  completionPct: number; // 0..100, one decimal of honesty is overkill — integers
  claimable: number; // reached-but-unclaimed nodes
  claimableMajors: number;
  nodes: EvolutionNodeView[];
  next: { level: number; toGo: number; major: boolean; label: string } | null; // null at loop top
  canPrestige: boolean;
  shardFree: boolean; // prestige ≥ 1 — this loop's pool never pays unit shards again
}

/** Player-facing name for one grant (the labs' currency names, not internal kinds). */
export function evolutionGrantLabel(g: EvolutionGrant, subject: EvolutionSubject): string {
  switch (g.kind) {
    case 'unitShards': return `+${g.amount} ${subject === 'tower' ? 'Strain Samples' : 'Apex Genome'}`;
    case 'genomeCores': return `+${g.amount} Genome Cores`;
    case 'geneEssence': return `+${g.amount} Gene Essence`;
    case 'scrap': return `+${g.amount} Scrap`;
    case 'mutagen': return `+${g.amount} Mutagen`;
    case 'catalyst': return `+${g.amount} Catalyst`;
    case 'container': return `Bio Container (${g.tier === 1 ? 'Rare' : g.tier === 2 ? 'Epic' : 'Legendary'})`;
    case 'ichor': return `+${g.amount} Ichor`;
  }
}

export function evolutionPanelModel(save: SaveData, subject: EvolutionSubject, unit: string): EvolutionPanelModel {
  const xp = subject === 'tower'
    ? save.towerMasteryXp[unit as TowerKind] ?? 0
    : save.heroMasteryXp[unit as HeroKind] ?? 0;
  const lvl = masteryProgress(xp).level;
  const st = save.masteryEvolution[`${subject}:${unit}`] ?? { claimedUpTo: 0, prestige: 0 };
  const trackLevel = trackLevelOf(lvl, st.prestige);
  const track = masteryEvolutionTrack(subject, unit, st.prestige);

  let claimable = 0;
  let claimableMajors = 0;
  const nodes: EvolutionNodeView[] = track.nodes.map((n) => {
    const state: EvolutionNodeState = n.level <= st.claimedUpTo ? 'claimed' : n.level <= trackLevel ? 'ready' : 'upcoming';
    if (state === 'ready') { claimable++; if (n.major) claimableMajors++; }
    return { level: n.level, major: n.major, state, label: n.grants.map((g) => evolutionGrantLabel(g, subject)).join(' · ') };
  });

  const upcoming = nodes.find((n) => n.level > trackLevel) ?? null;
  return {
    masteryLevel: lvl,
    prestige: st.prestige,
    trackLevel,
    completionPct: Math.round((trackLevel / MASTERY_EVOLUTION.trackLevels) * 100),
    claimable,
    claimableMajors,
    nodes,
    next: upcoming ? { level: upcoming.level, toGo: upcoming.level - trackLevel, major: upcoming.major, label: upcoming.label } : null,
    canPrestige: canPrestige(lvl, st.prestige),
    shardFree: st.prestige >= 1,
  };
}

/** Roster-scale signal for badges + the "Evolution rewards" sort: what needs attention. */
export function evolutionRosterSignal(save: SaveData, subject: EvolutionSubject, unit: string): { claimable: number; ready: boolean } {
  const m = evolutionPanelModel(save, subject, unit);
  return { claimable: m.claimable, ready: m.canPrestige };
}
