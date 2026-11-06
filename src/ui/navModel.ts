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
//
// ONE NAME PER SCREEN (docs/UI-STANDARDS.md §naming): a row's label + mono DERIVE from the feature
// registry (state/unlocks.ts FEATURES — name + glyph), so the rail, breadcrumb and sibling chips
// can never drift from the hub cards, advice and page titles. navModel.test.ts pins it.

import { screenName, t } from '../i18n';
import { FEATURE_BY_ID } from '../state/unlocks';

export type NavKey =
  | 'home' | 'campaign' | 'infinite' | 'bossrush' | 'daily' | 'quests' | 'season' | 'arena' | 'infestation' | 'metabolism'
  | 'towers' | 'heroes' | 'expeditions' | 'evolution' | 'bonds' | 'adaptation' | 'genes' | 'mulligans' | 'hive' | 'harvest'
  | 'vault' | 'market' | 'auction' | 'equipment' | 'gearcodex' | 'phenotypes' | 'specimens' | 'collection'
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

/** A screen's player-facing name in the current locale — the feature-registry name (the single
 *  source), translated by id outside English. Folded tabs resolve too. */
export function navLabel(k: NavKey): string {
  return screenName(k, FEATURE_BY_ID.get(k)?.name ?? k);
}

/** One nav row, derived — never hand-labelled (the registry owns name + glyph). */
const row = (key: NavKey): NavItem => ({ key, label: navLabel(key), mono: FEATURE_BY_ID.get(key)?.glyph ?? '·' });

// Adding a screen is one row in the right hub — the renderer, badges, rings, landing pages,
// and recommendations are generic.
export const navGroups = (): NavGroup[] => [
  { id: 'play', title: t('nav.group.play'), accent: 'var(--vital)', hub: { glyph: '⬡', blurb: t('hub.blurb.play') }, items: [
    row('home'),
    row('campaign'),
    row('infinite'),
    row('bossrush'),
    row('daily'),
    row('arena'), // The Proving Grounds (docs/ARENA.md)
    row('infestation'), // THE FRONT — territory war (docs/INFESTATION.md §front)
  ] },
  // Every claim/open surface in one hub — the CLAIM beat of the loop lives here, so "what do
  // I have waiting?" is one place, not five.
  { id: 'rewards', title: t('nav.group.rewards'), accent: 'var(--gold)', hub: { glyph: '✪', blurb: t('hub.blurb.rewards') }, items: [
    row('quests'),
    row('season'),
    row('vault'),
  ] },
  { id: 'progression', title: t('nav.group.progression'), accent: 'var(--kinetic)', hub: { glyph: '✷', blurb: t('hub.blurb.progression') }, items: [
    row('towers'),
    row('heroes'),
    row('evolution'),
    row('bonds'), // Class Bonds (docs/CLASS-BONDS.md)
    row('adaptation'), // Adaptation Chamber (docs/ADAPTATION.md)
    row('genes'),
    row('mulligans'),
    row('hive'), // Hive Construction (docs/HIVE-CONSTRUCTION.md)
  ] },
  { id: 'trade', title: t('nav.group.trade'), accent: 'var(--caustic)', hub: { glyph: '◆', blurb: t('hub.blurb.trade') }, items: [
    row('market'),
    row('auction'), // player-driven Auction House (docs/AUCTION-HOUSE.md)
    row('equipment'),
    row('phenotypes'),
  ] },
  // The Premium Store sits in its OWN group — monetization stays visibly separate from
  // gameplay progression (docs/PREMIUM-STORE.md §philosophy). Headerless: the divider +
  // viral accent carry the separation; a "STORE" title over a "STORE" row said it twice.
  { id: 'store', title: t('nav.group.store'), accent: 'var(--viral)', headerless: true, hub: { glyph: '✷', blurb: t('hub.blurb.store') }, items: [
    row('store'),
  ] },
  { id: 'account', title: t('nav.group.account'), accent: 'var(--muted)', hub: { glyph: '◑', blurb: t('hub.blurb.account') }, items: [
    row('profile'),
    row('collection'),
    row('help'),
    row('settings'),
  ] },
];

// ── Folded screens (docs/NOTIFICATIONS.md §hubs — "decisions, not destinations") ────────────
// Side screens that live as a TAB inside a host screen instead of as their own nav row. Every
// NavKey still deep-links: Hub.go('harvest') opens The Hive on its Production tab (the host
// component renders the tab strip — ui/components/HostTabs.tsx). Each folded key keeps its own
// unlock-registry row, so its tab reveals on its own beat. Adding a fold = one row here.
export const FOLDED_NAVS: Readonly<Partial<Record<NavKey, NavKey>>> = {
  harvest: 'hive', // Hive Production → The Hive
  expeditions: 'hive', // Expedition Command → The Hive
  metabolism: 'quests', // Milestones → the Quest Board
  specimens: 'phenotypes', // Specimen Vault → the Phenotype Lab (claim stock beside the wardrobe it binds into)
  gearcodex: 'equipment', // Gear Codex → the Armory
};

/** The screen that renders a NavKey — its host when folded, itself otherwise. */
export function hostOf(k: NavKey): NavKey {
  return FOLDED_NAVS[k] ?? k;
}

/** The folded tabs a host carries, in declaration order (the host's own tab comes first). */
export function foldedInto(host: NavKey): NavKey[] {
  return (Object.keys(FOLDED_NAVS) as NavKey[]).filter((k) => FOLDED_NAVS[k] === host);
}

/** Roll per-NavKey counts (badges) up onto host screens — a folded tab's badge lights its host. */
export function foldCounts(rec: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(rec)) {
    const h = hostOf(k as NavKey);
    out[h] = (out[h] ?? 0) + n;
  }
  return out;
}

/** Roll per-NavKey reason lines up onto host screens (same rule as foldCounts). */
export function foldLines(rec: Readonly<Record<string, string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, lines] of Object.entries(rec)) (out[hostOf(k as NavKey)] ??= []).push(...lines);
  return out;
}

/** The group (hub) that owns a screen — landing pages and back-routing key on this. A folded
 *  screen belongs to its host's group. */
export function groupOf(k: NavKey): NavGroup {
  const groups = navGroups();
  const h = hostOf(k);
  return groups.find((g) => g.items.some((i) => i.key === h)) ?? groups[0];
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
  const h = hostOf(k);
  for (const tab of mobileTabs()) if (tab.navs.includes(h)) return tab.key;
  return 'home';
}
