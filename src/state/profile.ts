// PLAYER PROFILE read-model + PROVIDER REGISTRY (docs/PROFILE.md). The profile screen renders
// WHATEVER the registry yields — there is no hardcoded stat list in the UI. Each provider owns
// one slice of the dashboard (a career group, an analytics row); a future system surfaces
// itself by registering a provider (or extending one here) — the screen inherits it for free,
// the same self-registration pattern every content registry uses.
//
// Structured surfaces (banner / power breakdown / showcase / timeline) are dedicated
// read-model functions over the same save. Pure over SaveData (device prefs only where a
// stat is device-local and labeled as such); never imported by meta.ts.

import type { SaveData } from '../save/saveStore';
import { Registry } from '../core/registry';
import { HERO_DEFS, HERO_ORDER, TOWER_ORDER } from '../core/config';
import type { HeroKind } from '../core/types';
import { POWER_BASE, composePower } from '../core/power';
import { collectionView } from '../core/collection';
import { biomeForStage } from '../core/campaign';
import { cardRegistry } from '../core/cards';
import { DOCTRINES } from '../core/doctrines';
import { resolveDifficulty } from '../core/difficulty';
import { masteryRewardById } from '../core/mastery';
import { ACHIEVEMENTS, achievementById } from './achievements';
import type { AchievementDef } from './achievements';
import { favoriteTowerName } from './stats';
import { accountPowerParts, collectionContextOf } from './meta';
import { highestCampaignStage } from '../save/derive';
import { difficultyPref, vaultLedger } from './prefs';
import { nextRushIchorAt } from '../core/market';

// ── The stat provider registry ────────────────────────────────────────────────

export interface ProfileStat {
  id: string;
  label: string;
  value: string;
  hint?: string; // tooltip body (tt-bubble)
  color?: string;
  progress?: number; // 0..1 → renders a bar under the value
}

export type ProfileSectionId = 'combat' | 'economy' | 'campaign' | 'infinite' | 'bossrush' | 'collection' | 'analytics';

export const PROFILE_SECTION_TITLES: Record<ProfileSectionId, string> = {
  combat: 'Combat',
  economy: 'Economy',
  campaign: 'Campaign',
  infinite: 'Infinite',
  bossrush: 'Boss Rush',
  collection: 'Collection',
  analytics: 'Performance Analytics',
};

export interface ProfileProvider {
  id: string;
  section: ProfileSectionId;
  order: number; // within the section (ascending)
  stats: (save: SaveData) => ProfileStat[];
}

export const profileRegistry = new Registry<ProfileProvider>('profile-provider', {
  idOf: (p) => p.id,
  validate: (p) => (typeof p.stats === 'function' ? [] : ['profile provider needs stats()']),
});

/** Everything a section renders, in registry order — the UI's single career entry point. */
export function profileSection(save: SaveData, id: ProfileSectionId): ProfileStat[] {
  return profileRegistry
    .active()
    .filter((p) => p.section === id)
    .sort((a, b) => a.order - b.order)
    .flatMap((p) => p.stats(save));
}

const num = (n: number): string => Math.round(n).toLocaleString('en-US');
const pctOf = (a: number, b: number): number => (b > 0 ? a / b : 0);

/** "3d 4h" / "2h 12m" / "45m" — durations on the human scale the profile speaks. */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.round((s % 86400) / 3600)}h`;
}

function argmax<K extends string>(rec: Record<K, number> | Record<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const k of Object.keys(rec)) {
    const v = (rec as Record<string, number>)[k] ?? 0;
    if (v > max) { max = v; best = k; }
  }
  return best;
}

// ── Built-in providers (one per slice; future systems append their own) ──────

profileRegistry.registerAll([
  {
    id: 'combat-core', section: 'combat', order: 10,
    stats: (s) => [
      { id: 'kills', label: 'Enemies Eliminated', value: num(s.stats.lifetimeKills) },
      { id: 'bosses', label: 'Boss Chassis Slain', value: num(s.bossesSlain.length), hint: 'Distinct assembled-boss chassis defeated (the Bestiary boss codex).' },
      { id: 'damage', label: 'Total Damage', value: num(s.stats.totalDamage) },
      { id: 'biomass', label: 'Biomass Generated', value: num(s.stats.totalBiomass) },
      { id: 'towers-built', label: 'Towers Grown', value: num(TOWER_ORDER.reduce((a, k) => a + (s.stats.towerUsage[k] ?? 0), 0)) },
      { id: 'hero-kills', label: 'Hero Kills', value: num(HERO_ORDER.reduce((a, k) => a + (s.heroKills[k] ?? 0), 0)) },
      { id: 'cards-drafted', label: 'Gene Cards Drafted', value: num(s.stats.cardsDrafted) },
    ],
  },
  {
    id: 'economy-core', section: 'economy', order: 10,
    stats: (s) => {
      const led = vaultLedger();
      const cv = collectionView(collectionContextOf(s));
      const equip = cv.categories.find((c) => c.id === 'equipment');
      return [
        { id: 'cores', label: 'Genome Cores Earned', value: num(s.lifetimeShards), color: 'var(--gold)' },
        { id: 'essence', label: 'Gene Essence Held', value: num(s.geneEssence) },
        { id: 'containers', label: 'Containers Opened', value: num(led.opened), hint: 'Vault openings on THIS device (the vault ledger is device-local).' },
        ...(equip ? [{ id: 'equip-found', label: 'Equipment Discovered', value: `${equip.discovered} / ${equip.total}`, progress: pctOf(equip.discovered, equip.total) }] : []),
        { id: 'mats', label: 'Materials Banked', value: num(s.mats.mutagen + s.mats.scrap + s.mats.catalyst) },
      ];
    },
  },
  {
    id: 'campaign-core', section: 'campaign', order: 10,
    stats: (s) => {
      const stage = highestCampaignStage(s);
      let fastest: number | null = null;
      for (const track of Object.values(s.campaign.bestTime)) {
        for (const t of Object.values(track)) if (typeof t === 'number' && (fastest === null || t < fastest)) fastest = t;
      }
      return [
        { id: 'stage', label: 'Deepest Stage Cleared', value: String(stage), color: 'var(--caustic)' },
        { id: 'wins', label: 'Extractions', value: num(s.stats.runsCompleted) },
        { id: 'losses', label: 'Nuclei Lost', value: num(s.stats.runsFailed) },
        { id: 'fastest', label: 'Fastest Clear', value: fastest !== null ? fmtDuration(fastest) : '—', hint: 'Best stage-clear time across every stage and difficulty.' },
      ];
    },
  },
  {
    id: 'infinite-core', section: 'infinite', order: 10,
    stats: (s) => [
      { id: 'best', label: 'Deepest Wave', value: String(s.bestWave), color: 'var(--viral)' },
      { id: 'avg-wave', label: 'Average Final Wave', value: s.totalRuns > 0 ? String(Math.round(s.stats.waveSum / s.totalRuns)) : '—', hint: 'Across every settled run, all modes.' },
      { id: 'avg-run', label: 'Average Run Length', value: s.totalRuns > 0 ? fmtDuration(s.stats.playtimeSec / s.totalRuns) : '—' },
      { id: 'longest', label: 'Longest Run', value: s.stats.longestRunSec > 0 ? fmtDuration(s.stats.longestRunSec) : '—' },
    ],
  },
  {
    id: 'bossrush-core', section: 'bossrush', order: 10,
    stats: (s) => [
      { id: 'rush-best', label: 'Deepest Wave', value: String(s.rushBestWave), color: 'var(--danger)' },
      { id: 'rush-record', label: 'Best Single Run', value: `${s.rushBestBoss} bosses` },
      { id: 'rush-lifetime', label: 'Lifetime Bosses Felled', value: String(s.stats.rushBossKills), color: 'var(--gold)' },
      { id: 'rush-runs', label: 'Gauntlet Runs', value: String(s.stats.rushRuns) },
      { id: 'rush-ichor', label: 'Next Ichor Band', value: `${s.rushBestBoss}/${nextRushIchorAt(s.rushBestBoss)}`, hint: 'Every NEW 5-boss single-run record bleeds Ichor; every 10th drops a Bio-Container.' },
    ],
  },
  {
    id: 'collection-core', section: 'collection', order: 10,
    stats: (s) => {
      const cv = collectionView(collectionContextOf(s));
      return cv.categories.map((c) => ({
        id: `col-${c.id}`,
        label: c.name,
        value: `${c.discovered} / ${c.total}`,
        progress: pctOf(c.discovered, c.total),
        hint: `${c.rank} rank · ${Math.round(c.completion * 100)}% tier-weighted completion.`,
      }));
    },
  },
  {
    id: 'analytics-core', section: 'analytics', order: 10,
    stats: (s) => {
      const favHeroId = argmax(s.stats.heroUsage) as HeroKind | null;
      const draftedId = argmax(s.stats.cardDrafts);
      const doctrineId = argmax(s.stats.doctrineRuns);
      const towersUsed = TOWER_ORDER.filter((k) => (s.stats.towerUsage[k] ?? 0) > 0).length;
      const stage = highestCampaignStage(s);
      return [
        { id: 'fav-tower', label: 'Favorite Strain', value: favoriteTowerName(s.stats), hint: 'Most-grown tower across all runs.' },
        { id: 'fav-hero', label: 'Favorite Champion', value: favHeroId ? HERO_DEFS[favHeroId]?.name ?? favHeroId : '—', hint: 'Most-fielded hero.' },
        { id: 'top-card', label: 'Most Drafted Gene', value: draftedId ? cardRegistry.get(draftedId)?.name ?? draftedId : '—', hint: 'Lifetime draft counts began with schema v22.' },
        { id: 'top-doctrine', label: 'Preferred Doctrine', value: doctrineId ? DOCTRINES[doctrineId]?.name ?? doctrineId : '—' },
        { id: 'home-biome', label: 'Frontier Biome', value: stage > 0 ? biomeForStage(stage + 1).name : '—', hint: 'The ecosystem your campaign frontier sits in.' },
        { id: 'breadth', label: 'Arsenal Breadth', value: `${towersUsed} / ${TOWER_ORDER.length}`, progress: pctOf(towersUsed, TOWER_ORDER.length), hint: 'Distinct strains ever deployed — build diversity.' },
      ];
    },
  },
]);

// ── Banner (identity strip) ───────────────────────────────────────────────────

export interface ProfileFrame {
  id: string;
  name: string;
  blurb: string; // how to unlock it
  unlocked: (save: SaveData) => boolean;
}

/** Unlockable banner frames — data; appending one here is the whole feature. */
export const PROFILE_FRAMES: ProfileFrame[] = [
  { id: 'membrane', name: 'Membrane', blurb: 'The specimen line’s first containment.', unlocked: () => true },
  { id: 'chitin', name: 'Chitin Plate', blurb: 'Clear Campaign Stage 25.', unlocked: (s) => highestCampaignStage(s) >= 25 },
  { id: 'molted', name: 'Molted Crown', blurb: 'Complete your first MOLT.', unlocked: (s) => s.prestige.molts >= 1 },
  { id: 'abyssal', name: 'Abyssal Lattice', blurb: 'Reach Infinite Depth 100.', unlocked: (s) => s.bestWave >= 100 },
  { id: 'archivist', name: 'Archivist Halo', blurb: 'Reach 50% Archive discovery.', unlocked: (s) => collectionView(collectionContextOf(s)).pct >= 0.5 },
  { id: 'apex', name: 'Apex Aureole', blurb: 'Unlock 15 achievements.', unlocked: (s) => s.achievements.length >= 15 },
];

export interface BannerModel {
  name: string;
  title: string | null; // resolved worn-title name
  power: number;
  stage: number;
  bestWave: number;
  molts: number;
  playtime: string;
  accountAge: string; // "—" until the first settle stamps createdAt
  difficulty: string; // campaign difficulty preference (device)
  favoriteTower: string;
  favoriteHero: string;
  frame: ProfileFrame; // the SELECTED frame (falls back to the default)
  frames: (ProfileFrame & { isUnlocked: boolean })[];
}

export function playerBanner(save: SaveData): BannerModel {
  const favHeroId = argmax(save.stats.heroUsage) as HeroKind | null;
  const frames = PROFILE_FRAMES.map((f) => ({ ...f, isUnlocked: f.unlocked(save) }));
  const frame = PROFILE_FRAMES.find((f) => f.id === save.profileFrame && f.unlocked(save)) ?? PROFILE_FRAMES[0];
  return {
    name: save.profileName,
    title: save.equippedTitle ? masteryRewardById(save.equippedTitle)?.name ?? save.equippedTitle : null,
    power: composePower(accountPowerParts(save)).score,
    stage: highestCampaignStage(save),
    bestWave: save.bestWave,
    molts: save.prestige.molts,
    playtime: save.stats.playtimeSec > 0 ? fmtDuration(save.stats.playtimeSec) : '—',
    accountAge: save.createdAt > 0 ? `${Math.max(1, Math.ceil((Date.now() - save.createdAt) / 86400000))}d` : '—',
    difficulty: resolveDifficulty(difficultyPref('campaign')).name,
    favoriteTower: favoriteTowerName(save.stats),
    favoriteHero: favHeroId ? HERO_DEFS[favHeroId]?.name ?? favHeroId : '—',
    frame,
    frames,
  };
}

// ── Power breakdown (the progression map) ─────────────────────────────────────

export interface PowerSlice {
  id: string;
  label: string;
  mult: number; // the bucket's multiplier (×1 = no contribution yet)
  share: number; // Power points attributed to this bucket (log-share of the gained total)
  hint: string;
}

/** Split the Power Score into its REAL model buckets. Attribution is the log-share of each
 *  multiplicative bucket (mathematically consistent: shares sum to score − POWER_BASE). */
export function powerBreakdown(save: SaveData): { score: number; base: number; slices: PowerSlice[] } {
  const parts = accountPowerParts(save);
  const score = composePower(parts).score;
  const defs: { id: string; label: string; mult: number; hint: string }[] = [
    { id: 'towers', label: 'Tower Evolution', mult: parts.towers, hint: 'Stars, mastery and branch depth across the strains (geomean).' },
    { id: 'heroes', label: 'Champions', mult: parts.heroes, hint: 'Hero stars + hero mastery across the roster.' },
    { id: 'equipment', label: 'Equipment', mult: parts.equipment, hint: 'Equipped loadouts across every hero (rarity + affixes + set bonuses).' },
    { id: 'meta', label: 'Permanent Evolution', mult: parts.meta, hint: 'Upgrades, Prestige, Ascendant tree, gene levels, collection bonuses, hero slots.' },
    { id: 'collection', label: 'Archive', mult: parts.collection, hint: 'Assimilation Archive completion power.' },
  ];
  const logs = defs.map((d) => Math.log(Math.max(1, d.mult)));
  const logSum = logs.reduce((a, b) => a + b, 0);
  const gained = Math.max(0, score - POWER_BASE);
  return {
    score,
    base: POWER_BASE,
    slices: defs.map((d, i) => ({
      ...d,
      share: logSum > 0 ? Math.round((gained * logs[i]) / logSum) : 0,
    })),
  };
}

// ── Achievements showcase ─────────────────────────────────────────────────────

export interface ShowcaseModel {
  count: number;
  total: number;
  recent: AchievementDef | null; // last unlocked (insertion order)
  rarest: AchievementDef | null; // highest-reward unlocked (the value proxy for rarity)
  goal: AchievementDef | null; // a locked, visible achievement to chase next
}

export function achievementShowcase(save: SaveData): ShowcaseModel {
  const unlocked = save.achievements.map(achievementById).filter((d): d is AchievementDef => !!d);
  const rarest = unlocked.reduce<AchievementDef | null>((a, b) => ((b.reward ?? 0) > (a?.reward ?? -1) ? b : a), null);
  const goal = ACHIEVEMENTS.find((a) => !a.hidden && !save.achievements.includes(a.id)) ?? null;
  return {
    count: unlocked.length,
    total: ACHIEVEMENTS.length,
    recent: unlocked[unlocked.length - 1] ?? null,
    rarest,
    goal,
  };
}
