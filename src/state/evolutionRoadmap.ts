// EVOLUTION ROADMAP (docs/EVOLUTION-ROADMAP.md — Foundation #4 of the UX consolidation pass): the whole
// progression future on one rail. Every major system, in the learning curve's authored order —
// already-revealed wings shown as CONQUERED waypoints, locked wings as UPCOMING nodes with live
// requirement progress, an honest distance in stages, the Power the frontier will ask for, and
// the anticipation hook ("why you'll want this"). The future should feel exciting, not
// overwhelming: one ordered path, no surprises, nothing hidden.
//
// COALESCING CONTRACT: nodes derive from the SAME unlock registry that gates the nav and the
// What's-New reveals (state/unlocks FEATURES) — the roadmap can never disagree with the doors.
// Distance uses guaranteedByStage (the luck-proof backbone) and Power uses the campaign's own
// recommendedPowerScore, so every number matches the surface it points at. PURE over SaveData.

import type { SaveData } from '../save/saveStore';
import { FEATURES, evalCondition, featureRevealed, guaranteedByStage } from './unlocks';
import { recommendedPowerScore } from '../core/campaign';
import { highestCampaignStage } from '../save/derive';

export interface RoadmapNode {
  id: string; // feature id (nav key for revealed nodes)
  name: string;
  glyph: string;
  hook: string; // the anticipation blurb ("why you'll want this")
  revealed: boolean; // conquered waypoint vs upcoming node
  progress: number; // 1 for revealed; live requirement progress otherwise
  requirement: string; // human requirement ("Clear Campaign Stage 4 · 2 to go"); '' when done
  /** Honest distance: campaign stages between here and the luck-proof unlock stage (0 =
   *  resource-gated or imminent — the requirement string carries the detail). */
  stagesAhead: number;
  /** The Power the campaign recommends at that unlock stage — what "ready" will mean there. */
  powerAtUnlock: number;
}

export interface EvolutionRoadmapModel {
  nodes: RoadmapNode[]; // the full learning curve, authored order
  conquered: number; // revealed count — the "how far I've come" read
  next: RoadmapNode | null; // the first upcoming node (the roadmap's headline)
}

export function evolutionRoadmap(save: SaveData): EvolutionRoadmapModel {
  const here = highestCampaignStage(save);
  const nodes: RoadmapNode[] = FEATURES
    .filter((f) => f.kind === 'screen')
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const revealed = featureRevealed(save, f.id);
      const c = revealed ? null : evalCondition(f.condition, save);
      const gate = guaranteedByStage(f.condition);
      const gateStage = Number.isFinite(gate) ? gate : 0;
      return {
        id: f.id,
        name: f.name,
        glyph: f.glyph,
        hook: f.blurb,
        revealed,
        progress: revealed ? 1 : c!.progress,
        requirement: revealed ? '' : c!.label,
        stagesAhead: revealed ? 0 : Math.max(0, gateStage - here),
        powerAtUnlock: recommendedPowerScore(Math.max(1, gateStage || here + 1), 'standard'),
      };
    });
  const next = nodes.find((n) => !n.revealed) ?? null;
  return { nodes, conquered: nodes.filter((n) => n.revealed).length, next };
}
