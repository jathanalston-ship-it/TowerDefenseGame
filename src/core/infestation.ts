// INFESTATION MAP (docs/INFESTATION.md) — the persistent conquest meta. A hive-map of
// four REGIONS × four SECTORS; every finished run FEEDS infestation into a target sector
// (wave-scaled; losses feed at half), regions pay a passive account bonus scaled by how
// infested they are, and neglect DECAYS — the organism must be fed.
//
// TIME DISCIPLINE: decay is LAZY — sectors store {level, updatedAt} and every read
// resolves the effective level from wall-clock days elapsed. Nothing ticks, nothing runs
// offline, and every function takes `now` so tests never sleep. The SIM never reads any
// of this; bonuses fold into runs as ordinary run effects (like gear/trophies).

import type { CardEffect, RunModNumberKey } from './cards';
import type { DoctrineWarp } from './doctrines';
import type { PassReward } from './battlePass';

export interface SectorDef {
  id: string;
  name: string;
}

export interface RegionDef {
  id: string;
  name: string;
  blurb: string;
  accent: string; // hex for the board UI
  sectors: SectorDef[];
  /** The region's passive at FULL infestation (all four sectors at 100). */
  bonus: { field: RunModNumberKey; max: number; label: string };
}

export const REGIONS: RegionDef[] = [
  {
    id: 'fringe', name: 'Cordyceps Fringe', accent: '#7fe07a',
    blurb: 'The soft outskirts — every spore that lands here feeds the economy.',
    sectors: [
      { id: 'fringe_meadow', name: 'Sporefall Meadow' }, { id: 'fringe_mire', name: 'Rotwood Mire' },
      { id: 'fringe_terrace', name: 'Bloom Terraces' }, { id: 'fringe_delta', name: 'Mycel Delta' },
    ],
    bonus: { field: 'biomassMult', max: 1.08, label: 'Biomass' },
  },
  {
    id: 'reach', name: 'Calcified Reach', accent: '#9ecbff',
    blurb: 'Old bone-fields — infestation here hardens every strain the hive grows.',
    sectors: [
      { id: 'reach_spine', name: 'Spine Rows' }, { id: 'reach_quarry', name: 'Marrow Quarry' },
      { id: 'reach_cliffs', name: 'Chitin Cliffs' }, { id: 'reach_ossuary', name: 'The Ossuary' },
    ],
    bonus: { field: 'towerDamageMult', max: 1.06, label: 'Tower Damage' },
  },
  {
    id: 'basin', name: 'Neural Basin', accent: '#c98bff',
    blurb: 'A drowned cortex — champions who fight over it strike with borrowed instinct.',
    sectors: [
      { id: 'basin_synapse', name: 'Synapse Shallows' }, { id: 'basin_cortex', name: 'Cortex Deep' },
      { id: 'basin_stem', name: 'Stem Channels' }, { id: 'basin_dream', name: 'Dreaming Floor' },
    ],
    bonus: { field: 'heroDamageMult', max: 1.08, label: 'Hero Damage' },
  },
  {
    id: 'fields', name: 'Marrow Fields', accent: '#ffb84d',
    blurb: 'The fat of the land — a fed field pays its keeper in fire.',
    sectors: [
      { id: 'fields_granary', name: 'Red Granary' }, { id: 'fields_orchard', name: 'Vein Orchard' },
      { id: 'fields_silo', name: 'Silo Warrens' }, { id: 'fields_reservoir', name: 'Ichor Reservoir' },
    ],
    bonus: { field: 'towerFireRateMult', max: 1.05, label: 'Fire Rate' },
  },
];

export const SECTOR_CAP = 100; // full infestation per sector
export const DECAY_PER_DAY = 2; // points a neglected sector loses per real day
export const GAIN_PER_WAVE = 2; // infestation points per wave cleared (wins; losses half)
export const GAIN_CAP_PER_RUN = 40; // one run can't paint a sector alone
/** A sector WRITTEN at full cap decays at half rate — saturation entrenches (docs §tiers). */
export const SATURATED_DECAY_MULT = 0.5;
/** A region at (effectively) full infestation pays its bonus portion ×this — the set payoff. */
export const ENTRENCH_MULT = 1.25;
const ENTRENCH_AT = 0.995; // float-tolerant "all four saturated"

// ── Sector TIERS — named thresholds the map + warnings speak in (docs §tiers). ──
/** Saturated starts a hair under the cap: a sector WRITTEN at 100 decays past exactly-100
 *  within seconds, so a strict threshold would make the top tier a split-second state. At
 *  99.5 (half-rate decay ⇒ ~½ day of hold per cap write) Saturated is a real, maintainable
 *  band — THE FRONT's tier claims and tribute count on it (docs/INFESTATION.md §front). */
export const SATURATED_AT = 99.5;
export const SECTOR_TIERS = [
  { at: 0, name: 'Dormant' },
  { at: 1, name: 'Foothold' },
  { at: 35, name: 'Colony' },
  { at: 70, name: 'Stronghold' },
  { at: SATURATED_AT, name: 'Saturated' },
] as const;

export interface SectorTier {
  index: number; // 0..4 into SECTOR_TIERS
  name: string;
  /** The next tier up, or null at Saturated. */
  next: { at: number; name: string } | null;
}

export function tierOf(level: number): SectorTier {
  let index = 0;
  for (let i = 0; i < SECTOR_TIERS.length; i++) if (level >= SECTOR_TIERS[i].at && (i === 0 || level > 0)) index = i;
  const nxt = index < SECTOR_TIERS.length - 1 ? SECTOR_TIERS[index + 1] : null;
  return { index, name: SECTOR_TIERS[index].name, next: nxt ? { at: nxt.at, name: nxt.name } : null };
}

export const ALL_SECTORS: SectorDef[] = REGIONS.flatMap((r) => r.sectors);

export function regionOfSector(sectorId: string): RegionDef | undefined {
  return REGIONS.find((r) => r.sectors.some((s) => s.id === sectorId));
}

export interface SectorState {
  level: number; // stored level at updatedAt (0..SECTOR_CAP)
  updatedAt: number; // wall-clock ms of the last write
}

/** A sector's live decay rate: saturation (written at cap) entrenches — half speed. */
export function decayRateOf(s: SectorState | undefined): number {
  return s && s.level >= SECTOR_CAP ? DECAY_PER_DAY * SATURATED_DECAY_MULT : DECAY_PER_DAY;
}

/** Resolve a sector's LIVE level: stored minus lazy decay for the days since last feed. */
export function effectiveLevel(s: SectorState | undefined, now: number): number {
  if (!s) return 0;
  const days = Math.max(0, (now - s.updatedAt) / 86_400_000);
  return Math.max(0, Math.min(SECTOR_CAP, s.level - days * decayRateOf(s)));
}

/** Days until a sector's live level drains to zero (null when already empty). */
export function zeroInDays(s: SectorState | undefined, now: number): number | null {
  const lvl = effectiveLevel(s, now);
  return lvl <= 0 ? null : lvl / decayRateOf(s);
}

/** Days until the sector DROPS OUT of its current tier (null when Dormant / tierless). */
export function tierHoldDays(s: SectorState | undefined, now: number): number | null {
  const lvl = effectiveLevel(s, now);
  const t = tierOf(lvl);
  if (t.index === 0) return null;
  const floor = SECTOR_TIERS[t.index].at;
  return Math.max(0, (lvl - floor) / decayRateOf(s));
}

/** The infestation a finished run feeds its target (wins full rate, losses half). */
export function runInfestGain(wave: number, won: boolean): number {
  return Math.min(GAIN_CAP_PER_RUN, Math.max(0, Math.round(wave * GAIN_PER_WAVE * (won ? 1 : 0.5))));
}

/** A region's live completion fraction (0..1) from its sectors' effective levels. */
export function regionFraction(region: RegionDef, sectors: Record<string, SectorState | undefined>, now: number): number {
  const total = region.sectors.reduce((a, s) => a + effectiveLevel(sectors[s.id], now), 0);
  return total / (region.sectors.length * SECTOR_CAP);
}

/** Every region's passive, scaled by its live fraction — ×1 everywhere on a fresh save.
 *  An ENTRENCHED region (all four sectors saturated) pays its bonus portion ×ENTRENCH_MULT. */
export function infestationEffects(sectors: Record<string, SectorState | undefined>, now: number): CardEffect[] {
  const out: CardEffect[] = [];
  for (const r of REGIONS) {
    const frac = regionFraction(r, sectors, now);
    if (frac <= 0) continue;
    const entrench = frac >= ENTRENCH_AT ? ENTRENCH_MULT : 1;
    out.push({ op: 'mul', field: r.bonus.field, value: 1 + (r.bonus.max - 1) * frac * entrench });
  }
  return out;
}

/** True when a region is entrenched (paying its ×ENTRENCH_MULT overdrive). */
export function isEntrenched(region: RegionDef, sectors: Record<string, SectorState | undefined>, now: number): boolean {
  return regionFraction(region, sectors, now) >= ENTRENCH_AT;
}

/** A pin target may be a SECTOR id, a REGION id (feed its emptiest sector), or null (spread). */
export function isValidInfestTarget(id: string): boolean {
  return ALL_SECTORS.some((x) => x.id === id) || REGIONS.some((r) => r.id === id);
}

const emptiestOf = (pool: SectorDef[], sectors: Record<string, SectorState | undefined>, now: number): string =>
  pool.reduce((lo, x) => (effectiveLevel(sectors[x.id], now) < effectiveLevel(sectors[lo.id], now) ? x : lo), pool[0]).id;

/** Resolve where a run's infestation lands: pinned sector → itself; pinned region → its
 *  emptiest sector; null/junk → the emptiest sector on the whole map. */
export function resolveFeedTarget(target: string | null, sectors: Record<string, SectorState | undefined>, now: number): string {
  if (target) {
    if (ALL_SECTORS.some((x) => x.id === target)) return target;
    const region = REGIONS.find((r) => r.id === target);
    if (region) return emptiestOf(region.sectors, sectors, now);
  }
  return emptiestOf(ALL_SECTORS, sectors, now);
}

/** Feed `gain` points into a target with SPILLOVER (docs §spillover): overflow past the cap
 *  pours into the emptiest sector of the SAME region, then the emptiest anywhere — no point
 *  is wasted until the entire map is saturated. Pure; returns the fed ledger for the UI. */
export function feedInfestation(
  sectors: Record<string, SectorState | undefined>,
  targetId: string,
  gain: number,
  now: number,
): { sectors: Record<string, SectorState>; fed: { id: string; amount: number }[] } {
  const next: Record<string, SectorState> = {};
  for (const [id, st] of Object.entries(sectors)) if (st) next[id] = st;
  const fed: { id: string; amount: number }[] = [];
  let remaining = gain;
  let cursor: string | null = targetId;
  for (let hops = 0; remaining > 0 && cursor && hops < ALL_SECTORS.length + 1; hops++) {
    const cur = effectiveLevel(next[cursor], now);
    const room = SECTOR_CAP - cur;
    const put = Math.min(room, remaining);
    if (put > 0) {
      next[cursor] = { level: Math.min(SECTOR_CAP, cur + put), updatedAt: now };
      fed.push({ id: cursor, amount: put });
      remaining -= put;
    }
    if (remaining <= 0) break;
    // Overflow: same region first, then anywhere — skipping already-full sectors.
    const region = regionOfSector(cursor);
    const inRegion = region ? region.sectors.filter((x) => effectiveLevel(next[x.id], now) < SECTOR_CAP) : [];
    const anywhere = ALL_SECTORS.filter((x) => effectiveLevel(next[x.id], now) < SECTOR_CAP);
    cursor = inRegion.length > 0 ? emptiestOf(inRegion, next, now) : anywhere.length > 0 ? emptiestOf(anywhere, next, now) : null;
  }
  return { sectors: next, fed };
}

// ═══ THE FRONT (docs/INFESTATION.md §front, 2026-07) — territory that pays, attacks back, and
// deploys. The overhaul that makes the map MATTER: held tiers mint one-time CLAIMS, held
// ground pays a weekly regional TRIBUTE (localized wallets — docs/ECONOMY.md §localized), a
// daily HOTSPOT concentrates feeds, INCURSIONS bite neglected strongholds, and DEPLOY
// composes a small region warp onto the run at game.ts's single warp fold site (absent ⇒
// identity — golden-safe, like vows). Everything here stays pure and lazy: day/week keys
// arrive as arguments, meta owns every write. ═══

/** Deterministic uint hash for day-keyed rotation (djb2 — matches the save checksum family). */
function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ── Deploy warps — hazard-up + reward-up regional flavor (every field inside [0.9, 1.2]).
//    Composed ONLY on an explicit Deploy (state/frontDeploy.ts arms one run); dailies and
//    the Arena never carry them (fair shared boards). ──
export const REGION_WARPS: Record<string, { warp: DoctrineWarp; blurb: string }> = {
  fringe: { warp: { countMult: 1.08, bountyMult: 1.12 }, blurb: 'Swollen spore economy — thicker waves, richer bounties.' },
  reach: { warp: { hpMult: 1.12, rewardMult: 1.06 }, blurb: 'Calcified foes — harder shells, better salvage.' },
  basin: { warp: { speedMult: 1.08, rewardMult: 1.06 }, blurb: 'Borrowed instinct — faster prey, keener spoils.' },
  fields: { warp: { countMult: 1.15, hpMult: 0.95, bountyMult: 1.05 }, blurb: 'The fat of the land — swarming, softer, and generous.' },
};

/** The warp a deploy into `sectorId` fights under (undefined for junk ids — no reshaping). */
export function deployWarp(sectorId: string): DoctrineWarp | undefined {
  const region = regionOfSector(sectorId);
  return region ? REGION_WARPS[region.id]?.warp : undefined;
}

// ── Tier claims — one-time spoils per sector per named tier (Colony / Stronghold / Saturated).
//    Region-flavored into the LOCALIZED wallets: the Fringe pays Chitin (the Hive build
//    wallet), the Reach pays strain, the Basin pays apex, the Fields pay the account wallet.
//    One-time CONTENT (like achievements), not income — the sim bounds the full-map total. ──
export const CLAIMABLE_TIERS = [2, 3, 4] as const; // indexes into SECTOR_TIERS (Colony+)

export function tierReward(regionId: string, tierIndex: number): PassReward[] {
  const saturatedBonus: PassReward[] = tierIndex >= 4 ? [{ kind: 'container', rarity: 'rare', count: 1 }] : [];
  switch (regionId) {
    case 'fringe': return [{ kind: 'hiveMats', qty: tierIndex === 2 ? 40 : tierIndex === 3 ? 90 : 150 }, ...saturatedBonus];
    case 'reach': return [{ kind: 'towerShardsAll', qtyEach: tierIndex === 2 ? 2 : tierIndex === 3 ? 4 : 6 }, ...saturatedBonus];
    case 'basin': return [{ kind: 'heroShardsAll', qtyEach: tierIndex === 2 ? 2 : tierIndex === 3 ? 3 : 5 }, ...saturatedBonus];
    default: return [{ kind: 'cores', qty: tierIndex === 2 ? 120 : tierIndex === 3 ? 260 : 400 }, ...saturatedBonus];
  }
}

// ── Weekly tribute — held ground pays its keeper (claimed on the map, once per ISO week). ──
/** Σ of held tier indexes across a region (0..16) — the tribute scale. */
export function regionHeldTiers(region: RegionDef, sectors: Record<string, SectorState | undefined>, now: number): number {
  return region.sectors.reduce((a, s) => a + tierOf(effectiveLevel(sectors[s.id], now)).index, 0);
}

export const TRIBUTE_MIN_TIERS = 2; // something must actually be HELD before tribute flows
const TRIBUTE_MAX = 16; // four sectors at Saturated

/** The region's weekly tribute at `heldTiers` — base scaled by hold, zero rows dropped. */
export function tributeFor(regionId: string, heldTiers: number): PassReward[] {
  const frac = Math.max(0, Math.min(1, heldTiers / TRIBUTE_MAX));
  const rows: PassReward[] =
    regionId === 'fringe' ? [{ kind: 'hiveMats', qty: Math.round(60 * frac) }]
    : regionId === 'reach' ? [{ kind: 'towerShardsAll', qtyEach: Math.round(2 * frac) }]
    : regionId === 'basin' ? [{ kind: 'heroShardsAll', qtyEach: Math.round(2 * frac) }]
    : [{ kind: 'cores', qty: Math.round(120 * frac) }];
  return rows.filter((r) => ('qty' in r ? r.qty > 0 : 'qtyEach' in r ? r.qtyEach > 0 : true));
}

// ── The daily hotspot — "somewhere to be today": feeds into it land ×HOTSPOT_FEED_MULT. ──
export const HOTSPOT_FEED_MULT = 1.5;

export function hotspotSectorId(dayKey: string): string {
  return ALL_SECTORS[hashKey(`hot:${dayKey}`) % ALL_SECTORS.length].id;
}

// ── Incursions — decay with a face. Each day one held sector (Colony+) comes under attack;
//    a WON run that feeds it that day defends it. An undefended incursion BITES the sector
//    when the next day's first write resolves it. Deliberately bounded: only the most recent
//    unresolved day ever bites (a lapsed player returns to at most ONE bite + natural decay —
//    pressure, never a death spiral; sim-front pins it). ──
export const INCURSION_BITE = 12; // levels torn off an undefended sector
export const INCURSION_MIN_TIER = 2; // only real holdings are worth attacking

/** Today's incursion target, or null when nothing worth attacking is held. */
export function incursionSectorId(dayKey: string, sectors: Record<string, SectorState | undefined>, now: number): string | null {
  const eligible = ALL_SECTORS.filter((s) => tierOf(effectiveLevel(sectors[s.id], now)).index >= INCURSION_MIN_TIER);
  if (eligible.length === 0) return null;
  return eligible[hashKey(`inc:${dayKey}`) % eligible.length].id;
}

/** Resolve ONE past day's incursion: if `dayKey` had a target and it wasn't defended, the
 *  bite lands (eligibility approximated on current levels — documented; the map only moves
 *  a few points a day). Pure — returns the next sectors record + what was bitten. */
export function resolveIncursionBite(
  sectors: Record<string, SectorState | undefined>,
  dayKey: string,
  defenses: Record<string, string>,
  now: number,
): { sectors: Record<string, SectorState>; bitten: string | null } {
  const next: Record<string, SectorState> = {};
  for (const [id, st] of Object.entries(sectors)) if (st) next[id] = st;
  const target = incursionSectorId(dayKey, sectors, now);
  if (!target || defenses[dayKey] === target) return { sectors: next, bitten: null };
  const lvl = effectiveLevel(next[target], now);
  next[target] = { level: Math.max(0, lvl - INCURSION_BITE), updatedAt: now };
  return { sectors: next, bitten: target };
}
