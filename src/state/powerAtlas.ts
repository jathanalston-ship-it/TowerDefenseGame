// POWER ATLAS (docs/POWER-SCORE.md §atlas) — the whole meta-progression answered on one card:
// for EVERY system that raises the account's Power Score, "what's my best next move there, can
// I afford it right now, and how many moves are open?" Buy-systems reuse the exact advisors
// (bestPurchase / adaptationPicks — real scorer diffs, never heuristics); equipment surfaces
// FREE exact moves via the equip advisor; the remaining tend-systems (Mulligans, the Archive)
// get an honest status line instead of a fake price tag. PURE over SaveData — the Command
// Center's Growth panel and any future surface memoize per revision.
//
// Extension point: a new upgradeable system adds ONE entry to systems() below — either a
// bestPurchase surface (preferred; exact) or a tend row with its own status math.

import type { SaveData } from '../save/saveStore';
import { powerBreakdown } from './profile';
import type { PowerSlice } from './profile';
import { bestPurchase } from './bestPurchase';
import { adaptableUnits, adaptationPicks } from './adaptationAdvisor';
import { equipUpgrades } from './equipAdvisor';
import { collectionContextOf, fieldedLoadout, isTowerUnlocked, loadoutOf } from './meta';
import { collectionView } from '../core/collection';
import { MULLIGAN_SLOTS } from '../core/mulligan';
import { TOWER_ORDER } from '../core/config';

/** One concrete "do this next" (buy systems only — tend systems guide via `note`). */
export interface AtlasMove {
  label: string; // what ("Reinforced Nucleus L1")
  price: string; // for how much ("25 Cores" / "1 Antigen pick")
  powerDelta: number; // EXACT Power gained (advisor math)
  affordable: boolean;
}

export interface AtlasSystem {
  id: 'towers' | 'heroes' | 'evolution' | 'genes' | 'adaptation' | 'equipment' | 'mulligans' | 'collection';
  label: string;
  nav: string; // Hub nav key (src/ui/navModel.ts) — the jump target
  kind: 'buy' | 'tend';
  move: AtlasMove | null; // best next action; null when nothing is open
  readyCount: number; // actions the player can take RIGHT NOW (affordable buys / free picks / empty slots)
  note: string; // one status line, always present
}

export interface PowerAtlasModel {
  score: number;
  slices: PowerSlice[]; // the six model buckets (log-share attribution) — the share bar
  systems: AtlasSystem[];
  /** The single biggest affordable Power gain across every system — "best move now". */
  headline: { system: AtlasSystem; move: AtlasMove } | null;
}

function buyRow(
  save: SaveData,
  id: AtlasSystem['id'] & ('towers' | 'heroes' | 'evolution' | 'genes'),
  label: string,
  nav: string,
  emptyNote: string,
): AtlasSystem {
  const { best, bestAffordable, ranked } = bestPurchase(save, id);
  const pick = bestAffordable ?? best;
  const readyCount = ranked.filter((c) => c.affordable).length;
  return {
    id, label, nav, kind: 'buy',
    move: pick ? { label: pick.label, price: pick.buyLabel, powerDelta: pick.powerDelta, affordable: pick.affordable } : null,
    readyCount,
    note: pick ? (readyCount > 0 ? `${readyCount} affordable now` : 'save up — best value shown') : emptyNote,
  };
}

export function powerAtlas(save: SaveData): PowerAtlasModel {
  const { score, slices } = powerBreakdown(save);
  const systems: AtlasSystem[] = [];

  systems.push(buyRow(save, 'towers', 'Tower Evolution', 'towers', 'all strains maxed or capped'));
  systems.push(buyRow(save, 'heroes', 'Champions', 'heroes', 'roster fully evolved'));
  systems.push(buyRow(save, 'evolution', 'Evolution HQ', 'evolution', 'every upgrade maxed'));
  systems.push(buyRow(save, 'genes', 'Gene Archive', 'genes', 'draft cards in runs to open upgrades'));

  // Adaptation — free banked Antigen points; picks are exact scorer diffs (0 ⇒ behavioral rewrite).
  const freeAntigen = adaptableUnits(save).reduce((n, u) => n + u.free, 0);
  const topPick = freeAntigen > 0 ? adaptationPicks(save, 1)[0] ?? null : null;
  systems.push({
    id: 'adaptation', label: 'Adaptation', nav: 'adaptation', kind: 'buy',
    move: topPick ? { label: `${topPick.unitName} — ${topPick.nodeName}`, price: '1 Antigen pick', powerDelta: topPick.powerDelta, affordable: true } : null,
    readyCount: freeAntigen,
    note: freeAntigen > 0 ? `${freeAntigen} free Antigen ready` : 'earn Antigen from Mastery Ranks and the campaign',
  });

  // Equipment — gear comes from drops, but EQUIPPING is a free exact move: the equip advisor
  // (state/equipAdvisor.ts) finds strictly-better vault pieces for every fielded hero, so free
  // upgrades compete for the headline against paid buys. Falls back to the empty-slot count.
  const gear = equipUpgrades(save, 8);
  const fielded = fieldedLoadout(save);
  let emptySlots = 0;
  for (const k of fielded) for (const uid of Object.values(loadoutOf(save, k))) if (!uid) emptySlots++;
  const gp = gear[0] ?? null;
  systems.push({
    id: 'equipment', label: 'Equipment', nav: 'equipment', kind: 'tend',
    move: gp ? { label: `Equip ${gp.itemName} — ${gp.heroName}`, price: 'free', powerDelta: gp.powerDelta, affordable: true } : null,
    readyCount: gear.length,
    note: gp
      ? `${gear.length} free gear upgrade${gear.length === 1 ? '' : 's'} in the vault`
      : emptySlots > 0 ? `${emptySlots} fielded gear slot${emptySlots === 1 ? '' : 's'} empty` : 'loadouts full — hunt higher rarity',
  });

  // Mulligans — organisms do nothing until all slots fill; the status is completion across strains.
  const unlockedTowers = TOWER_ORDER.filter((k) => isTowerUnlocked(save, k));
  const complete = unlockedTowers.filter((k) => (save.mulligans?.[k]?.slots ?? []).filter(Boolean).length >= MULLIGAN_SLOTS).length;
  systems.push({
    id: 'mulligans', label: 'Mulligans', nav: 'mulligans', kind: 'tend',
    move: null, readyCount: 0,
    note: `${complete}/${unlockedTowers.length} tower organisms complete`,
  });

  // Archive — completion is play-earned; show the honest percent.
  const cv = collectionView(collectionContextOf(save));
  systems.push({
    id: 'collection', label: 'Archive', nav: 'collection', kind: 'tend',
    move: null, readyCount: 0,
    note: `${Math.round(cv.completion * 100)}% assimilated · discover specimens to compound Power`,
  });

  // Best move now = the biggest AFFORDABLE exact gain anywhere (powerDelta is currency-free,
  // so cross-system comparison is honest — unlike per-1k value, which stays per-surface).
  let headline: PowerAtlasModel['headline'] = null;
  for (const sys of systems) {
    if (sys.move && sys.move.affordable && sys.move.powerDelta > 0 && (!headline || sys.move.powerDelta > headline.move.powerDelta)) {
      headline = { system: sys, move: sys.move };
    }
  }
  return { score, slices, systems, headline };
}
