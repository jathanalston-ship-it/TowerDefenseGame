// Mechanics registry (docs/HELP.md) — the single source of truth for the game's teachable systems.
// It powers BOTH the living Help wiki (shows only UNLOCKED mechanics) and the "What's New?" unlock
// announcements (fires when a mechanic's unlock predicate first becomes true). Adding a mechanic is
// one data row: its help content, unlock gate, category, cross-links, and where to find it. Pure over
// SaveData — never touches the sim.

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive'; // cycle-free (never import meta here)

export type MechanicCategory = 'Basics' | 'Towers' | 'Heroes' | 'Progression' | 'Modes' | 'World';

export interface MechanicDef {
  id: string;
  title: string;
  category: MechanicCategory;
  /** One-line hook (used by What's New + the wiki index). */
  summary: string;
  /** What it is · why it matters · where to find it · what it enables next (the wiki body + the
   *  What's New card). Kept tight — teach, don't drown. */
  what: string;
  why: string;
  where: string;
  next: string;
  /** Common mistakes / traps for this system — rendered as the wiki's "Watch out" row. */
  mistakes?: string;
  nav?: string; // Hub NavKey this links to (clickable UI reference), if any
  links?: string[]; // related mechanic ids (cross-linking)
  media?: string; // media placeholder caption (image/GIF/video slot — art lands later)
  /** Unlocked from the start? Otherwise `unlock(save)` gates both the wiki entry + the announcement. */
  core?: boolean;
  unlock?: (save: SaveData) => boolean;
}

const molts = (s: SaveData): number => s.prestige?.molts ?? 0;
const hasGear = (s: SaveData): boolean => s.equipment.inventory.length > 0;

// Order = display order within a category. Unknown (locked) mechanics stay hidden until unlocked.
export const MECHANICS: MechanicDef[] = [
  // ── Basics ──
  { id: 'hive-core', title: 'The Hive Core', category: 'Basics', core: true, nav: 'play',
    summary: 'Your one life — defend it.', media: 'GIF: enemies breaching the core',
    what: 'The Hive Core sits at the bottom of the field. Enemies that reach it deal damage to it.',
    why: 'If its integrity hits zero, the run ends — everything you build exists to keep it alive.',
    where: 'The bottom-centre of the battlefield, tracked in the top HUD.',
    next: 'Place towers and field your Hero to hold the line.',
    mistakes: 'Integrity does not regenerate between waves, and enemies that reach the Core ATTACK it until killed — a lone survivor chewing on the Hive bleeds you dry. Clear attackers off the Core immediately (your towers focus them automatically).' },
  { id: 'gene-essence', title: 'Gene Essence', category: 'Progression', nav: 'genes', links: ['gene-cards', 'gene-archive'],
    summary: 'Permanent currency that upgrades Gene Cards.',
    what: 'Gene Essence is the permanent currency for upgrading Gene Cards in the Gene Archive. Its main source is AUTO-CONVERSION: once a tower or hero hits max Star (Evolution), any further duplicate Shards from Bio-Containers convert straight into Gene Essence — more for rarer duplicates. A small bonus also drops rarely from Bio-Containers.',
    why: 'It turns "wasted" duplicate Shards on maxed units into lasting progression, so cracking containers always advances you.',
    where: 'Shown on the Bio-Container reveal (e.g. "+45 Gene Essence · Duplicate Legendary Hero") and spent in the Gene Archive.',
    next: 'Bank Essence, then permanently level your Gene Cards in the Archive.',
    unlock: (s) => (s.geneEssence ?? 0) > 0 || (s.stats?.uniqueCards?.length ?? 0) > 0 },
  { id: 'gene-archive', title: 'Gene Archive', category: 'Progression', nav: 'genes', links: ['gene-cards', 'gene-essence', 'gene-loadout'],
    summary: 'Permanently level your collected Gene Cards.',
    what: 'The Gene Archive holds every Gene Card you have ever drafted. Spend Gene Essence to buy permanent upgrade levels (3–5 per card) — each level adds real new effects that apply every time the card is drafted, and raises your Power Score immediately.',
    why: 'It turns run-only drafts into permanent account strength — the deeper your library, the stronger every future run.',
    where: 'The Gene Archive in the sidebar (Progression).',
    next: 'Deeper levels unlock globally at Campaign milestones (L2 at Stage 15 … L5 at Stage 75) — and Card Ascension arrives in a future update.',
    unlock: (s) => (s.stats?.uniqueCards?.length ?? 0) > 0 },
  { id: 'gene-loadout', title: 'Starting Gene Loadouts', category: 'Progression', nav: 'genes', links: ['gene-archive', 'gene-cards'],
    summary: 'Equip genes that auto-activate every run.',
    what: 'Starting Gene Loadouts equip owned Gene Cards into slots that automatically activate at the start of EVERY run — at their permanent Archive level. One slot is free; up to five unlock with Campaign progress plus Genome Cores.',
    why: 'Your best genes stop being a lucky draft — they are guaranteed from wave 1, every run, and your Power updates the moment you equip.',
    where: 'The STARTING GENES bar at the top of the Gene Archive.',
    next: 'Unlock more slots, rearrange freely (no duplicates), and build around a guaranteed opening.',
    unlock: (s) => (s.stats?.uniqueCards?.length ?? 0) > 0 },
  { id: 'biomass', title: 'Biomass', category: 'Basics', core: true, links: ['towers'],
    summary: 'In-run currency from kills.', media: 'Image: the Biomass counter',
    what: 'Biomass is the in-run currency. Enemies drop it on death and Flesh Reactors generate it.',
    why: 'You spend it to build and grow your defenses during a run. It resets each run.',
    where: 'The Biomass counter in the top HUD.',
    next: 'Spend it on towers; a Reactor build snowballs your income.',
    mistakes: 'Hoarding is a trap: unspent Biomass kills nothing. If the bank is full, build or upgrade before the next wave lands.' },
  { id: 'wave-rhythm', title: 'Waves & the Build Phase', category: 'Basics', core: true, links: ['biomass', 'towers'],
    summary: 'Fight, breathe, build — the run’s heartbeat.',
    what: 'Runs alternate between WAVES (enemies advance, towers fight) and the BUILD phase between them. The Wave Briefing console shows exactly what’s coming next — names, counts, and roles.',
    why: 'The build phase is where runs are won: reading the briefing and counter-building beats reacting mid-wave.',
    where: 'The Wave Briefing console appears above the battlefield between waves.',
    next: 'Auto Wave and Auto Gene (on the console) automate the rhythm once you trust your build.',
    mistakes: 'Starting the next wave with a full Biomass bank and an unchanged build is the most common way to leak — spend first, then deploy.' },
  { id: 'game-speed', title: 'Game Speed', category: 'Basics', links: ['wave-rhythm'],
    unlock: (s) => s.totalRuns >= 1,
    summary: '1× / 2× / 5× — the sim, byte-identical, just faster.',
    what: 'The speed control (top of the battlefield, or F) runs the simulation at 1×, 2×, or 5×. The outcome is exactly the same — only wall-clock time changes.',
    why: 'Farm waves you’ve outgrown at 5×; drop to 1× for boss reads and close calls.',
    where: 'Above the battlefield during a run (hotkey F cycles).',
    next: 'Auto-slow returns you to 1× at finales and personal records so the moment lands.',
    mistakes: 'Leaving 5× on through a boss telegraph is how healthy runs die — the game auto-slows at key moments, but the habit is yours to build.' },
  { id: 'emergency-defense', title: 'Emergency Defense', category: 'Basics', links: ['towers', 'hive-core'],
    unlock: (s) => s.totalRuns >= 1,
    summary: 'The red line — when enemies reach the Final Defense Zone.',
    what: 'When enemies push into the Final Defense Zone near the Hive Core, Danger Mode engages: the HUD banner flips to EMERGENCY DEFENSE, the zone washes red, and ALL towers prioritize the leakers.',
    why: 'It’s your last automatic safety net — and your cue to cast the Hero ability NOW.',
    where: 'The red band at the bottom of the battlefield; the wave console banner.',
    next: 'Rear-guard tower placements (short-range brawlers) turn the zone into a kill box.',
    mistakes: 'Danger Mode retargeting saves you from stragglers, not from a collapsed front line — if it fires every wave, the build needs range coverage further up.' },
  { id: 'power-score', title: 'Power Score', category: 'Basics', core: true, nav: 'profile', links: ['prediction'],
    summary: 'Your account strength, one number.', media: 'Image: Power Score readout',
    what: 'Power Score folds every permanent bucket — upgrades, stars, mastery, heroes, equipment, prestige — into one strength index.',
    why: 'It is the universal measure of how strong your account is, and it drives progress predictions.',
    where: 'Shown on the top bar and the Profile.',
    next: 'Grow it via any progression system; watch your predicted reach climb.' },
  // ── Towers ──
  { id: 'towers', title: 'Towers', category: 'Towers', core: true, nav: 'towers', links: ['tower-stars', 'tower-branches'],
    summary: 'Automated defenders you place with Biomass.', media: 'GIF: towers firing',
    what: 'Towers are placed on build slots for Biomass and fire automatically. Each class fills a battlefield role.',
    why: 'They are your primary damage — layering roles (single-target, splash, support) wins waves.',
    where: 'The tower rail at the bottom of the battlefield; managed in the Tower Lab.',
    next: 'Upgrade towers with Stars, then specialize them with Branches.',
    mistakes: 'Stacking one species walls out fast — armor, swarms, and flyers each punish a mono-build. Layer roles instead.' },
  { id: 'tower-stars', title: 'Tower Stars', category: 'Towers', nav: 'towers', links: ['towers'],
    unlock: (s) => Object.values(s.towerStars).some((n) => (n ?? 0) > 0) || Object.values(s.towerShards).some((n) => (n ?? 0) > 0),
    summary: 'Permanent tower power, bought with Strain Samples.', media: 'GIF: a tower evolving a star',
    what: 'Stars are permanent tower upgrades bought with Strain Samples in the Tower Lab. The Star Cap rises with Campaign depth.',
    why: 'Each star is a big, permanent damage jump — the backbone of tower scaling.',
    where: 'The Tower Lab.',
    next: 'Push the Campaign to raise the Star Cap and evolve further.' },
  { id: 'tower-mastery', title: 'Tower Mastery', category: 'Towers', nav: 'towers', links: ['towers', 'tower-stars'],
    unlock: (s) => Object.values(s.towerMasteryXp).some((n) => (n ?? 0) > 0),
    summary: 'Infinite craft levels from USING a tower — tracked live in every run.', media: 'GIF: the live mastery bar leveling mid-run',
    what: 'Every deployed tower earns Mastery XP from kills, damage, and time in the field. The bar fills LIVE during the run (select a tower to watch it), levels celebrate on the spot, and the XP banks at run end.',
    why: 'Each level is a small permanent damage bonus plus Power — and milestones unlock titles, lore, and mechanic perks. It never stops: ranks are infinite.',
    where: 'Select any placed tower in a run; the full ledger (lifetime kills, damage, best wave, next unlock) lives in the Tower Lab.',
    next: 'Chase the Lv 10 / 25 / 50 / 75 milestones — perks like extra pierce arrive there.' },
  { id: 'tower-branches', title: 'Tower Branches', category: 'Towers', nav: 'towers', links: ['towers', 'tower-stars'],
    unlock: (s) => highestCampaignStage(s) >= 3,
    summary: 'Specialize a tower down a mutation path.', media: 'GIF: the branch tree',
    what: 'Branches are in-run specialization paths that re-author a tower with new firing behavior across five tiers.',
    why: 'They turn a generic tower into a build-defining specialist mid-run.',
    where: 'Inspect a placed tower during a run to open its branch tree.',
    next: 'Match branches to the enemies you face and your Gene Card synergies.' },
  { id: 'adaptation', title: 'Adaptation & Antigen', category: 'Towers', nav: 'towers', links: ['towers', 'tower-mastery', 'tower-stars'],
    unlock: (s) => (s.antigen ?? 0) > 0 || highestCampaignStage(s) >= 15,
    summary: 'Per-tower talent trees bought with Antigen.',
    what: 'Every tower species has its own Adaptation tree — four branches of permanent behavioral picks with exclusive forks and an apex capstone — bought with Antigen from mastery ranks, campaign clears, container Traces, and achievements.',
    why: 'Stars make a tower stronger; Adaptation makes it DIFFERENT — the picks change how it fights, permanently.',
    where: 'The Tower Lab → a tower’s Adaptation tab (gates open at Campaign Stages 15/30/50).',
    next: 'Respec is available (priced, stage-gated) — experiment once a tree fills out.',
    mistakes: 'Antigen income is capped per source — spreading picks thin across every tower dilutes it. Deepen the towers you actually field.' },
  { id: 'gene-cards', title: 'Gene Cards', category: 'Towers', core: true, nav: 'genes', links: ['towers', 'gene-archive', 'gene-essence'],
    summary: 'Drafted boosts for this run — collected forever.', media: 'GIF: the draft',
    what: 'Gene Cards are drafted between waves. The BOOST lasts only for the current run — but the card itself is a permanent collectible: once drafted, it joins your Gene Archive forever, at whatever permanent level you have evolved it to.',
    why: 'Drafts shape each run differently, and every discovery is lasting progress — a leveled card is stronger every future time you draft it.',
    where: 'The draft after clearing a wave; your collection lives in the Gene Archive.',
    next: 'Chase synergies in-run, then level your discovered cards with Gene Essence in the Archive.',
    mistakes: 'Don’t auto-pick raw damage every time — economy and utility genes compound over a long run, and NEW cards are permanent collection progress.' },
  // ── Heroes ──
  { id: 'heroes', title: 'Heroes', category: 'Heroes', core: true, nav: 'heroes', links: ['hero-slots', 'equipment'],
    summary: 'A living unit that moves and fights on its own.', media: 'GIF: the hero fighting',
    what: 'Your Hero patrols the field autonomously, attacks, and has a powerful Active Ability you trigger.',
    why: 'A Hero is mobile burst + control the static towers can’t provide.',
    where: 'On the battlefield; developed in the Hero Lab.',
    next: 'Open the Hero Combat Console in a run (E, or tap the hero chip) to spend Biomass. Gear the Hero in the Armory and unlock more Hero Slots.',
    mistakes: 'An ability saved forever is an ability wasted — it recharges. Spend it on any real push, not just emergencies.' },
  { id: 'hero-evolution', title: 'Hero Evolution (in-run)', category: 'Heroes', links: ['heroes', 'biomass'],
    unlock: (s) => s.totalRuns >= 1,
    summary: 'Spend Biomass on your hero mid-run — ten axes, ten levels.',
    what: 'The Hero Combat Console (E, or tap the hero chip) spends this run’s Biomass on ten evolution axes — damage, speed, ability amplitude and more. It resets every run.',
    why: 'It’s the other Biomass sink: when the board is built, the hero is where surplus income keeps converting into power.',
    where: 'In a run: press E or tap the hero chip in the HUD.',
    next: 'Later heroes inherit your evolution habits — the console works identically for every roster slot.',
    mistakes: 'The console PAUSES the game while open — use that breath; but towers still win most runs. Evolve the hero with surplus, not instead of the front line.' },
  { id: 'hero-slots', title: 'Hero Slots', category: 'Heroes', nav: 'heroes', links: ['heroes'],
    unlock: (s) => highestCampaignStage(s) >= 25,
    summary: 'Field 2, then 3 heroes at once.', media: 'Image: the Hero Slots strip',
    what: 'Clearing Campaign milestones (Stage 25, then 90) unlocks a second and third Hero Slot.',
    why: 'Multiple heroes multiply your board control — dive + sustain + control across lanes.',
    where: 'The Hero Lab’s Hero Slots strip.',
    next: 'Each hero keeps its own gear, stars, and mastery — build a trio.' },
  { id: 'equipment', title: 'Equipment', category: 'Heroes', nav: 'equipment', links: ['heroes', 'equipment-reforge'],
    unlock: hasGear,
    summary: 'Weapons, armor, and relics for your heroes.', media: 'GIF: equipping an item',
    what: 'Equipment drops from containers and slots into a hero’s Weapon / Armor / Relic. Each hero keeps its own loadout.',
    why: 'Gear is a huge, build-defining power source — sets and affixes enable archetypes.',
    where: 'The Armory (Equipment).',
    next: 'Reforge items to push their quality; complete sets for bonuses.' },
  { id: 'equipment-reforge', title: 'Equipment Reforging', category: 'Heroes', nav: 'equipment', links: ['equipment'],
    unlock: (s) => hasGear(s) && (s.mats.mutagen + s.mats.scrap + s.mats.catalyst) > 0,
    summary: 'Improve and reroll gear with materials.', media: 'GIF: a reforge',
    what: 'Reforging spends crafting materials to upgrade, reroll, or targetedly swap an item’s affixes.',
    why: 'It turns a good-base item into a perfect one — the late-game materials sink.',
    where: 'The Armory’s Reforge overlay.',
    next: 'Lock the affixes you like, then reroll the rest.' },
  // ── Progression ──
  { id: 'genome-core', title: 'Genome Core Upgrades', category: 'Progression', nav: 'evolution', links: ['power-score', 'prestige'],
    unlock: (s) => s.lifetimeShards > 0,
    summary: 'Permanent account upgrades, by category.', media: 'Image: the Evolution HQ',
    what: 'Genome Core upgrades are permanent, categorized upgrades bought with Genome Cores in the Evolution tab.',
    why: 'They permanently raise damage, economy, hero and tower power — your steady account growth.',
    where: 'The Evolution HQ.',
    next: 'Bank enough Cores to Molt (Prestige) for a permanent multiplier.' },
  { id: 'prestige', title: 'Prestige (Molt)', category: 'Progression', nav: 'evolution', links: ['genome-core', 'ascension'],
    unlock: (s) => highestCampaignStage(s) >= 10,
    summary: 'Reset the Genome engine for permanent power.', media: 'GIF: a Molt',
    what: 'Molting sacrifices your banked Cores + capped upgrades to mint Ascendant Cells — a permanent, compounding global multiplier.',
    why: 'It is the "re-climb faster, push further" loop that breaks through a plateau.',
    where: 'The Evolution HQ’s Ascension section — unlocks at Campaign Stage 10.',
    next: 'Spend Ascendant Cells on the Ascendant Tree; each Molt requires a bit more Campaign depth.',
    mistakes: 'Molting too early wastes the climb, too late wastes time — Molt when your Core income has clearly plateaued, not at the first opportunity.' },
  { id: 'ascension', title: 'Ascendant Tree', category: 'Progression', nav: 'evolution', links: ['prestige'],
    unlock: (s) => molts(s) >= 1,
    summary: 'Permanent nodes that survive every Molt.', media: 'Image: the Ascendant Tree',
    what: 'The Ascendant Tree spends Ascendant Cells on permanent nodes — damage, income, mastery, loot quality — that are KEPT across every future Molt.',
    why: 'It compounds: each Molt re-climbs faster because the tree never resets.',
    where: 'The Evolution HQ’s Ascension section, after your first Molt.',
    next: 'Prioritize income + damage nodes to accelerate the next Molt.' },
  { id: 'containers', title: 'Bio-Containers', category: 'Progression', nav: 'vault', links: ['equipment'],
    unlock: (s) => s.pendingContainers.length > 0,
    summary: 'Loot boxes you crack open in the Vault.', media: 'GIF: opening a container',
    what: 'Runs fill a Loot Meter that awards Bio-Containers. They bank UNOPENED until you crack them in the Genetic Vault.',
    why: 'Containers are your gear + shard + material firehose — the core reward loop.',
    where: 'The Genetic Vault.',
    next: 'Open them for equipment, shards, and reforge materials.',
    mistakes: 'Containers do nothing while banked — crack them and equip what drops before your next push, or you’re fighting under-geared.' },
  // ── Modes ──
  { id: 'campaign', title: 'Campaign', category: 'Modes', core: true, nav: 'campaign', links: ['tower-stars', 'hero-slots', 'prestige'],
    summary: 'The main progression path — descend, stage by stage.', media: 'Image: the Campaign map',
    what: 'Campaign is a sequence of authored stages; clearing one opens the next. Depth gates your biggest unlocks.',
    why: 'It is the spine of progression — Star Cap, Hero Slots, and Prestige all key off Campaign depth.',
    where: 'The Campaign screen.',
    next: 'Push deeper to unlock the Star Cap, Hero Slots, and Prestige.' },
  { id: 'infinite', title: 'Infinite', category: 'Modes', core: true, nav: 'infinite', links: ['bosses', 'biomes'],
    summary: 'Endless, escalating waves — chase a best.', media: 'GIF: a deep Infinite run',
    what: 'Infinite is an endless mode where an AI Director escalates the threat forever.',
    why: 'It is the ultimate test of a build — and pays the Loot Meter richly the deeper you hold.',
    where: 'The Infinite screen.',
    next: 'Push your best wave; Ascendant Infinity boosts its rewards.' },
  // ── World ──
  { id: 'biomes', title: 'Biomes', category: 'World', links: ['infinite'],
    unlock: (s) => s.bestWave >= 10,
    summary: 'Shifting environments with their own modifiers.', media: 'Image: a biome transition',
    what: 'Biomes are environmental zones with distinct modifiers and hazards that rotate as a run deepens.',
    why: 'Each biome changes the maths — you adapt your build to its modifier and hazard.',
    where: 'On the battlefield; announced as you enter one.',
    next: 'Learn each biome’s hazard and counter-build for it.' },
  { id: 'bosses', title: 'Bosses', category: 'World', links: ['infinite', 'campaign'],
    unlock: (s) => (s.bossesSlain?.length ?? 0) > 0,
    summary: 'Multi-phase threats with big rewards.', media: 'GIF: a boss fight',
    what: 'Bosses are multi-phase enemies with telegraphed attacks that appear at Campaign milestones and deep Infinite waves.',
    why: 'They are the skill checks — and drop the richest rewards.',
    where: 'Campaign milestone stages and deep Infinite waves.',
    next: 'Read the telegraphs; burst the phases with your Hero ability.' },
];

export const MECHANIC_BY_ID = new Map(MECHANICS.map((m) => [m.id, m] as const));

/** True if a mechanic is unlocked (core mechanics always are). */
export function isMechanicUnlocked(m: MechanicDef, save: SaveData): boolean {
  return !!m.core || (m.unlock ? m.unlock(save) : true);
}

/** The mechanics currently visible in the Help wiki (unlocked only). */
export function unlockedMechanics(save: SaveData): MechanicDef[] {
  return MECHANICS.filter((m) => isMechanicUnlocked(m, save));
}

/** The ids of mechanics unlocked but NOT yet announced (drives What's New). */
export function pendingAnnouncements(save: SaveData): MechanicDef[] {
  const seen = new Set(save.help?.seen ?? []);
  return MECHANICS.filter((m) => !m.core && !seen.has(m.id) && isMechanicUnlocked(m, save));
}
