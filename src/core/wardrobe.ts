// THE WARDROBE (docs/COSMETICS.md §wardrobe) — the account-wide cosmetics ecosystem that sits
// BESIDE the unit Phenotypes (cosmetics.ts). Where a Phenotype re-dresses ONE tower/hero, a
// Wardrobe item re-dresses a GLOBAL surface of the game: the Nucleus, the battlefield, every
// projectile trail, the UI shell, the music, the player's identity card. One equipped item per
// KIND (a slot model), every item purely presentational — equipping changes nothing the sim can
// see (golden-safe by construction; enforced by wardrobe.test.ts).
//
// FOUNDATIONAL CONTRACT — adding a cosmetic is ONE DATA ROW:
//   • a kind is a WardrobeKindDef (group + preview style) — consumers key off the kind id;
//   • an item is a WardrobeItemDef (rarity + source + flat payload) on the registry;
//   • unlock sources are CLOSED, TYPED data (campaign stage, achievement id, shop price,
//     battle-pass level…) — meta.pollWardrobeUnlocks() evaluates the auto lanes, the shop
//     sells the shop lane, the Battle Pass claims its lane. No per-item engine code, ever.
//
// Payloads are a FLAT bag of presentation parameters (validated per kind): palette accents,
// FX/trail preset ids, audio-cue variants, music transforms, CSS modifier handles, identity
// text. Consumers (renderer kit / music manager / UI roots) read the equipped payload of the
// kind they care about and fall back to the classic look when the slot is empty.

import { Registry } from './registry';
import type { CollectionCategoryId } from './collection';

// ── Kinds — every cosmetic surface of the game ─────────────────────────────────
export type WardrobeGroup = 'arena' | 'audio' | 'interface' | 'identity';

export type WardrobeKind =
  // arena — combat & battlefield FX
  | 'nucleusSkin' | 'battlefieldTheme' | 'projectileTrail' | 'towerFx' | 'placementFx'
  | 'heroFx' | 'heroSelectFx' | 'enemyTheme' | 'bossTheme' | 'megaTheme' | 'waveTheme' | 'stageIntro'
  // audio — music & sound packs
  | 'musicPack' | 'combatMusic' | 'towerAudio' | 'enemyAudio' | 'heroVoice' | 'notifSound'
  // interface — UI shells & ceremony themes
  | 'uiTheme' | 'hudTheme' | 'cardFrame' | 'lootTheme' | 'rouletteTheme' | 'cursorTheme'
  | 'victoryScreen' | 'defeatScreen'
  // identity — the commander's public face
  | 'title' | 'nameColor' | 'nameplate' | 'profileBg' | 'banner' | 'emblem'
  | 'prestigeBorder' | 'collectionBorder';

/** How the Wardrobe previews a kind: 'swatch' (palette card), 'fx' (animated canvas),
 *  'audio' (play a cue), 'music' (audition the transform), 'text' (typography card),
 *  'frame' (bordered card mock). */
export type WardrobePreview = 'swatch' | 'fx' | 'audio' | 'music' | 'text' | 'frame';

export interface WardrobeKindDef {
  id: WardrobeKind;
  group: WardrobeGroup;
  name: string;
  icon: string; // mono glyph for chips/nav
  blurb: string; // one-line what-this-re-dresses
  preview: WardrobePreview;
}

export const WARDROBE_GROUP_LABEL: Record<WardrobeGroup, string> = {
  arena: 'Arena & Combat FX',
  audio: 'Audio & Music',
  interface: 'Interface & Ceremony',
  identity: 'Commander Identity',
};

export const WARDROBE_KINDS: WardrobeKindDef[] = [
  { id: 'nucleusSkin', group: 'arena', name: 'Nucleus Skins', icon: '◉', blurb: 'Re-grow the heart you defend.', preview: 'fx' },
  { id: 'battlefieldTheme', group: 'arena', name: 'Battlefield Themes', icon: '▦', blurb: 'Tint the living arena itself.', preview: 'swatch' },
  { id: 'projectileTrail', group: 'arena', name: 'Projectile Trails', icon: '⇢', blurb: 'Every shot leaves your signature.', preview: 'fx' },
  { id: 'towerFx', group: 'arena', name: 'Tower Particle FX', icon: '✧', blurb: 'An idle flourish over every tower.', preview: 'fx' },
  { id: 'placementFx', group: 'arena', name: 'Placement Effects', icon: '⊕', blurb: 'How new growth breaks the ground.', preview: 'fx' },
  { id: 'heroFx', group: 'arena', name: 'Hero Ability FX', icon: '⚚', blurb: 'The light your champion fights in.', preview: 'swatch' },
  { id: 'heroSelectFx', group: 'arena', name: 'Hero Selection FX', icon: '❋', blurb: 'The flourish when a champion answers.', preview: 'swatch' },
  { id: 'enemyTheme', group: 'arena', name: 'Enemy Reskins', icon: '☣', blurb: 'Re-pigment the invading broods.', preview: 'swatch' },
  { id: 'bossTheme', group: 'arena', name: 'Boss Skins', icon: '☠', blurb: 'Dress the tyrants for the occasion.', preview: 'swatch' },
  { id: 'megaTheme', group: 'arena', name: 'Mega Boss Variants', icon: '⛬', blurb: 'Recolor the battlefield-scale horrors.', preview: 'swatch' },
  { id: 'waveTheme', group: 'arena', name: 'Wave Transitions', icon: '≋', blurb: 'The herald between assaults.', preview: 'swatch' },
  { id: 'stageIntro', group: 'arena', name: 'Stage Intros', icon: '⌖', blurb: 'How a deployment announces itself.', preview: 'swatch' },
  { id: 'musicPack', group: 'audio', name: 'Menu Music', icon: '♬', blurb: 'Re-voice the hive’s idle song.', preview: 'music' },
  { id: 'combatMusic', group: 'audio', name: 'Combat Music', icon: '♪', blurb: 'A different pulse under the war.', preview: 'music' },
  { id: 'towerAudio', group: 'audio', name: 'Tower Sound Packs', icon: '◍', blurb: 'The voice of your artillery.', preview: 'audio' },
  { id: 'enemyAudio', group: 'audio', name: 'Enemy Audio Packs', icon: '◌', blurb: 'How the broods die, audibly.', preview: 'audio' },
  { id: 'heroVoice', group: 'audio', name: 'Hero Voice Packs', icon: '👁', blurb: 'Your champion’s battle timbre (framework).', preview: 'audio' },
  { id: 'notifSound', group: 'audio', name: 'Notification Sounds', icon: '◔', blurb: 'The chime of good news.', preview: 'audio' },
  { id: 'uiTheme', group: 'interface', name: 'UI Themes', icon: '❒', blurb: 'Re-skin the headquarters shell.', preview: 'frame' },
  { id: 'hudTheme', group: 'interface', name: 'Battle HUD Themes', icon: '▥', blurb: 'The combat overlay, your way.', preview: 'frame' },
  { id: 'cardFrame', group: 'interface', name: 'Card Frames', icon: '▤', blurb: 'Frame every mutation draft.', preview: 'frame' },
  { id: 'lootTheme', group: 'interface', name: 'Container Ceremonies', icon: '◈', blurb: 'How a Bio-Container gives itself up.', preview: 'frame' },
  { id: 'rouletteTheme', group: 'interface', name: 'Bio-Roulette Themes', icon: '✺', blurb: 'Re-felt the wheel of organs.', preview: 'frame' },
  { id: 'cursorTheme', group: 'interface', name: 'Cursor Themes', icon: '➤', blurb: 'The commander’s pointing claw.', preview: 'frame' },
  { id: 'victoryScreen', group: 'interface', name: 'Victory Screens', icon: '✓', blurb: 'Gloat in your chosen colors.', preview: 'frame' },
  { id: 'defeatScreen', group: 'interface', name: 'Defeat Screens', icon: '✗', blurb: 'Lose with unreasonable style.', preview: 'frame' },
  { id: 'title', group: 'identity', name: 'Titles', icon: '❝', blurb: 'The words under your name.', preview: 'text' },
  { id: 'nameColor', group: 'identity', name: 'Name Colors', icon: 'A', blurb: 'Your name, in your ink.', preview: 'text' },
  { id: 'nameplate', group: 'identity', name: 'Nameplates', icon: '▭', blurb: 'The living plaque behind your name.', preview: 'text' },
  { id: 'profileBg', group: 'identity', name: 'Profile Backgrounds', icon: '🗔', blurb: 'The wall behind the commander.', preview: 'swatch' },
  { id: 'banner', group: 'identity', name: 'Player Banners', icon: '⚑', blurb: 'The standard you fly at home.', preview: 'swatch' },
  { id: 'emblem', group: 'identity', name: 'Emblems', icon: '❉', blurb: 'Your mark on every leaderboard.', preview: 'text' },
  { id: 'prestigeBorder', group: 'identity', name: 'Prestige Borders', icon: '⬒', blurb: 'A frame earned in deep water.', preview: 'frame' },
  { id: 'collectionBorder', group: 'identity', name: 'Collection Borders', icon: '⬓', blurb: 'The archivist’s gilded edge.', preview: 'frame' },
];
const KIND_BY_ID = new Map(WARDROBE_KINDS.map((k) => [k.id, k] as const));
export function wardrobeKind(id: WardrobeKind): WardrobeKindDef {
  return KIND_BY_ID.get(id)!;
}

// ── Payload — the flat presentation-parameter bag consumers read ───────────────
/** FX preset vocabulary (render/wardrobeFx.ts + UI ceremony classes speak these ids). */
export type WardrobeFxPreset =
  | 'embers' | 'frost' | 'spores' | 'static' | 'petals' | 'starlit' | 'tendrils' | 'pulse' | 'gold' | 'void';
export type WardrobeTrail = 'comet' | 'ribbon' | 'sparks' | 'phage' | 'petal' | 'static' | 'gilded' | 'void';
/** Audio-cue variants — the SAME vocabulary Phenotype firing sfx uses (audio/sound.ts §variants). */
export type WardrobeCue = 'default' | 'deep' | 'crisp' | 'wet' | 'aetheric';

export interface WardrobePayload {
  accent?: string; // hex — the item's primary color (palette kinds, identity ink)
  glow?: string; // hex — secondary bloom/highlight
  bg?: string; // hex — deep background (themes, backdrops, nameplates)
  fx?: WardrobeFxPreset; // particle/FX preset id
  trail?: WardrobeTrail; // projectile trail preset id
  cue?: WardrobeCue; // audio-cue variant
  rootShift?: number; // music: semitone shift applied to the track root (−6..+6)
  bpmMult?: number; // music: tempo multiplier (0.8..1.25)
  brightness?: number; // music: 0..1 layer-gain shaping (0 = murky, 1 = glassy)
  text?: string; // titles: the words themselves
  css?: string; // interface kinds: the data-attribute value index.css keys off
  glyph?: string; // emblems/banners/cursors: the display glyph
}

// ── Sources — the CLOSED unlock vocabulary ─────────────────────────────────────
export type WardrobeSource =
  | { kind: 'starter' } // owned from the first boot (seeded by the save sanitizer)
  | { kind: 'campaign'; stage: number }
  | { kind: 'infinite'; depth: number } // best endless Depth (save.bestWave)
  | { kind: 'daily'; clears: number } // lifetime Daily Run clears
  | { kind: 'login'; days: number } // lifetime Daily Bio-Cache claims (docs/DAILY-LOGIN.md)
  | { kind: 'login-drop' } // the Bio-Cache's extremely-rare jackpot bleed (never auto-earned)
  | { kind: 'rush'; bossKills: number } // lifetime Boss Rush boss kills
  | { kind: 'roulette'; spores: number } // lifetime Bio-Spores wagered
  | { kind: 'achievement'; id: string }
  | { kind: 'collection'; category: CollectionCategoryId | 'overall'; rank: number } // rankIndex ≥
  | { kind: 'shop'; ichor: number } // Wardrobe boutique, bought with Ichor
  | { kind: 'battlepass'; season: string; level: number; track: 'free' | 'premium' }
  | { kind: 'milestone' } // granted by a cosmetic-collection milestone claim (see MILESTONES)
  | { kind: 'event'; event: string } // LiveOps grant lane (seasonal/holiday drops)
  | { kind: 'quest'; quest: string }; // quest finale exclusive (granted once by the finale claim — core/quests.ts)

export type WardrobeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const WARDROBE_RARITY_COLOR: Record<WardrobeRarity, string> = {
  common: '#9fb0bd', rare: '#5ad1ff', epic: '#c98bff', legendary: '#ffd24d',
};
export const WARDROBE_RARITY_ORDER: WardrobeRarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface WardrobeItemDef {
  id: string; // 'wd_<kind>_<slug>'
  kind: WardrobeKind;
  name: string;
  desc: string;
  rarity: WardrobeRarity;
  source: WardrobeSource;
  payload: WardrobePayload;
}

// ── Per-kind payload requirements (the validator's contract with consumers) ────
const NEEDS: Partial<Record<WardrobeKind, (keyof WardrobePayload)[]>> = {
  nucleusSkin: ['accent', 'glow', 'fx'],
  battlefieldTheme: ['accent', 'bg'],
  projectileTrail: ['trail', 'accent'],
  towerFx: ['fx', 'accent'],
  placementFx: ['fx', 'accent'],
  heroFx: ['accent', 'glow'],
  heroSelectFx: ['accent', 'fx'],
  enemyTheme: ['accent', 'glow'],
  bossTheme: ['accent', 'glow'],
  megaTheme: ['accent', 'glow'],
  waveTheme: ['accent', 'cue'],
  stageIntro: ['accent', 'css'],
  musicPack: ['rootShift', 'bpmMult', 'brightness'],
  combatMusic: ['rootShift', 'bpmMult', 'brightness'],
  towerAudio: ['cue'],
  enemyAudio: ['cue'],
  heroVoice: ['cue'],
  notifSound: ['cue'],
  uiTheme: ['css', 'accent'],
  hudTheme: ['css', 'accent'],
  cardFrame: ['css', 'accent'],
  lootTheme: ['css', 'accent'],
  rouletteTheme: ['css', 'accent'],
  cursorTheme: ['css', 'glyph'],
  victoryScreen: ['css', 'accent'],
  defeatScreen: ['css', 'accent'],
  title: ['text'],
  nameColor: ['accent'],
  nameplate: ['accent', 'bg'],
  profileBg: ['accent', 'bg'],
  banner: ['accent', 'glyph'],
  emblem: ['glyph', 'accent'],
  prestigeBorder: ['css', 'accent'],
  collectionBorder: ['css', 'accent'],
};

export const wardrobeRegistry = new Registry<WardrobeItemDef>('wardrobeItem', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (!d.id.startsWith('wd_')) out.push('id must be wd_ prefixed');
    if (!KIND_BY_ID.has(d.kind)) out.push(`unknown kind ${d.kind}`);
    for (const key of NEEDS[d.kind] ?? []) {
      if (d.payload[key] === undefined) out.push(`kind ${d.kind} needs payload.${String(key)}`);
    }
    for (const hex of [d.payload.accent, d.payload.glow, d.payload.bg]) {
      if (hex !== undefined && !/^#[0-9a-f]{6}$/i.test(hex)) out.push(`bad hex '${hex}'`);
    }
    if (d.payload.rootShift !== undefined && Math.abs(d.payload.rootShift) > 6) out.push('rootShift beyond ±6');
    if (d.payload.bpmMult !== undefined && (d.payload.bpmMult < 0.8 || d.payload.bpmMult > 1.25)) out.push('bpmMult outside 0.8..1.25');
    if (d.source.kind === 'shop' && d.source.ichor <= 0) out.push('shop price must be > 0');
    return out;
  },
});

// ── The launch catalog ─────────────────────────────────────────────────────────
// Authored as dense rows; the id slug is derived from the name. Sources deliberately span
// EVERY progression lane (docs/COSMETICS.md §sources): campaign, infinite, daily, rush,
// roulette, achievements, collection ranks, the Ichor boutique, both Battle Passes, the
// milestone track, and a LiveOps event drop.
type Row = [kind: WardrobeKind, name: string, rarity: WardrobeRarity, source: WardrobeSource, payload: WardrobePayload, desc: string];

const bp = (season: string, level: number, track: 'free' | 'premium'): WardrobeSource => ({ kind: 'battlepass', season, level, track });

const ROWS: Row[] = [
  // ── ARENA ──
  ['nucleusSkin', 'Umbral Heart', 'common', { kind: 'starter' }, { accent: '#8a6ff0', glow: '#c9b8ff', fx: 'pulse' }, 'The heart as it first grew — dark, patient, alive.'],
  ['nucleusSkin', 'Molten Core', 'rare', { kind: 'campaign', stage: 10 }, { accent: '#ff7a45', glow: '#ffc46b', fx: 'embers' }, 'A heart that learned to smolder. Cinders rise off every beat.'],
  ['nucleusSkin', 'Glacial Heart', 'epic', { kind: 'infinite', depth: 25 }, { accent: '#7fd7ff', glow: '#e8f8ff', fx: 'frost' }, 'Frozen mid-beat in the deep dark. Breath crystallizes around it.'],
  ['nucleusSkin', 'Heart of Gold', 'epic', { kind: 'shop', ichor: 120 }, { accent: '#ffd24d', glow: '#fff0b8', fx: 'gold' }, 'Aurified chambers. It beats like a struck bell.'],
  ['nucleusSkin', 'Apex Crown', 'legendary', bp('s1', 100, 'premium'), { accent: '#ff4d6d', glow: '#ffd24d', fx: 'petals' }, 'The Crimson Bloom’s final flower — a crowned heart wreathed in falling petals.'],
  ['nucleusSkin', 'Event Horizon', 'legendary', bp('s2', 60, 'premium'), { accent: '#3d7a8c', glow: '#9adfff', fx: 'void' }, 'Light bends toward it and does not leave.'],
  ['battlefieldTheme', 'Ashen Waste', 'rare', { kind: 'campaign', stage: 20 }, { accent: '#c8b29a', bg: '#191410' }, 'A field burned to quiet greys — new growth reads brighter against it.'],
  ['battlefieldTheme', 'Bioluminal Deep', 'epic', { kind: 'infinite', depth: 40 }, { accent: '#4de0c4', bg: '#04141a' }, 'The arena as an abyssal trench, lit by what lives in it.'],
  ['battlefieldTheme', 'Blood Tide', 'epic', bp('s1', 35, 'premium'), { accent: '#ff4d6d', bg: '#1a0710' }, 'The ground remembers every wave that broke on it.'],
  ['battlefieldTheme', 'Sterile Field', 'rare', { kind: 'shop', ichor: 90 }, { accent: '#c7d0d8', bg: '#10151c' }, 'Corporate-white containment tiling. The infestation looks louder here.'],
  ['projectileTrail', 'Ember Wake', 'common', { kind: 'campaign', stage: 6 }, { trail: 'comet', accent: '#ff9a5c' }, 'Every shot drags a line of live coals.'],
  ['projectileTrail', 'Phage Ribbon', 'rare', { kind: 'achievement', id: 'exterminator' }, { trail: 'ribbon', accent: '#7fe07a' }, 'A helix of pale sequence trailing every round.'],
  ['projectileTrail', 'Static Rift', 'epic', { kind: 'shop', ichor: 100 }, { trail: 'static', accent: '#9adfff' }, 'Shots tear briefly visible seams in the air.'],
  ['projectileTrail', 'Gilded Thread', 'legendary', bp('s1', 70, 'premium'), { trail: 'gilded', accent: '#ffd24d' }, 'The champion’s wake — molten gold, drawn thin.'],
  ['projectileTrail', 'Petalfall', 'epic', { kind: 'event', event: 'bloom_cycle' }, { trail: 'petal', accent: '#ff9ab8' }, 'Bloom Cycle exclusive — every impact sheds petals.'],
  ['projectileTrail', 'Void Wake', 'legendary', bp('s2', 85, 'premium'), { trail: 'void', accent: '#8a6ff0' }, 'Rounds that remember being somewhere darker.'],
  ['towerFx', 'Spore Bloom', 'common', { kind: 'daily', clears: 5 }, { fx: 'spores', accent: '#a9e069' }, 'Idle towers exhale a soft green drift.'],
  ['towerFx', 'Ember Motes', 'rare', { kind: 'campaign', stage: 15 }, { fx: 'embers', accent: '#ff9a5c' }, 'Warm sparks orbit every emplacement.'],
  ['towerFx', 'Frost Breath', 'rare', { kind: 'shop', ichor: 80 }, { fx: 'frost', accent: '#bfe9ff' }, 'Your artillery exhales winter.'],
  ['towerFx', 'Golden Pollen', 'epic', bp('s1', 55, 'premium'), { fx: 'gold', accent: '#ffd24d' }, 'The hive dusts its champions in gold.'],
  ['placementFx', 'Seismic Root', 'common', { kind: 'campaign', stage: 8 }, { fx: 'tendrils', accent: '#a9e069' }, 'New growth slams its roots home.'],
  ['placementFx', 'Spore Burst', 'rare', { kind: 'shop', ichor: 60 }, { fx: 'spores', accent: '#7fe07a' }, 'Placement detonates a soft green bloom.'],
  ['placementFx', 'Star Impact', 'epic', bp('s2', 45, 'premium'), { fx: 'starlit', accent: '#9adfff' }, 'Towers arrive like something that fell from orbit.'],
  ['heroFx', 'Vital Surge', 'rare', { kind: 'collection', category: 'heroes', rank: 3 }, { accent: '#7fe07a', glow: '#c9ffb0' }, 'Your champion’s abilities bloom green with stolen vitality.'],
  ['heroFx', 'Abyssal Focus', 'epic', { kind: 'shop', ichor: 110 }, { accent: '#8a6ff0', glow: '#d9c9ff' }, 'Ability light drawn from the dark between signals.'],
  ['heroFx', 'Crimson Command', 'legendary', bp('s1', 90, 'premium'), { accent: '#ff4d6d', glow: '#ffb3c2' }, 'Every cast is a declaration in arterial red.'],
  ['heroSelectFx', 'Command Aura', 'common', { kind: 'achievement', id: 'veteran' }, { accent: '#ffd24d', fx: 'pulse' }, 'Chosen champions answer under a golden ring.'],
  ['heroSelectFx', 'Bloom of War', 'rare', bp('s2', 30, 'free'), { accent: '#ff9ab8', fx: 'petals' }, 'Selection wreathes your hero in falling petals.'],
  ['enemyTheme', 'Spectral Broods', 'rare', { kind: 'achievement', id: 'centurion' }, { accent: '#9adfff', glow: '#e8f8ff' }, 'The invaders arrive pale and half-remembered.'],
  ['enemyTheme', 'Toxic Broods', 'rare', { kind: 'infinite', depth: 30 }, { accent: '#a9e069', glow: '#eaffb0' }, 'A caustic re-pigmentation — the swarm glows warning-green.'],
  ['enemyTheme', 'Obsidian Broods', 'epic', { kind: 'shop', ichor: 140 }, { accent: '#5a6673', glow: '#aab7c4' }, 'Glassy black carapaces that drink the arena light.'],
  ['enemyTheme', 'Bleached Broods', 'epic', bp('s2', 70, 'premium'), { accent: '#e8e3d8', glow: '#ffffff' }, 'The tide comes in bone-white.'],
  ['bossTheme', 'Gilded Tyrants', 'epic', { kind: 'collection', category: 'bosses', rank: 4 }, { accent: '#ffd24d', glow: '#fff0b8' }, 'Bosses arrive laurelled — trophies that fight back.'],
  ['bossTheme', 'Umbral Tyrants', 'epic', { kind: 'shop', ichor: 150 }, { accent: '#8a6ff0', glow: '#2b1d33' }, 'The tyrants wear the dark between signals.'],
  ['bossTheme', 'Neon Tyrants', 'legendary', bp('s1', 80, 'premium'), { accent: '#ff4d9e', glow: '#ffd24d' }, 'Bosses lit like a midnight marquee.'],
  ['megaTheme', 'Crimson Colossi', 'epic', { kind: 'collection', category: 'megaBosses', rank: 2 }, { accent: '#ff4d6d', glow: '#ffb3c2' }, 'The battlefield-scale horrors, re-veined in red.'],
  ['megaTheme', 'Void Colossi', 'legendary', bp('s2', 100, 'premium'), { accent: '#8a6ff0', glow: '#3d7a8c' }, 'The Abyssal Tide’s final shape — colossi dressed in event-horizon violet.'],
  ['waveTheme', 'Klaxon Bloom', 'common', { kind: 'campaign', stage: 12 }, { accent: '#ffd24d', cue: 'crisp' }, 'Wave heralds land as bright brass.'],
  ['waveTheme', 'Silent Tide', 'rare', { kind: 'shop', ichor: 70 }, { accent: '#3d7a8c', cue: 'deep' }, 'Assaults announced as a low pressure change.'],
  ['stageIntro', 'Breach Protocol', 'rare', { kind: 'campaign', stage: 25 }, { accent: '#ff7a45', css: 'breach' }, 'Deployments open with emergency-amber sirens.'],
  ['stageIntro', 'Royal Descent', 'epic', bp('s1', 25, 'premium'), { accent: '#ffd24d', css: 'royal' }, 'Every stage begins like a coronation.'],
  // ── AUDIO ──
  ['musicPack', 'Deep Cradle', 'rare', { kind: 'campaign', stage: 18 }, { rootShift: -3, bpmMult: 0.9, brightness: 0.25 }, 'The hive’s song, three steps lower and half asleep.'],
  ['musicPack', 'Frostsong', 'rare', { kind: 'shop', ichor: 100 }, { rootShift: 4, bpmMult: 1.05, brightness: 0.85 }, 'The menu theme re-sung in glassy registers.'],
  ['musicPack', 'Choir of Wounds', 'epic', bp('s1', 45, 'premium'), { rootShift: 1, bpmMult: 0.95, brightness: 0.45 }, 'The idle song learns a second, sadder voice.'],
  ['musicPack', 'Abyss Chorale', 'epic', bp('s2', 25, 'premium'), { rootShift: -5, bpmMult: 0.85, brightness: 0.15 }, 'Sung from the bottom of a lightless column.'],
  ['combatMusic', 'War Drums', 'rare', { kind: 'rush', bossKills: 25 }, { rootShift: 0, bpmMult: 1.12, brightness: 0.55 }, 'The combat pulse, pushed forward on skin drums.'],
  ['combatMusic', 'Adrenal Surge', 'rare', { kind: 'shop', ichor: 100 }, { rootShift: 2, bpmMult: 1.2, brightness: 0.75 }, 'Faster, brighter, meaner — combat at redline.'],
  ['combatMusic', 'Black Parade', 'epic', bp('s2', 90, 'premium'), { rootShift: -4, bpmMult: 0.92, brightness: 0.2 }, 'A funeral march that wins.'],
  ['towerAudio', 'Deep Resonance', 'rare', { kind: 'collection', category: 'towers', rank: 3 }, { cue: 'deep' }, 'Every emplacement fires an octave heavier.'],
  ['towerAudio', 'Crisp Actuation', 'common', { kind: 'shop', ichor: 60 }, { cue: 'crisp' }, 'Clinical, bright, satisfying mechanisms.'],
  ['towerAudio', 'Wet Chorus', 'rare', { kind: 'daily', clears: 10 }, { cue: 'wet' }, 'The organic truth of the artillery, unmuffled.'],
  ['enemyAudio', 'Hollow Cries', 'rare', { kind: 'achievement', id: 'biomass_baron' }, { cue: 'aetheric' }, 'The broods die like wind through pipes.'],
  ['enemyAudio', 'Chitin Chorus', 'common', { kind: 'shop', ichor: 60 }, { cue: 'crisp' }, 'Dry, clicking, percussive ends.'],
  ['heroVoice', 'Stoic Resolve', 'rare', { kind: 'collection', category: 'heroes', rank: 2 }, { cue: 'deep' }, 'Your champion acknowledges orders from the chest.'],
  ['heroVoice', 'Feral Snarl', 'rare', { kind: 'shop', ichor: 80 }, { cue: 'wet' }, 'Less acknowledgement, more appetite.'],
  ['notifSound', 'Soft Chime', 'common', { kind: 'starter' }, { cue: 'default' }, 'Good news, gently.'],
  ['notifSound', 'Deep Pulse', 'common', { kind: 'shop', ichor: 40 }, { cue: 'deep' }, 'Notifications as a felt heartbeat.'],
  ['notifSound', 'Crystal Ping', 'rare', bp('s1', 15, 'free'), { cue: 'crisp' }, 'A bright icicle of a chime.'],
  // ── INTERFACE ──
  ['uiTheme', 'Arctic Console', 'rare', { kind: 'infinite', depth: 20 }, { css: 'arctic', accent: '#7fd7ff' }, 'Headquarters recooled to glacier blues.'],
  ['uiTheme', 'Blood Lab', 'rare', { kind: 'campaign', stage: 30 }, { css: 'blood', accent: '#ff4d6d' }, 'The shell re-lit in specimen red.'],
  ['uiTheme', 'Amber Terminal', 'epic', { kind: 'shop', ichor: 130 }, { css: 'amber', accent: '#ffb84d' }, 'A salvaged corporate terminal glow.'],
  ['uiTheme', 'Void Glass', 'legendary', bp('s2', 50, 'premium'), { css: 'void', accent: '#8a6ff0' }, 'The interface as a window onto nothing.'],
  ['uiTheme', 'Curator', 'epic', { kind: 'collection', category: 'overall', rank: 4 }, { css: 'curator', accent: '#e6a2ff' }, 'The archivist’s private exhibition lighting.'],
  ['hudTheme', 'Minimal Pulse', 'rare', { kind: 'daily', clears: 15 }, { css: 'minimal', accent: '#9fb0bd' }, 'The combat HUD, whisper-quiet.'],
  ['hudTheme', 'Tactical Amber', 'rare', { kind: 'shop', ichor: 90 }, { css: 'amber', accent: '#ffb84d' }, 'Warm targeting-room optics.'],
  ['hudTheme', 'Crimson Ops', 'epic', bp('s1', 60, 'premium'), { css: 'crimson', accent: '#ff4d6d' }, 'Battle overlay in war-room red.'],
  ['cardFrame', 'Chitin Inlay', 'common', { kind: 'campaign', stage: 22 }, { css: 'chitin', accent: '#a9e069' }, 'Mutation drafts framed in polished shell.'],
  ['cardFrame', 'Bone Filigree', 'rare', { kind: 'collection', category: 'cards', rank: 3 }, { css: 'bone', accent: '#e8e3d8' }, 'Delicate skeletal scrollwork around every card.'],
  ['cardFrame', 'Gilt Edge', 'epic', { kind: 'shop', ichor: 85 }, { css: 'gilt', accent: '#ffd24d' }, 'Museum framing for your genome.'],
  ['cardFrame', 'Royal Seal', 'legendary', bp('s1', 40, 'premium'), { css: 'royal', accent: '#ff4d6d' }, 'Every draft arrives under the crown’s wax.'],
  ['cardFrame', 'Archive Filigree', 'epic', { kind: 'milestone' }, { css: 'archive', accent: '#e6a2ff' }, 'The Curator’s own cataloguing frame — a milestone reward.'],
  ['lootTheme', 'Golden Rupture', 'rare', { kind: 'collection', category: 'chests', rank: 4 }, { css: 'gold', accent: '#ffd24d' }, 'Containers give up their contents in bullion light.'],
  ['lootTheme', 'Void Bloom', 'epic', { kind: 'shop', ichor: 95 }, { css: 'void', accent: '#8a6ff0' }, 'The ceremony collapses inward before it blooms.'],
  ['lootTheme', 'Jubilee Burst', 'rare', bp('s2', 15, 'free'), { css: 'jubilee', accent: '#ff9ab8' }, 'Openings with unreasonable confetti.'],
  ['rouletteTheme', 'Midnight Wheel', 'rare', { kind: 'roulette', spores: 50 }, { css: 'midnight', accent: '#8a6ff0' }, 'The organ wheel re-felted for the small hours.'],
  ['rouletteTheme', 'Royal Wheel', 'epic', { kind: 'shop', ichor: 85 }, { css: 'royal', accent: '#ffd24d' }, 'High-roller varnish on the wheel of organs.'],
  ['cursorTheme', 'Talon', 'common', { kind: 'campaign', stage: 5 }, { css: 'talon', glyph: '➤' }, 'Point with something that has an edge.'],
  ['cursorTheme', 'Ghost Needle', 'rare', { kind: 'shop', ichor: 50 }, { css: 'ghost', glyph: '✛' }, 'A pale surgical crosshair.'],
  ['cursorTheme', 'Gilded Talon', 'rare', bp('s1', 8, 'free'), { css: 'gilded', glyph: '➤' }, 'The claw, dipped in gold.'],
  ['victoryScreen', 'Triumphant Bloom', 'rare', { kind: 'campaign', stage: 14 }, { css: 'bloom', accent: '#7fe07a' }, 'Wins end under a burst of green growth.'],
  ['victoryScreen', 'Golden Fanfare', 'epic', bp('s1', 95, 'premium'), { css: 'fanfare', accent: '#ffd24d' }, 'Victory as a coronation portrait.'],
  ['defeatScreen', 'Graceful Collapse', 'rare', { kind: 'infinite', depth: 15 }, { css: 'graceful', accent: '#9fb0bd' }, 'Losses rendered as elegy, not error.'],
  ['defeatScreen', 'Martyr’s Pyre', 'epic', { kind: 'shop', ichor: 65 }, { css: 'pyre', accent: '#ff7a45' }, 'Go down burning.'],
  // ── IDENTITY ──
  ['title', 'Hatchling', 'common', { kind: 'starter' }, { text: 'Hatchling' }, 'Everyone starts wet and new.'],
  ['title', 'Survivor', 'common', { kind: 'achievement', id: 'first_run' }, { text: 'Survivor' }, 'You came back. That already puts you ahead.'],
  ['title', 'Centurion', 'rare', { kind: 'achievement', id: 'centurion' }, { text: 'Centurion' }, 'A hundred kills in one breath of the war.'],
  ['title', 'Deep Diver', 'rare', { kind: 'infinite', depth: 35 }, { text: 'Deep Diver' }, 'Depth 35. The dark knows your name now.'],
  ['title', 'Daily Devotee', 'rare', { kind: 'daily', clears: 20 }, { text: 'Daily Devotee' }, 'Twenty days answered.'],
  ['title', 'Warmaster', 'epic', { kind: 'campaign', stage: 40 }, { text: 'Warmaster' }, 'Stage 40 cleared — the campaign bends to you.'],
  ['title', 'The Curator', 'epic', { kind: 'collection', category: 'overall', rank: 4 }, { text: 'The Curator' }, 'Platinum across the whole codex.'],
  ['title', 'Bloombearer', 'legendary', bp('s1', 100, 'premium'), { text: 'Bloombearer' }, 'You carried the Crimson Bloom to its hundredth petal.'],
  ['title', 'Tidecaller', 'legendary', bp('s2', 100, 'premium'), { text: 'Tidecaller' }, 'The Abyssal Tide answered to you, all season long.'],
  ['title', 'Patron of the Hive', 'epic', { kind: 'shop', ichor: 200 }, { text: 'Patron of the Hive' }, 'The hive remembers its benefactors.'],
  ['nameColor', 'Vital Green', 'common', { kind: 'starter' }, { accent: '#7fe07a' }, 'Hive-standard signature ink.'],
  ['nameColor', 'Caustic Lime', 'common', { kind: 'campaign', stage: 16 }, { accent: '#c8ff4d' }, 'A name that reads like a warning label.'],
  ['nameColor', 'Ichor Black', 'rare', { kind: 'shop', ichor: 75 }, { accent: '#b8c4d9' }, 'Pale script on the void — written in what the market runs on.'],
  ['nameColor', 'Royal Gold', 'epic', bp('s1', 30, 'premium'), { accent: '#ffd24d' }, 'Your name, minted.'],
  ['nameColor', 'Abyss Teal', 'epic', bp('s2', 40, 'premium'), { accent: '#4de0c4' }, 'The color of pressure and patience.'],
  ['nameplate', 'Bone Plate', 'common', { kind: 'starter' }, { accent: '#e8e3d8', bg: '#1a1712' }, 'A clean plaque of cured bone.'],
  ['nameplate', 'Living Vines', 'rare', { kind: 'daily', clears: 8 }, { accent: '#7fe07a', bg: '#0c1a0e' }, 'Your name, slowly being grown over.'],
  ['nameplate', 'Molten Crest', 'epic', { kind: 'shop', ichor: 120 }, { accent: '#ff9a5c', bg: '#1a0e07' }, 'A plaque still cooling from the forge.'],
  ['nameplate', 'Star Court', 'legendary', bp('s2', 95, 'premium'), { accent: '#9adfff', bg: '#070d1a' }, 'A nameplate with its own constellation.'],
  ['profileBg', 'Hive Wall', 'common', { kind: 'starter' }, { accent: '#8a6ff0', bg: '#120d1a' }, 'The commander against living architecture.'],
  ['profileBg', 'Blood Garden', 'rare', { kind: 'campaign', stage: 28 }, { accent: '#ff4d6d', bg: '#1a070d' }, 'Where the campaign’s casualties bloom.'],
  ['profileBg', 'Abyss Window', 'epic', bp('s2', 75, 'premium'), { accent: '#4de0c4', bg: '#04141a' }, 'A porthole onto the lightless deep.'],
  ['banner', 'War Banner', 'common', { kind: 'achievement', id: 'veteran' }, { accent: '#ff4d6d', glyph: '⚑' }, 'Ten campaigns’ worth of standing your ground.'],
  ['banner', 'Harvest Standard', 'rare', { kind: 'shop', ichor: 110 }, { accent: '#ffb84d', glyph: '❂' }, 'Flown over fields that feed the hive.'],
  ['banner', 'Crown Standard', 'legendary', bp('s1', 85, 'premium'), { accent: '#ffd24d', glyph: '♛' }, 'The Crimson Bloom’s royal colors.'],
  ['emblem', 'Hive Sigil', 'common', { kind: 'starter' }, { glyph: '❉', accent: '#7fe07a' }, 'The mark every commander starts under.'],
  ['emblem', 'Skull Mark', 'rare', { kind: 'rush', bossKills: 50 }, { glyph: '☠', accent: '#c7d0d8' }, 'Fifty tyrants filed under “handled.”'],
  ['emblem', 'Gene Helix', 'rare', { kind: 'collection', category: 'cards', rank: 4 }, { glyph: '⌬', accent: '#c98bff' }, 'The mutation archive, worn as a badge.'],
  ['emblem', 'Crown of Thorns', 'legendary', bp('s1', 65, 'premium'), { glyph: '♛', accent: '#ffd24d' }, 'Won, not inherited.'],
  ['emblem', 'Void Star', 'legendary', bp('s2', 65, 'premium'), { glyph: '✦', accent: '#8a6ff0' }, 'A point of dark you can navigate by.'],
  ['prestigeBorder', 'Molt Ring', 'rare', { kind: 'campaign', stage: 35 }, { css: 'molt', accent: '#7fe07a' }, 'A border grown from shed campaign skins.'],
  ['prestigeBorder', 'Diamond Weave', 'epic', { kind: 'infinite', depth: 50 }, { css: 'diamond', accent: '#7cc9ff' }, 'Depth-50 lattice — pressure made ornament.'],
  ['prestigeBorder', 'Ascendant Halo', 'legendary', { kind: 'shop', ichor: 250 }, { css: 'halo', accent: '#e6a2ff' }, 'The boutique’s single most shameless object.'],
  ['collectionBorder', 'Bronze Fret', 'common', { kind: 'collection', category: 'overall', rank: 1 }, { css: 'bronze', accent: '#c9803e' }, 'The archivist’s first frame.'],
  ['collectionBorder', 'Gold Fret', 'rare', { kind: 'collection', category: 'overall', rank: 3 }, { css: 'gold', accent: '#ffd24d' }, 'Gold rank, worn on the profile’s edge.'],
  ['collectionBorder', 'Ascendant Fret', 'legendary', { kind: 'collection', category: 'overall', rank: 6 }, { css: 'ascendant', accent: '#e6a2ff' }, '100% of everything. The frame agrees.'],
  ['emblem', 'Curator’s Eye', 'epic', { kind: 'milestone' }, { glyph: '◉', accent: '#e6a2ff' }, 'A milestone-track exclusive — the eye that catalogued it all.'],
  // ── Daily Bio-Cache devotion ladder (docs/DAILY-LOGIN.md — lifetime claims, never lost) ──
  ['title', 'The Devoted', 'rare', { kind: 'login', days: 7 }, { text: 'The Devoted' }, 'Seven caches opened. The organism has started expecting you.'],
  ['nameplate', 'Vein-Grown Plaque', 'epic', { kind: 'login', days: 30 }, { accent: '#e0314b', bg: '#1a070d' }, 'A month of tithes — your name now has a pulse.'],
  ['banner', 'Standard of the Vigil', 'epic', { kind: 'login', days: 100 }, { accent: '#e0314b', glyph: '◈' }, 'A hundred days answered. Flown in arterial red.'],
  ['title', 'Year-Bound', 'legendary', { kind: 'login', days: 365 }, { text: 'Year-Bound' }, 'Three hundred sixty-five communions. The hive keeps your calendar now.'],
  ['prestigeBorder', 'Thousandth Dawn', 'legendary', { kind: 'login', days: 1000 }, { css: 'dawn', accent: '#e0314b' }, 'A thousand mornings at the membrane. Time itself frames you.'],
  ['collectionBorder', 'Devoted Fret', 'epic', { kind: 'collection', category: 'logins', rank: 4 }, { css: 'devoted', accent: '#e0314b' }, 'Platinum devotion, worn on the profile’s edge.'],
  // The Bio-Cache jackpot pool (source 'login-drop' — granted ONLY by the ~1-in-220 cache roll).
  ['projectileTrail', 'Ichor Wake', 'epic', { kind: 'login-drop' }, { trail: 'gilded', accent: '#e0314b' }, 'A jackpot bleed from a Daily Bio-Cache — every shot trails black blood.'],
  ['cardFrame', 'Caul Filigree', 'legendary', { kind: 'login-drop' }, { css: 'caul', accent: '#e0314b' }, 'A jackpot bleed from a Daily Bio-Cache — drafts framed in birth membrane.'],
  // ── Season FREE-track cosmetics (docs/BATTLEPASS.md — every pass seeds the free lane too) ──
  ['waveTheme', 'Bloom Fanfare', 'rare', bp('s1', 35, 'free'), { accent: '#ff9ab8', cue: 'crisp' }, 'Crimson Bloom free reward — waves announced in falling petals.'],
  ['nameColor', 'Petal Pink', 'rare', bp('s1', 60, 'free'), { accent: '#ff9ab8' }, 'Crimson Bloom free reward — a name signed in bloom.'],
  ['emblem', 'Bloom Mark', 'rare', bp('s1', 80, 'free'), { glyph: '❁', accent: '#ff4d6d' }, 'Crimson Bloom free reward — you were there when it flowered.'],
  ['nameColor', 'Tide Grey', 'rare', bp('s2', 55, 'free'), { accent: '#9fb8bd' }, 'Abyssal Tide free reward — ink the color of deep water.'],
  ['title', 'Tideborn', 'rare', bp('s2', 85, 'free'), { text: 'Tideborn' }, 'Abyssal Tide free reward — the deep claims its own.'],
  // ── Quest finale exclusives (core/quests.ts — each finale's first claim grants one FOREVER) ──
  ['projectileTrail', 'Reaper’s Wake', 'epic', { kind: 'quest', quest: 'wk_red_harvest' }, { trail: 'phage', accent: '#ff5d73' }, 'The Red Harvest finale — every shot drags a wake of red chaff.'],
  ['nucleusSkin', 'Signal Heart', 'epic', { kind: 'quest', quest: 'wk_deep_signals' }, { accent: '#8fd0ff', glow: '#e8f8ff', fx: 'static' }, 'Deep Signals finale — a heart that beats in dots and dashes.'],
  ['banner', 'Watchfire Standard', 'epic', { kind: 'quest', quest: 'wk_long_watch' }, { accent: '#b6e84a', glyph: '☄' }, 'The Long Watch finale — flown wherever the line held.'],
  ['emblem', 'First Eye', 'epic', { kind: 'quest', quest: 'mq_awakening' }, { glyph: '◎', accent: '#b6e84a' }, 'Chapter I finale — the Core’s first eye, open ever since.'],
  ['banner', 'Choirbreaker', 'legendary', { kind: 'quest', quest: 'mq_choirs' }, { accent: '#d98cff', glyph: '♆' }, 'Chapter II finale — one voice fewer in the deep chorus.'],
  ['uiTheme', 'The Root', 'legendary', { kind: 'quest', quest: 'mq_root' }, { css: 'root', accent: '#e24dff' }, 'Chapter III finale — the shell re-grown from below.'],
];

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const WARDROBE_ITEMS: WardrobeItemDef[] = ROWS.map(([kind, name, rarity, source, payload, desc]) => ({
  id: `wd_${kind}_${slug(name)}`.toLowerCase(), kind, name, desc, rarity, source, payload,
}));
wardrobeRegistry.registerAll(WARDROBE_ITEMS);

// ── Lookups ────────────────────────────────────────────────────────────────────
export function wardrobeItem(id: string): WardrobeItemDef | undefined {
  return wardrobeRegistry.get(id);
}
export function wardrobeItemsOf(kind: WardrobeKind): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => d.kind === kind);
}
export function wardrobeGroupItems(group: WardrobeGroup): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => wardrobeKind(d.kind).group === group);
}
/** Items owned from the first boot — the save layer seeds these into `owned`. */
export function starterItems(): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => d.source.kind === 'starter');
}
/** The Ichor boutique inventory (always purchasable — cosmetics never rotate out of reach). */
export function boutiqueItems(): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => d.source.kind === 'shop');
}
/** Items a given Battle Pass season's tracks grant (for pass authoring + validation). */
export function seasonItems(season: string): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => d.source.kind === 'battlepass' && d.source.season === season);
}

// ── Auto-unlock evaluation (the achievement-style poll) ────────────────────────
/** Everything the auto lanes read, derived from the save by meta (read-only). */
export interface WardrobeUnlockCtx {
  campaignStage: number; // highest cleared stage
  bestDepth: number; // best endless Depth (save.bestWave)
  dailyClears: number;
  lifetimeLogins: number; // lifetime Daily Bio-Cache claims (docs/DAILY-LOGIN.md)
  rushBossKills: number;
  rouletteSpores: number;
  achievements: Set<string>;
  collectionRanks: Partial<Record<CollectionCategoryId, number>>; // rankIndex per category
  overallRank: number;
}

/** Whether an item's source is an AUTO lane (progression-derived, granted by the poll). */
export function isAutoSource(s: WardrobeSource): boolean {
  return s.kind === 'campaign' || s.kind === 'infinite' || s.kind === 'daily' || s.kind === 'login'
    || s.kind === 'rush' || s.kind === 'roulette' || s.kind === 'achievement' || s.kind === 'collection';
}

/** Evaluate one auto source against the context. Non-auto sources always read false. */
export function sourceMet(s: WardrobeSource, ctx: WardrobeUnlockCtx): boolean {
  switch (s.kind) {
    case 'campaign': return ctx.campaignStage >= s.stage;
    case 'infinite': return ctx.bestDepth >= s.depth;
    case 'daily': return ctx.dailyClears >= s.clears;
    case 'login': return ctx.lifetimeLogins >= s.days;
    case 'rush': return ctx.rushBossKills >= s.bossKills;
    case 'roulette': return ctx.rouletteSpores >= s.spores;
    case 'achievement': return ctx.achievements.has(s.id);
    case 'collection': {
      const have = s.category === 'overall' ? ctx.overallRank : (ctx.collectionRanks[s.category] ?? 0);
      return have >= s.rank;
    }
    default: return false;
  }
}

/** All auto-lane items the context has EARNED (owned or not — caller diffs). */
export function earnedAutoItems(ctx: WardrobeUnlockCtx): WardrobeItemDef[] {
  return wardrobeRegistry.all().filter((d) => isAutoSource(d.source) && sourceMet(d.source, ctx));
}

/** Quest display names for locked-card hints — quests.test.ts pins these against core/quests.ts
 *  (kept as data here so wardrobe never imports quest defs; see the battlepass season names). */
const QUEST_NAMES: Record<string, string> = {
  wk_red_harvest: 'The Red Harvest', wk_deep_signals: 'Deep Signals', wk_long_watch: 'The Long Watch',
  mq_awakening: 'Chapter I — Awakening', mq_choirs: 'Chapter II — The Choirs', mq_root: 'Chapter III — The Root',
};

/** Human text for where an item comes from (the Wardrobe's locked-card hint). */
export function sourceLabel(s: WardrobeSource): string {
  switch (s.kind) {
    case 'starter': return 'Starter issue';
    case 'campaign': return `Clear Campaign Stage ${s.stage}`;
    case 'infinite': return `Reach Depth ${s.depth} (Infinite)`;
    case 'daily': return `${s.clears} lifetime Daily clears`;
    case 'login': return `${s.days} lifetime Daily Bio-Cache claims`;
    case 'login-drop': return 'Daily Bio-Cache rarity bleed — extremely rare';
    case 'rush': return `${s.bossKills} lifetime Boss Rush kills`;
    case 'roulette': return `Wager ${s.spores} lifetime Bio-Spores`;
    case 'achievement': return 'Achievement reward';
    case 'collection': return `Collection rank (${s.category === 'overall' ? 'overall' : s.category})`;
    case 'shop': return `Boutique — ${s.ichor} Ichor`;
    case 'battlepass': return `${s.season === 's1' ? 'Crimson Bloom' : s.season === 's2' ? 'Abyssal Tide' : s.season} Pass — Level ${s.level}${s.track === 'premium' ? ' (Premium)' : ''}`;
    case 'milestone': return 'Cosmetic milestone reward';
    case 'event': return 'Seasonal event exclusive';
    case 'quest': return `Quest finale — ${QUEST_NAMES[s.quest] ?? s.quest}`;
  }
}

// ── Cosmetic collection milestones (docs/COSMETICS.md §milestones) ─────────────
// Cosmetic-first rewards for completing the cosmetic codices — Ichor, containers, cores,
// shards, ANOTHER cosmetic, a title. Claimed once each (save.wardrobe.milestones).
export type WardrobeMilestoneReward =
  | { kind: 'ichor'; qty: number }
  | { kind: 'cores'; qty: number }
  | { kind: 'geneEssence'; qty: number }
  | { kind: 'container'; rarity: 'rare' | 'epic' | 'legendary'; count: number }
  | { kind: 'towerShardsAll'; qtyEach: number }
  | { kind: 'heroShardsAll'; qtyEach: number }
  | { kind: 'item'; id: string }; // a milestone-source wardrobe item

export interface WardrobeMilestone {
  id: string;
  name: string;
  desc: string;
  category: CollectionCategoryId; // which cosmetic codex it watches
  rank: number; // rankIndex required
  rewards: WardrobeMilestoneReward[];
}

export const WARDROBE_MILESTONES: WardrobeMilestone[] = [
  { id: 'ms_skins_silver', name: 'Strain Sampler', desc: 'Silver rank across the Tower Skin codex.', category: 'towerSkins', rank: 2, rewards: [{ kind: 'ichor', qty: 40 }, { kind: 'container', rarity: 'rare', count: 2 }] },
  { id: 'ms_skins_gold', name: 'Strain Curator', desc: 'Gold rank across the Tower Skin codex.', category: 'towerSkins', rank: 3, rewards: [{ kind: 'ichor', qty: 90 }, { kind: 'cores', qty: 300 }, { kind: 'container', rarity: 'epic', count: 1 }] },
  { id: 'ms_hero_silver', name: 'Champion Tailor', desc: 'Silver rank across the Hero Skin codex.', category: 'heroSkins', rank: 2, rewards: [{ kind: 'ichor', qty: 40 }, { kind: 'heroShardsAll', qtyEach: 10 }] },
  { id: 'ms_arena_silver', name: 'Set Dresser', desc: 'Silver rank across the Arena FX codex.', category: 'wardrobeArena', rank: 2, rewards: [{ kind: 'ichor', qty: 50 }, { kind: 'towerShardsAll', qtyEach: 8 }] },
  { id: 'ms_arena_gold', name: 'Pyrotechnician', desc: 'Gold rank across the Arena FX codex.', category: 'wardrobeArena', rank: 3, rewards: [{ kind: 'ichor', qty: 100 }, { kind: 'container', rarity: 'epic', count: 2 }] },
  { id: 'ms_audio_silver', name: 'Ear of the Hive', desc: 'Silver rank across the Audio codex.', category: 'wardrobeAudio', rank: 2, rewards: [{ kind: 'ichor', qty: 50 }, { kind: 'geneEssence', qty: 120 }] },
  { id: 'ms_interface_silver', name: 'Shell Collector', desc: 'Silver rank across the Interface codex.', category: 'wardrobeInterface', rank: 2, rewards: [{ kind: 'ichor', qty: 50 }, { kind: 'item', id: 'wd_cardframe_archive_filigree' }] },
  { id: 'ms_interface_gold', name: 'Grand Decorator', desc: 'Gold rank across the Interface codex.', category: 'wardrobeInterface', rank: 3, rewards: [{ kind: 'ichor', qty: 110 }, { kind: 'container', rarity: 'legendary', count: 1 }] },
  { id: 'ms_identity_silver', name: 'Known Quantity', desc: 'Silver rank across the Identity codex.', category: 'wardrobeIdentity', rank: 2, rewards: [{ kind: 'ichor', qty: 50 }, { kind: 'item', id: 'wd_emblem_curator_s_eye' }] },
  { id: 'ms_identity_gold', name: 'Living Legend', desc: 'Gold rank across the Identity codex.', category: 'wardrobeIdentity', rank: 3, rewards: [{ kind: 'ichor', qty: 120 }, { kind: 'cores', qty: 400 }] },
];
const MILESTONE_BY_ID = new Map(WARDROBE_MILESTONES.map((m) => [m.id, m] as const));
export function wardrobeMilestone(id: string): WardrobeMilestone | undefined {
  return MILESTONE_BY_ID.get(id);
}
