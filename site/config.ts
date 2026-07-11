// SITE CONFIG (docs/WEBSITE.md §architecture) — the one place the marketing site's shape lives.
// The static site is GENERATED from this + the content modules by `npm run site` (scripts/
// gen-site.ts) into committed files under public/, so Cloudflare Pages serves real HTML at the
// domain root while the game app lives at /play/. Adding a page = one entry here + one content
// module — the nav, sitemap, search index and link-check test all pick it up automatically.

export const DOMAIN = 'https://assimilationtowerdefense.com';
export const SITE_NAME = 'ASSIMILATE';
export const TAGLINE = 'Grow. Mutate. Assimilate. A cyberpunk bio-horror tower defense.';
// Interim REAL support address (stamped by the account-platform batch; replace with a dedicated
// support alias once mail on the domain is set up — AdSense wants a reachable contact).
export const CONTACT_EMAIL = 'jathan.alston@gmail.com';

/** Primary navigation — grouped for the header (groups become dropdowns on desktop,
 *  sections in the mobile drawer). `path` is the served URL (always trailing slash). */
export interface NavItem { label: string; path: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: (NavItem | NavGroup)[] = [
  { label: 'Home', path: '/' },
  {
    label: 'Game',
    items: [
      { label: 'About', path: '/about/' },
      { label: 'Features', path: '/features/' },
      { label: 'Roadmap', path: '/roadmap/' },
      { label: 'FAQ', path: '/faq/' },
    ],
  },
  {
    label: 'Guides',
    items: [
      { label: 'All Guides', path: '/guides/' },
      { label: 'Beginner Guide', path: '/guides/beginner/' },
      { label: 'Tower Guide', path: '/guides/towers/' },
      { label: 'Hero Guide', path: '/guides/heroes/' },
      { label: 'Doctrine Guide', path: '/guides/doctrines/' },
      { label: 'Weekly Contracts', path: '/guides/contracts/' },
      { label: 'Progression Guide', path: '/guides/progression/' },
    ],
  },
  {
    label: 'Encyclopedia',
    items: [
      { label: 'Enemy Compendium', path: '/encyclopedia/enemies/' },
      { label: 'Biome Encyclopedia', path: '/encyclopedia/biomes/' },
      { label: 'Doctrine Codex', path: '/encyclopedia/doctrines/' },
      { label: 'Collection Records', path: '/encyclopedia/collections/' },
    ],
  },
  {
    label: 'News',
    items: [
      { label: 'Dev Blog', path: '/blog/' },
      { label: 'Patch Notes', path: '/news/' },
      { label: 'Leaderboards', path: '/leaderboards/' },
    ],
  },
];

/** The Play CTA rides outside the groups (always visible, styled hot). */
export const PLAY_PATH = '/play/';

export const FOOTER_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Game',
    items: [
      { label: 'Play Free', path: '/play/' },
      { label: 'About', path: '/about/' },
      { label: 'Features', path: '/features/' },
      { label: 'Roadmap', path: '/roadmap/' },
      { label: 'FAQ', path: '/faq/' },
    ],
  },
  {
    label: 'Learn',
    items: [
      { label: 'Guides', path: '/guides/' },
      { label: 'Enemy Compendium', path: '/encyclopedia/enemies/' },
      { label: 'Biome Encyclopedia', path: '/encyclopedia/biomes/' },
      { label: 'Doctrine Codex', path: '/encyclopedia/doctrines/' },
      { label: 'Collection Records', path: '/encyclopedia/collections/' },
    ],
  },
  {
    label: 'News',
    items: [
      { label: 'Dev Blog', path: '/blog/' },
      { label: 'Patch Notes', path: '/news/' },
      { label: 'Leaderboards', path: '/leaderboards/' },
    ],
  },
  {
    label: 'Studio',
    items: [
      { label: 'Contact', path: '/contact/' },
      { label: 'Credits', path: '/credits/' },
      { label: 'Privacy Policy', path: '/privacy/' },
      { label: 'Terms of Service', path: '/terms/' },
      { label: 'Cookie Policy', path: '/cookies/' },
    ],
  },
];

/** Every flat nav item (used by the sitemap + the link-check test). */
export function allNavPaths(): string[] {
  const out = new Set<string>([PLAY_PATH]);
  for (const n of NAV) {
    if ('items' in n) for (const i of n.items) out.add(i.path);
    else out.add(n.path);
  }
  for (const g of FOOTER_GROUPS) for (const i of g.items) out.add(i.path);
  return [...out];
}
