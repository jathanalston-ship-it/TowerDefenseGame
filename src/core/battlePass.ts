// BATTLE PASS (docs/BATTLEPASS.md) — the rotating 100-level dual-track season built ON TOP of
// the Wardrobe (core/wardrobe.ts). PURE core: window math, the XP curve, season definitions,
// and the per-level reward tables. The meta layer owns persistence, claims, purchases and the
// XP faucets; the UI renders the track. No sim import — a fresh save earns 0 XP and owns no
// passive, so runs are byte-identical (golden-safe).
//
// FOUNDATIONAL CONTRACT — a future season is DATA, not engineering:
//   1. author its Wardrobe items with source {kind:'battlepass', season, level, track};
//   2. add a SeasonDef row (theme palette + music transform + passive rows + filler tuning);
//   3. push. The reward tables DERIVE cosmetic placement from the Wardrobe registry (one
//      source of truth — battlePass.test.ts fails if an item's slot and the table disagree),
//      the filler cadence fills every remaining level (NO empty levels, enforced), and the
//      rotation ring picks it up automatically. Holiday/collab passes are the same three steps.
//
// ECONOMY LAW (state/battlePassEconomy.test.ts): the premium track's total Ichor refund is a
// FRACTION of the premium price — completing a pass can never fund the next one. Permanent
// passives are earned ONCE ever; on repeat rotations their levels pay currency replacements.
// Only the level-100 free "Perennial Bloom" stack repeats — an intentionally tiny (+0.4%
// biomass) infinitely-stackable trophy for players who complete every season.

import type { WardrobeItemDef } from './wardrobe';
import { seasonItems, wardrobeItem } from './wardrobe';

// ── Config ─────────────────────────────────────────────────────────────────────
export const BP = {
  levels: 100,
  /** Seasons rotate every two weeks, counted from a fixed UTC epoch (a Monday). */
  rotationMs: 14 * 86_400_000,
  epochMs: Date.UTC(2026, 6, 6), // 2026-07-06T00:00Z
  /** Premium unlock price in Ichor (≈ the $9.99 bundle at the store's 25 Ichor/$ anchor —
   *  rebalanced from the 1500 draft, which would have priced Premium at ~$60; docs §pricing). */
  premiumIchor: 250,
  /** Buying a level with Ichor: base + a shallow ramp (late levels cost more to skip). */
  levelIchorBase: 15,
  levelIchorRampPer10: 2,
  /** Rewarded-ad level advances per UTC day (provider builds only — ads/provider.ts rules). */
  adLevelsPerDay: 1,
  /** Premium-track levels FREE players may claim — the taste of the paid lane. */
  freePremiumLevels: [1, 50, 99] as readonly number[],
  /** XP to go from level n-1 → n: base + growth×(n-1). Total for 100 levels ≈ 61,700 —
   *  tuned so a casual (≈2 runs/day) free player lands near level ~57 and a heavy player
   *  completes around day 9 of 14 (state/battlePassEconomy.test.ts pins the archetypes). */
  xpBase: 320,
  xpGrowth: 6,
  /** The infinitely-stackable completion trophy: +0.4% biomass per completed season. */
  stackBiomassPerStack: 0.004,
  /** Currency paid in place of an already-owned permanent/cosmetic on repeat rotations. */
  repeatReplacement: { ichor: 15, cores: 120 },
} as const;

// ── Window math (max-window tamper rule lives in meta, mirroring the markets) ──
export function passWindow(now: number): number {
  return Math.max(0, Math.floor((now - BP.epochMs) / BP.rotationMs));
}
export function msToPassEnd(now: number): number {
  return BP.epochMs + (passWindow(now) + 1) * BP.rotationMs - now;
}

// ── XP curve ───────────────────────────────────────────────────────────────────
/** XP required to climb FROM level-1 TO level (1-based). */
export function xpForLevel(level: number): number {
  return BP.xpBase + BP.xpGrowth * (Math.max(1, level) - 1);
}
/** Total XP from 0 → `level`. */
export function xpToReach(level: number): number {
  let sum = 0;
  for (let l = 1; l <= Math.min(level, BP.levels); l++) sum += xpForLevel(l);
  return sum;
}
/** Level for a raw XP total (0..100) + progress into the next level. */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let rest = Math.max(0, xp);
  while (level < BP.levels && rest >= xpForLevel(level + 1)) {
    rest -= xpForLevel(level + 1);
    level++;
  }
  return { level, into: level >= BP.levels ? 0 : rest, need: level >= BP.levels ? 0 : xpForLevel(level + 1) };
}
/** Ichor price to buy ONE level starting from `level` (0-based current). */
export function levelBuyPrice(level: number): number {
  return BP.levelIchorBase + Math.floor(level / 10) * BP.levelIchorRampPer10;
}

// ── Permanent passives — tiny, economy-leaning, once-per-account ───────────────
// Effects (fold into runs like gear) stay on the FREE track and microscopic; premium
// permanents are ECONOMY-ONLY levers (docs §no-pay-to-win). All spelled here as data.
export interface PassPassiveDef {
  id: string;
  name: string;
  desc: string;
  effect?: { field: 'biomassMult' | 'towerDamageMult' | 'towerFireRateMult'; value: number }; // multiplicative
  econ?: { key: 'towerXpMult' | 'heroXpMult' | 'bossLootMult' | 'campaignRewardMult' | 'lootQualityTier'; value: number }; // additive lever
}

export const PASS_PASSIVES: PassPassiveDef[] = [
  // Season 1 — Crimson Bloom · free track (levels 12/32/52/72/92)
  { id: 'bp1_f_biomass', name: 'Rootstock', desc: '+1% biomass income, forever.', effect: { field: 'biomassMult', value: 1.01 } },
  { id: 'bp1_f_towerxp', name: 'Trained Reflex', desc: '+3% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.03 } },
  { id: 'bp1_f_heroxp', name: 'Field Promotion', desc: '+3% hero XP.', econ: { key: 'heroXpMult', value: 0.03 } },
  { id: 'bp1_f_damage', name: 'Thorn Memory', desc: '+0.5% tower damage, forever.', effect: { field: 'towerDamageMult', value: 1.005 } },
  { id: 'bp1_f_bossloot', name: 'Trophy Sense', desc: '+2% boss loot.', econ: { key: 'bossLootMult', value: 0.02 } },
  // Season 1 · premium track (economy-only; levels 6/16/26/36/46/56/66/76/86/96)
  { id: 'bp1_p_campaign', name: 'Bloom Logistics', desc: '+2% campaign rewards.', econ: { key: 'campaignRewardMult', value: 0.02 } },
  { id: 'bp1_p_towerxp', name: 'Crimson Doctrine', desc: '+4% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.04 } },
  { id: 'bp1_p_heroxp', name: 'Champion’s Diet', desc: '+4% hero XP.', econ: { key: 'heroXpMult', value: 0.04 } },
  { id: 'bp1_p_bossloot', name: 'Tyrant Tithe', desc: '+3% boss loot.', econ: { key: 'bossLootMult', value: 0.03 } },
  { id: 'bp1_p_quality', name: 'Petal Sifting', desc: '+0.05 loot quality tier.', econ: { key: 'lootQualityTier', value: 0.05 } },
  { id: 'bp1_p_campaign2', name: 'Supply Blooms', desc: '+2% campaign rewards.', econ: { key: 'campaignRewardMult', value: 0.02 } },
  { id: 'bp1_p_towerxp2', name: 'Live-Fire Gardens', desc: '+3% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.03 } },
  { id: 'bp1_p_heroxp2', name: 'War Nectar', desc: '+3% hero XP.', econ: { key: 'heroXpMult', value: 0.03 } },
  { id: 'bp1_p_bossloot2', name: 'Deep Tithe', desc: '+2% boss loot.', econ: { key: 'bossLootMult', value: 0.02 } },
  { id: 'bp1_p_quality2', name: 'Golden Sieve', desc: '+0.05 loot quality tier.', econ: { key: 'lootQualityTier', value: 0.05 } },
  // Season 2 — Abyssal Tide · free track
  { id: 'bp2_f_biomass', name: 'Silt Feeder', desc: '+1% biomass income, forever.', effect: { field: 'biomassMult', value: 1.01 } },
  { id: 'bp2_f_towerxp', name: 'Pressure Training', desc: '+3% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.03 } },
  { id: 'bp2_f_heroxp', name: 'Deep Conditioning', desc: '+3% hero XP.', econ: { key: 'heroXpMult', value: 0.03 } },
  { id: 'bp2_f_firerate', name: 'Current Rhythm', desc: '+0.5% tower fire rate, forever.', effect: { field: 'towerFireRateMult', value: 1.005 } },
  { id: 'bp2_f_bossloot', name: 'Wreck Diving', desc: '+2% boss loot.', econ: { key: 'bossLootMult', value: 0.02 } },
  // Season 2 · premium track
  { id: 'bp2_p_campaign', name: 'Tide Charts', desc: '+2% campaign rewards.', econ: { key: 'campaignRewardMult', value: 0.02 } },
  { id: 'bp2_p_towerxp', name: 'Abyssal Drills', desc: '+4% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.04 } },
  { id: 'bp2_p_heroxp', name: 'Depth Rations', desc: '+4% hero XP.', econ: { key: 'heroXpMult', value: 0.04 } },
  { id: 'bp2_p_bossloot', name: 'Leviathan Tithe', desc: '+3% boss loot.', econ: { key: 'bossLootMult', value: 0.03 } },
  { id: 'bp2_p_quality', name: 'Brine Sifting', desc: '+0.05 loot quality tier.', econ: { key: 'lootQualityTier', value: 0.05 } },
  { id: 'bp2_p_campaign2', name: 'Undertow Freight', desc: '+2% campaign rewards.', econ: { key: 'campaignRewardMult', value: 0.02 } },
  { id: 'bp2_p_towerxp2', name: 'Hull Studies', desc: '+3% tower mastery XP.', econ: { key: 'towerXpMult', value: 0.03 } },
  { id: 'bp2_p_heroxp2', name: 'Siren Schooling', desc: '+3% hero XP.', econ: { key: 'heroXpMult', value: 0.03 } },
  { id: 'bp2_p_bossloot2', name: 'Salvage Rights', desc: '+2% boss loot.', econ: { key: 'bossLootMult', value: 0.02 } },
  { id: 'bp2_p_quality2', name: 'Pearl Sieve', desc: '+0.05 loot quality tier.', econ: { key: 'lootQualityTier', value: 0.05 } },
];
const PASSIVE_BY_ID = new Map(PASS_PASSIVES.map((p) => [p.id, p] as const));
export function passPassive(id: string): PassPassiveDef | undefined {
  return PASSIVE_BY_ID.get(id);
}

// ── Rewards ────────────────────────────────────────────────────────────────────
export type PassReward =
  | { kind: 'ichor'; qty: number }
  | { kind: 'cores'; qty: number }
  | { kind: 'geneEssence'; qty: number }
  | { kind: 'mats'; mutagen?: number; scrap?: number; catalyst?: number }
  | { kind: 'towerShardsAll'; qtyEach: number }
  | { kind: 'heroShardsAll'; qtyEach: number }
  | { kind: 'container'; rarity: 'common' | 'rare' | 'epic' | 'legendary'; count: number }
  | { kind: 'runCache'; count: number }
  | { kind: 'rushStamina'; qty: number }
  | { kind: 'bioSpores'; qty: number } // banked Bio-Roulette ammo (save.bioSpores)
  | { kind: 'cosmetic'; id: string } // a Wardrobe item (already-owned on repeat → replacement)
  | { kind: 'phenotype'; family: string } // one unowned phenotype of the family, rolled at claim
  | { kind: 'passive'; id: string } // permanent passive (once EVER → replacement on repeats)
  | { kind: 'stack' }; // the infinite completion bonus

/** Display metadata for a reward (icon + short label) — one switch, UI-safe. */
export function rewardLabel(r: PassReward): { icon: string; label: string } {
  switch (r.kind) {
    case 'ichor': return { icon: '◆', label: `${r.qty} Ichor` };
    case 'cores': return { icon: '⬡', label: `${r.qty} Genome Cores` };
    case 'geneEssence': return { icon: '⌬', label: `${r.qty} Gene Essence` };
    case 'mats': return { icon: '⚒', label: `Materials ⊕${r.mutagen ?? 0}·◳${r.scrap ?? 0}·✷${r.catalyst ?? 0}` };
    case 'towerShardsAll': return { icon: '✦', label: `${r.qtyEach} Strain Samples × all towers` };
    case 'heroShardsAll': return { icon: '✦', label: `${r.qtyEach} Apex Genome × all heroes` };
    case 'container': return { icon: '◈', label: `${r.count}× ${r.rarity} Bio-Container` };
    case 'runCache': return { icon: '⬢', label: `${r.count}× Run Cache` };
    case 'rushStamina': return { icon: '☠', label: `${r.qty} Rush Stamina` };
    case 'bioSpores': return { icon: '✺', label: `${r.qty} Bio-Spore${r.qty === 1 ? '' : 's'} (Roulette)` };
    case 'cosmetic': return { icon: '❖', label: wardrobeItem(r.id)?.name ?? r.id };
    case 'phenotype': return { icon: '🧬', label: `${r.family[0].toUpperCase()}${r.family.slice(1)} Phenotype` };
    case 'passive': return { icon: '♾', label: passPassive(r.id)?.name ?? r.id };
    case 'stack': return { icon: '❁', label: 'Perennial Bloom (+0.4% biomass, stacks forever)' };
  }
}

/** Ultra-compact reward text for the track CELLS (docs/BATTLEPASS.md §ui): every tile names
 *  its cargo at a glance, without opening the detail panel. Full wording stays rewardLabel's. */
export function rewardShort(r: PassReward): string {
  switch (r.kind) {
    case 'ichor': return `${r.qty} Ichor`;
    case 'cores': return `${r.qty} Cores`;
    case 'geneEssence': return `${r.qty} Essence`;
    case 'mats': return 'Materials';
    case 'towerShardsAll': return `Samples ×${r.qtyEach}`;
    case 'heroShardsAll': return `Genome ×${r.qtyEach}`;
    case 'container': return `${r.rarity} cache`;
    case 'runCache': return r.count > 1 ? `${r.count}× Run Cache` : 'Run Cache';
    case 'rushStamina': return `${r.qty} Stamina`;
    case 'bioSpores': return r.qty > 1 ? `${r.qty} Bio-Spores` : 'Bio-Spore';
    case 'cosmetic': return wardrobeItem(r.id)?.name ?? 'Cosmetic';
    case 'phenotype': return 'Phenotype';
    case 'passive': return passPassive(r.id)?.name ?? 'Passive';
    case 'stack': return 'Bloom stack';
  }
}

// ── Season definitions ─────────────────────────────────────────────────────────
export interface SeasonDef {
  id: string; // 's1' | 's2' | future
  name: string;
  tagline: string;
  glyph: string; // the season's mark
  accent: string; // theme primary (CSS)
  glow: string; // theme highlight
  bg: string; // deep backdrop
  /** Menu-music re-voicing while the pass screen is open (root/tempo/brightness). */
  music: { rootShift: number; bpmMult: number; brightness: number };
  /** Free-track passive levels (5) and premium-track passive levels (10), paired 1:1 with
   *  the season's PASS_PASSIVES rows in author order. */
  freePassiveLevels: number[];
  premiumPassiveLevels: number[];
  /** Premium phenotype-grant levels → theme family granted (docs/COSMETICS.md families). */
  phenotypeLevels: Record<number, string>;
}

export const SEASONS: SeasonDef[] = [
  {
    id: 's1', name: 'Crimson Bloom', tagline: 'The hive flowers, and the flower is a wound.',
    glyph: '❁', accent: '#ff4d6d', glow: '#ffd24d', bg: '#1a070d',
    music: { rootShift: 1, bpmMult: 1.0, brightness: 0.6 },
    freePassiveLevels: [12, 32, 52, 72, 92],
    premiumPassiveLevels: [6, 16, 26, 36, 46, 56, 66, 76, 86, 96],
    phenotypeLevels: { 20: 'ember', 48: 'verdant', 58: 'void', 78: 'ember', 92: 'void' },
  },
  {
    id: 's2', name: 'Abyssal Tide', tagline: 'What the deep water grew, it now returns.',
    glyph: '≋', accent: '#4de0c4', glow: '#9adfff', bg: '#04141a',
    music: { rootShift: -4, bpmMult: 0.92, brightness: 0.3 },
    freePassiveLevels: [12, 32, 52, 72, 92],
    premiumPassiveLevels: [6, 16, 26, 36, 46, 56, 66, 76, 86, 96],
    phenotypeLevels: { 20: 'frost', 48: 'void', 58: 'frost', 78: 'verdant', 92: 'void' },
  },
];
export function seasonById(id: string): SeasonDef | undefined {
  return SEASONS.find((s) => s.id === id);
}
/** The season active in a rotation window (the ring wraps — unlimited future windows). */
export function seasonForWindow(window: number): SeasonDef {
  return SEASONS[window % SEASONS.length];
}

/** The season's passive ids in track order (paired with its passive levels). */
function seasonPassives(season: SeasonDef, track: 'free' | 'premium'): string[] {
  const prefix = `bp${season.id === 's1' ? 1 : season.id === 's2' ? 2 : 0}_${track === 'free' ? 'f' : 'p'}_`;
  return PASS_PASSIVES.filter((p) => p.id.startsWith(prefix)).map((p) => p.id);
}

// ── The reward tables — derived once per season, cached ────────────────────────
// Cosmetics come FROM the Wardrobe registry (single source of truth); passives + phenotypes
// from the SeasonDef; a deterministic filler cadence covers every remaining level so NO level
// is empty (battlePass.test.ts walks all 200 slots per season and asserts non-empty).
function fillerFree(level: number): PassReward[] {
  if (level % 10 === 0) {
    const rarity = level >= 80 ? 'legendary' : level >= 50 ? 'epic' : 'rare';
    return [{ kind: 'container', rarity, count: 1 }];
  }
  switch (level % 5) {
    case 0: return [{ kind: 'runCache', count: 1 }];
    case 1: return [{ kind: 'cores', qty: 40 + level * 3 }];
    case 2: return [{ kind: 'geneEssence', qty: 20 + level * 2 }];
    case 3: return [{ kind: 'mats', mutagen: 1 + Math.floor(level / 25), scrap: 4 + Math.floor(level / 10), catalyst: level > 40 ? 1 : 0 }];
    default: return level % 2 === 0 ? [{ kind: 'cores', qty: 30 + level * 2 }] : [{ kind: 'ichor', qty: 2 }];
  }
}
function fillerPremium(level: number): PassReward[] {
  if (level % 10 === 0) {
    const rarity = level >= 70 ? 'legendary' : level >= 40 ? 'epic' : 'rare';
    return [{ kind: 'container', rarity, count: level >= 90 ? 2 : 1 }];
  }
  switch (level % 5) {
    case 0: return [{ kind: 'towerShardsAll', qtyEach: 4 + Math.floor(level / 20) }];
    case 1: return [{ kind: 'geneEssence', qty: 35 + level * 2 }];
    case 2: return [{ kind: 'cores', qty: 70 + level * 3 }];
    case 3: return [{ kind: 'heroShardsAll', qtyEach: 3 + Math.floor(level / 25) }];
    default: return level % 2 === 0 ? [{ kind: 'rushStamina', qty: 5 }] : [{ kind: 'ichor', qty: 4 }];
  }
}

export interface SeasonTracks {
  free: PassReward[][]; // [level-1] → rewards (never empty)
  premium: PassReward[][];
}
const trackCache = new Map<string, SeasonTracks>();

/** Build (and cache) the full 100×2 reward table for a season. */
export function seasonTracks(seasonId: string): SeasonTracks {
  const hit = trackCache.get(seasonId);
  if (hit) return hit;
  const season = seasonById(seasonId);
  if (!season) throw new Error(`unknown season ${seasonId}`);
  const free: PassReward[][] = [];
  const premium: PassReward[][] = [];
  const items = seasonItems(seasonId);
  const at = (level: number, track: 'free' | 'premium'): WardrobeItemDef[] =>
    items.filter((d) => d.source.kind === 'battlepass' && d.source.level === level && d.source.track === track);
  const freePassives = seasonPassives(season, 'free');
  const premiumPassives = seasonPassives(season, 'premium');

  for (let level = 1; level <= BP.levels; level++) {
    // FREE — cosmetics pinned by the registry, passives by the SeasonDef, filler otherwise.
    const f: PassReward[] = at(level, 'free').map((d) => ({ kind: 'cosmetic', id: d.id }));
    const fpIdx = season.freePassiveLevels.indexOf(level);
    if (fpIdx >= 0 && freePassives[fpIdx]) f.push({ kind: 'passive', id: freePassives[fpIdx] });
    if (level === BP.levels) f.push({ kind: 'stack' }, { kind: 'container', rarity: 'legendary', count: 1 });
    if (f.length === 0) f.push(...fillerFree(level));
    // Bio-Spore lane (docs/BOSS-RUSH.md §roulette): ADDITIVE after the filler fallback so no
    // existing reward is displaced. Free track: 4 per season (25/50/75/100).
    if (level % 25 === 0) f.push({ kind: 'bioSpores', qty: 1 });
    free.push(f);

    // PREMIUM — richer filler; the taste levels (1/50/99) are pinned generous; 100 is the crown.
    const p: PassReward[] = at(level, 'premium').map((d) => ({ kind: 'cosmetic', id: d.id }));
    const ppIdx = season.premiumPassiveLevels.indexOf(level);
    if (ppIdx >= 0 && premiumPassives[ppIdx]) p.push({ kind: 'passive', id: premiumPassives[ppIdx] });
    const pheno = season.phenotypeLevels[level];
    if (pheno) p.push({ kind: 'phenotype', family: pheno });
    if (level === 1) p.push({ kind: 'ichor', qty: 20 }, { kind: 'container', rarity: 'epic', count: 1 });
    if (level === 50) p.push({ kind: 'container', rarity: 'legendary', count: 1 });
    if (level === 99) p.push({ kind: 'ichor', qty: 25 }, { kind: 'container', rarity: 'epic', count: 1 });
    if (level === BP.levels) p.push({ kind: 'container', rarity: 'legendary', count: 2 });
    if (p.length === 0) p.push(...fillerPremium(level));
    // Premium spore lane: 5 per season (20/40/60/80/100) — additive, same rule as free.
    if (level % 20 === 0) p.push({ kind: 'bioSpores', qty: 1 });
    premium.push(p);
  }
  const tracks = { free, premium };
  trackCache.set(seasonId, tracks);
  return tracks;
}

/** Total Ichor a track pays out (the economy law's measured quantity). */
export function trackIchorTotal(seasonId: string, track: 'free' | 'premium'): number {
  return seasonTracks(seasonId)[track].reduce(
    (sum, rewards) => sum + rewards.reduce((a, r) => a + (r.kind === 'ichor' ? r.qty : 0), 0), 0);
}
