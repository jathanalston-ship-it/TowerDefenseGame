// NAVIGATION MODEL (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the single source of truth for
// the hub's information architecture. The DESKTOP rail and the PORTRAIT tab shell both derive
// from `navGroups()`, and the validation layer (navModel.test.ts + scripts/mobilecheck.ts)
// derives its coverage contracts from the same rows — so a NEW screen added here is
// automatically grouped on desktop, indexed under the right mobile tab, and asserted reachable
// on BOTH layouts. There is no second list to forget.
//
// The groups are BEHAVIOR HUBS in reward-loop order (docs/NOTIFICATIONS.md §hubs):
// MISSION (fight) → REWARDS (claim/open what fights earned) → EVOLUTION (spend into permanent
// growth) → MARKET (trade/equip) → Store (monetization, deliberately separate —
// docs/PREMIUM-STORE.md §philosophy) → PROFILE (identity/record). Each hub carries a landing
// identity (glyph + blurb) rendered by ui/HubLanding.tsx and the portrait tab indexes.
//
// Pure data + i18n only: no React, no DOM — importable from vite-node scripts and tests.

import { t } from '../i18n';

export type NavKey =
  | 'home' | 'campaign' | 'infinite' | 'bossrush' | 'daily' | 'quests' | 'season' | 'arena' | 'infestation' | 'metabolism'
  | 'towers' | 'heroes' | 'expeditions' | 'evolution' | 'adaptation' | 'genes' | 'mulligans' | 'hive' | 'harvest'
  | 'vault' | 'market' | 'auction' | 'equipment' | 'gearcodex' | 'phenotypes' | 'collection'
  | 'store'
  | 'profile' | 'settings' | 'help';

/** Stable group ids — the portrait tab mapping keys on these (titles localize; ids don't). */
export type NavGroupId = 'play' | 'rewards' | 'progression' | 'trade' | 'store' | 'account';

export interface NavItem { key: NavKey; label: string; mono: string }
/** The desktop rail renders ONE front-door button per group (less visual clutter — screens
 * are picked from the hub LANDING pages). `headerless` marks a group that IS its single item
 * (the Store): its door navigates straight to the screen instead of a one-card landing hop.
 * `hub` is the landing-page identity (ui/HubLanding.tsx): glyph + one-line promise. */
export interface NavGroup {
  id: NavGroupId; title: string; accent: string; items: NavItem[];
  hub: { glyph: string; blurb: string };
  headerless?: boolean;
}

// Adding a screen is one row in the right hub — the renderer, badges, rings, landing pages,
// and recommendations are generic.
export const navGroups = (): NavGroup[] => [
  { id: 'play', title: t('nav.group.play'), accent: 'var(--vital)', hub: { glyph: '⬡', blurb: t('hub.blurb.play') }, items: [
    { key: 'home', label: t('nav.home'), mono: '⌂' },
    { key: 'campaign', label: t('nav.campaign'), mono: '⬡' },
    { key: 'infinite', label: t('nav.infinite'), mono: '∞' },
    { key: 'bossrush', label: t('nav.bossrush'), mono: '☠' },
    { key: 'daily', label: t('nav.daily'), mono: '☀' },
    { key: 'arena', label: t('nav.arena'), mono: '⚔' }, // The Proving Grounds (docs/ARENA.md)
    { key: 'infestation', label: t('nav.infestation'), mono: '⛬' }, // THE FRONT — territory war (docs/INFESTATION.md §front)
  ] },
  // Every claim/open surface in one hub — the CLAIM beat of the loop lives here, so "what do
  // I have waiting?" is one place, not five.
  { id: 'rewards', title: t('nav.group.rewards'), accent: 'var(--gold)', hub: { glyph: '✪', blurb: t('hub.blurb.rewards') }, items: [
    { key: 'quests', label: t('nav.quests'), mono: '✪' },
    { key: 'season', label: t('nav.season'), mono: '❁' },
    { key: 'vault', label: t('nav.vault'), mono: '◈' },
    { key: 'expeditions', label: t('nav.expeditions'), mono: '⇢' }, // Hero Expeditions (docs/EXPEDITIONS.md)
    { key: 'harvest', label: t('nav.harvest'), mono: '⬣' }, // Idle Harvest (docs/IDLE-HARVEST.md)
    { key: 'metabolism', label: t('nav.metabolism'), mono: '✹' }, // Metabolism milestones (docs/METABOLISM.md)
  ] },
  { id: 'progression', title: t('nav.group.progression'), accent: 'var(--kinetic)', hub: { glyph: '✷', blurb: t('hub.blurb.progression') }, items: [
    { key: 'towers', label: t('nav.towers'), mono: 'T' },
    { key: 'heroes', label: t('nav.heroes'), mono: 'H' },
    { key: 'evolution', label: t('nav.evolution'), mono: '✷' },
    { key: 'adaptation', label: t('nav.adaptation'), mono: '☣' }, // Adaptation Chamber (docs/ADAPTATION.md)
    { key: 'genes', label: t('nav.genes'), mono: '⌬' },
    { key: 'mulligans', label: t('nav.mulligans'), mono: '⊛' },
    { key: 'hive', label: t('nav.hive'), mono: '⬡' }, // Hive Construction (docs/HIVE-CONSTRUCTION.md)
  ] },
  { id: 'trade', title: t('nav.group.trade'), accent: 'var(--caustic)', hub: { glyph: '◆', blurb: t('hub.blurb.trade') }, items: [
    { key: 'market', label: t('nav.market'), mono: '◆' },
    { key: 'auction', label: t('nav.auction'), mono: '⚖' }, // player-driven Auction House (docs/AUCTION-HOUSE.md)
    { key: 'equipment', label: t('nav.equipment'), mono: '⛨' },
    { key: 'gearcodex', label: t('nav.gearcodex'), mono: '❑' },
    { key: 'phenotypes', label: t('nav.phenotypes'), mono: '❖' },
  ] },
  // The Premium Store sits in its OWN group — monetization stays visibly separate from
  // gameplay progression (docs/PREMIUM-STORE.md §philosophy). Headerless: the divider +
  // viral accent carry the separation; a "STORE" title over a "STORE" row said it twice.
  { id: 'store', title: t('nav.group.store'), accent: 'var(--viral)', headerless: true, hub: { glyph: '✷', blurb: t('hub.blurb.store') }, items: [
    { key: 'store', label: t('nav.store'), mono: '✷' },
  ] },
  { id: 'account', title: t('nav.group.account'), accent: 'var(--muted)', hub: { glyph: '◑', blurb: t('hub.blurb.account') }, items: [
    { key: 'profile', label: t('nav.profile'), mono: '◑' },
    { key: 'collection', label: t('nav.collection'), mono: '▤' },
    { key: 'help', label: t('nav.help'), mono: '?' },
    { key: 'settings', label: t('nav.settings'), mono: '⚙' },
  ] },
];

/** The group (hub) that owns a screen — landing pages and back-routing key on this. */
export function groupOf(k: NavKey): NavGroup {
  const groups = navGroups();
  return groups.find((g) => g.items.some((i) => i.key === k)) ?? groups[0];
}

// ── Portrait tab shell ─────────────────────────────────────────────────────────
// Five thumb-reachable tabs in reward-loop order (Home / Battle / Rewards / Evolve / More).
// HOME jumps straight to the Command Center; every other tab opens an INDEX PAGE of
// self-describing rows (glyph + name + blurb from the unlock registry), and a row drills
// into the screen with a back header. The tabs DERIVE from the groups above via
// TAB_OF_GROUP — a new nav group needs one mapping row here and nothing else.

export type MobileTabKey = 'home' | 'battle' | 'rewards' | 'evolve' | 'more';

export interface MobileTab { key: MobileTabKey; label: string; glyph: string; navs: NavKey[] }

const TAB_OF_GROUP: Record<NavGroupId, Exclude<MobileTabKey, 'home'>> = {
  play: 'battle', // minus 'home', which is its own tab
  rewards: 'rewards',
  progression: 'evolve',
  trade: 'more',
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
    { key: 'rewards', label: t('mnav.rewards'), glyph: '✪', navs: navsFor('rewards') },
    { key: 'evolve', label: t('mnav.evolve'), glyph: '✷', navs: navsFor('evolve') },
    { key: 'more', label: t('mnav.more'), glyph: '≡', navs: navsFor('more') },
  ];
}

/** Which portrait tab owns a screen (drives the active tab + the back header's destination). */
export function tabOf(k: NavKey): MobileTabKey {
  for (const tab of mobileTabs()) if (tab.navs.includes(k)) return tab.key;
  return 'home';
}
