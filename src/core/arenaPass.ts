// ARENA PASS (docs/ARENA.md §pass) — the permanent seasonal reward track: 100 levels over the
// 30-day arena season, advanced ONLY by Arena WINS (the spec's contract — losses pay match
// cores but zero track progress), a free + premium lane on every level, and a PROCEDURALLY
// ROTATED reward table seeded by the season index — every season the containers/currencies/
// essence/phenotype mix, the theme palette, the music re-voice and the name all rotate while
// the structure stays foundational. Level 100's crown is the season's ARENA-EXCLUSIVE content
// grant (Tower A → Tower B → Hero, alternating forever) — no alternate acquisition path.
//
// Speaks the Battle Pass's PassReward vocabulary (core/battlePass.ts) so meta's ONE reward
// interpreter (applyRewardList) pays both tracks — a future reward type lands once, both
// passes inherit. Deterministic: same season ⇒ byte-identical table (test-pinned).
//
// No sim import, no DOM, no Math.random (seeded Rng only) — golden-safe by construction.

import { Rng } from './rng';
import type { PassReward } from './battlePass';
import { arenaSeasonIndex, msToSeasonEnd } from './arena';

export const ARENA_PASS = {
  levels: 100,
  /** XP per win comes from ARENA.winPassXp (10). Level costs step up in three bands so the
   *  season's back half is the grind: 10/15/20 XP ⇒ 1450 XP ≈ 145 wins for a full clear —
   *  ~5 wins/day across the 30-day season for the dedicated (docs/ARENA.md §pacing). */
  xpBands: [
    { toLevel: 40, xp: 10 },
    { toLevel: 70, xp: 15 },
    { toLevel: 100, xp: 20 },
  ] as readonly { toLevel: number; xp: number }[],
  /** Premium unlock price (Ichor) — cheaper than the Battle Pass (250): the arena pass pays
   *  no permanent passives, so its premium lane is currency/cosmetic depth only. */
  premiumIchor: 200,
} as const;

/** XP to climb FROM level-1 TO `level` (1-based). */
export function arenaPassXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(ARENA_PASS.levels, level));
  for (const band of ARENA_PASS.xpBands) if (l <= band.toLevel) return band.xp;
  return ARENA_PASS.xpBands[ARENA_PASS.xpBands.length - 1].xp;
}

/** Total XP from 0 → `level`. */
export function arenaPassXpToReach(level: number): number {
  let sum = 0;
  for (let l = 1; l <= Math.min(level, ARENA_PASS.levels); l++) sum += arenaPassXpForLevel(l);
  return sum;
}

/** Level for a raw XP total + progress into the next. */
export function arenaPassLevelOf(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let rest = Math.max(0, xp);
  while (level < ARENA_PASS.levels && rest >= arenaPassXpForLevel(level + 1)) {
    rest -= arenaPassXpForLevel(level + 1);
    level++;
  }
  return { level, into: level >= ARENA_PASS.levels ? 0 : rest, need: level >= ARENA_PASS.levels ? 0 : arenaPassXpForLevel(level + 1) };
}

// ── The exclusive rotation (docs/ARENA.md §exclusives) ─────────────────────────
/** The three arena-exclusive content pieces, granted at level 100, alternating by season
 *  forever: Tower A → Tower B → Hero → Tower A → …  These ids are the ONLY acquisition path
 *  (no shard drops, no market, no containers — enforced at the content defs + meta grant). */
export const ARENA_EXCLUSIVES = ['tower:basilisk', 'tower:ossuary', 'hero:chimera'] as const;
export type ArenaExclusiveId = (typeof ARENA_EXCLUSIVES)[number];

export function arenaExclusiveForSeason(season: number): ArenaExclusiveId {
  return ARENA_EXCLUSIVES[(Math.max(1, season) - 1) % ARENA_EXCLUSIVES.length];
}

export function arenaExclusiveLabel(id: ArenaExclusiveId): string {
  switch (id) {
    case 'tower:basilisk': return 'Basilisk Maw (Arena-exclusive tower)';
    case 'tower:ossuary': return 'Ossuary Choir (Arena-exclusive tower)';
    case 'hero:chimera': return 'Chimera (Arena-exclusive hero)';
  }
}

// ── Seasonal identity (procedural theme rotation — docs/ARENA.md §seasons) ─────
export interface ArenaSeasonInfo {
  index: number;
  name: string; // "The Crimson Crucible"
  glyph: string;
  accent: string; // theme primary (CSS)
  glow: string;
  bg: string;
  /** Menu-music re-voice while the arena screen is open (the Battle Pass pattern). */
  music: { rootShift: number; bpmMult: number; brightness: number };
  /** One rotating loading-screen line (flavor — the seasonal freshness beat). */
  tagline: string;
  endsInMs: number; // 0 when derived without a clock
  exclusive: ArenaExclusiveId;
}

const SEASON_PREFIX = ['Crimson', 'Sunken', 'Howling', 'Gilded', 'Umbral', 'Feral', 'Verdant', 'Pale', 'Molten', 'Sporebound'] as const;
const SEASON_NOUN = ['Crucible', 'Proving', 'Gauntlet', 'Tithe', 'Communion', 'Harrow', 'Dominion', 'Clutch', 'Descent', 'Bloom'] as const;
const SEASON_GLYPH = ['⚔', '❖', '✦', '◉', '⌖', '☣', '✷', '◍', '⛨', '❁'] as const;
const SEASON_ACCENT = ['#ff4d6d', '#4de0c4', '#ffb64d', '#9a6bff', '#5fb8ff', '#7fd08f', '#ff8a3d', '#e05fa8', '#c9d24d', '#4dd2ff'] as const;
const SEASON_TAGLINE = [
  'Two hives. One survivor.',
  'The arena remembers every strain.',
  'Prove the colony. Outlast the rival.',
  'What survives the mirror, rules it.',
  'The proving grounds are hungry again.',
] as const;

/** Deterministic seasonal identity — same season index ⇒ identical theme, forever. */
export function arenaSeasonInfo(season: number, now = 0): ArenaSeasonInfo {
  const s = Math.max(1, Math.floor(season));
  const rng = new Rng((0x41524e41 ^ Math.imul(s, 2654435761)) >>> 0); // 'ARNA' ^ season hash
  const prefix = rng.pick(SEASON_PREFIX);
  const noun = rng.pick(SEASON_NOUN);
  const accent = rng.pick(SEASON_ACCENT);
  return {
    index: s,
    name: `The ${prefix} ${noun}`,
    glyph: rng.pick(SEASON_GLYPH),
    accent,
    glow: rng.pick(SEASON_ACCENT),
    bg: '#0a0710',
    music: { rootShift: rng.int(7) - 3, bpmMult: 0.92 + rng.next() * 0.16, brightness: 0.25 + rng.next() * 0.5 },
    tagline: rng.pick(SEASON_TAGLINE),
    endsInMs: now > 0 ? msToSeasonEnd(now) : 0,
    exclusive: arenaExclusiveForSeason(s),
  };
}

export function currentArenaSeasonInfo(now: number): ArenaSeasonInfo {
  return arenaSeasonInfo(arenaSeasonIndex(now), now);
}

// ── The procedural reward tables (docs/ARENA.md §pass-rewards) ─────────────────
export interface ArenaPassLevelRewards {
  free: PassReward[]; // never empty (enforced by arenaPass.test.ts)
  premium: PassReward[]; // never empty
  /** Level 100 only: the season's exclusive content grant (meta grants it on claim). */
  exclusive?: ArenaExclusiveId;
}

const PHENO_FAMILIES = ['ember', 'verdant', 'void', 'frost'] as const;

/** Milestone levels every season keeps (structure is foundational; CONTENTS rotate). */
function milestoneReward(level: number, rng: Rng, premium: boolean): PassReward[] {
  const rarity = level >= 80 ? 'legendary' : level >= 50 ? 'epic' : 'rare';
  const out: PassReward[] = [{ kind: 'container', rarity, count: premium && level >= 90 ? 2 : 1 }];
  if (rng.chance(premium ? 0.5 : 0.25)) out.push({ kind: 'ichor', qty: premium ? 6 + rng.int(5) : 2 + rng.int(3) });
  return out;
}

/** One level's filler — seeded per (season, level, track) so seasons genuinely differ while
 *  every level stays non-empty and value-banded (small early, richer late). */
function rotatedFiller(rng: Rng, level: number, premium: boolean): PassReward[] {
  const scale = 1 + level * 0.03;
  const mult = premium ? 1.8 : 1;
  const lane = rng.pickWeighted<PassReward['kind']>([
    ['cores', 30],
    ['geneEssence', 22],
    ['mats', 14],
    ['runCache', 10],
    ['towerShardsAll', premium ? 10 : 5],
    ['heroShardsAll', premium ? 8 : 4],
    ['rushStamina', 5],
    ['ichor', premium ? 8 : 4],
    ['phenotype', premium ? 5 : 2],
  ]);
  switch (lane) {
    case 'cores': return [{ kind: 'cores', qty: Math.round((40 + rng.int(30)) * scale * mult) }];
    case 'geneEssence': return [{ kind: 'geneEssence', qty: Math.round((18 + rng.int(16)) * scale * mult) }];
    case 'mats': return [{ kind: 'mats', mutagen: 1 + rng.int(2), scrap: 3 + rng.int(5), catalyst: level > 40 && rng.chance(0.5) ? 1 : 0 }];
    case 'runCache': return [{ kind: 'runCache', count: premium && level > 60 ? 2 : 1 }];
    case 'towerShardsAll': return [{ kind: 'towerShardsAll', qtyEach: Math.round((3 + rng.int(3)) * (premium ? 1.5 : 1)) }];
    case 'heroShardsAll': return [{ kind: 'heroShardsAll', qtyEach: Math.round((2 + rng.int(3)) * (premium ? 1.5 : 1)) }];
    case 'rushStamina': return [{ kind: 'rushStamina', qty: 5 + rng.int(3) * 5 }];
    case 'ichor': return [{ kind: 'ichor', qty: Math.round((premium ? 4 : 2) + rng.int(3)) }];
    default: return [{ kind: 'phenotype', family: rng.pick(PHENO_FAMILIES) }];
  }
}

const arenaTrackCache = new Map<number, ArenaPassLevelRewards[]>();

/** HARD Ichor ceilings per track (the Battle Pass economy law, made structural: the rotation
 *  is random, so the cap is enforced by construction — overflow Ichor rewards convert to
 *  cores at the exchange anchor, never paid). Premium cap = 50% of the premium price. */
export const ARENA_PASS_ICHOR_CAP = { free: 40, premium: Math.floor(ARENA_PASS.premiumIchor * 0.5) } as const;
const ICHOR_TO_CORES = 25; // conversion anchor for capped overflow (≈ market core-bundle rate)

function capTrackIchor(rows: ArenaPassLevelRewards[], track: 'free' | 'premium'): void {
  let paid = 0;
  const cap = ARENA_PASS_ICHOR_CAP[track];
  for (const row of rows) {
    const rewards = row[track];
    for (let i = 0; i < rewards.length; i++) {
      const r = rewards[i];
      if (r.kind !== 'ichor') continue;
      if (paid + r.qty > cap) rewards[i] = { kind: 'cores', qty: r.qty * ICHOR_TO_CORES };
      else paid += r.qty;
    }
  }
}

/** Build (and cache) the season's full 100-level table. Deterministic per season. */
export function arenaPassTrack(season: number): ArenaPassLevelRewards[] {
  const s = Math.max(1, Math.floor(season));
  const hit = arenaTrackCache.get(s);
  if (hit) return hit;
  const rng = new Rng((0x50415353 ^ Math.imul(s, 40503)) >>> 0); // 'PASS' ^ season
  const track: ArenaPassLevelRewards[] = [];
  for (let level = 1; level <= ARENA_PASS.levels; level++) {
    const milestone = level % 10 === 0;
    const free: PassReward[] = milestone ? milestoneReward(level, rng, false) : rotatedFiller(rng, level, false);
    const premium: PassReward[] = milestone ? milestoneReward(level, rng, true) : rotatedFiller(rng, level, true);
    if (level === 1) premium.push({ kind: 'ichor', qty: 15 }); // the premium taste, up front
    const row: ArenaPassLevelRewards = { free, premium };
    if (level === ARENA_PASS.levels) {
      row.exclusive = arenaExclusiveForSeason(s);
      row.free.push({ kind: 'container', rarity: 'legendary', count: 1 });
      row.premium.push({ kind: 'container', rarity: 'legendary', count: 2 });
    }
    track.push(row);
  }
  capTrackIchor(track, 'free');
  capTrackIchor(track, 'premium');
  arenaTrackCache.set(s, track);
  return track;
}

/** Total Ichor a season's track pays (economy guard: must stay a FRACTION of premiumIchor —
 *  completing an arena pass can never fund the next one; arenaPassEconomy test pins it). */
export function arenaTrackIchorTotal(season: number, track: 'free' | 'premium'): number {
  return arenaPassTrack(season).reduce(
    (sum, row) => sum + row[track].reduce((a, r) => a + (r.kind === 'ichor' ? r.qty : 0), 0), 0);
}
