// CANONICAL STORE COPY (docs/PIL.md §stores) — the ONE place marketing language lives.
// `npm run pil -- release` folds this + the latest Chronicle release (site/patchnotes.json)
// into per-store bundles (store/*.md) and the in-game What's New feed — the same truth
// everywhere, written once. Update THIS file when the pitch changes; never edit a bundle.

export const GAME_NAME = 'ASSIMILATE';
export const TAGLINE = 'You are not defending against the swarm. You ARE the swarm.';

export const DESCRIPTION_LONG =
  'ASSIMILATE is a bio-horror tower defense where the towers are organisms, the battlefield is a body, ' +
  'and every run feeds a permanent, ever-mutating hive. Grow living turrets, splice Gene Cards mid-run, ' +
  'field evolving heroes, and push three pillars — Campaign, Infinite, and Boss Rush — while the arena ' +
  'itself assimilates around your growth. Deterministic runs, deep progression, fully playable offline.';

/** The feature bullets every storefront shares (order = priority). */
export const FEATURE_BULLETS: string[] = [
  '15+ living towers with Strains, Branches and permanent Star evolution',
  'Heroes that fight beside you — gear them, fork their abilities, watch them mutate',
  'Three pillars: hand-crafted Campaign, endless Infinite, and Boss Rush gauntlets',
  '500+ Gene Cards, equipment sets, mulligans and prestige — a decade of progression',
  'The Living Battlefield: the arena visibly assimilates as your run deepens',
  'One account, every device — cloud saves, cross-progression, full offline play',
  'Deterministic runs with shareable, self-verifying replays and daily leaderboards',
];

export const SEO_KEYWORDS: string[] = [
  'tower defense', 'bio horror game', 'roguelite TD', 'idle progression', 'browser tower defense',
  'assimilate game', 'mutation strategy game', 'endless tower defense', 'boss rush',
];

export interface StoreTarget {
  id: 'steam' | 'googleplay' | 'appstore';
  label: string;
  /** Store-imposed caps the generator enforces (chars). */
  shortDescMax: number;
  whatsNewMax: number;
}

export const STORE_TARGETS: StoreTarget[] = [
  { id: 'steam', label: 'Steam', shortDescMax: 300, whatsNewMax: 4000 },
  { id: 'googleplay', label: 'Google Play', shortDescMax: 80, whatsNewMax: 500 },
  { id: 'appstore', label: 'Apple App Store', shortDescMax: 170, whatsNewMax: 4000 },
];

export const SHORT_DESC: Record<StoreTarget['id'], string> = {
  steam: 'Bio-horror tower defense: grow living turrets, splice genes mid-run, and assimilate the battlefield itself across Campaign, Infinite and Boss Rush — with permanent mutation between runs.',
  googleplay: 'Bio-horror tower defense. Grow living turrets. Assimilate everything.',
  appstore: 'Bio-horror tower defense: grow living turrets, splice genes mid-run, and assimilate the battlefield across three game modes.',
};
