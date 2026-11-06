// POWER ADVISOR (docs/POWER-ADVISOR.md — Foundation #5 of the UX consolidation pass): the
// account's fastest available Power gains as ONE ranked, cross-system plan. Where the Power
// Atlas answers "best next move PER system", the Advisor merges every system's EXACT ranked
// list (bestPurchase / adaptationPicks / equipUpgrades — real scorer diffs, never heuristics)
// into "do these K things, in this order, for +N Power". Mission Control, the Hive Intelligence
// Feed, the Evolution Roadmap, and every wing screen consume THIS plan, so the whole game
// speaks one language: what to do, what it pays, and how long it takes.
//
// PURE over SaveData (memoize per revision at the consumer). Time estimates are deliberately
// coarse and honest: an INSTANT move (free equip, free Antigen pick, affordable buy) is a
// half-minute of menuing; save-up moves are listed but excluded from the plan's totals —
// the Advisor never promises Power the player cannot bank right now.

import type { SaveData } from '../save/saveStore';
import { bestPurchase } from './bestPurchase';
import type { PurchaseSurface } from './bestPurchase';
import { adaptationPicks } from './adaptationAdvisor';
import { equipUpgrades } from './equipAdvisor';
import { isOpenNav } from './unlocks';
import type { AtlasAction } from './powerAtlas';

/** One ranked "do this" — provenance + the same guarded executable payload the Atlas uses. */
export interface AdvisorMove {
  label: string; // what ("Equip Ossified Helm — Ravager")
  system: string; // owning wing label ("Equipment")
  nav: string; // hub nav key — the jump shortcut
  price: string; // "free" / "25 Cores" / "1 Antigen pick"
  powerDelta: number; // EXACT Power gained (advisor math)
  affordable: boolean; // executable right now
  action: AtlasAction; // quick-buy payload (routes through the same guarded meta actions)
}

export interface AdvisorPlan {
  moves: AdvisorMove[]; // ranked by powerDelta desc; affordable moves only
  saveUp: AdvisorMove | null; // the single best NON-affordable move (the thing worth banking for)
  totalGain: number; // sum of `moves` deltas — bankable immediately
  estMinutes: number; // honest menuing time for the plan (½ min per instant move, rounded up)
}

const SURFACES: { surface: PurchaseSurface; system: string; nav: string }[] = [
  { surface: 'towers', system: 'Tower Evolution', nav: 'towers' },
  { surface: 'heroes', system: 'Champions', nav: 'heroes' },
  { surface: 'evolution', system: 'Evolution HQ', nav: 'evolution' },
  { surface: 'genes', system: 'Gene Archive', nav: 'genes' },
];

/** The fastest available Power plan: top `k` affordable moves across EVERY system, ranked by
 *  exact gain, plus the single best save-up target. Deterministic; ties keep source order. */
export function advisorPlan(save: SaveData, k = 5): AdvisorPlan {
  const affordable: AdvisorMove[] = [];
  let saveUp: AdvisorMove | null = null;

  // THE SEAL RULE (docs/PROGRESSION-GATING.md): only wings the player has reached may be advised.
  for (const { surface, system, nav } of SURFACES) {
    if (!isOpenNav(save, nav)) continue;
    const { ranked } = bestPurchase(save, surface);
    for (const c of ranked) {
      const move: AdvisorMove = {
        label: c.label, system, nav, price: c.buyLabel, powerDelta: c.powerDelta,
        affordable: c.affordable, action: { type: 'purchase', surface, id: c.id },
      };
      if (c.affordable) affordable.push(move);
      else if (!saveUp || c.powerDelta > saveUp.powerDelta) saveUp = move;
    }
  }
  for (const p of isOpenNav(save, 'adaptation') ? adaptationPicks(save, k) : []) {
    affordable.push({
      label: `${p.unitName} — ${p.nodeName}`, system: 'Adaptation', nav: 'adaptation',
      price: '1 Antigen pick', powerDelta: p.powerDelta, affordable: true,
      action: { type: 'adapt', subject: p.subject, unit: p.unit, nodeId: p.nodeId },
    });
  }
  for (const g of isOpenNav(save, 'equipment') ? equipUpgrades(save, k) : []) {
    affordable.push({
      label: `Equip ${g.itemName} — ${g.heroName}`, system: 'Equipment', nav: 'equipment',
      price: 'free', powerDelta: g.powerDelta, affordable: true,
      action: { type: 'equip', hero: g.hero, slot: g.slot, uid: g.uid },
    });
  }

  affordable.sort((a, b) => b.powerDelta - a.powerDelta);
  const moves = affordable.filter((m) => m.powerDelta > 0).slice(0, Math.max(0, k));
  const totalGain = moves.reduce((n, m) => n + m.powerDelta, 0);
  return { moves, saveUp, totalGain, estMinutes: Math.max(1, Math.ceil(moves.length * 0.5)) };
}
