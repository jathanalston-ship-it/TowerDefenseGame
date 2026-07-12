// NAVIGATION MODEL (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the single source of truth for
// the hub's information architecture. The DESKTOP rail and the PORTRAIT tab shell both derive
// from `navGroups()`, and the validation layer (navModel.test.ts + scripts/mobilecheck.ts)
// derives its coverage contracts from the same rows — so a NEW screen added here is
// automatically grouped on desktop, indexed under the right mobile tab, and asserted reachable
// on BOTH layouts. There is no second list to forget.
//
// Pure data + i18n only: no React, no DOM — importable from vite-node scripts and tests.

import { t } from '../i18n';

export type NavKey =
  | 'home' | 'campaign' | 'infinite' | 'bossrush' | 'daily' | 'quests' | 'season'
  | 'towers' | 'heroes' | 'expeditions' | 'evolution' | 'genes' | 'mulligans' | 'hive' | 'harvest'
  | 'vault' | 'market' | 'equipment' | 'gearcodex' | 'phenotypes' | 'collection'
  | 'store'
  | 'profile' | 'settings' | 'help';

/** Stable group ids — the portrait tab mapping keys on these (titles localize; ids don't). */
export type NavGroupId = 'play' | 'progression' | 'collection' | 'store' | 'account';

export interface NavItem { key: NavKey; label: string; mono: string }
/** `compact` renders the group as a row of labelled icon squares (the Account trio) so every
 * destination — Settings included — stays visible without scrolling the rail. `headerless`
 * drops the group title when it would merely repeat its only item's label (the Store). */
export interface NavGroup { id: NavGroupId; title: string; accent: string; items: NavItem[]; compact?: boolean; headerless?: boolean }

// The nav is GROUPED by intent (the user-facing IA): Play / Progression / Collection / Account.
// Adding a screen is one row in the right group — the renderer, badges, and rings are generic.
export const navGroups = (): NavGroup[] => [
  { id: 'play', title: t('nav.group.play'), accent: 'var(--vital)', items: [
    { key: 'home', label: t('nav.home'), mono: '⌂' },
    { key: 'campaign', label: t('nav.campaign'), mono: '⬡' },
    { key: 'infinite', label: t('nav.infinite'), mono: '∞' },
    { key: 'bossrush', label: t('nav.bossrush'), mono: '☠' },
    { key: 'daily', label: t('nav.daily'), mono: '☀' },
    { key: 'quests', label: t('nav.quests'), mono: '✪' },
    { key: 'season', label: t('nav.season'), mono: '❁' },
  ] },
  { id: 'progression', title: t('nav.group.progression'), accent: 'var(--kinetic)', items: [
    { key: 'towers', label: t('nav.towers'), mono: 'T' },
    { key: 'heroes', label: t('nav.heroes'), mono: 'H' },
    { key: 'expeditions', label: t('nav.expeditions'), mono: '⇢' }, // Hero Expeditions (docs/EXPEDITIONS.md)
    { key: 'evolution', label: t('nav.evolution'), mono: '✷' },
    { key: 'genes', label: t('nav.genes'), mono: '⌬' },
    { key: 'mulligans', label: t('nav.mulligans'), mono: '⊛' },
    { key: 'hive', label: t('nav.hive'), mono: '⬡' }, // Hive Construction (docs/HIVE-CONSTRUCTION.md)
    { key: 'harvest', label: t('nav.harvest'), mono: '⬣' }, // Idle Harvest (docs/IDLE-HARVEST.md)
  ] },
  { id: 'collection', title: t('nav.group.collection'), accent: 'var(--gold)', items: [
    { key: 'vault', label: t('nav.vault'), mono: '◈' },
    { key: 'market', label: t('nav.market'), mono: '◆' },
    { key: 'equipment', label: t('nav.equipment'), mono: '⛨' },
    { key: 'gearcodex', label: t('nav.gearcodex'), mono: '❑' },
    { key: 'phenotypes', label: t('nav.phenotypes'), mono: '❖' },
    { key: 'collection', label: t('nav.collection'), mono: '▤' },
  ] },
  // The Premium Store sits in its OWN group — monetization stays visibly separate from
  // gameplay progression (docs/PREMIUM-STORE.md §philosophy). Headerless: the divider +
  // viral accent carry the separation; a "STORE" title over a "STORE" row said it twice.
  { id: 'store', title: t('nav.group.store'), accent: 'var(--viral)', headerless: true, items: [
    { key: 'store', label: t('nav.store'), mono: '✷' },
  ] },
  { id: 'account', title: t('nav.group.account'), accent: 'var(--muted)', compact: true, items: [
    { key: 'profile', label: t('nav.profile'), mono: '◑' },
    { key: 'help', label: t('nav.help'), mono: '?' },
    { key: 'settings', label: t('nav.settings'), mono: '⚙' },
  ] },
];

// ── Portrait tab shell ─────────────────────────────────────────────────────────
// Five thumb-reachable tabs. HOME jumps straight to the Command Center; every other tab opens
// an INDEX PAGE of self-describing rows (glyph + name + blurb from the unlock registry), and a
// row drills into the screen with a back header. The tabs DERIVE from the groups above via
// TAB_OF_GROUP — a new nav group needs one mapping row here and nothing else.

export type MobileTabKey = 'home' | 'battle' | 'evolve' | 'armory' | 'more';

export interface MobileTab { key: MobileTabKey; label: string; glyph: string; navs: NavKey[] }

const TAB_OF_GROUP: Record<NavGroupId, Exclude<MobileTabKey, 'home'>> = {
  play: 'battle', // minus 'home', which is its own tab
  progression: 'evolve',
  collection: 'armory',
  store: 'more',
  account: 'more',
};

export function mobileTabs(): MobileTab[] {
  const groups = navGroups();
  const navsFor = (tab: MobileTabKey): NavKey[] =>
    groups
      .filter((g) => TAB_OF_GROUP[g.id] === tab)
      .flatMap((g) => g.items.map((i) => i.key))
      .filter((k) => k !== 'home');
  return [
    { key: 'home', label: t('mnav.home'), glyph: '⌂', navs: ['home'] },
    { key: 'battle', label: t('mnav.battle'), glyph: '⬡', navs: navsFor('battle') },
    { key: 'evolve', label: t('mnav.evolve'), glyph: '✷', navs: navsFor('evolve') },
    { key: 'armory', label: t('mnav.armory'), glyph: '◈', navs: navsFor('armory') },
    { key: 'more', label: t('mnav.more'), glyph: '≡', navs: navsFor('more') },
  ];
}

/** Which portrait tab owns a screen (drives the active tab + the back header's destination). */
export function tabOf(k: NavKey): MobileTabKey {
  for (const tab of mobileTabs()) if (tab.navs.includes(k)) return tab.key;
  return 'home';
}
