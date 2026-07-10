// Mulligan Lab — the pure READ-MODEL behind the player equip screen (docs/MULLIGANS.md §UI). It
// turns a save into everything the UI paints (per-tower slots, owned modifiers, costs, affordability)
// so the React layer stays dumb. All MUTATIONS go through the meta store pipeline (equip / upgrade /
// ascend / unequip); this module never writes. Pure + testable headlessly.

import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import {
  MULLIGAN_GATE_MEGAS, MULLIGAN_RARITY, adaptationOf, ascendCost, dominantAxis, isMaxLevel, levelCap,
  modifierHost, mulliganRegistry, nextRarity, reforgeSlotCount, resolveMulligan, upgradeCost,
} from '../core/mulligan';
import { COMBAT_CLASSES } from '../core/combatClass';
import type { CombatClass } from '../core/types';
import type { AdaptationTier } from '../core/mulligan';
import { REFORGE_RARITY, reforgeCost, reforgeModById } from '../core/mulliganReforge';
import type { MulliganAxis, MulliganRarity, ResolvedMulligan } from '../core/mulligan';
import type { TowerKind } from '../core/types';
import type { SaveData } from '../save/saveStore';

export interface SlotView {
  index: number;
  filled: boolean;
  id?: string;
  name?: string;
  desc?: string; // what the modifier does, in player words (shown on the slot card)
  category?: 'offensive' | 'utility' | 'biological';
  /** §classes — the modifier's biological class + whether it matches the HOST tower's. */
  cls?: CombatClass;
  clsGlyph?: string;
  clsColor?: string;
  clsMatch?: boolean;
  rarity?: MulliganRarity;
  rarityColor?: string;
  level?: number;
  maxLevel?: number;
  maxed?: boolean;
  upgradeCost?: number; // Gene Essence to +1 level (absent when maxed)
  canAfford?: boolean; // upgrade affordable now
  ascendable?: boolean; // maxed + a higher rarity exists + affordable
  ascendCost?: number | null;
  nextRarity?: MulliganRarity | null; // the rarity an ascend would reach (null at the apex)
}

export interface TowerMulliganView {
  kind: TowerKind;
  name: string;
  color: string;
  active: boolean; // all three slots filled
  filled: number; // slots holding a modifier (0..3) — the rail + dormancy copy read this
  power: number; // this organism's Power multiplier (≥1)
  dominant: MulliganAxis | ''; // the organism's identity axis ('' until active)
  packageLines: string[]; // the resolved stat package, display-ready ([] until active)
  /** §adaptations — the host-class synergy read (docs/MULLIGANS.md §adaptations). */
  hostClass: CombatClass;
  hostGlyph: string;
  hostColor: string;
  adaptation: {
    matches: number; // 0..3 host-class modifiers grafted (counts while assembling)
    tier: AdaptationTier | null; // full / minor / null — only while ACTIVE
    title: string; // the adaptation's ceremony name
    activeDesc: string | null; // the RUNNING bonus line (null when no tier)
    goalDesc: string; // the full-adaptation payoff (the chase copy)
  };
  slots: SlotView[];
  /** §reforge — the organism is permanently bound to this host (first wheel spin). */
  locked: boolean;
  /** §reforge — the wheel bay: usable slots (1–3 by combined graft rarity) + their state. */
  reforge: {
    usable: number;
    slots: { index: number; cost: number; affordable: boolean; mod: { id: string; name: string; desc: string; rarity: string; color: string } | null }[];
  };
}

export interface OwnedModifier {
  id: string;
  name: string;
  category: 'offensive' | 'utility' | 'biological';
  /** §classes — chrome the library card wears. */
  cls: CombatClass;
  clsGlyph: string;
  clsColor: string;
  role: string; // the class's one-line gameplay identity ("what role does this fill?")
  rarity: MulliganRarity; // best discovered rarity (equip ceiling)
  rarityColor: string;
  desc: string;
  powerWeight: number; // the def's flat Power vehicle (sorting)
  dexIndex: number; // discovery order (the dex preserves insertion — "Newest" sorts on this)
  /** Hosted-slot live state (0 / false when unhosted). */
  level: number;
  upgradeable: boolean; // hosted, not maxed, and affordable right now
  /** §exclusivity — the tower currently wearing this piece (equipping elsewhere MOVES it). */
  host: TowerKind | null;
  hostName: string | null;
  /** The piece is grafted into a reforge-LOCKED organism — it can never move again. */
  bound: boolean;
}

export interface MulliganLabView {
  essence: number; // Gene Essence balance (the unified gene currency — cards AND modifiers)
  ichor: number; // the reforge wheel's fuel
  discovered: number;
  total: number; // total modifiers in the registry
  towers: TowerMulliganView[];
  owned: OwnedModifier[]; // discovered modifiers, sorted by rarity then name
  /** §gate — the pillar opens after MULLIGAN_GATE_MEGAS distinct Mega Boss kills. */
  unlocked: boolean;
  gate: { slain: number; needed: number };
}

function slotView(save: SaveData, kind: TowerKind, index: number): SlotView {
  const slot = save.mulligans?.[kind]?.slots?.[index] ?? null;
  if (!slot) return { index, filled: false };
  const def = mulliganRegistry.get(slot.id);
  const maxed = isMaxLevel(slot);
  const cost = maxed ? undefined : upgradeCost(slot.rarity, slot.level);
  const asc = maxed ? ascendCost(slot.rarity) : null;
  const hostCls = TOWER_DEFS[kind].combatClass;
  return {
    index,
    filled: true,
    id: slot.id,
    name: def?.name ?? slot.id,
    desc: def?.desc,
    category: def?.category,
    cls: def?.cls,
    clsGlyph: def ? COMBAT_CLASSES[def.cls].glyph : undefined,
    clsColor: def ? COMBAT_CLASSES[def.cls].color : undefined,
    clsMatch: def ? def.cls === hostCls : undefined,
    rarity: slot.rarity,
    rarityColor: MULLIGAN_RARITY[slot.rarity].color,
    level: slot.level,
    maxLevel: levelCap(slot.rarity),
    maxed,
    upgradeCost: cost,
    canAfford: cost !== undefined && save.geneEssence >= cost,
    ascendable: maxed && !!nextRarity(slot.rarity) && asc != null && save.geneEssence >= asc,
    ascendCost: asc,
    nextRarity: nextRarity(slot.rarity),
  };
}

/** The resolved organism's stat package as display lines (mirrors the Inspector's format). */
function packageLines(r: ResolvedMulligan): string[] {
  if (!r.active) return [];
  const pct = (v: number): string => `+${Math.round((v - 1) * 100)}%`;
  return [
    r.damageMult > 1 && `${pct(r.damageMult)} damage`,
    r.fireRateMult > 1 && `${pct(r.fireRateMult)} fire rate`,
    r.rangeMult > 1 && `${pct(r.rangeMult)} range`,
    r.splashMult > 1 && `${pct(r.splashMult)} splash`,
    r.extraProjectiles > 0 && `+${r.extraProjectiles} projectile${r.extraProjectiles > 1 ? 's' : ''}`,
  ].filter((x): x is string => !!x);
}

/** The whole Lab view for a save. */
export function mulliganLabView(save: SaveData): MulliganLabView {
  const towers: TowerMulliganView[] = TOWER_ORDER.map((kind) => {
    const st = save.mulligans?.[kind];
    const resolved = resolveMulligan(st, TOWER_DEFS[kind].combatClass);
    const slots = [0, 1, 2].map((i) => slotView(save, kind, i));
    const usable = reforgeSlotCount(st);
    const hostClass = TOWER_DEFS[kind].combatClass;
    const adapt = adaptationOf(st, hostClass);
    return {
      kind,
      name: TOWER_DEFS[kind].name,
      color: TOWER_DEFS[kind].color,
      active: resolved.active,
      filled: slots.filter((s) => s.filled).length,
      power: resolved.power,
      dominant: dominantAxis(resolved.profile),
      packageLines: packageLines(resolved),
      hostClass,
      hostGlyph: COMBAT_CLASSES[hostClass].glyph,
      hostColor: COMBAT_CLASSES[hostClass].color,
      adaptation: {
        matches: adapt.matches,
        tier: adapt.tier,
        title: adapt.adaptation.title,
        activeDesc: adapt.tier === 'full' ? adapt.adaptation.fullDesc : adapt.tier === 'minor' ? adapt.adaptation.minorDesc : null,
        goalDesc: adapt.adaptation.fullDesc,
      },
      slots,
      locked: st?.locked === true,
      reforge: {
        usable,
        slots: Array.from({ length: usable }, (_, i) => {
          const id = st?.reforges?.[i] ?? null;
          const def = id ? reforgeModById(id) : undefined;
          const cost = reforgeCost(i);
          return {
            index: i, cost, affordable: (save.ichor ?? 0) >= cost,
            mod: def ? { id: def.id, name: def.name, desc: def.desc, rarity: REFORGE_RARITY[def.rarity].label, color: REFORGE_RARITY[def.rarity].color } : null,
          };
        }),
      },
    };
  });
  const dex = save.mulliganDex ?? {};
  const owned: OwnedModifier[] = Object.entries(dex)
    .map(([id, rarity], dexIndex) => {
      const def = mulliganRegistry.get(id);
      if (!def) return null;
      const host = modifierHost(save.mulligans ?? {}, id) as TowerKind | null;
      const hostedSlot = host ? save.mulligans[host]?.slots?.find((sl) => sl?.id === id) ?? null : null;
      const cmeta = COMBAT_CLASSES[def.cls];
      return {
        id, name: def.name, category: def.category, rarity, rarityColor: MULLIGAN_RARITY[rarity].color, desc: def.desc,
        cls: def.cls, clsGlyph: cmeta.glyph, clsColor: cmeta.color, role: cmeta.role,
        powerWeight: def.powerWeight, dexIndex,
        level: hostedSlot?.level ?? 0,
        upgradeable: !!hostedSlot && !isMaxLevel(hostedSlot) && save.geneEssence >= upgradeCost(hostedSlot.rarity, hostedSlot.level),
        host, hostName: host ? TOWER_DEFS[host].name : null,
        bound: !!host && save.mulligans[host]?.locked === true,
      };
    })
    .filter((x): x is OwnedModifier => !!x)
    .sort((a, b) => MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier || a.name.localeCompare(b.name));
  const slainMegas = save.megaProgress?.slain?.length ?? 0;
  return {
    essence: save.geneEssence ?? 0,
    ichor: save.ichor ?? 0,
    discovered: owned.length,
    total: mulliganRegistry.size,
    towers,
    owned,
    unlocked: slainMegas >= MULLIGAN_GATE_MEGAS || owned.length > 0,
    gate: { slain: slainMegas, needed: MULLIGAN_GATE_MEGAS },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §recommendations — rank the library for ONE host (docs/MULLIGANS.md §recommendations).
// The score prefers, in order: completing the host's Complete Class Adaptation, class
// matches in general, higher discovered rarity (Power), and free (unhosted) pieces over
// stealing from another organism. Pure — the UI highlights the top picks.
// ─────────────────────────────────────────────────────────────────────────────
export interface ModifierRecommendation {
  id: string;
  score: number;
  reason: string; // one line the highlight tooltip shows
}

export function recommendModifiers(save: SaveData, kind: TowerKind, n = 3): ModifierRecommendation[] {
  const hostCls = TOWER_DEFS[kind].combatClass;
  const st = save.mulligans?.[kind];
  const equipped = new Set((st?.slots ?? []).filter((sl) => !!sl).map((sl) => sl!.id));
  const matchesNow = (st?.slots ?? []).filter((sl) => sl && mulliganRegistry.get(sl.id)?.cls === hostCls).length;
  const openSites = 3 - equipped.size;
  const rows: ModifierRecommendation[] = [];
  for (const [id, rarity] of Object.entries(save.mulliganDex ?? {})) {
    const def = mulliganRegistry.get(id);
    if (!def || equipped.has(id)) continue;
    const host = modifierHost(save.mulligans ?? {}, id) as TowerKind | null;
    if (host && save.mulligans[host]?.locked) continue; // bound pieces can never move
    const match = def.cls === hostCls;
    // Would this piece finish the FULL adaptation? (all open sites filled by matches)
    const completes = match && openSites > 0 && matchesNow + 1 === 3 && openSites === 1;
    let score = MULLIGAN_RARITY[rarity].tier + def.powerWeight * 10;
    if (match) score += 4;
    if (completes) score += 8;
    if (!host) score += 1.5; // free pieces beat stealing
    const reason = completes
      ? `Completes the ${hostCls} Adaptation`
      : match
        ? `${hostCls} match — builds toward the full Adaptation`
        : `High-value graft (${MULLIGAN_RARITY[rarity].label})`;
    rows.push({ id, score, reason });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, n);
}
