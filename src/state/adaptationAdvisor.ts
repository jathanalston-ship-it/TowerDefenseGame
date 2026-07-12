// Adaptation advisor (docs/ADAPTATION.md §advisor) — the "what should I adapt next?" engine
// for the Adaptation Chamber. EXACT, like the best-purchase advisor: every pickable node on
// every unit holding free Antigen is scored by diffing the real pure Power scorer against the
// hypothetical pick; ranked best-gain first (ties: shallower tier first — cheaper ladders).
// Zero-gain picks are HONEST behavioral rewrites (pierce/range/conduct), kept and flagged —
// never hidden, never oversold. Pure over SaveData; the UI decides how many to show.

import type { SaveData } from '../save/saveStore';
import { adaptationView, isHeroUnlocked, isTowerUnlocked } from './meta';
import { powerBreakdown } from './profile';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { AdaptBranch } from '../core/adaptation';

export interface AdaptPick {
  subject: 'tower' | 'hero';
  unit: string;
  unitName: string;
  color: string;
  nodeId: string;
  nodeName: string;
  desc: string;
  branch: AdaptBranch;
  tier: number;
  /** Exact Power gain of this single pick (0 ⇒ a behavioral rewrite, not a dud). */
  powerDelta: number;
}

/** Units the chamber can adapt right now: unlocked, with ≥1 free Antigen. */
export function adaptableUnits(save: SaveData): { subject: 'tower' | 'hero'; unit: string; free: number }[] {
  const out: { subject: 'tower' | 'hero'; unit: string; free: number }[] = [];
  for (const k of TOWER_ORDER) {
    if (!isTowerUnlocked(save, k)) continue;
    out.push({ subject: 'tower', unit: k, free: adaptationView(save, 'tower', k).pointsAvailable });
  }
  for (const h of HERO_ORDER) {
    if (!isHeroUnlocked(save, h)) continue;
    out.push({ subject: 'hero', unit: h, free: adaptationView(save, 'hero', h).pointsAvailable });
  }
  return out;
}

/** Every pickable adaptation across the account, ranked by exact Power gain. */
export function adaptationPicks(save: SaveData, limit = 8): AdaptPick[] {
  const base = powerBreakdown(save).score;
  const out: AdaptPick[] = [];
  for (const { subject, unit, free } of adaptableUnits(save)) {
    if (free <= 0) continue;
    const view = adaptationView(save, subject, unit);
    const def = subject === 'tower' ? TOWER_DEFS[unit as keyof typeof TOWER_DEFS] : HERO_DEFS[unit as keyof typeof HERO_DEFS];
    const key = `${subject}:${unit}`;
    for (const nv of view.nodes) {
      if (nv.chosen || !nv.canPick) continue;
      const after = powerBreakdown({
        ...save,
        adaptation: { ...save.adaptation, [key]: [...view.chosen, nv.node.id] },
      }).score;
      out.push({
        subject, unit, unitName: def?.name ?? unit, color: def?.color ?? 'var(--text)',
        nodeId: nv.node.id, nodeName: nv.node.name, desc: nv.node.desc,
        branch: nv.node.branch, tier: nv.node.tier,
        powerDelta: Math.max(0, Math.round(after - base)),
      });
    }
  }
  out.sort((a, b) => b.powerDelta - a.powerDelta || a.tier - b.tier || a.unitName.localeCompare(b.unitName));
  return out.slice(0, limit);
}
