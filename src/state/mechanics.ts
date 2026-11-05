// Mechanics registry (docs/HELP.md) — the single source of truth for the game's teachable systems.
// It powers BOTH the living Help wiki (shows only UNLOCKED mechanics) and the "What's New?" unlock
// announcements (fires when a mechanic's unlock predicate first becomes true). Adding a mechanic is
// one data row: its summary, unlock gate, category, cross-links, and where to find it (plus its
// long-form text in mechanicsText.ts, kept out of the boot bundle). Pure over
// SaveData — never touches the sim.

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive'; // cycle-free (never import meta here)
// Screen-linked rows delegate their unlock to the progression-gating registry
// (docs/PROGRESSION-GATING.md) so the What's New card fires the moment its nav entry reveals —
// ONE source of truth for "when does this system exist".
import { FEATURE_BY_ID, featureRevealed, isOpenNav } from './unlocks';
import { DRAFT_FEATURES } from '../core/config'; // pure data — the Splice gate
import { FIELD_NOTE_MECHANICS } from './fieldNotes'; // the in-run lessons — taught at their moment, never queued here

export type MechanicCategory = 'Basics' | 'Towers' | 'Heroes' | 'Progression' | 'Modes' | 'World';

export interface MechanicDef {
  id: string;
  title: string;
  category: MechanicCategory;
  /** One-line hook (used by What's New + the wiki index). The long-form body — what · why · where ·
   *  next · mistakes · media — lives in state/mechanicsText.ts, loaded with the screens that show it. */
  summary: string;
  nav?: string; // Hub NavKey this links to (clickable UI reference), if any
  links?: string[]; // related mechanic ids (cross-linking)
  /** Unlocked from the start? Otherwise `unlock(save)` gates both the wiki entry + the announcement. */
  core?: boolean;
  unlock?: (save: SaveData) => boolean;
}

const molts = (s: SaveData): number => s.prestige?.molts ?? 0;
const hasGear = (s: SaveData): boolean => s.equipment.inventory.length > 0;

// Order = display order within a category. Unknown (locked) mechanics stay hidden until unlocked.
export const MECHANICS: MechanicDef[] = [
  // ── Basics · the five guidance instruments (the UX Foundations — docs/MISSION-CONTROL.md and
  //    siblings). CORE rows: browsable from minute 0, never announced (the HUD Tour and the
  //    tutorial handoff introduce them — a What's New card for the guidance layer would be noise).
  { id: 'mission-control', title: 'Mission Control', category: 'Basics', core: true, nav: 'home', links: ['power-advisor', 'hive-intel'],
    summary: 'Your standing orders — the answer to "what should I do now?"' },
  { id: 'hive-intel', title: 'Hive Intelligence', category: 'Basics', core: true, nav: 'home', links: ['mission-control', 'power-advisor'],
    summary: 'The live intel feed — banked value, ready moves, recent milestones.' },
  { id: 'evolution-roadmap', title: 'Evolution Roadmap', category: 'Basics', core: true, nav: 'home', links: ['mission-control'],
    summary: 'Every wing of the hive on one rail, in unlock order.' },
  { id: 'power-advisor', title: 'The Power Advisor', category: 'Basics', core: true, nav: 'home', links: ['power-score', 'mission-control'],
    summary: 'Exact best-value answers to “what should I buy?”' },
  { id: 'field-guides', title: 'Field Guides', category: 'Basics', core: true, nav: 'help', links: ['mission-control'],
    summary: 'Short guided walkthroughs that open with each new wing.' },
  // ── Basics ──
  { id: 'hive-core', title: 'The Hive Core', category: 'Basics', core: true, nav: 'play',
    summary: 'Your one life — defend it.' },
  { id: 'biomorph-conveyor', title: 'Biomorph Conveyor', category: 'Basics', core: true, nav: 'play', links: ['strain-evolution'],
    summary: 'Towers arrive on a living belt — Deploy, Strain, or Discard.' },
  { id: 'strain-evolution', title: 'Strain Evolution', category: 'Basics', nav: 'play', links: ['biomorph-conveyor', 'tower-branches'],
    summary: 'Consume conveyor duplicates to evolve towers — Strain I to V.' },
  { id: 'boss-sieges', title: 'Boss Sieges & Phases', category: 'Basics', nav: 'play', links: ['strain-evolution'],
    summary: 'Bosses are encounters: siege behaviors + HP-phase mutations, never just bigger HP bars.' },
  { id: 'boss-rush', title: 'Boss Rush', category: 'Basics', nav: 'bossrush', links: ['boss-sieges', 'gene-cards'],
    summary: 'The gauntlet: wave N deploys N assembled bosses — rewards pay per boss defeated.',
    unlock: (s) => featureRevealed(s, 'bossrush') },
  { id: 'bio-roulette', title: 'Bio-Roulette & Bio-Spores', category: 'Basics', nav: 'bossrush', links: ['boss-rush'],
    summary: 'The gauntlet\u2019s second reward screen: launch earned Bio-Spores into a living wheel of reward pods.',
    unlock: (s) => featureRevealed(s, 'bossrush') },
  { id: 'gene-essence', title: 'Gene Essence', category: 'Progression', nav: 'genes', links: ['gene-cards', 'gene-archive'],
    summary: 'Permanent currency that upgrades Gene Cards.',
    unlock: (s) => (s.geneEssence ?? 0) > 0 || (s.stats?.uniqueCards?.length ?? 0) > 0 },
  { id: 'field-research', title: 'Field Research (optional studies)', category: 'Progression', nav: 'market',
    summary: 'Optional daily field studies — review a specimen observation for a small sample payout. Never required, never the path.',
    unlock: (s: SaveData) => featureRevealed(s, 'market'), // arrives with the market wing itself
  },
  { id: 'splice-market', title: 'Splice Market & Ichor', category: 'Progression', nav: 'market', links: ['gene-essence'],
    unlock: (s) => featureRevealed(s, 'market'),
    summary: 'A refreshing black bazaar: small goods for Genome Cores, premium goods and Bio-Containers for Ichor.' },
  { id: 'auction-house', title: 'Auction House', category: 'Progression', nav: 'auction', links: ['splice-market', 'equipment'],
    unlock: (s) => featureRevealed(s, 'auction'),
    summary: 'The player-driven market: list gene cards, gear and cosmetics for Ichor, bid or buy now, and bank proceeds in your market wallet.' },
  { id: 'daily-login', title: 'Daily Bio-Cache', category: 'Progression', nav: 'home', links: ['splice-market'],
    summary: 'One living cache per day — its value compounds for every consecutive day you answer.',
    unlock: (s) => s.totalRuns >= 1 },
  { id: 'hive-construction', title: 'Hive Construction', category: 'Progression', nav: 'hive', links: ['gene-essence'],
    summary: 'Build the laboratory organism — organs that visibly transform your base.',
    unlock: (s) => featureRevealed(s, 'hive') },
  { id: 'gene-archive', title: 'Gene Archive', category: 'Progression', nav: 'genes', links: ['gene-cards', 'gene-essence', 'gene-loadout'],
    summary: 'Permanently level your collected Gene Cards.',
    unlock: (s) => featureRevealed(s, 'genes') },
  { id: 'gene-loadout', title: 'Starting Gene Loadouts', category: 'Progression', nav: 'genes', links: ['gene-archive', 'gene-cards'],
    summary: 'Equip genes that auto-activate every run.',
    unlock: (s) => featureRevealed(s, 'genes') },
  { id: 'biomass', title: 'Biomass', category: 'Basics', core: true, links: ['towers'],
    summary: 'In-run currency from kills.' },
  { id: 'wave-rhythm', title: 'Waves & the Build Phase', category: 'Basics', core: true, links: ['biomass', 'towers'],
    summary: 'Fight, breathe, build — the run’s heartbeat.' },
  { id: 'game-speed', title: 'Game Speed', category: 'Basics', links: ['wave-rhythm'],
    unlock: (s) => s.totalRuns >= 1,
    summary: '1× / 2× / 5× — the sim, byte-identical, just faster.' },
  { id: 'early-call', title: 'Early Call', category: 'Basics', links: ['wave-rhythm', 'biomass'],
    unlock: (s) => s.totalRuns >= 1,
    summary: 'Call the next wave mid-fight — the skipped wait pays Biomass.' },
  { id: 'emergency-defense', title: 'Emergency Defense', category: 'Basics', links: ['towers', 'hive-core'],
    unlock: (s) => s.totalRuns >= 1,
    summary: 'The red line — when enemies reach the Final Defense Zone.' },
  { id: 'power-score', title: 'Power Score', category: 'Basics', core: true, nav: 'profile', links: ['prediction'],
    summary: 'Your account strength, one number.' },
  { id: 'account-level', title: 'Account Level', category: 'Basics', nav: 'profile', links: ['power-score'],
    summary: 'Every kill, wave, win and acquisition feeds one ever-rising level.',
    unlock: (s) => s.totalRuns >= 1 },
  { id: 'genome-rank', title: 'Genome Rank', category: 'Basics', nav: 'profile', links: ['account-level', 'power-score'],
    summary: 'The ultimate mastery ladder — every system you grow feeds one prestigious Rank.',
    unlock: (s) => s.totalRuns >= 3 },
  // ── Towers ──
  { id: 'towers', title: 'Towers', category: 'Towers', nav: 'towers', links: ['tower-stars', 'tower-branches'], // announces as the Tower Lab opens (seal rule), with its guided walkthrough
    summary: 'Automated defenders you place with Biomass.' },
  { id: 'tower-stars', title: 'Tower Stars', category: 'Towers', nav: 'towers', links: ['towers'],
    unlock: (s) => Object.values(s.towerStars).some((n) => (n ?? 0) > 0) || Object.values(s.towerShards).some((n) => (n ?? 0) > 0),
    summary: 'Permanent tower power, bought with Strain Samples.' },
  { id: 'tower-mastery', title: 'Tower Mastery', category: 'Towers', nav: 'towers', links: ['towers', 'tower-stars'],
    unlock: (s) => Object.values(s.towerMasteryXp).some((n) => (n ?? 0) > 0),
    summary: 'Infinite craft levels from USING a tower — tracked live in every run.' },
  // Body-blocking as a TOWER verb (docs/TOWERS.md §answers — the Gristle Warren barracks); revealed
  // once the account owns a unit-fielding organ, so a fresh save never sees the card.
  { id: 'blockers', title: 'Walls & Blockers', category: 'Towers', nav: 'towers', links: ['towers'],
    unlock: (s) => (s.towerUnlocked ?? []).some((k) => k === 'warren' || k === 'roost'),
    summary: 'Friendly units that stand in the lane and HOLD whatever walks into them.' },
  { id: 'mastery-evolution', title: 'Evolution Tracks', category: 'Progression', nav: 'towers', links: ['tower-mastery', 'power-score'],
    unlock: (s) => Object.values(s.towerMasteryXp).some((n) => (n ?? 0) > 0) || Object.values(s.heroMasteryXp).some((n) => (n ?? 0) > 0),
    summary: 'Every tower and hero owns a 100-level reward helix that renews forever.' },
  { id: 'tower-branches', title: 'Tower Branches', category: 'Towers', nav: 'towers', links: ['towers', 'tower-stars'],
    unlock: (s) => highestCampaignStage(s) >= 3,
    summary: 'Specialize a tower down a mutation path.' },
  { id: 'adaptation', title: 'Adaptation & Antigen', category: 'Towers', nav: 'adaptation', links: ['towers', 'tower-mastery', 'tower-stars'],
    unlock: (s) => featureRevealed(s, 'adaptation'),
    summary: 'Per-tower talent trees bought with Antigen.' },
  { id: 'mulligans', title: 'Mulligan Organisms', category: 'Towers', nav: 'mulligans', links: ['towers', 'tower-stars', 'containers'],
    unlock: (s) => featureRevealed(s, 'mulligans'),
    summary: 'Biomechanical organisms you assemble onto towers — stats AND flesh.' },
  { id: 'nucleus', title: 'Nucleus Chambers', category: 'Towers', nav: 'mulligans', links: ['mulligans', 'gene-essence', 'collection'],
    unlock: () => true,
    summary: 'The Hive Nucleus grows its OWN organism — chambers of support organs that mutate it visibly.',
  },
  { id: 'gene-cards', title: 'Gene Cards', category: 'Towers', core: true, nav: 'genes', links: ['towers', 'gene-archive', 'gene-essence', 'containers'],
    summary: 'Discovered strands, drafted as run boosts — collected forever.' },
  // Batch G (docs/CARDS.md §fit · §opening · §splice): drafts that fit the run + the Biomass outlet.
  { id: 'splice', title: 'Splice & the ◆ PICK', category: 'Towers', nav: 'genes', links: ['gene-cards', 'biomass'],
    summary: 'Turn a Biomass overflow into an extra gene draft — and read which card fits.',
    unlock: (s) => highestCampaignStage(s) >= DRAFT_FEATURES.splice.fromCleared },
  // ── Heroes ──
  { id: 'heroes', title: 'Heroes', category: 'Heroes', nav: 'heroes', links: ['hero-slots', 'equipment'], // announces as the Hero Hall opens (seal rule), with its guided walkthrough
    summary: 'A living unit that moves and fights on its own.' },
  { id: 'hero-evolution', title: 'Hero Evolution (in-run)', category: 'Heroes', links: ['heroes', 'biomass'],
    unlock: (s) => s.totalRuns >= 1,
    summary: 'Spend Biomass on your hero mid-run — ten axes, ten levels.' },
  { id: 'hero-slots', title: 'Hero Slots', category: 'Heroes', nav: 'heroes', links: ['heroes'],
    unlock: (s) => highestCampaignStage(s) >= 25,
    summary: 'Field 2, then 3 heroes at once.' },
  { id: 'equipment', title: 'Equipment', category: 'Heroes', nav: 'equipment', links: ['heroes', 'equipment-reforge'],
    unlock: (s) => featureRevealed(s, 'equipment'),
    summary: 'Weapons, armor, and relics for your heroes.' },
  { id: 'equipment-reforge', title: 'Equipment Reforging', category: 'Heroes', nav: 'equipment', links: ['equipment'],
    unlock: (s) => hasGear(s) && (s.mats.mutagen + s.mats.scrap + s.mats.catalyst) > 0,
    summary: 'Improve and reroll gear with materials.' },
  { id: 'gear-codex', title: 'Gear Codex', category: 'Heroes', nav: 'gearcodex', links: ['equipment'],
    summary: 'The full equipment gallery — sets, silhouettes, and set bonuses.',
    unlock: (s) => featureRevealed(s, 'gearcodex') },
  // ── Progression ──
  { id: 'genome-core', title: 'Genome Core Upgrades', category: 'Progression', nav: 'evolution', links: ['power-score', 'prestige'],
    unlock: (s) => featureRevealed(s, 'evolution'),
    summary: 'Permanent account upgrades, by category.' },
  { id: 'prestige', title: 'Prestige (Molt)', category: 'Progression', nav: 'evolution', links: ['genome-core', 'ascension'],
    unlock: (s) => highestCampaignStage(s) >= 10,
    summary: 'Reset the Genome engine for permanent power.' },
  { id: 'ascension', title: 'Ascendant Tree', category: 'Progression', nav: 'evolution', links: ['prestige'],
    unlock: (s) => molts(s) >= 1,
    summary: 'Permanent nodes that survive every Molt.' },
  { id: 'containers', title: 'Bio-Containers', category: 'Progression', nav: 'vault', links: ['equipment', 'loot-meter', 'gene-cards'],
    unlock: (s) => featureRevealed(s, 'vault'),
    summary: 'Loot boxes you crack open in the Vault.' },
  { id: 'loot-meter', title: 'The Loot Meter', category: 'Progression', nav: 'vault', links: ['containers'],
    unlock: (s) => s.megaProgress.slain.length > 0,
    summary: 'The organism stirs — every wave and kill now banks toward Bio-Containers.' },
  { id: 'mega-hunt', title: 'The Mega Hunt', category: 'Progression', nav: 'campaign', links: ['loot-meter', 'boss-sieges'],
    unlock: (s) => s.megaProgress.weakPoints > 0 || s.megaProgress.slain.length > 0,
    summary: 'Every organ you rupture on a Mega Boss advances your Hunt Rank — even in a raid you lose.' },
  { id: 'collection-codex', title: 'Bio-Dex (Collection)', category: 'Progression', nav: 'collection', links: ['containers', 'gene-cards'],
    summary: 'Rank badges, bonuses and Power for everything you catalogue.',
    unlock: (s) => featureRevealed(s, 'collection') },
  { id: 'phenotype-lab', title: 'Phenotype Lab', category: 'Progression', nav: 'phenotypes', links: ['gene-essence'],
    summary: 'Cosmetic phenotypes for every strain and champion.',
    unlock: (s) => featureRevealed(s, 'phenotypes') },
  { id: 'idle-harvest', title: 'Hive Production', category: 'Progression', nav: 'harvest',
    summary: 'The Hive is the engine; the harvest is its output. It produces while you are away — collect on return, grow the body to produce more.',
    unlock: (s) => featureRevealed(s, 'harvest') },
  { id: 'metabolism', title: 'Milestones (Metabolism)', category: 'Progression', nav: 'metabolism',
    summary: 'The organism digests everything you do. Every lifetime quantity — kills, discoveries, claims, rituals — climbs an endless milestone ladder, and every reached tier pays.',
    unlock: (s) => featureRevealed(s, 'metabolism') },
  { id: 'specimens', title: 'Specimen Cabinet (Cosmetic Claiming)', category: 'Progression', nav: 'specimens',
    summary: 'Cosmetics arrive UNCLAIMED: tradable specimens in the Specimen Cabinet. Claiming binds one to your account forever — unlocking it to equip, adding it to Collections, and activating its small permanent bonus.',
    unlock: (s) => featureRevealed(s, 'specimens') },
  { id: 'arena', title: 'The Arena (Live PvP)', category: 'Modes', nav: 'arena', links: ['idle-harvest', 'season-pass'],
    summary: 'Ranked live PvP: mirrored battlefields, one shared assault, the survivor takes the rating.',
    unlock: (s) => featureRevealed(s, 'arena') },
  { id: 'expeditions', title: 'Hero Expeditions', category: 'Heroes', nav: 'expeditions', links: ['heroes', 'idle-harvest'],
    summary: 'Benched heroes run real-time away-missions and return carrying Cores, Essence and materials.',
    unlock: (s) => featureRevealed(s, 'expeditions') },
  { id: 'quests', title: 'Quests & Missions', category: 'Progression', nav: 'quests',
    summary: 'Weekly directives and the story questline.',
    unlock: (s) => featureRevealed(s, 'quests') },
  { id: 'season-pass', title: 'Season Pass', category: 'Progression', nav: 'season',
    summary: 'A rotating 100-level reward season fed by everything you play.',
    unlock: (s) => featureRevealed(s, 'season') },
  { id: 'premium-store', title: 'Premium Store', category: 'Progression', core: true, nav: 'store',
    summary: 'Optional support — never the path.' },
  // ── Modes ──
  { id: 'campaign', title: 'Campaign', category: 'Modes', core: true, nav: 'campaign', links: ['tower-stars', 'hero-slots', 'prestige'],
    summary: 'The main progression path — descend, stage by stage.' },
  { id: 'hive-adapts', title: 'The Hive Adapts', category: 'Modes', nav: 'campaign', links: ['campaign', 'bosses'],
    unlock: (s) => highestCampaignStage(s) >= 3,
    summary: 'From wave 4, Campaign waves answer your board’s live Power.' },
  { id: 'infinite', title: 'Infinite', category: 'Modes', nav: 'infinite', links: ['bosses', 'biomes'], // announces as the Infinite pillar opens (seal rule), with its guided walkthrough
    summary: 'Endless, escalating waves — chase a best.',
    unlock: (s) => featureRevealed(s, 'infinite') },
  { id: 'threat', title: 'The Threat Ladder', category: 'Modes', nav: 'campaign', links: ['infinite', 'boss-rush', 'campaign'],
    summary: 'Opt-in Threat levels 0–10 — the replay ladder for content you’ve beaten.',
    unlock: (s) => featureRevealed(s, 'infinite') }, // the replay ladder arrives with the first replay pillar (Stage 3), not run 1
  { id: 'infestation', title: 'The Front', category: 'Modes', nav: 'infestation', links: ['infinite', 'expeditions'],
    summary: 'The territory war — hold sectors, collect tribute, answer incursions.',
    unlock: (s) => featureRevealed(s, 'infestation') },
  { id: 'daily-run', title: 'Daily Run', category: 'Modes', nav: 'daily', links: ['infinite', 'gene-cards'],
    summary: 'One seed per day — the same gauntlet worldwide.',
    unlock: (s) => featureRevealed(s, 'daily') },
  { id: 'contracts', title: 'Champion Contracts', category: 'Modes', nav: 'home', links: ['daily-run', 'gene-cards'],
    unlock: (s) => featureRevealed(s, 'daily'), // the board arrives with the daily rhythm (homeModel 'contracts' widget)
    summary: 'Three weekly constraint runs — same board for everyone.' },
  // ── World ──
  { id: 'biomes', title: 'Biomes', category: 'World', links: ['infinite'],
    unlock: (s) => s.bestWave >= 10,
    summary: 'Shifting environments with their own modifiers.' },
  { id: 'arena-layouts', title: 'Arena Layouts', category: 'World', links: ['campaign', 'infinite', 'biomes'],
    unlock: (s) => highestCampaignStage(s) >= 2, // after the first NEW routing idea (stage 2's open_maw pin) has been played
    summary: 'The battlefield’s terrain reshapes how the swarm reaches you.' },
  { id: 'bosses', title: 'Bosses', category: 'World', links: ['infinite', 'campaign'],
    unlock: (s) => (s.bossesSlain?.length ?? 0) > 0,
    summary: 'Multi-phase threats with big rewards.' },
];

export const MECHANIC_BY_ID = new Map(MECHANICS.map((m) => [m.id, m] as const));

/** True if a mechanic is unlocked (core mechanics always are). THE SEAL RULE (docs/PROGRESSION-GATING.md
 *  §announcements): a row whose `nav` names a gated wing never unlocks before that wing reveals — neither
 *  the Help wiki nor What's New may advise a sealed screen (the Nucleus row announced the stage-25 Mulligan
 *  Lab at minute 0; Gene Essence announced the stage-4 Gene Archive after run 1). */
export function isMechanicUnlocked(m: MechanicDef, save: SaveData): boolean {
  if (m.core) return true;
  if (m.nav && FEATURE_BY_ID.has(m.nav) && !featureRevealed(save, m.nav)) return false;
  return m.unlock ? m.unlock(save) : true;
}

/** The mechanics currently visible in the Help wiki (unlocked only). */
export function unlockedMechanics(save: SaveData): MechanicDef[] {
  return MECHANICS.filter((m) => isMechanicUnlocked(m, save));
}

/** The ids of mechanics unlocked but NOT yet announced (drives What's New). In-run controls with a
 *  FIELD NOTE (state/fieldNotes.ts) are taught at their moment mid-fight instead, so they never queue. */
export function pendingAnnouncements(save: SaveData): MechanicDef[] {
  const seen = new Set(save.help?.seen ?? []);
  return MECHANICS.filter((m) => !m.core && !seen.has(m.id) && !FIELD_NOTE_MECHANICS.has(m.id) && isMechanicUnlocked(m, save));
}

/** ANNOUNCEMENT PACING (docs/PROGRESSION-GATING.md §announcements) — "one learnable beat at a time"
 *  applied to What's New: at most `perBeat` cards per BEAT (a finished run), the rest wait for the
 *  following runs. Nothing is lost — a queued mechanic is already in the Help wiki; only the
 *  announcement waits. A fresh account used to get ~13 cards (one "11 new systems unlocked" summary)
 *  after its first run. */
export const ANNOUNCE = { perBeat: 2 };

/** The mechanic each SCREEN teaches (FEATURES.teach) → its screen id: a wing's own briefing. */
const WING_LESSON: ReadonlyMap<string, string> = new Map(
  [...FEATURE_BY_ID.values()].filter((f) => f.teach).map((f) => [f.teach as string, f.id] as const),
);

/** Priority within a beat: a revealed SCREEN's own briefing first (the wing just opened and the player
 *  can act on it — its card carries the guided "Show me ▸"), then registry order (Basics → … → World,
 *  display order within each). */
function announcePriority(m: MechanicDef, save: SaveData): number {
  const wing = WING_LESSON.get(m.id);
  return wing && featureRevealed(save, wing) ? 0 : 1;
}

/** This beat's cards: the pending queue in priority order, capped to what the beat has left. */
export function pacedAnnouncements(save: SaveData, shownThisBeat: number): MechanicDef[] {
  const left = Math.max(0, ANNOUNCE.perBeat - shownThisBeat);
  if (left === 0) return [];
  const pending = pendingAnnouncements(save);
  const order = new Map(MECHANICS.map((m, i) => [m.id, i] as const));
  return pending
    .slice()
    .sort((a, b) => announcePriority(a, save) - announcePriority(b, save) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, left);
}

/** What's New batching (docs/GUIDED-UNLOCKS.md §batching): this many queued announcements (or
 *  more) collapse into ONE summary card — a first run can unlock a dozen systems at once, and a
 *  dozen WHAT/WHY/WHERE/NEXT walls teach nothing. One or two keep the full per-system card. */
export const WHATS_NEW_SUMMARY_AT = 3;

const CATEGORY_GLYPH: Record<MechanicCategory, string> = {
  Basics: '◎', Towers: '⌖', Heroes: '✦', Progression: '⬆', Modes: '⬡', World: '⛬',
};

export interface UnlockSummaryRow {
  id: string;
  glyph: string; // the wing's own sigil (FEATURES) when it has one, else the category glyph
  title: string;
  line: string; // the one-line hook (MechanicDef.summary)
  nav: string | null; // an OPEN destination for the row's "Open" action, else null
}

/** One row per newly-available system for the summary card. The full briefing is never lost —
 *  archiving files every card into the Help wiki (and a guided wing still teaches on "Open"). */
export function unlockSummaryRows(queue: readonly MechanicDef[], save: SaveData): UnlockSummaryRow[] {
  return queue.map((m) => ({
    id: m.id,
    glyph: (m.nav && FEATURE_BY_ID.get(m.nav)?.glyph) || CATEGORY_GLYPH[m.category],
    title: m.title,
    line: m.summary,
    nav: m.nav && isOpenNav(save, m.nav) ? m.nav : null,
  }));
}
