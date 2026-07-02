// Mastery as EXPERIENCE (MASTERY.md). Infinite mastery is a veteran trophy you DISPLAY,
// not a private stat: levels unlock TITLES you wear and LORE you read, plus a procedural
// RANK that scales forever with zero authoring. The minor permanent power stays the gentle
// log curve already in config.MASTERY — the rewards here are pure identity (no sim power),
// so they can never inflate and never touch the golden run.
//
// Pure data + pure helpers (no Game/DOM). Tower mastery = CRAFT (tool expertise); hero
// mastery = BOND (relationship with a character) — same XP engine, distinct vocabularies.

import { Registry } from './registry';
import type { HeroKind, TowerKind } from './types';

export type MasteryRewardKind = 'title' | 'lore';

export interface MasteryReward {
  at: number; // mastery level threshold (inclusive)
  kind: MasteryRewardKind;
  id: string; // stable id (stored in the save)
  name: string; // display label (title text, or lore chapter title)
  text?: string; // lore body (kind === 'lore')
}

/** A milestone PERK — a sparse MECHANIC (not a stat-stick) folded into the tower's run kit
 * at a mastery level. Reuses the star-kit grant fields, so it rides the existing sim wiring;
 * golden-safe because a fresh unit (level 0) crosses none. */
export interface MasteryPerk {
  at: number; // mastery level threshold
  name: string;
  desc: string;
  projectileMutator?: string; // e.g. 'pierce1' — the tower's shots gain a mutator
  extraProjectiles?: number;
  splashMult?: number;
  // Identity-range axes (docs/RANGE.md §8) — tower-specific reach, never a generic "+range%".
  rangeMult?: number; // engagement range (needle) / pulse radius (obelisk)
  fireRateMult?: number; // faster indirect targeting (mortar) — quicker re-aim/cadence
  infectionSpreadMult?: number; // Infection spread radius (parasite)
}

export interface MasteryTrack {
  subject: 'tower' | 'hero';
  unit: string; // TowerKind | HeroKind
  rewards: MasteryReward[]; // ascending by `at`
  perks?: MasteryPerk[]; // sparse mechanic milestones (towers)
}

export const masteryTrackRegistry = new Registry<MasteryTrack>('masteryTrack', {
  idOf: (t) => `${t.subject}:${t.unit}`,
  validate: (t) => {
    const out: string[] = [];
    let prev = -1;
    for (const r of t.rewards) {
      if (r.at <= prev) out.push(`rewards must ascend by level (saw ${r.at} after ${prev})`);
      prev = r.at;
      if (!r.id || !r.name) out.push(`reward at ${r.at} missing id/name`);
    }
    return out;
  },
});

// ── Procedural ranks: infinite, zero-authoring veteran tiers ───────────────────

export const MASTERY_RANK_EVERY = 25; // a new Rank every N mastery levels

const RANK_NAMES = ['Initiate', 'Adept', 'Veteran', 'Expert', 'Master', 'Grandmaster', 'Ascendant', 'Paragon'];

function roman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let x = n;
  for (const [v, s] of map) while (x >= v) ((out += s), (x -= v));
  return out;
}

/** The rank index for a mastery level (0 = Unranked). */
export function masteryRank(level: number): number {
  return Math.floor(level / MASTERY_RANK_EVERY);
}

/** A display title for the rank at `level` — cycles names with a numeral past the list, so
 * it is genuinely infinite (e.g. "Paragon", then "Initiate II" … "Paragon II" …). */
export function masteryRankTitle(level: number): string {
  const r = masteryRank(level);
  if (r <= 0) return 'Unranked';
  const i = (r - 1) % RANK_NAMES.length;
  const cycle = Math.floor((r - 1) / RANK_NAMES.length);
  return cycle > 0 ? `${RANK_NAMES[i]} ${roman(cycle + 1)}` : RANK_NAMES[i];
}

// ── Reward queries (pure) ──────────────────────────────────────────────────────

function trackId(subject: 'tower' | 'hero', unit: string): string {
  return `${subject}:${unit}`;
}

/** Authored rewards unlocked at or below `level` for a unit. */
export function masteryRewardsUpTo(subject: 'tower' | 'hero', unit: string, level: number): MasteryReward[] {
  return (masteryTrackRegistry.get(trackId(subject, unit))?.rewards ?? []).filter((r) => r.at <= level);
}

/** Authored rewards crossed by a level-up `from → to` (the run-end unlock set). */
export function masteryRewardsBetween(subject: 'tower' | 'hero', unit: string, from: number, to: number): MasteryReward[] {
  if (to <= from) return [];
  return (masteryTrackRegistry.get(trackId(subject, unit))?.rewards ?? []).filter((r) => r.at > from && r.at <= to);
}

/** Mechanic perks earned at or below `level` for a unit (folded into its run kit). */
export function masteryPerksUpTo(subject: 'tower' | 'hero', unit: string, level: number): MasteryPerk[] {
  return (masteryTrackRegistry.get(trackId(subject, unit))?.perks ?? []).filter((p) => p.at <= level);
}

/** The NEXT thing this unit's mastery will unlock above `level` — the nearest of its
 * authored rewards, mechanic perks, and the procedural rank boundary. Never null:
 * ranks are infinite, so there is always a next goal to surface. */
export function nextMasteryUnlock(
  subject: 'tower' | 'hero',
  unit: string,
  level: number,
): { at: number; name: string; kind: MasteryRewardKind | 'perk' | 'rank' } {
  const track = masteryTrackRegistry.get(trackId(subject, unit));
  const candidates: { at: number; name: string; kind: MasteryRewardKind | 'perk' | 'rank' }[] = [];
  for (const r of track?.rewards ?? []) if (r.at > level) candidates.push({ at: r.at, name: r.name, kind: r.kind });
  for (const p of track?.perks ?? []) if (p.at > level) candidates.push({ at: p.at, name: p.name, kind: 'perk' });
  const nextRankAt = (masteryRank(level) + 1) * MASTERY_RANK_EVERY;
  candidates.push({ at: nextRankAt, name: masteryRankTitle(nextRankAt), kind: 'rank' });
  candidates.sort((a, b) => a.at - b.at);
  return candidates[0];
}

// Flat index for display (id → reward), since the save stores reward ids.
const REWARD_BY_ID = new Map<string, MasteryReward>();
export function masteryRewardById(id: string): MasteryReward | undefined {
  return REWARD_BY_ID.get(id);
}

// ── Authored tracks ────────────────────────────────────────────────────────────
// Tower = CRAFT (class-flex titles + tactical lore). Hero = BOND (character titles +
// backstory lore). Sparse on purpose; ranks fill the infinite space between.

const TOWER_TRACKS: { unit: TowerKind; rewards: MasteryReward[]; perks?: MasteryPerk[] }[] = [
  {
    unit: 'needle',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.needle.1', name: 'Kinetic Doctrine', text: 'The Needle Spitter is the hive’s first reflex — cheap, fast, and merciless to the swift.' },
      { at: 25, kind: 'title', id: 'title.needle.virtuoso', name: 'Needle Virtuoso' },
      { at: 50, kind: 'title', id: 'title.needle.stormcaller', name: 'Stormcaller' },
    ],
    perks: [
      { at: 50, name: 'Veteran Barbs', desc: 'Mastery 50: needles pierce one extra foe.', projectileMutator: 'pierce1' },
      { at: 75, name: 'Forward Sights', desc: 'Mastery 75: +20% engagement range — the Needle opens fire even sooner.', rangeMult: 1.2 },
    ],
  },
  {
    unit: 'mortar',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.mortar.1', name: 'Caustic Doctrine', text: 'Bone Mortars seed the ground itself against the swarm — patience rendered as acid.' },
      { at: 25, kind: 'title', id: 'title.mortar.siegemaster', name: 'Siegemaster' },
    ],
    perks: [
      { at: 50, name: 'Wide Bore', desc: 'Mastery 50: +15% blast radius.', splashMult: 1.15 },
      { at: 75, name: 'Rapid Bombardment', desc: 'Mastery 75: +20% fire rate — faster indirect targeting puts shells on target sooner.', fireRateMult: 1.2 },
    ],
  },
  {
    unit: 'parasite',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.parasite.1', name: 'Viral Doctrine', text: 'The Nest does not kill; it converts. Every host is a future spore.' },
      { at: 25, kind: 'title', id: 'title.parasite.plaguelord', name: 'Plaguelord' },
    ],
    perks: [
      { at: 50, name: 'Burrowing Brood', desc: 'Mastery 50: parasites bore through one extra host.', projectileMutator: 'pierce1' },
      { at: 75, name: 'Virulent Spread', desc: 'Mastery 75: +40% Infection spread radius — the plague leaps to farther hosts.', infectionSpreadMult: 1.4 },
    ],
  },
  {
    unit: 'obelisk',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.obelisk.1', name: 'Neural Doctrine', text: 'The Obelisk speaks in frequencies the prey cannot refuse.' },
      { at: 25, kind: 'title', id: 'title.obelisk.mindwright', name: 'Mindwright' },
    ],
    perks: [{ at: 75, name: 'Resonant Field', desc: 'Mastery 75: +20% pulse radius — the control field reaches farther.', rangeMult: 1.2 }],
  },
  {
    unit: 'reactor',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.reactor.1', name: 'Vital Doctrine', text: 'The Flesh Reactor is the hive’s heart — it feeds the others, asking nothing.' },
      { at: 25, kind: 'title', id: 'title.reactor.lifewarden', name: 'Lifewarden' },
    ],
    perks: [{ at: 75, name: 'Mycelial Network', desc: 'Mastery 75: +30% support radius — the Reactor overcharges farther towers.', rangeMult: 1.3 }],
  },
];

const HERO_TRACKS: { unit: HeroKind; rewards: MasteryReward[] }[] = [
  {
    unit: 'ravager',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.ravager.1', name: 'The Ravager', text: 'First of the assimilated to keep its will. It remembers being prey — and chooses, now, to hunt.' },
      { at: 25, kind: 'title', id: 'title.ravager.bonded', name: 'Ravager-Bonded' },
    ],
  },
  {
    unit: 'shepherd',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.shepherd.1', name: 'The Shepherd', text: 'It does not fight for the hive. It fights so the hive need not.' },
      { at: 25, kind: 'title', id: 'title.shepherd.chosen', name: 'Shepherd’s Chosen' },
    ],
  },
  {
    unit: 'overseer',
    rewards: [
      { at: 10, kind: 'lore', id: 'lore.overseer.1', name: 'The Overseer', text: 'A thousand eyes, one intent. It sees the wave before the wave begins.' },
      { at: 25, kind: 'title', id: 'title.overseer.hand', name: 'Overseer’s Hand' },
    ],
  },
];

for (const t of TOWER_TRACKS) masteryTrackRegistry.register({ subject: 'tower', unit: t.unit, rewards: t.rewards, perks: t.perks });
for (const t of HERO_TRACKS) masteryTrackRegistry.register({ subject: 'hero', unit: t.unit, rewards: t.rewards });
for (const track of masteryTrackRegistry.all()) for (const r of track.rewards) REWARD_BY_ID.set(r.id, r);
