// LIVE EVENT FRAMEWORK (docs/LIVE-EVENTS.md) — the permanent rotating-identity layer.
// Where core/liveops.ts is the multiplier CALENDAR (windows × reward lanes), THIS module is
// the game's transformation engine: three independent rotation HORIZONS (short 3d / medium
// 14d / major 91d rings, all from the shared Monday epoch), each carrying a full identity
// PACKAGE — theme, visuals, audio re-voicing, reward track, event currency, challenges,
// gameplay modifiers, hub decoration, enemy/boss variants, shop, quests, collections, lore.
//
// DESIGN LAWS (validated by liveEventProblems() + the rotation sim):
//   • DATA-DRIVEN — a future event is ONE registry row; every package is optional and
//     modular; consumers read declared packages through fixed seams (below), so no event
//     ever needs architectural work.
//   • COMPOSABLE VOCABULARIES — gameplay mods are DAILY MODIFIER ids (the proven sim-safe
//     boot-time seam; the deterministic core is never branched mid-run), rewards are
//     PassReward[] (the one grant language), challenges are quest MissionConds (the one
//     judge), reward-lane boosts are LiveEventMods (folded by the liveops pipeline).
//   • READABILITY UNDER OVERLAP — the three horizons are ALWAYS simultaneously live; the
//     hub wears ONE identity (priority: major > medium > short) while the others surface
//     as chips/rows; any co-active triple must be color-distinct (validated for every
//     rotation alignment).
//   • ANTI-INFLATION — event tokens are WINDOW-SCOPED (`eventId:window` keys; stale keys
//     prune on load — use-it-or-lose-it, warned by the ending-soon notification) and every
//     window's total mintable value (track + shop) is budget-capped by validation.
//
// Pure core module: no DOM, no state imports; deterministic from UTC time.

import { BP, type SeasonDef } from './battlePass';
import type { PassReward } from './battlePass';
import type { LiveEventMods } from './liveops';
import type { MissionCond } from './quests';
import { dailyModifierById } from './dailyModifiers';

// ── The package vocabulary (every field optional ⇒ modular) ──────────────────────────────
export interface EventTheme {
  accent: string; // CSS color — the identity primary
  glow: string;
  bg: string; // deep backdrop tint
  logo: string; // the event mark (glyph — logos stay text-native like season glyphs)
}
export interface EventVisualPackage {
  bgEffect?: 'spore-drift' | 'ember-rain' | 'deep-current' | 'static-veins' | 'aurora' | 'none';
  hubMutation?: string; // CSS class token applied at the hub root (data-event carries the id)
  loadingLine?: string; // DeployScreen flavor line while the event is live
  menuTransition?: 'pulse' | 'ripple' | 'tear';
  rewardVfx?: 'burst-gold' | 'burst-viral' | 'burst-abyss';
  notificationStyle?: 'banner' | 'pulse' | 'quiet';
}
export interface EventAudioPackage {
  /** Menu-music re-voicing while live — the SeasonDef.music seam, reused verbatim. */
  music?: SeasonDef['music'];
  playlist?: string[]; // ordered score ids (future hook — the music engine's queue seam)
  stinger?: string; // audio.cue id on event start/claim
}
export interface EventCurrency {
  id: string; // token id, unique per event
  name: string;
  glyph: string;
  /** Hard wallet cap per window (anti-inflation guard #1). */
  cap: number;
}
export interface EventTrackMilestone { at: number; rewards: PassReward[] } // `at` = tokens earned
export interface EventChallenge { id: string; name: string; cond: MissionCond; target: number; tokens: number }
export interface EventShopRow { id: string; name: string; costTokens: number; rewards: PassReward[]; stock: number }
export interface EventVariantPackage {
  /** Renderer-side tint/name overlays (visuals seam — never sim stats; sim pressure comes
   *  from gameplayMods' daily-modifier ids, which the engine already folds at boot). */
  enemyTint?: string;
  enemySuffix?: string; // "Emberborn Skitterer"
  bossTint?: string;
  bossTitle?: string; // "Herald of the Bloom"
}

export type EventHorizon = 'short' | 'medium' | 'major';

export interface LiveEventDefV2 {
  id: string;
  name: string;
  tagline: string;
  horizon: EventHorizon;
  /** Theme-ownership priority INSIDE a horizon tie is registry order; ACROSS horizons the
   *  fixed law major(3) > medium(2) > short(1) applies — see themeOwner(). */
  priority: 1 | 2 | 3;
  theme: EventTheme;
  visuals?: EventVisualPackage;
  audio?: EventAudioPackage;
  /** Reward-lane boosts folded by the EXISTING liveops pipeline (multiplicative stack). */
  mods?: LiveEventMods;
  currency?: EventCurrency;
  track?: EventTrackMilestone[]; // milestones over tokens earned (claims are meta-side)
  challenges?: EventChallenge[]; // pay tokens through the quest judge
  gameplayModifiers?: string[]; // DAILY MODIFIER ids — boot-time, sim-safe, opt-in per run
  hubDecorations?: string[]; // additional CSS tokens (garlands, membranes, banners)
  variants?: EventVariantPackage;
  shop?: EventShopRow[]; // token sink (anti-inflation guard #2: finite stock)
  questSet?: string[]; // bonus mission ids surfaced on the Quest Board while live
  collections?: string[]; // codex entry ids revealed by participation
  achievements?: string[]; // achievement ids scoped to the event
  lore?: { title: string; body: string }[];
  unlockReq?: { campaignStage?: number }; // events gate softly; locked = visible teaser
  /** Forward-compatibility bag — future consumers read namespaced keys; never required. */
  future?: Record<string, unknown>;
}

// ── The three horizons — independent rings from the shared Monday epoch ──────────────────
export const EVENT_HORIZONS: Record<EventHorizon, { periodDays: number; label: string }> = {
  short: { periodDays: 3, label: 'Surge Event' },
  medium: { periodDays: 14, label: 'Season Event' },
  major: { periodDays: 91, label: 'Epoch Event' },
};

export function horizonWindow(h: EventHorizon, now: number): number {
  return Math.max(0, Math.floor((now - BP.epochMs) / (EVENT_HORIZONS[h].periodDays * 86_400_000)));
}
export function horizonEndsAt(h: EventHorizon, now: number): number {
  return BP.epochMs + (horizonWindow(h, now) + 1) * EVENT_HORIZONS[h].periodDays * 86_400_000;
}

/** The registry — THE data. Adding an event = one row (the ring simply grows). */
export const LIVE_EVENTS_V2: LiveEventDefV2[] = [
  // ── SHORT ring (3-day surges; ring of 3 ⇒ a 9-day cycle) ──
  {
    id: 'ember_tide', name: 'Ember Tide', tagline: 'The strata burn from below.', horizon: 'short', priority: 1,
    theme: { accent: '#ff6a3c', glow: '#ffd24d', bg: '#1a0b06', logo: '🜂' },
    visuals: { bgEffect: 'ember-rain', hubMutation: 'ev-ember', loadingLine: 'Thermal vents dilate…', menuTransition: 'pulse', rewardVfx: 'burst-gold', notificationStyle: 'pulse' },
    audio: { music: { rootShift: 2, bpmMult: 1.05, brightness: 0.7 }, stinger: 'place' },
    mods: { lootMult: 1.15 },
    currency: { id: 'emberSpores', name: 'Ember Spores', glyph: '🜂', cap: 60 },
    challenges: [
      { id: 'ember_kills', name: 'Feed the Furnace', cond: { kind: 'killsTotal' }, target: 300, tokens: 15 },
      { id: 'ember_win', name: 'Hold Through the Heat', cond: { kind: 'wins' }, target: 2, tokens: 20 },
    ],
    track: [{ at: 15, rewards: [{ kind: 'cores', qty: 120 }] }, { at: 35, rewards: [{ kind: 'mats', scrap: 10, mutagen: 2 }] }],
    gameplayModifiers: ['blood_frenzy'],
    variants: { enemyTint: '#ff6a3c', enemySuffix: 'Emberborn' },
    lore: [{ title: 'Vent Reading I', body: 'The heat is not geological. Something breathes down there.' }],
  },
  {
    id: 'spore_bloom', name: 'Spore Bloom', tagline: 'The air itself germinates.', horizon: 'short', priority: 1,
    theme: { accent: '#7ddc5a', glow: '#d6ff9e', bg: '#0a1406', logo: '❁' },
    visuals: { bgEffect: 'spore-drift', hubMutation: 'ev-bloom', loadingLine: 'Spore density rising…', menuTransition: 'ripple', rewardVfx: 'burst-viral', notificationStyle: 'banner' },
    audio: { music: { rootShift: -2, bpmMult: 0.96, brightness: 0.5 }, stinger: 'hover' },
    mods: { essenceMult: 1.2 },
    currency: { id: 'bloomPollen', name: 'Bloom Pollen', glyph: '❁', cap: 60 },
    challenges: [
      { id: 'bloom_waves', name: 'Ride the Pollen Front', cond: { kind: 'waveReached', wave: 12 }, target: 2, tokens: 18 },
      { id: 'bloom_open', name: 'Crack the Husks', cond: { kind: 'containersOpened' }, target: 4, tokens: 15 },
    ],
    track: [{ at: 15, rewards: [{ kind: 'geneEssence', qty: 90 }] }, { at: 33, rewards: [{ kind: 'container', rarity: 'rare', count: 1 }] }],
    gameplayModifiers: ['regeneration'],
    variants: { enemyTint: '#7ddc5a', enemySuffix: 'Blooming' },
    lore: [{ title: 'Pollen Census', body: 'Every spore lands. None of them die. Count again.' }],
  },
  {
    id: 'static_night', name: 'Static Night', tagline: 'The dark between signals.', horizon: 'short', priority: 1,
    theme: { accent: '#41d0e8', glow: '#b9f2ff', bg: '#050b14', logo: '⌁' },
    visuals: { bgEffect: 'static-veins', hubMutation: 'ev-static', loadingLine: 'Signal integrity failing…', menuTransition: 'tear', rewardVfx: 'burst-abyss', notificationStyle: 'quiet' },
    audio: { music: { rootShift: -5, bpmMult: 0.9, brightness: 0.25 }, stinger: 'ui' },
    mods: { megaIchorMult: 1.2 },
    currency: { id: 'staticCharge', name: 'Static Charge', glyph: '⌁', cap: 60 },
    challenges: [
      { id: 'static_boss', name: 'Silence the Broadcast', cond: { kind: 'bossKillsTotal' }, target: 6, tokens: 20 },
      { id: 'static_flawless', name: 'No Signal Lost', cond: { kind: 'flawlessWins' }, target: 1, tokens: 15 },
    ],
    track: [{ at: 15, rewards: [{ kind: 'ichor', qty: 6 }] }, { at: 33, rewards: [{ kind: 'cores', qty: 160 }] }],
    gameplayModifiers: ['myopia'],
    variants: { bossTint: '#41d0e8', bossTitle: 'Signal-Bearer' },
    lore: [{ title: 'Intercept 88.1', body: 'We stopped decoding it when it started answering.' }],
  },
  // ── MEDIUM ring (14-day seasons; ring of 3 ⇒ a 6-week cycle) ──
  {
    id: 'great_hunt', name: 'The Great Hunt', tagline: 'Every chassis has a bounty.', horizon: 'medium', priority: 2,
    theme: { accent: '#e8b234', glow: '#fff0b8', bg: '#141006', logo: '◎' },
    visuals: { bgEffect: 'aurora', hubMutation: 'ev-hunt', loadingLine: 'Bounties posted…', menuTransition: 'pulse', rewardVfx: 'burst-gold', notificationStyle: 'banner' },
    audio: { music: { rootShift: 1, bpmMult: 1.02, brightness: 0.65 }, stinger: 'place' },
    mods: { rushShardMult: 1.15 },
    currency: { id: 'huntMarks', name: 'Hunt Marks', glyph: '◎', cap: 150 },
    challenges: [
      { id: 'hunt_bosses', name: 'Collect the Bounties', cond: { kind: 'bossKillsTotal' }, target: 20, tokens: 40 },
      { id: 'hunt_megas', name: 'The Apex Contract', cond: { kind: 'megaKillsTotal' }, target: 2, tokens: 40 },
      { id: 'hunt_wheel', name: 'Spoils to the Wheel', cond: { kind: 'rouletteCollects' }, target: 2, tokens: 30 },
    ],
    track: [
      { at: 30, rewards: [{ kind: 'cores', qty: 250 }] },
      { at: 70, rewards: [{ kind: 'bioSpores', qty: 2 }] },
      { at: 110, rewards: [{ kind: 'container', rarity: 'epic', count: 1 }] },
    ],
    shop: [
      { id: 'hunt_cache', name: 'Bounty Cache', costTokens: 45, rewards: [{ kind: 'container', rarity: 'rare', count: 1 }], stock: 2 },
      { id: 'hunt_stamina', name: 'Tracker Rations', costTokens: 30, rewards: [{ kind: 'rushStamina', qty: 4 }], stock: 2 },
    ],
    gameplayModifiers: ['ironhide'],
    variants: { bossTint: '#e8b234', bossTitle: 'Bountied' },
    achievements: [], collections: [],
    lore: [{ title: 'The Ledger', body: 'The hive does not hate its prey. It keeps accounts.' }],
  },
  {
    id: 'deep_current', name: 'Deep Current', tagline: 'What the tide carries up.', horizon: 'medium', priority: 2,
    theme: { accent: '#4de0c4', glow: '#9adfff', bg: '#04141a', logo: '≋' },
    visuals: { bgEffect: 'deep-current', hubMutation: 'ev-current', loadingLine: 'Pressure equalizing…', menuTransition: 'ripple', rewardVfx: 'burst-abyss', notificationStyle: 'pulse' },
    audio: { music: { rootShift: -4, bpmMult: 0.92, brightness: 0.3 }, stinger: 'hover' },
    mods: { endlessShardMult: 1.15 },
    currency: { id: 'currentShells', name: 'Current Shells', glyph: '≋', cap: 150 },
    challenges: [
      { id: 'current_depth', name: 'Ride the Undertow', cond: { kind: 'waveReached', wave: 18, mode: 'endless' }, target: 3, tokens: 45 },
      { id: 'current_runs', name: 'Keep Diving', cond: { kind: 'runs' }, target: 8, tokens: 35 },
      { id: 'current_pass', name: 'Surface with the Season', cond: { kind: 'passLevels' }, target: 6, tokens: 30 },
    ],
    track: [
      { at: 30, rewards: [{ kind: 'geneEssence', qty: 180 }] },
      { at: 70, rewards: [{ kind: 'towerShardsAll', qtyEach: 5 }] },
      { at: 110, rewards: [{ kind: 'container', rarity: 'epic', count: 1 }] },
    ],
    shop: [
      { id: 'current_essence', name: 'Abyssal Concentrate', costTokens: 40, rewards: [{ kind: 'geneEssence', qty: 140 }], stock: 2 },
      { id: 'current_cache', name: 'Tide-Locked Cache', costTokens: 50, rewards: [{ kind: 'container', rarity: 'rare', count: 1 }], stock: 2 },
    ],
    gameplayModifiers: ['dormancy'],
    variants: { enemyTint: '#4de0c4', enemySuffix: 'Tide-Borne' },
    lore: [{ title: 'Depth Chart', body: 'The map ends. The current does not.' }],
  },
  {
    id: 'red_famine', name: 'Red Famine', tagline: 'Scarcity sharpens the hive.', horizon: 'medium', priority: 2,
    theme: { accent: '#ff4d6d', glow: '#ffb3c1', bg: '#1a070d', logo: '✕' },
    visuals: { bgEffect: 'ember-rain', hubMutation: 'ev-famine', loadingLine: 'Rationing biomass…', menuTransition: 'tear', rewardVfx: 'burst-viral', notificationStyle: 'quiet' },
    audio: { music: { rootShift: -1, bpmMult: 0.94, brightness: 0.35 }, stinger: 'ui' },
    mods: { materialsMult: 1.2 },
    currency: { id: 'famineTithes', name: 'Famine Tithes', glyph: '✕', cap: 150 },
    challenges: [
      { id: 'famine_lean', name: 'Waste Nothing', cond: { kind: 'leanWins', maxTowers: 8 }, target: 2, tokens: 45 },
      { id: 'famine_kills', name: 'The Cull', cond: { kind: 'killsTotal' }, target: 2500, tokens: 35 },
      { id: 'famine_exped', name: 'Forage Far', cond: { kind: 'expeditionsClaimed' }, target: 3, tokens: 30 },
    ],
    track: [
      { at: 30, rewards: [{ kind: 'mats', mutagen: 4, scrap: 14, catalyst: 3 }] },
      { at: 70, rewards: [{ kind: 'cores', qty: 300 }] },
      { at: 110, rewards: [{ kind: 'heroShardsAll', qtyEach: 4 }] },
    ],
    shop: [
      { id: 'famine_mats', name: 'Emergency Stores', costTokens: 40, rewards: [{ kind: 'mats', scrap: 20, catalyst: 2 }], stock: 2 },
      { id: 'famine_spore', name: 'Preserved Spore', costTokens: 55, rewards: [{ kind: 'bioSpores', qty: 1 }], stock: 1 },
    ],
    gameplayModifiers: ['famine', 'scarcity'],
    variants: { enemyTint: '#ff4d6d', enemySuffix: 'Starved' },
    lore: [{ title: 'Tithe Record', body: 'Hunger is the oldest doctrine. The hive merely wrote it down.' }],
  },
  // ── MAJOR ring (91-day epochs; ring of 2 ⇒ a two-season year arc) ──
  {
    id: 'assimilation_epoch', name: 'Epoch of Assimilation', tagline: 'The hive remembers everything it has eaten.', horizon: 'major', priority: 3,
    theme: { accent: '#b64dff', glow: '#e0b8ff', bg: '#0e0614', logo: '◈' },
    visuals: { bgEffect: 'aurora', hubMutation: 'ev-epoch-assim', loadingLine: 'Memory strata compiling…', menuTransition: 'pulse', rewardVfx: 'burst-viral', notificationStyle: 'banner' },
    audio: { music: { rootShift: 0, bpmMult: 1.0, brightness: 0.55 }, playlist: ['menu', 'cinema'], stinger: 'place' },
    mods: { lootMult: 1.1 },
    currency: { id: 'epochStrands', name: 'Epoch Strands', glyph: '◈', cap: 400 },
    challenges: [
      { id: 'epoch_wins', name: 'A Season of Holding', cond: { kind: 'wins' }, target: 30, tokens: 90 },
      { id: 'epoch_bosses', name: 'The Long Cull', cond: { kind: 'bossKillsTotal' }, target: 80, tokens: 90 },
      { id: 'epoch_open', name: 'Archive the Spoils', cond: { kind: 'containersOpened' }, target: 40, tokens: 80 },
      { id: 'epoch_pass', name: 'Two Passes Deep', cond: { kind: 'passLevels' }, target: 40, tokens: 80 },
    ],
    track: [
      { at: 80, rewards: [{ kind: 'container', rarity: 'epic', count: 2 }] },
      { at: 170, rewards: [{ kind: 'bioSpores', qty: 3 }, { kind: 'cores', qty: 400 }] },
      { at: 260, rewards: [{ kind: 'container', rarity: 'legendary', count: 1 }] },
      { at: 340, rewards: [{ kind: 'ichor', qty: 30 }] },
    ],
    shop: [
      { id: 'epoch_leg', name: 'Strand-Woven Vault', costTokens: 160, rewards: [{ kind: 'container', rarity: 'legendary', count: 1 }], stock: 1 },
      { id: 'epoch_ess', name: 'Compiled Memory', costTokens: 70, rewards: [{ kind: 'geneEssence', qty: 260 }], stock: 3 },
    ],
    gameplayModifiers: ['infestation'],
    variants: { bossTint: '#b64dff', bossTitle: 'Remembered' },
    unlockReq: { campaignStage: 3 },
    lore: [
      { title: 'Stratum I', body: 'Assimilation is not conquest. It is curation.' },
      { title: 'Stratum II', body: 'Ask the hive what it keeps. The answer is: everything that held.' },
    ],
  },
  {
    id: 'overgrowth_epoch', name: 'Epoch of Overgrowth', tagline: 'Growth without permission.', horizon: 'major', priority: 3,
    theme: { accent: '#66bb6a', glow: '#c8ffb0', bg: '#071206', logo: '⬢' },
    visuals: { bgEffect: 'spore-drift', hubMutation: 'ev-epoch-grow', loadingLine: 'Canopy breaching containment…', menuTransition: 'ripple', rewardVfx: 'burst-gold', notificationStyle: 'banner' },
    audio: { music: { rootShift: 3, bpmMult: 1.04, brightness: 0.75 }, playlist: ['menu'], stinger: 'hover' },
    mods: { essenceMult: 1.1 },
    currency: { id: 'growthRings', name: 'Growth Rings', glyph: '⬢', cap: 400 },
    challenges: [
      { id: 'grow_waves', name: 'Let It Climb', cond: { kind: 'waveReached', wave: 20 }, target: 12, tokens: 90 },
      { id: 'grow_runs', name: 'Ninety Days of Green', cond: { kind: 'runs' }, target: 60, tokens: 90 },
      { id: 'grow_exped', name: 'Root Networks', cond: { kind: 'expeditionsClaimed' }, target: 15, tokens: 80 },
      { id: 'grow_wheel', name: 'Fruit of the Wheel', cond: { kind: 'rouletteCollects' }, target: 8, tokens: 80 },
    ],
    track: [
      { at: 80, rewards: [{ kind: 'towerShardsAll', qtyEach: 8 }] },
      { at: 170, rewards: [{ kind: 'container', rarity: 'epic', count: 2 }] },
      { at: 260, rewards: [{ kind: 'heroShardsAll', qtyEach: 8 }, { kind: 'cores', qty: 400 }] },
      { at: 340, rewards: [{ kind: 'container', rarity: 'legendary', count: 1 }] },
    ],
    shop: [
      { id: 'grow_cache', name: 'Seed Vault', costTokens: 160, rewards: [{ kind: 'container', rarity: 'legendary', count: 1 }], stock: 1 },
      { id: 'grow_mats', name: 'Cutting Bundle', costTokens: 60, rewards: [{ kind: 'mats', mutagen: 6, scrap: 18, catalyst: 4 }], stock: 3 },
    ],
    gameplayModifiers: ['overrun'],
    variants: { enemyTint: '#66bb6a', enemySuffix: 'Overgrown' },
    unlockReq: { campaignStage: 3 },
    lore: [
      { title: 'Ring Count I', body: 'The rings do not mark years. They mark appetites.' },
      { title: 'Ring Count II', body: 'Prune nothing. The hive is watching what you keep.' },
    ],
  },
];

const RING: Record<EventHorizon, LiveEventDefV2[]> = {
  short: LIVE_EVENTS_V2.filter((e) => e.horizon === 'short'),
  medium: LIVE_EVENTS_V2.filter((e) => e.horizon === 'medium'),
  major: LIVE_EVENTS_V2.filter((e) => e.horizon === 'major'),
};

/** The horizon's live event at `now` — the ring wraps forever (unlimited future windows). */
export function eventForHorizon(h: EventHorizon, now: number): LiveEventDefV2 {
  const ring = RING[h];
  return ring[horizonWindow(h, now) % ring.length];
}

export interface ActiveLiveEvent { def: LiveEventDefV2; window: number; endsAt: number; key: string }

/** All three simultaneously-active events, major-first (the readability order). */
export function activeLiveEvents(now: number): ActiveLiveEvent[] {
  return (['major', 'medium', 'short'] as const).map((h) => {
    const def = eventForHorizon(h, now);
    const window = horizonWindow(h, now);
    return { def, window, endsAt: horizonEndsAt(h, now), key: `${def.id}:${window}` };
  });
}

/** THE theme owner — exactly one identity dresses the hub (major > medium > short). */
export function themeOwner(now: number): ActiveLiveEvent {
  return activeLiveEvents(now)[0];
}

/** Total value a window can MINT (track + full shop) in Genome-Core-equivalents — the
 *  anti-inflation budget the validator caps per horizon. Coarse IV weights on purpose. */
export function windowMintBudget(e: LiveEventDefV2): number {
  const iv = (r: PassReward): number => {
    switch (r.kind) {
      case 'cores': return r.qty;
      case 'ichor': return r.qty * 25;
      case 'geneEssence': return r.qty * 0.8;
      case 'mats': return (r.mutagen ?? 0) * 30 + (r.scrap ?? 0) * 6 + (r.catalyst ?? 0) * 45;
      case 'towerShardsAll': case 'heroShardsAll': return r.qtyEach * 60;
      case 'container': return r.count * (r.rarity === 'legendary' ? 700 : r.rarity === 'epic' ? 320 : 140);
      case 'runCache': return r.count * 100;
      case 'rushStamina': return r.qty * 15;
      case 'bioSpores': return r.qty * 60;
      default: return 100; // cosmetic/passive/stack — bounded flat weight
    }
  };
  const track = (e.track ?? []).flatMap((m) => m.rewards).reduce((a, r) => a + iv(r), 0);
  const shop = (e.shop ?? []).flatMap((s) => Array.from({ length: s.stock }, () => s.rewards).flat()).reduce((a, r) => a + iv(r), 0);
  return track + shop;
}

/** Per-DAY mint ceilings (core-equivalents) — horizons are budgeted by duration, so a short
 *  surge can never out-pay an epoch pro-rata (docs/LIVE-EVENTS.md §economy). */
export const MINT_BUDGET_PER_DAY: Record<EventHorizon, number> = { short: 220, medium: 180, major: 120 };

/** Registry integrity + the readability and economy laws. Empty ⇒ the framework holds. */
export function liveEventProblems(): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const e of LIVE_EVENTS_V2) {
    if (ids.has(e.id)) out.push(`duplicate event id '${e.id}'`);
    ids.add(e.id);
    for (const m of e.gameplayModifiers ?? []) {
      if (!dailyModifierById(m)) out.push(`${e.id}: unknown gameplay modifier '${m}' (must be a daily-modifier id)`);
    }
    const budget = MINT_BUDGET_PER_DAY[e.horizon] * EVENT_HORIZONS[e.horizon].periodDays;
    const mint = windowMintBudget(e);
    if (mint > budget) out.push(`${e.id}: window mints ${mint} core-eq > ${budget} budget (inflation guard)`);
    if (e.currency) {
      const maxTokens = (e.challenges ?? []).reduce((a, c) => a + c.tokens, 0);
      if (maxTokens > e.currency.cap) out.push(`${e.id}: challenges pay ${maxTokens} tokens > wallet cap ${e.currency.cap}`);
      const topMilestone = Math.max(0, ...(e.track ?? []).map((m) => m.at));
      if (topMilestone > maxTokens) out.push(`${e.id}: track milestone at ${topMilestone} unreachable (max earnable ${maxTokens})`);
    }
    for (const ch of e.challenges ?? []) if (ch.target <= 0) out.push(`${e.id}/${ch.id}: non-positive target`);
  }
  // Ring sizes — the brief's rotation contract (grows freely; never empty).
  if (RING.short.length < 3) out.push(`short ring has ${RING.short.length} events (< 3)`);
  if (RING.medium.length < 3) out.push(`medium ring has ${RING.medium.length} events (< 3)`);
  if (RING.major.length < 2) out.push(`major ring has ${RING.major.length} events (< 2)`);
  // READABILITY: every co-active triple across a full super-cycle must be accent-distinct.
  const lcm = (a: number, b: number): number => (a * b) / ((function g(x: number, y: number): number { return y === 0 ? x : g(y, x % y); })(a, b));
  const superDays = [3 * RING.short.length, 14 * RING.medium.length, 91 * RING.major.length].reduce(lcm);
  for (let d = 0; d < superDays; d += 3) {
    const t = BP.epochMs + d * 86_400_000 + 3_600_000;
    const accents = activeLiveEvents(t).map((a) => a.def.theme.accent.toLowerCase());
    if (new Set(accents).size !== accents.length) {
      out.push(`day +${d}: co-active events share an accent (${accents.join(', ')}) — overlap unreadable`);
      break;
    }
  }
  return out;
}
