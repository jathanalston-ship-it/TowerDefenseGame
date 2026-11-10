// MUSIC ENGINE (docs/MUSIC.md) — the adaptive soundtrack. ACTUAL MUSIC, never ambience:
// every track is a composition (melody, countermelody, bass motion, drum grammar, harmonic
// progression, evolving structure) built from a shared MOTIF library so themes recur across
// the whole score. Two halves:
//
//   1. A PURE COMPOSITION CORE (exported, unit-tested): the TRACK LIBRARY is data (tempo,
//      key, progression, motif references, per-layer gain ranges); `barNotes(track, bar)`
//      deterministically renders one bar of notes for every layer. No AudioContext here, so
//      tests can PROVE musicality (recognizable melody, harmonic progression, drum grammar,
//      intro ≠ loop, countermelody, motif reuse) headlessly.
//
//   2. A WebAudio PLAYER (the music manager): lookahead scheduler, per-layer stereo buses,
//      a mastering chain (compressor glue + the near-death duress filter), BAR-ALIGNED
//      equal-power crossfades, track ROTATION (menus never repeat forever), progression- and
//      scene-weighted selection, per-boss theme assignment, intensity→layer mapping (the
//      Assimilation seam: choir + industrial hits only AWAKEN at high intensity), musical
//      STINGERS, and sidechain ducking. Callers only ever request a CATEGORY — playback,
//      selection, and transitions are entirely the manager's business.
//
// ADDING CONTENT = DATA: a new track is one TRACK_LIBRARY row; a new boss theme is one
// BOSS_THEME_OVERRIDES entry (unmapped bosses hash-assign a stable theme automatically);
// a new stinger is one STINGERS row. No engine changes anywhere.

// ── The pure composition core ────────────────────────────────────────────────────────────────

export type MusicCategory = 'menu' | 'combat' | 'boss' | 'mega' | 'victory' | 'defeat' | 'events' | 'cinema';
export type LayerId = 'bass' | 'drums' | 'arp' | 'lead' | 'pad' | 'texture' | 'choir' | 'hits';
export const LAYER_IDS: LayerId[] = ['bass', 'drums', 'arp', 'lead', 'pad', 'texture', 'choir', 'hits'];

/** A Wardrobe music pack's re-voicing (docs/COSMETICS.md §wardrobe): semitone root shift,
 *  tempo multiplier, and 0..1 brightness over the layer mix. */
export interface MusicTransform { rootShift: number; bpmMult: number; brightness: number }

export interface Note {
  /** Offset inside the bar, in 16th steps (0..15). */
  step: number;
  /** MIDI note number (drums use channel-style ids: 36 kick, 38 snare, 42 hat, 46 open, 49 crash). */
  midi: number;
  /** Duration in 16th steps. */
  len: number;
  /** 0..1 — velocity/level. */
  vel: number;
}

export interface LayerDef {
  id: LayerId;
  /** Gain range across intensity 0..1 (the adaptive seam): gain = min + (max-min)·intensity.
   *  A [0, x] range means the layer is SILENT until intensity wakes it (choir/hits emerge). */
  gain: [number, number];
}

// ── The MOTIF LIBRARY — the score's recurring themes. Every track's melody (and its choir
//    countermelody) is a reference into this table, so the same theme is heard across menus,
//    combat, and bosses in different keys/tempos/registers — the "players remember melodies"
//    contract. Degrees are scale indices (octave-relative); -1 = a breath. ──
export type MotifId =
  | 'hive' // the main theme — the organism itself (menus + early combat)
  | 'assimilation' // the rising takeover figure (late menus, deep combat, boss stalking)
  | 'hero' // the defiant counter-voice (labs, events, combat countermelody)
  | 'nucleus' // the rocking lullaby of the core (peaceful menus)
  | 'swarm' // hammering repeated-note aggression (peak combat)
  | 'apex' // the boss challenge figure (phrygian snarl)
  | 'colossus' // the Mega Boss processional hymn
  | 'triumph' // the victory cadence
  | 'lament' // the defeat elegy
  | 'coldopen'; // the opening cinematic's mournful call (docs/GAME-FEEL.md §intro)

export const MOTIFS: Record<MotifId, number[]> = {
  hive: [7, -1, 5, 7, 8, -1, 7, 5, 3, -1, 2, 3, 5, -1, -1, -1, 7, -1, 8, 10, 9, -1, 7, 5, 7, -1, 5, 3, 2, -1, -1, -1],
  assimilation: [0, -1, 1, 3, -1, 3, 4, 5, -1, 5, 7, 8, 7, -1, 5, 3],
  hero: [3, -1, 5, 7, -1, 7, 8, 7, 5, -1, 3, 2, -1, -1, -1, -1],
  nucleus: [7, -1, 5, -1, 7, 8, -1, 7, 5, -1, 3, -1, 5, -1, -1, -1],
  swarm: [0, 0, -1, 3, 0, 0, -1, 5, 7, -1, 5, 3, 2, 1, 0, -1],
  apex: [0, 1, -1, 0, 3, -1, 1, 0, 5, -1, 3, 1, 0, -1, -1, -1],
  colossus: [0, -1, -1, 2, 3, -1, 2, 0, 5, -1, 4, 3, 2, -1, -1, -1, 0, -1, 2, 3, 7, -1, 5, 4, 3, -1, 2, 1, 0, -1, -1, -1],
  triumph: [0, 2, 4, 7, -1, 4, 7, 9, 7, -1, -1, -1, -1, -1, -1, -1],
  lament: [5, -1, 3, 2, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  // A slow, mournful call — long tones with breaths; the second phrase reaches up and falls back.
  coldopen: [0, -1, -1, -1, 3, -1, 2, -1, 5, -1, -1, -1, 4, -1, 3, -1, 7, -1, -1, 5, 4, -1, 3, -1, 2, -1, -1, -1, 0, -1, -1, -1],
};

export interface TrackDef {
  id: string;
  /** Display name (dev tools + docs). */
  name: string;
  category: MusicCategory;
  bpm: number;
  /** Root MIDI note of the key. */
  root: number;
  /** Scale intervals from the root. */
  scale: number[];
  /** Chord progression, one degree index per bar of the LOOP (into `scale`). */
  progression: number[];
  /** Bars of intro before the loop region (intro renders reduced layers). */
  introBars: number;
  /** One-shot (victory/defeat cadences): play intro+progression once, no loop. */
  oneShot?: boolean;
  /** The melody — a reference into MOTIFS (the lead voice). */
  motif: MotifId;
  /** The countermelody the CHOIR sings once intensity wakes it (absent ⇒ chord long-tones). */
  counterMotif?: MotifId;
  /** Hub scenes this track serves (nav keys); the picker prefers scene matches. */
  scenes?: string[];
  /** Extra selection weight × progressionTier (late-game players hear evolved themes more). */
  lateWeight?: number;
  /** Auto-rotate to a sibling track after this many full loop cycles (menus never repeat forever). */
  rotateAfterLoops?: number;
  layers: LayerDef[];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Standard layer stack — per-track gain ranges tune the mix; choir/hits START SILENT
 *  ([0, x]) so they only awaken as intensity (combat pressure / Assimilation) rises. */
const stack = (o: Partial<Record<LayerId, [number, number]>>): LayerDef[] => LAYER_IDS.map((id) => ({
  id,
  gain: o[id] ?? ([0.3, 0.5] as [number, number]),
}));

// ── THE TRACK LIBRARY — the whole soundtrack is data. Adding a track = one row. ──
export const TRACK_LIBRARY: TrackDef[] = [
  // ═══ MENUS — each hub mood has an identity; rotation keeps them alive ═══
  {
    id: 'menu_hive', name: 'Command Center', category: 'menu', bpm: 92, root: 40, scale: MINOR,
    progression: [0, 5, 2, 6, 0, 5, 2, 6, 0, 5, 3, 4, 0, 3, 4, 4],
    introBars: 4, motif: 'hive', counterMotif: 'hero',
    scenes: ['home', 'campaign', 'infinite', 'bossrush'], rotateAfterLoops: 3,
    layers: stack({
      bass: [0.5, 0.7], drums: [0.35, 0.6], arp: [0.3, 0.5], lead: [0.5, 0.6],
      pad: [0.25, 0.3], texture: [0.15, 0.3], choir: [0, 0.35], hits: [0, 0.3],
    }),
  },
  {
    id: 'menu_bloom', name: 'Peaceful Evolution', category: 'menu', bpm: 84, root: 45, scale: DORIAN,
    progression: [0, 3, 5, 4, 0, 3, 1, 4],
    introBars: 2, motif: 'nucleus', counterMotif: 'hive',
    scenes: ['heroes', 'evolution', 'genes', 'daily'], rotateAfterLoops: 4,
    layers: stack({
      bass: [0.4, 0.55], drums: [0.2, 0.45], arp: [0.4, 0.55], lead: [0.45, 0.55],
      pad: [0.3, 0.38], texture: [0.2, 0.35], choir: [0, 0.4], hits: [0, 0.12],
    }),
  },
  {
    id: 'menu_command', name: 'Overmind Ascendant', category: 'menu', bpm: 100, root: 38, scale: MINOR,
    progression: [0, 6, 5, 4, 0, 6, 3, 4],
    introBars: 2, motif: 'assimilation', counterMotif: 'hive',
    scenes: ['evolution', 'store', 'profile', 'settings'], lateWeight: 2.2, rotateAfterLoops: 3,
    layers: stack({
      bass: [0.55, 0.75], drums: [0.4, 0.65], arp: [0.35, 0.55], lead: [0.5, 0.62],
      pad: [0.22, 0.3], texture: [0.15, 0.3], choir: [0, 0.45], hits: [0, 0.35],
    }),
  },
  {
    id: 'menu_vault', name: 'The Living Archive', category: 'menu', bpm: 96, root: 43, scale: MINOR,
    progression: [0, 2, 5, 6, 0, 2, 3, 4],
    introBars: 2, motif: 'hero', counterMotif: 'nucleus',
    scenes: ['towers', 'vault', 'collection', 'equipment', 'market', 'mulligans', 'gearcodex', 'phenotypes'], rotateAfterLoops: 3,
    layers: stack({
      bass: [0.45, 0.6], drums: [0.3, 0.55], arp: [0.45, 0.6], lead: [0.45, 0.58],
      pad: [0.25, 0.32], texture: [0.2, 0.35], choir: [0, 0.3], hits: [0, 0.2],
    }),
  },

  // ═══ COMBAT — a run's musical arc: opening strain → overrun → apex swarm ═══
  {
    id: 'combat_strain', name: 'Opening Strain', category: 'combat', bpm: 112, root: 38, scale: MINOR,
    progression: [0, 0, 5, 6, 0, 0, 3, 4],
    introBars: 2, motif: 'hive', counterMotif: 'hero',
    layers: stack({
      bass: [0.55, 0.75], drums: [0.5, 0.8], arp: [0.35, 0.55], lead: [0.3, 0.5],
      pad: [0.15, 0.25], texture: [0.1, 0.25], choir: [0, 0.3], hits: [0, 0.4],
    }),
  },
  {
    id: 'combat_overrun', name: 'Overrun', category: 'combat', bpm: 122, root: 36, scale: MINOR,
    progression: [0, 0, 3, 4, 0, 0, 5, 6],
    introBars: 1, motif: 'assimilation', counterMotif: 'hive', lateWeight: 1.2,
    layers: stack({
      bass: [0.6, 0.8], drums: [0.55, 0.85], arp: [0.4, 0.6], lead: [0.35, 0.55],
      pad: [0.12, 0.22], texture: [0.12, 0.28], choir: [0, 0.35], hits: [0, 0.45],
    }),
  },
  {
    id: 'combat_apexswarm', name: 'Apex Swarm', category: 'combat', bpm: 132, root: 35, scale: PHRYGIAN,
    progression: [0, 1, 0, 6, 0, 1, 3, 4],
    introBars: 1, motif: 'swarm', counterMotif: 'assimilation', lateWeight: 2.0,
    layers: stack({
      bass: [0.65, 0.85], drums: [0.6, 0.9], arp: [0.4, 0.6], lead: [0.4, 0.6],
      pad: [0.1, 0.2], texture: [0.15, 0.3], choir: [0, 0.4], hits: [0, 0.5],
    }),
  },

  // ═══ BOSSES — three theme families; every boss hash-assigns one (overridable) ═══
  {
    id: 'boss_apex', name: 'Apex Challenge', category: 'boss', bpm: 126, root: 37, scale: PHRYGIAN,
    progression: [0, 1, 0, 6, 0, 1, 3, 4],
    introBars: 1, motif: 'apex', counterMotif: 'assimilation',
    layers: stack({
      bass: [0.65, 0.85], drums: [0.65, 0.9], arp: [0.4, 0.6], lead: [0.45, 0.65],
      pad: [0.2, 0.3], texture: [0.2, 0.35], choir: [0, 0.45], hits: [0, 0.5],
    }),
  },
  {
    id: 'boss_marrow', name: 'Marrow Tyrant', category: 'boss', bpm: 118, root: 42, scale: HARMONIC,
    progression: [0, 0, 3, 4, 0, 5, 1, 4],
    introBars: 1, motif: 'colossus', counterMotif: 'apex',
    layers: stack({
      bass: [0.7, 0.88], drums: [0.6, 0.88], arp: [0.35, 0.55], lead: [0.5, 0.68],
      pad: [0.22, 0.32], texture: [0.18, 0.32], choir: [0, 0.5], hits: [0, 0.5],
    }),
  },
  {
    id: 'boss_neural', name: 'Neural Cathedral', category: 'boss', bpm: 138, root: 39, scale: PHRYGIAN,
    progression: [0, 6, 1, 0, 0, 6, 3, 4],
    introBars: 1, motif: 'assimilation', counterMotif: 'apex',
    layers: stack({
      bass: [0.62, 0.82], drums: [0.68, 0.92], arp: [0.45, 0.65], lead: [0.42, 0.62],
      pad: [0.15, 0.25], texture: [0.22, 0.38], choir: [0, 0.42], hits: [0, 0.55],
    }),
  },

  // ═══ MEGA — the Colossus Hymn (raid-scale processional) ═══
  {
    id: 'mega_colossus', name: 'The Colossus Hymn', category: 'mega', bpm: 84, root: 36, scale: HARMONIC,
    progression: [0, 0, 5, 5, 1, 1, 4, 4, 0, 0, 5, 3, 1, 4, 4, 4],
    introBars: 2, motif: 'colossus', counterMotif: 'assimilation',
    layers: stack({
      bass: [0.7, 0.9], drums: [0.55, 0.85], arp: [0.25, 0.45], lead: [0.5, 0.75],
      pad: [0.35, 0.45], texture: [0.25, 0.5], choir: [0.1, 0.6], hits: [0, 0.55],
    }),
  },

  // ═══ CADENCES — one-shots ═══
  {
    id: 'sting_victory', name: 'Triumph', category: 'victory', bpm: 100, root: 43, scale: MAJOR,
    progression: [3, 4, 0, 0], introBars: 0, oneShot: true, motif: 'triumph', counterMotif: 'hive',
    layers: stack({
      bass: [0.55, 0.7], drums: [0.35, 0.5], arp: [0.4, 0.5], lead: [0.65, 0.75],
      pad: [0.3, 0.35], texture: [0.1, 0.15], choir: [0.2, 0.5], hits: [0, 0.3],
    }),
  },
  {
    id: 'sting_defeat', name: 'Reabsorption', category: 'defeat', bpm: 72, root: 40, scale: MINOR,
    progression: [5, 4, 0, 0], introBars: 0, oneShot: true, motif: 'lament', counterMotif: 'nucleus',
    layers: stack({
      bass: [0.5, 0.6], drums: [0.1, 0.2], arp: [0.15, 0.25], lead: [0.6, 0.7],
      pad: [0.35, 0.4], texture: [0.15, 0.2], choir: [0.15, 0.35], hits: [0, 0],
    }),
  },

  // ═══ EVENTS — the special-mode identity (GameView routes DAILY runs here — the seeded
  // worldwide gauntlet earns its own musical voice instead of borrowing plain combat).
  // Three identities rotate across a run: the pulse (hero resolve), the relay (one seed,
  // every commander on Earth), the mutation (today's rules are WARPED). ═══
  {
    id: 'event_pulse', name: 'The Daily Pulse', category: 'events', bpm: 104, root: 40, scale: MINOR,
    progression: [0, 6, 5, 4], introBars: 1, motif: 'hero', counterMotif: 'assimilation', rotateAfterLoops: 4,
    layers: stack({
      bass: [0.5, 0.7], drums: [0.45, 0.65], arp: [0.4, 0.55], lead: [0.4, 0.55],
      pad: [0.2, 0.3], texture: [0.15, 0.3], choir: [0, 0.3], hits: [0, 0.35],
    }),
  },
  {
    // The shared-seed anthem: the whole world runs the SAME board today. The main HIVE theme
    // over a driving dorian relay — communal, bright-edged, arp-forward (the baton keeps moving).
    id: 'event_relay', name: 'Worldwide Relay', category: 'events', bpm: 118, root: 41, scale: DORIAN,
    progression: [0, 3, 4, 6, 0, 3, 1, 4], introBars: 1, motif: 'hive', counterMotif: 'hero', rotateAfterLoops: 3,
    layers: stack({
      bass: [0.55, 0.75], drums: [0.5, 0.75], arp: [0.5, 0.68], lead: [0.42, 0.6],
      pad: [0.18, 0.28], texture: [0.12, 0.26], choir: [0, 0.35], hits: [0, 0.4],
    }),
  },
  {
    // The modifier identity: today's rules are WARPED. Off-kilter phrygian lab unease —
    // assimilation lead over a swarm mutter, texture-forward (something in the seed is wrong).
    id: 'event_mutation', name: 'Mutation Protocol', category: 'events', bpm: 108, root: 37, scale: PHRYGIAN,
    progression: [0, 1, 5, 4, 0, 1, 6, 4], introBars: 1, motif: 'assimilation', counterMotif: 'swarm', rotateAfterLoops: 3,
    layers: stack({
      bass: [0.52, 0.72], drums: [0.48, 0.7], arp: [0.38, 0.56], lead: [0.4, 0.58],
      pad: [0.22, 0.32], texture: [0.25, 0.42], choir: [0, 0.32], hits: [0, 0.38],
    }),
  },
  // ═══ CINEMA — THE COLD OPEN (docs/GAME-FEEL.md §intro): the opening cinematic's score. A slow
  // 62bpm processional in D minor: pads + a distant lead breathe under the narration, percussion
  // nearly absent (the SFX beats ARE the rhythm). The intensity seam is driven scene-by-scene by
  // InitCutscene (0 at the listening post → 1 at the title), so the film swells to the wordmark —
  // and at full swell the choir sings the HIVE main theme under the title. ═══
  {
    id: 'cinema_cold_open', name: 'The Cold Open', category: 'cinema', bpm: 62, root: 38, scale: MINOR,
    progression: [0, 0, 5, 5, 3, 3, 4, 4],
    introBars: 2, motif: 'coldopen', counterMotif: 'hive',
    layers: stack({
      bass: [0.3, 0.55],
      drums: [0, 0.18], // nearly silent — the cinematic SFX beats carry the pulse
      arp: [0.08, 0.3], lead: [0.35, 0.6], pad: [0.4, 0.5], texture: [0.25, 0.45],
      choir: [0, 0.4], hits: [0, 0], // voices earn the wordmark; no industrial slams under narration
    }),
  },
];

/** Category → its library slice (never empty — the data contract test pins it). */
export function tracksOf(category: MusicCategory): TrackDef[] {
  return TRACK_LIBRARY.filter((t) => t.category === category);
}

/** Default track per category (the first authored row) — back-compat + tests. */
export const TRACKS: Record<MusicCategory, TrackDef> = {
  menu: tracksOf('menu')[0], combat: tracksOf('combat')[0], boss: tracksOf('boss')[0],
  mega: tracksOf('mega')[0], victory: tracksOf('victory')[0], defeat: tracksOf('defeat')[0],
  events: tracksOf('events')[0], cinema: tracksOf('cinema')[0],
};

// ── Selection: rotation + scene + progression weighting (pure; the manager feeds the roll) ──

export interface PickOpts {
  /** Track id to avoid (the one just played) — rotation never immediately repeats. */
  exclude?: string;
  /** Hub scene (nav key) — scene-tagged tracks are preferred when any match. */
  scene?: string;
  /** 0..1 account progression — `lateWeight` tracks surface more for veterans. */
  tier?: number;
  /** 0..1 roll (the manager passes Math.random(); tests pass constants). */
  roll?: number;
}

export function pickTrack(category: MusicCategory, opts: PickOpts = {}): TrackDef {
  const all = tracksOf(category);
  let pool = all;
  if (opts.scene) {
    const scoped = all.filter((t) => t.scenes?.includes(opts.scene as string));
    if (scoped.length > 0) pool = scoped;
  }
  if (opts.exclude && pool.length > 1) pool = pool.filter((t) => t.id !== opts.exclude);
  const tier = Math.min(1, Math.max(0, opts.tier ?? 0));
  const weights = pool.map((t) => 1 + (t.lateWeight ?? 0) * tier);
  const total = weights.reduce((a, b) => a + b, 0);
  let u = Math.min(0.999999, Math.max(0, opts.roll ?? 0)) * total;
  for (let i = 0; i < pool.length; i++) { u -= weights[i]; if (u < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Explicit boss → theme mapping (content authoring); anything unmapped hash-assigns. */
export const BOSS_THEME_OVERRIDES: Record<string, string> = {};

/** A STABLE theme for a boss key (its name/id): overrides first, else an FNV-1a hash into the
 *  boss slice — the same boss always brings the same music, and a NEW boss needs no code. */
export function bossTrackFor(bossKey: string): TrackDef {
  const bosses = tracksOf('boss');
  const override = BOSS_THEME_OVERRIDES[bossKey];
  if (override) {
    const t = bosses.find((b) => b.id === override);
    if (t) return t;
  }
  let h = 2166136261;
  for (let i = 0; i < bossKey.length; i++) { h ^= bossKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  return bosses[(h >>> 0) % bosses.length];
}

// ── Rendering ────────────────────────────────────────────────────────────────────────────────

const degreeToMidi = (t: TrackDef, degree: number, octave = 0): number => {
  const n = t.scale.length;
  const idx = ((degree % n) + n) % n;
  const oct = octave + Math.floor(degree / n);
  return t.root + t.scale[idx] + 12 * oct;
};

/** Chord tones (triad) of the loop-bar's progression degree. */
export function chordAt(t: TrackDef, loopBar: number): number[] {
  const deg = t.progression[((loopBar % t.progression.length) + t.progression.length) % t.progression.length];
  return [degreeToMidi(t, deg), degreeToMidi(t, deg + 2), degreeToMidi(t, deg + 4)];
}

/** Deterministic per-bar pattern variation (tiny hash — same bar always renders identically). */
const vary = (bar: number, salt: number): number => {
  let h = (bar * 2654435761 + salt * 40503) >>> 0;
  h ^= h >> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >> 15;
  return (h % 1000) / 1000;
};

export interface BarNotes { bar: number; inIntro: boolean; layers: Record<LayerId, Note[]>; }

/** Render ONE bar of the track — the whole composition, deterministically. `bar` is absolute
 *  (0-based): bars < introBars render the reduced intro; after that the loop region repeats
 *  with evolving structure (arp A/B halves, drum fills on phrase ends, lead phrasing in/out,
 *  the choir countermelody, industrial hits punctuating B halves). */
export function barNotes(t: TrackDef, bar: number): BarNotes {
  const inIntro = bar < t.introBars;
  const loopBar = inIntro ? 0 : (bar - t.introBars) % t.progression.length;
  const chord = chordAt(t, loopBar);
  const rootMidi = chord[0] - 12; // bass lives an octave under the chord
  const phraseEnd = !inIntro && (loopBar + 1) % 8 === 0;
  const half = Math.floor(loopBar / 8) % 2; // A/B section (evolving structure)
  const motif = MOTIFS[t.motif];
  const counter = t.counterMotif ? MOTIFS[t.counterMotif] : null;
  const L: Record<LayerId, Note[]> = { bass: [], drums: [], arp: [], lead: [], pad: [], texture: [], choir: [], hits: [] };

  // BASS — driving 8ths on the root with a passing approach into the next bar (harmonic motion).
  for (let s = 0; s < 16; s += 2) {
    const approach = s === 14 && vary(bar, 1) > 0.5;
    const midi = approach ? chordAt(t, loopBar + 1)[0] - 12 - 2 : s === 8 && half === 1 ? chord[2] - 12 : rootMidi; // B halves pivot to the chord fifth (always in-scale)
    L.bass.push({ step: s, midi, len: 2, vel: s % 4 === 0 ? 0.9 : 0.7 });
  }

  // DRUMS — mechanical kit: kick 1 & 3 (+ syncopation in B halves), snare 2 & 4, 8th hats with
  // accents; a fill closes every 8-bar phrase; a crash opens each phrase. Intro: hats breathe in.
  if (!inIntro || t.introBars === 0) {
    L.drums.push({ step: 0, midi: 36, len: 1, vel: 1 }, { step: 8, midi: 36, len: 1, vel: 0.95 });
    if (half === 1 && vary(bar, 2) > 0.4) L.drums.push({ step: 10, midi: 36, len: 1, vel: 0.7 });
    L.drums.push({ step: 4, midi: 38, len: 1, vel: 0.85 }, { step: 12, midi: 38, len: 1, vel: 0.85 });
    if (phraseEnd) for (let s = 13; s < 16; s++) L.drums.push({ step: s, midi: 38, len: 1, vel: 0.5 + 0.15 * (s - 13) });
    if (!inIntro && loopBar % 8 === 0) L.drums.push({ step: 0, midi: 49, len: 4, vel: 0.5 }); // phrase-open crash
  }
  for (let s = 0; s < 16; s += 2) L.drums.push({ step: s, midi: 42, len: 1, vel: s % 4 === 0 ? 0.5 : 0.3 });
  if (!inIntro && vary(bar, 3) > 0.7) L.drums.push({ step: 14, midi: 46, len: 2, vel: 0.4 });

  // ARP — 16th synth arpeggio over the chord; pattern A rises, pattern B rocks (section change).
  if (!inIntro) {
    const spread = [chord[0], chord[1], chord[2], chord[1] + 12];
    for (let s = 0; s < 16; s++) {
      const i = half === 0 ? s % 4 : [0, 2, 1, 3][s % 4];
      L.arp.push({ step: s, midi: spread[i], len: 1, vel: 0.5 + 0.2 * ((s % 4) === 0 ? 1 : 0) });
    }
  }

  // LEAD — the authored MOTIF, spoken in 2-bar phrases with rests; sits out the first half of
  // each 16-bar cycle after the intro (space to breathe), returns varied (+octave shimmer in B).
  const leadActive = !inIntro && (loopBar % 16 >= 8 || t.oneShot || t.progression.length <= 8);
  if (leadActive) {
    const phrase = Math.floor(loopBar / 2) % Math.max(1, Math.floor(motif.length / 16));
    for (let s = 0; s < 16; s += 2) {
      const d = motif[(phrase * 16 + (loopBar % 2) * 8 + s / 2) % motif.length];
      if (d < 0) continue;
      L.lead.push({ step: s, midi: degreeToMidi(t, d, 1) + (half === 1 && vary(bar, 4) > 0.6 ? 12 : 0), len: 2, vel: 0.75 });
    }
  }

  // PAD — one organic chord swell per bar, UNDER the mix (harmonic bed, never a drone lead).
  for (const m of chord) L.pad.push({ step: 0, midi: m, len: 16, vel: 0.5 });

  // CHOIR — the COUNTERMELODY, sung in long augmented tones AGAINST the lead (quarter-speed:
  // one motif degree per half-bar) an octave above the chord register. When no counterMotif is
  // authored it hums the chord's colour tones. Gain-gated to intensity, so the choir AWAKENS as
  // the battlefield assimilates — the "more instruments as assimilation rises" contract.
  if (!inIntro) {
    if (counter) {
      for (const s of [0, 8]) {
        const d = counter[(loopBar * 2 + s / 8) % counter.length];
        if (d >= 0) L.choir.push({ step: s, midi: degreeToMidi(t, d, 2), len: 8, vel: 0.65 });
      }
    } else {
      L.choir.push({ step: 0, midi: chord[1] + 12, len: 16, vel: 0.55 });
    }
  }

  // HITS — industrial impacts: a slam opening every B-half bar pair + doubling phrase ends.
  // Sparse by design (impact = rarity); gain-gated so they only land at high intensity.
  if (!inIntro && ((half === 1 && loopBar % 2 === 0) || phraseEnd)) {
    L.hits.push({ step: 0, midi: 33, len: 4, vel: phraseEnd ? 1 : 0.8 });
    if (phraseEnd && vary(bar, 8) > 0.5) L.hits.push({ step: 8, midi: 33, len: 4, vel: 0.6 });
  }

  // TEXTURE — sparse bio-clicks/chitters (organic technology), placed off-grid-ish but seeded.
  if (vary(bar, 5) > 0.55) L.texture.push({ step: 3 + Math.floor(vary(bar, 6) * 4) * 2, midi: 84 + Math.floor(vary(bar, 7) * 7), len: 1, vel: 0.3 });

  return { bar, inIntro, layers: L };
}

// ── STINGERS — short musical events (E-minor home-key family, rendered by the same voices).
//    A stinger is DATA: absolute-ish midi rows on a fast 16th grid. Adding one = one row. ──

export type StingerId =
  | 'legendary' // legendary/exotic/mythic reveal
  | 'discovery' // a NEW gene strand enters the Archive (docs/CARDS.md §discovery)
  | 'achievement' // achievement unlocked
  | 'unlock' // hero/tower/system unlock
  | 'prestige' // MOLT / ascension
  | 'bossDown' // boss defeated mid-run
  | 'chapter' // campaign chapter cleared
  | 'mastery' // mastery rank / star milestones
  | 'power'; // major Power Score jump

export interface StingerNote { t: number; midi: number; len: number; vel: number }
export const STINGERS: Record<StingerId, StingerNote[]> = {
  legendary: [
    { t: 0, midi: 64, len: 1, vel: 0.8 }, { t: 1, midi: 67, len: 1, vel: 0.8 }, { t: 2, midi: 71, len: 1, vel: 0.85 },
    { t: 3, midi: 76, len: 4, vel: 0.95 }, { t: 5, midi: 79, len: 6, vel: 0.8 },
  ],
  // The discovery motif — a short WONDROUS lift (minor third → fifth → major sixth), quieter
  // and quicker than 'legendary': curiosity rewarded, not a jackpot.
  discovery: [
    { t: 0, midi: 64, len: 1, vel: 0.7 }, { t: 1, midi: 71, len: 2, vel: 0.75 }, { t: 3, midi: 73, len: 5, vel: 0.85 },
  ],
  achievement: [
    { t: 0, midi: 67, len: 1, vel: 0.7 }, { t: 1, midi: 71, len: 1, vel: 0.75 }, { t: 2, midi: 74, len: 4, vel: 0.85 },
  ],
  unlock: [
    { t: 0, midi: 59, len: 1, vel: 0.7 }, { t: 1, midi: 64, len: 1, vel: 0.75 },
    { t: 2, midi: 67, len: 2, vel: 0.8 }, { t: 4, midi: 76, len: 5, vel: 0.9 },
  ],
  prestige: [
    { t: 0, midi: 52, len: 2, vel: 0.85 }, { t: 2, midi: 59, len: 2, vel: 0.85 }, { t: 4, midi: 64, len: 2, vel: 0.9 },
    { t: 6, midi: 71, len: 3, vel: 0.95 }, { t: 9, midi: 76, len: 6, vel: 1 },
  ],
  bossDown: [
    { t: 0, midi: 40, len: 2, vel: 1 }, { t: 2, midi: 47, len: 2, vel: 0.9 }, { t: 4, midi: 52, len: 6, vel: 0.95 },
  ],
  chapter: [
    { t: 0, midi: 64, len: 2, vel: 0.8 }, { t: 2, midi: 69, len: 2, vel: 0.85 }, { t: 4, midi: 76, len: 6, vel: 0.9 },
  ],
  mastery: [
    { t: 0, midi: 71, len: 1, vel: 0.7 }, { t: 1, midi: 76, len: 3, vel: 0.8 },
  ],
  power: [
    { t: 0, midi: 59, len: 1, vel: 0.65 }, { t: 1, midi: 66, len: 1, vel: 0.7 }, { t: 2, midi: 71, len: 3, vel: 0.8 },
  ],
};

// ── The WebAudio player (the music manager) ──────────────────────────────────────────────────

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;
const XFADE_S = 1.8;
/** The score's designed level at Music volume 100 % — set against the MEASURED SFX mix (the 2026-11
 *  sound pass: the score sits level with steady combat, under rewards and alerts; docs/AUDIO.md). */
export const MUSIC_LEVEL = 0.7;
/** Fixed per-layer stereo image (a wide, professional stage; bass/kick stay centred). */
const LAYER_PAN: Record<LayerId, number> = { bass: 0, drums: 0, arp: -0.25, lead: 0.18, pad: -0.1, texture: -0.45, choir: 0.3, hits: 0 };
/** Equal-power fade curves (cos/sin quarter waves) — no mid-fade loudness dip. */
const FADE_N = 24;
const FADE_IN = new Float32Array(FADE_N).map((_, i) => Math.sin(((i / (FADE_N - 1)) * Math.PI) / 2));
const FADE_OUT = new Float32Array(FADE_N).map((_, i) => Math.cos(((i / (FADE_N - 1)) * Math.PI) / 2));

interface ActiveTrack {
  def: TrackDef;
  bus: GainNode; // track master (crossfade target)
  layers: Record<LayerId, GainNode>;
  nextBar: number;
  nextBarTime: number;
  boss?: string; // the boss key this playback was themed for (re-pick guard)
  done?: boolean; // one-shot finished
}

export interface PlayOpts {
  /** Boss key (name/id) — 'boss' playback binds a stable per-boss theme. */
  boss?: string;
  /** Force a re-pick even when already on the category (rotation / dev tools). */
  force?: boolean;
  /** Pin an exact track id (dev tools). */
  trackId?: string;
}

class MusicManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null; // pre-mastering sum (ducking target)
  private duressFilter: BiquadFilterNode | null = null; // near-death low-pass treatment
  private comp: DynamicsCompressorNode | null = null; // mastering glue (no clipping)
  private timer: ReturnType<typeof setInterval> | null = null;
  private active: ActiveTrack | null = null;
  private fading: ActiveTrack | null = null;
  private intensity = 0.5;
  private duress = 0;
  private progressionTier = 0;
  private scene: string | null = null;
  private pinned = false;
  private volume = MUSIC_LEVEL; // effective master gain = MUSIC_LEVEL × the player's Music volume
  private enabled = true;
  private requested: { category: MusicCategory; opts: PlayOpts } | null = null;
  current: MusicCategory | null = null;
  /** The active track id (dev tools + tests via the debug panel). */
  get currentTrackId(): string | null { return this.active?.def.id ?? null; }

  private ensure(): boolean {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // Mastering chain: sum → duress low-pass → compressor glue → destination. The compressor
      // keeps stacked layers + stingers from clipping (consistent loudness); the duress filter
      // sits at 18kHz (transparent) until near-death drags it down.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.duressFilter = this.ctx.createBiquadFilter();
      this.duressFilter.type = 'lowpass';
      this.duressFilter.frequency.value = 18000;
      this.duressFilter.Q.value = 0.5;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 3;
      this.comp.attack.value = 0.006;
      this.comp.release.value = 0.24;
      this.master.connect(this.duressFilter);
      this.duressFilter.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  // Wardrobe music packs (docs/COSMETICS.md §wardrobe): per-scope re-voicings applied to
  // WHATEVER track the picker chooses — root shift, tempo, and a brightness curve over the
  // layer gains. 'menu' re-voices the idle songs; 'combat' covers combat/boss/mega.
  // Ceremonial one-shots (victory/defeat/cinema) stay pure.
  private wardrobe: { menu?: MusicTransform; combat?: MusicTransform } = {};

  /** Install the equipped packs; re-voices the CURRENT track live via a normal crossfade. */
  setWardrobe(w: { menu?: MusicTransform; combat?: MusicTransform }): void {
    this.wardrobe = w;
    const cur = this.current;
    if (cur && this.active && !this.active.def.oneShot) {
      this.current = null; // force the same category through play() → crossfade into the new voice
      this.play(cur);
    }
  }

  private transformFor(category: MusicCategory): MusicTransform | undefined {
    if (category === 'menu' || category === 'events') return this.wardrobe.menu;
    if (category === 'combat' || category === 'boss' || category === 'mega') return this.wardrobe.combat;
    return undefined;
  }

  /** Apply the scope's re-voicing to a picked track — pure derivation, the library untouched. */
  private revoice(def: TrackDef, category: MusicCategory): TrackDef {
    const tr = this.transformFor(category);
    if (!tr) return def;
    const bright = Math.max(0, Math.min(1, tr.brightness));
    // Brightness shapes the mix: glassy layers rise with it, the murk sinks.
    const mult = (id: LayerId): number =>
      id === 'arp' || id === 'lead' || id === 'texture' ? 0.55 + 0.9 * bright
        : id === 'bass' || id === 'pad' ? 1.25 - 0.5 * bright
          : 1;
    return {
      ...def,
      root: def.root + Math.round(tr.rootShift),
      bpm: def.bpm * tr.bpmMult,
      layers: def.layers.map((l) => ({ ...l, gain: [l.gain[0] * mult(l.id), l.gain[1] * mult(l.id)] as [number, number] })),
    };
  }

  /** Request a CATEGORY (never a hardcoded track) — the manager picks (rotation + scene +
   *  progression + boss binding), bar-aligns the switch, and equal-power crossfades. One-shots
   *  (victory/defeat) play once over the fading bed and end silent. */
  play(category: MusicCategory, opts: PlayOpts = {}): void {
    if (this.pinned && !opts.force && !opts.trackId) return; // dev-console pin: app requests wait
    // Remember the latest scene even while muted, but never replay a past ceremony on enable.
    const requestedDef = (opts.trackId ? TRACK_LIBRARY.find((t) => t.id === opts.trackId) : undefined) ?? TRACKS[category];
    this.requested = requestedDef.oneShot ? null : { category, opts: { ...opts } };
    if (!this.enabled || !this.ensure() || !this.ctx || !this.master) return;
    if (this.current === category && this.active && !this.active.def.oneShot && !opts.force) {
      // Same category: only re-pick when a DIFFERENT boss demands its own theme.
      if (!(category === 'boss' && opts.boss && this.active.boss !== opts.boss)) return;
    }
    const picked = opts.trackId
      ? TRACK_LIBRARY.find((t) => t.id === opts.trackId) ?? TRACKS[category]
      : category === 'boss' && opts.boss
        ? bossTrackFor(opts.boss)
        : pickTrack(category, { exclude: this.active?.def.id, scene: this.scene ?? undefined, tier: this.progressionTier, roll: Math.random() });
    // Wardrobe re-voicing rides the pick (docs/COSMETICS.md §wardrobe) — dev pins stay pure.
    const def = opts.trackId ? picked : this.revoice(picked, category);

    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    const layers = {} as Record<LayerId, GainNode>;
    for (const l of def.layers) {
      const g = this.ctx.createGain();
      g.gain.value = l.gain[0] + (l.gain[1] - l.gain[0]) * this.intensity;
      const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = LAYER_PAN[l.id]; g.connect(pan); pan.connect(bus); }
      else g.connect(bus);
      layers[l.id] = g;
    }

    // BAR-ALIGNED handoff: the switch lands on the outgoing track's next bar boundary so the
    // pulse never stumbles — capped so urgent arrivals (boss/mega/cadences) never wait long.
    const now = this.ctx.currentTime;
    const urgent = category === 'boss' || category === 'mega' || category === 'victory' || category === 'defeat';
    let at = now + 0.06;
    if (this.active && !this.active.done) {
      const cap = urgent ? 0.35 : 2.2;
      at = Math.min(Math.max(this.active.nextBarTime, now + 0.06), now + cap);
    }
    if (this.fading) { try { this.fading.bus.disconnect(); } catch { /* already gone */ } }
    if (this.active) {
      this.fading = this.active;
      const g = this.fading.bus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      try { g.setValueCurveAtTime(FADE_OUT.map((v) => v * g.value), at, XFADE_S); } catch { g.linearRampToValueAtTime(0, at + XFADE_S); }
    }
    try { bus.gain.setValueCurveAtTime(FADE_IN, at, XFADE_S); } catch { bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(1, at + XFADE_S); }
    this.active = { def, bus, layers, nextBar: 0, nextBarTime: at, boss: opts.boss };
    this.current = category;
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.requested = null;
    if (!this.ctx || !this.active) return;
    const now = this.ctx.currentTime;
    this.active.bus.gain.cancelScheduledValues(now);
    this.active.bus.gain.setValueAtTime(this.active.bus.gain.value, now);
    this.active.bus.gain.linearRampToValueAtTime(0, now + 0.8);
    this.fading = this.active;
    this.active = null;
    this.current = null;
  }

  /** The adaptive seam: 0 = calm … 1 = full — maps onto each layer's authored gain range.
   *  The Assimilation Index raises the floor; combat pressure spikes it. Choir + hits author
   *  [0, x] ranges, so rising intensity literally ADDS instruments — the battlefield awakens. */
  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, v));
    if (!this.ctx || !this.active) return;
    for (const l of this.active.def.layers) {
      const g = this.active.layers[l.id];
      g.gain.linearRampToValueAtTime(l.gain[0] + (l.gain[1] - l.gain[0]) * this.intensity, this.ctx.currentTime + 0.4);
    }
  }

  /** NEAR-DEATH treatment (0 = none … 1 = flatlining): the mix drowns — a low-pass sweep pulls
   *  the air out while a slight make-up gain keeps presence. Fully musical, fully reversible. */
  setDuress(v: number): void {
    const d = Math.min(1, Math.max(0, v));
    if (Math.abs(d - this.duress) < 0.02) return;
    this.duress = d;
    if (!this.ctx || !this.duressFilter || !this.master) return;
    const t = this.ctx.currentTime + 0.35;
    // 18kHz (transparent) → ~700Hz (underwater) on an exponential perceptual sweep.
    this.duressFilter.frequency.exponentialRampToValueAtTime(18000 * Math.pow(700 / 18000, d), t);
    if (this.enabled) this.master.gain.linearRampToValueAtTime(this.volume * (1 + 0.22 * d), t);
  }

  /** Account progression 0..1 — `lateWeight` tracks (evolved themes) surface more for veterans. */
  setProgression(tier: number): void {
    this.progressionTier = Math.min(1, Math.max(0, tier));
  }

  /** Hub scene (nav key) — biases the NEXT menu pick toward scene-tagged tracks. */
  setScene(scene: string | null): void {
    this.scene = scene;
  }

  /** Dev console: PIN the current track — rotation and app category requests are ignored until
   *  unpinned. Console force/trackId plays still work (that's the point of the override). */
  setPinned(on: boolean): void {
    this.pinned = on;
  }

  /** A short MUSICAL event (data row in STINGERS) — reward payoff without stopping the score. */
  stinger(id: StingerId): void {
    if (!this.enabled || !this.ensure() || !this.ctx || !this.master) return;
    const notes = STINGERS[id];
    if (!notes) return;
    const out = this.ctx.createGain();
    out.gain.value = 0.9;
    out.connect(this.master);
    const step = 60 / 132 / 4; // bright fixed grid (~132bpm 16ths)
    const now = this.ctx.currentTime + 0.02;
    for (const n of notes) this.voice('lead', { step: 0, midi: n.midi, len: 1, vel: n.vel }, now + n.t * step, Math.max(0.08, n.len * step), out);
    if (id === 'legendary' || id === 'prestige') this.duck(0.3, 1.0); // the big ones own their moment
  }

  /** MIX GLUE: dip the score under a heavyweight SFX sting and ease back (sidechain duck). */
  duck(depth: number, seconds = 0.8): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    const floor = this.volume * (1 - Math.min(0.9, Math.max(0, depth)));
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(floor, now + 0.05);
    g.linearRampToValueAtTime(this.volume * (1 + 0.22 * this.duress), now + Math.max(0.2, seconds));
  }

  /** Direct layer override (dev tools / future adaptive hooks). */
  setLayerGain(layer: LayerId, gain: number): void {
    if (!this.ctx || !this.active) return;
    this.active.layers[layer]?.gain.linearRampToValueAtTime(Math.max(0, gain), this.ctx.currentTime + 0.3);
  }

  /** The player's Music volume, 0..1 (1 = the designed level, MUSIC_LEVEL). */
  setVolume(v: number): void {
    this.volume = MUSIC_LEVEL * Math.min(1, Math.max(0, v));
    this.updateMasterVolume();
  }

  private updateMasterVolume(): void {
    if (this.master && this.ctx) {
      const gain = this.master.gain;
      const now = this.ctx.currentTime;
      const current = gain.value;
      // Player volume/mute wins over every previously scheduled duck or duress fade.
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else gain.cancelScheduledValues(now);
      gain.setValueAtTime(current, now);
      gain.linearRampToValueAtTime(this.enabled ? this.volume * (1 + 0.22 * this.duress) : 0, now + 0.1);
    }
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    this.updateMasterVolume();
    if (!on) {
      const requested = this.requested;
      this.stop();
      this.requested = requested;
    } else if (this.requested) {
      this.play(this.requested.category, { ...this.requested.opts, force: true });
    }
  }

  // Lookahead scheduler: render bars slightly ahead of the clock (the standard WebAudio pattern).
  // Also owns ROTATION: after a track's authored loop budget, the same category re-picks (with
  // the current id excluded) on a bar boundary — menus and long runs never fossilize.
  private tick(): void {
    if (!this.ctx) return;
    const t = this.active;
    if (!t || t.done) return;
    while (t.nextBarTime < this.ctx.currentTime + LOOKAHEAD_S + (60 / t.def.bpm) * 4) {
      const barLen = (60 / t.def.bpm) * 4;
      const totalBars = t.def.introBars + t.def.progression.length;
      if (t.def.oneShot && t.nextBar >= totalBars) { t.done = true; this.current = null; break; }
      if (t.def.rotateAfterLoops && !t.def.oneShot && !this.pinned) {
        const loops = Math.floor(Math.max(0, t.nextBar - t.def.introBars) / t.def.progression.length);
        if (loops >= t.def.rotateAfterLoops && this.current) { this.play(this.current, { force: true }); return; }
      }
      this.renderBar(t, barNotes(t.def, t.nextBar), t.nextBarTime);
      t.nextBar++;
      t.nextBarTime += barLen;
    }
  }

  private renderBar(t: ActiveTrack, bar: BarNotes, at: number): void {
    if (!this.ctx) return;
    const stepLen = (60 / t.def.bpm) / 4;
    for (const layer of Object.keys(bar.layers) as LayerId[]) {
      const out = t.layers[layer];
      if (!out) continue;
      for (const n of bar.layers[layer]) {
        const when = at + n.step * stepLen;
        const dur = Math.max(0.05, n.len * stepLen);
        if (layer === 'drums') this.drum(n, when, out);
        else if (layer === 'hits') this.hit(n, when, out);
        else this.voice(layer, n, when, dur, out);
      }
    }
  }

  private voice(layer: LayerId, n: Note, when: number, dur: number, out: GainNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = layer === 'bass' ? 'sawtooth' : layer === 'arp' ? 'square' : layer === 'lead' ? 'sawtooth' : layer === 'texture' ? 'sine' : 'triangle';
    o.frequency.value = midiHz(n.midi);
    f.type = 'lowpass';
    f.frequency.value = layer === 'bass' ? 300 : layer === 'pad' ? 900 : layer === 'lead' ? 2200 : layer === 'choir' ? 1300 : 1800;
    if (layer === 'arp') { f.frequency.setValueAtTime(900, when); f.frequency.linearRampToValueAtTime(1900, when + dur); }
    const a = layer === 'pad' ? 0.6 : layer === 'choir' ? 0.45 : 0.01;
    const peak = n.vel * (layer === 'pad' ? 0.14 : layer === 'bass' ? 0.3 : layer === 'lead' ? 0.22 : layer === 'choir' ? 0.16 : 0.16);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + (layer === 'pad' ? 0.8 : layer === 'choir' ? 0.6 : 0.08));
    o.connect(f); f.connect(g); g.connect(out);
    o.start(when); o.stop(when + dur + 1);
    if (layer === 'lead') { // organic vibrato — the "alive" quality
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = 4;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(when + 0.12); lfo.stop(when + dur + 1);
    }
    if (layer === 'choir') { // a detuned twin + slow vibrato — voices, not an organ
      const o2 = this.ctx.createOscillator();
      o2.type = 'triangle'; o2.frequency.value = midiHz(n.midi) * 1.006;
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 3.1; lg.gain.value = 2.5;
      lfo.connect(lg); lg.connect(o2.frequency);
      o2.connect(f); lfo.start(when); lfo.stop(when + dur + 1); o2.start(when); o2.stop(when + dur + 1);
    }
  }

  /** Industrial impact — a sub drop + a metallic band slam (the "machine hits back" layer). */
  private hit(n: Note, when: number, out: GainNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, when); o.frequency.exponentialRampToValueAtTime(28, when + 0.35);
    g.gain.setValueAtTime(0.55 * n.vel, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
    o.connect(g); g.connect(out); o.start(when); o.stop(when + 0.6);
    const len = 0.3;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 1.2;
    const ng = this.ctx.createGain(); ng.gain.value = 0.4 * n.vel;
    src.connect(f); f.connect(ng); ng.connect(out); src.start(when);
  }

  private drum(n: Note, when: number, out: GainNode): void {
    if (!this.ctx) return;
    if (n.midi === 36) { // kick — pitched drop
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, when); o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
      g.gain.setValueAtTime(0.5 * n.vel, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
      o.connect(g); g.connect(out); o.start(when); o.stop(when + 0.3);
      return;
    }
    // snare / hats / crash — shaped noise bursts (mechanical, chitinous); hats sit right of centre.
    const len = n.midi === 38 ? 0.14 : n.midi === 46 ? 0.25 : n.midi === 49 ? 0.7 : 0.05;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = n.midi === 38 ? 'bandpass' : 'highpass';
    f.frequency.value = n.midi === 38 ? 1900 : n.midi === 49 ? 4200 : 6500;
    const g = this.ctx.createGain();
    g.gain.value = (n.midi === 38 ? 0.3 : n.midi === 49 ? 0.16 : 0.12) * n.vel;
    src.connect(f); f.connect(g);
    if ((n.midi === 42 || n.midi === 46) && this.ctx.createStereoPanner) {
      const pan = this.ctx.createStereoPanner(); pan.pan.value = 0.3; g.connect(pan); pan.connect(out);
    } else g.connect(out);
    src.start(when);
  }
}

export const music = new MusicManager();
