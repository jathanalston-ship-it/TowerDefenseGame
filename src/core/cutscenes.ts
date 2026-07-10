// STORY CUTSCENES (docs/CUTSCENES.md) — the game's unlockable memory reel. Every cutscene is
// DATA: a short film of procedural scenes (render/cutsceneScenes.ts painters, themed by the
// def's palette), staged copy lines, and sound-design beats (the cin_* cue set), played by
// ui/CutscenePlayer.tsx and collected in the Memory Archive (Collection screen).
//
// ── THE RULE (enforced by cutscenes.test.ts): every MEGA_BOSS_DEFS id MUST have a defeat
//    cutscene here. A new mega boss without one FAILS THE BUILD. ──
//
// Unlocks are DATA, resolved against the save by save/derive.isCutsceneUnlocked — megas by
// megaProgress.slain, story beats by campaign stage / molts / Infinite depth. Each unlock
// also grants a SMALL permanent passive (op-mul ≤ ×1.02 / tiny flat — the test enforces
// smallness); a fresh save has none, so baseline sims — and the golden test — never move.

import type { CardEffect } from './cards';

/** A copy line staged onto the film at a scene-relative time (seconds). */
export interface CutsceneLine { at: number; text: string; em?: boolean }
/** A sound-design beat fired at a scene-relative time (an audio cue tag). */
export interface CutsceneBeat { at: number; cue: string }

/** The procedural tableau painters (render/cutsceneScenes.ts). Reused across cutscenes —
 *  the def's palette re-themes them — so a new mega's film is usually pure data. */
export type CutscenePainter =
  | 'behemoth' // a titan silhouette buckling and falling
  | 'maw' // concentric hunger, a mouth that is also a tunnel
  | 'choir' // hollow figures in a ring, song made visible
  | 'herd' // a procession of small strains walking one way
  | 'tide' // black water, a bound moon, the pull
  | 'tithe' // offerings raining into a pit that counts them
  | 'lab' // the flashback: glass, instruments, a growing thing
  | 'countdown' // glyph rings contracting toward zero
  | 'molt' // a shed body drifting away from the new one
  | 'deep' // strata falling past the camera, pressure and dark
  | 'veinsplit' // one genome diverging into two — the kinship reveal
  | 'root'; // the vast thing below — the arc's destination

export interface CutsceneScene {
  id: string;
  painter: CutscenePainter;
  durMs: number; // hold before the cut (the player may tap ahead; the last scene leads to the coda)
  lines: CutsceneLine[];
  beats: CutsceneBeat[];
}

/** How a cutscene unlocks — pure data; save/derive resolves it (no save imports here). */
export type CutsceneUnlock =
  | { kind: 'mega'; megaId: string } // first defeat of this mega boss
  | { kind: 'stage'; stage: number } // clear this campaign stage (any difficulty track)
  | { kind: 'molt' } // perform the first Ascension molt
  | { kind: 'wave'; wave: number }; // reach this Infinite depth

export interface CutsceneDef {
  id: string; // 'mega:<megaId>' | 'story:<slug>'
  kind: 'mega' | 'story';
  title: string; // the memory's name, e.g. 'THE BURIED MAW FALLS'
  subtitle: string; // one line of what this memory is
  palette: { body: string; glow: string; accent: string }; // themes every painter in the film
  unlock: CutsceneUnlock;
  unlockHint: string; // the Archive's locked-card hint ("Defeat VORAXIS")
  /** The small permanent passive the unlock grants (label shown in the Archive). */
  boost: { effect: CardEffect; label: string };
  scenes: CutsceneScene[];
}

// ── The films ─────────────────────────────────────────────────────────────────────────────
// One continuous arc: the megas are the CHOIR — organ-lords serving something deeper. Each
// defeat names it a little more clearly; the story beats carry the Core's own awakening.

export const CUTSCENES: CutsceneDef[] = [
  // ── Mega defeats (docs/MEGA-BOSS.md — one per def, THE RULE) ──
  {
    id: 'mega:voraxis',
    kind: 'mega',
    title: 'THE BURIED MAW FALLS',
    subtitle: 'What Voraxis was digging toward',
    palette: { body: '#7a2334', glow: '#ff5d73', accent: '#c7b27a' },
    unlock: { kind: 'mega', megaId: 'voraxis' },
    unlockHint: 'Defeat VORAXIS, the Buried Maw',
    boost: { effect: { op: 'mul', field: 'biomassMult', value: 1.02 }, label: 'Devourer’s Memory — +2% biomass' },
    scenes: [
      {
        id: 'fall', painter: 'behemoth', durMs: 8200,
        lines: [
          { at: 0.8, text: 'The Maw buckles.' },
          { at: 3.2, text: 'A mountain learning, too late, that it can fall.', em: true },
        ],
        beats: [{ at: 0.2, cue: 'cin_rumble' }, { at: 2.4, cue: 'cin_shriek' }, { at: 4.6, cue: 'cin_rumble' }, { at: 6.4, cue: 'cin_snap' }],
      },
      {
        id: 'mouth', painter: 'maw', durMs: 9000,
        lines: [
          { at: 0.9, text: 'Inside the mouth: no stomach.' },
          { at: 3.4, text: 'A tunnel. Centuries deep.' },
          { at: 5.8, text: 'The Maw was never eating. It was DIGGING.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_creep' }, { at: 2.6, cue: 'cin_ping' }, { at: 5.6, cue: 'cin_alarm' }, { at: 7.4, cue: 'cin_creep' }],
      },
      {
        id: 'root', painter: 'root', durMs: 8600,
        lines: [
          { at: 1.0, text: 'At the tunnel’s end, the dark is not empty.' },
          { at: 3.8, text: 'Something below accepts the Maw’s silence —' },
          { at: 6.2, text: 'and keeps digging from the other side.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_rumble' }, { at: 3.4, cue: 'cin_heart' }, { at: 5.6, cue: 'cin_heart' }, { at: 7.2, cue: 'cin_rumble' }],
      },
    ],
  },
  {
    id: 'mega:meridia',
    kind: 'mega',
    title: 'THE CHOIR GOES QUIET',
    subtitle: 'What Meridia’s song was covering',
    palette: { body: '#22333f', glow: '#8fd0ff', accent: '#d98cff' },
    unlock: { kind: 'mega', megaId: 'meridia' },
    unlockHint: 'Defeat MERIDIA, the Hollow Choir',
    boost: { effect: { op: 'mul', field: 'heroDamageMult', value: 1.02 }, label: 'Choir’s Echo — +2% champion damage' },
    scenes: [
      {
        id: 'silence', painter: 'choir', durMs: 8600,
        lines: [
          { at: 0.8, text: 'Meridia’s thousand mouths close at once.' },
          { at: 3.4, text: 'For the first time in an age: silence.', em: true },
        ],
        beats: [{ at: 0.2, cue: 'cin_shriek' }, { at: 2.2, cue: 'cin_cut' }, { at: 4.0, cue: 'cin_ping' }, { at: 6.2, cue: 'cin_ping' }],
      },
      {
        id: 'under', painter: 'countdown', durMs: 9200,
        lines: [
          { at: 0.9, text: 'And under the silence — you hear it.' },
          { at: 3.6, text: 'A slow, patient COUNTING.' },
          { at: 6.0, text: 'The song was never music. It was a lid.', em: true },
        ],
        beats: [{ at: 0.5, cue: 'cin_ping' }, { at: 2.4, cue: 'cin_ping' }, { at: 4.3, cue: 'cin_ping' }, { at: 6.2, cue: 'cin_alarm' }, { at: 7.8, cue: 'cin_heart' }],
      },
    ],
  },
  {
    id: 'mega:ossira',
    kind: 'mega',
    title: 'THE PALE SHEPHERD RESTS',
    subtitle: 'Where the herds go when no one drives them',
    palette: { body: '#4a4238', glow: '#e8d5a0', accent: '#c7b27a' },
    unlock: { kind: 'mega', megaId: 'ossira' },
    unlockHint: 'Defeat OSSIRA, the Pale Shepherd',
    boost: { effect: { op: 'mul', field: 'towerFireRateMult', value: 1.01 }, label: 'Shepherd’s Cadence — +1% fire rate' },
    scenes: [
      {
        id: 'rest', painter: 'behemoth', durMs: 8200,
        lines: [
          { at: 0.8, text: 'The Shepherd kneels into the bone-field it made.' },
          { at: 3.6, text: 'Its crook dissolves. The driving stops.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_rumble' }, { at: 2.8, cue: 'cin_snap' }, { at: 5.0, cue: 'cin_creep' }],
      },
      {
        id: 'herds', painter: 'herd', durMs: 9400,
        lines: [
          { at: 0.9, text: 'The herds do not scatter.' },
          { at: 3.2, text: 'They turn — every strain, unbidden —' },
          { at: 5.6, text: 'and walk toward YOUR territory. Willingly.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_creep' }, { at: 2.6, cue: 'cin_creep' }, { at: 5.4, cue: 'cin_heart' }, { at: 7.6, cue: 'cin_bloom' }],
      },
      {
        id: 'question', painter: 'root', durMs: 8000,
        lines: [
          { at: 1.0, text: 'A shepherd serves the flock’s OWNER.' },
          { at: 4.0, text: 'Ossira was only ever borrowing them.', em: true },
        ],
        beats: [{ at: 0.5, cue: 'cin_rumble' }, { at: 3.6, cue: 'cin_heart' }, { at: 6.0, cue: 'cin_rumble' }],
      },
    ],
  },
  {
    id: 'mega:vesperine',
    kind: 'mega',
    title: 'THE TIDE UNBOUND',
    subtitle: 'What the water has been holding back',
    palette: { body: '#1e2a4a', glow: '#6ad4e8', accent: '#b48ae0' },
    unlock: { kind: 'mega', megaId: 'vesperine' },
    unlockHint: 'Defeat VESPERINE, the Tidebinder',
    boost: { effect: { op: 'mul', field: 'splashRadiusMult', value: 1.02 }, label: 'Tide’s Reach — +2% splash radius' },
    scenes: [
      {
        id: 'unbind', painter: 'tide', durMs: 8800,
        lines: [
          { at: 0.8, text: 'Vesperine’s knots slip, one by one.' },
          { at: 3.4, text: 'The black water it bound for centuries — released.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_creep' }, { at: 2.6, cue: 'cin_snap' }, { at: 4.2, cue: 'cin_rumble' }, { at: 6.6, cue: 'cin_creep' }],
      },
      {
        id: 'memory', painter: 'deep', durMs: 9400,
        lines: [
          { at: 0.9, text: 'And the water REMEMBERS.' },
          { at: 3.2, text: 'Green coasts. Bright cities. A world before the hunger.' },
          { at: 6.4, text: 'It was not binding the tide. It was drowning the evidence.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_ping' }, { at: 2.8, cue: 'cin_bloom' }, { at: 5.2, cue: 'cin_heart' }, { at: 7.4, cue: 'cin_alarm' }],
      },
    ],
  },
  {
    id: 'mega:moloch_ama',
    kind: 'mega',
    title: 'THE TITHE COMES DUE',
    subtitle: 'Who Moloch-Ama was collecting for',
    palette: { body: '#3a2e1e', glow: '#e8b84a', accent: '#a06a30' },
    unlock: { kind: 'mega', megaId: 'moloch_ama' },
    unlockHint: 'Defeat MOLOCH-AMA, the Tithe',
    boost: { effect: { op: 'add', field: 'startBiomassBonus', value: 15 }, label: 'Unpaid Tithe — +15 starting biomass' },
    scenes: [
      {
        id: 'spill', painter: 'tithe', durMs: 8800,
        lines: [
          { at: 0.8, text: 'The collector bursts, and millennia of tribute spill out.' },
          { at: 3.8, text: 'Biomass beyond counting. None of it spent.', em: true },
        ],
        beats: [{ at: 0.2, cue: 'cin_snap' }, { at: 1.8, cue: 'cin_rumble' }, { at: 3.6, cue: 'cin_creep' }, { at: 5.8, cue: 'cin_ping' }],
      },
      {
        id: 'ledger', painter: 'countdown', durMs: 9000,
        lines: [
          { at: 0.9, text: 'A tithe is not greed. A tithe is OWED.' },
          { at: 3.8, text: 'Somewhere below, a ledger notices the payment stop —' },
          { at: 6.6, text: 'and opens a new column. Yours.', em: true },
        ],
        beats: [{ at: 0.5, cue: 'cin_ping' }, { at: 2.6, cue: 'cin_ping' }, { at: 4.8, cue: 'cin_alarm' }, { at: 7.0, cue: 'cin_heart' }],
      },
    ],
  },
  {
    id: 'mega:sarcophage',
    kind: 'mega',
    title: 'THE LAST COURSE',
    subtitle: 'What the Self-Devourer was fattening itself for',
    palette: { body: '#3a4218', glow: '#c8e64a', accent: '#e0d8a8' },
    unlock: { kind: 'mega', megaId: 'sarcophage' },
    unlockHint: 'Defeat SARCOPHAGE, the Self-Devourer',
    boost: { effect: { op: 'mul', field: 'heroHealingMult', value: 1.02 }, label: 'Glutton’s Lesson — +2% champion healing' },
    scenes: [
      {
        id: 'starve', painter: 'behemoth', durMs: 8400,
        lines: [
          { at: 0.8, text: 'The Self-Devourer starves at last.' },
          { at: 3.4, text: 'A famine, dying the way famines do: still hungry.', em: true },
        ],
        beats: [{ at: 0.2, cue: 'cin_rumble' }, { at: 2.2, cue: 'cin_shriek' }, { at: 4.6, cue: 'cin_creep' }, { at: 6.4, cue: 'cin_snap' }],
      },
      {
        id: 'gullet', painter: 'maw', durMs: 9000,
        lines: [
          { at: 0.9, text: 'Inside the gullet: everything it ever ate, kept.' },
          { at: 3.6, text: 'Not digested. PRESERVED.' },
          { at: 6.0, text: 'It was not feeding itself. It was provisioning a voyage.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_creep' }, { at: 2.8, cue: 'cin_ping' }, { at: 5.6, cue: 'cin_alarm' }, { at: 7.4, cue: 'cin_heart' }],
      },
      {
        id: 'below', painter: 'deep', durMs: 8600,
        lines: [
          { at: 1.0, text: 'Provisions for a journey DOWN.' },
          { at: 3.8, text: 'Whatever waits at the bottom of the world —' },
          { at: 6.2, text: 'it expected to be fed on arrival.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_rumble' }, { at: 3.2, cue: 'cin_heart' }, { at: 5.8, cue: 'cin_heart' }, { at: 7.2, cue: 'cin_rumble' }],
      },
    ],
  },
  {
    id: 'mega:myriad',
    kind: 'mega',
    title: 'THE ANSWERS RUN OUT',
    subtitle: 'What Myriad never learned to survive',
    palette: { body: '#332844', glow: '#c9b8ff', accent: '#8fe8d0' },
    unlock: { kind: 'mega', megaId: 'myriad' },
    unlockHint: 'Defeat MYRIAD, the Thousand Answers',
    boost: { effect: { op: 'mul', field: 'heroSpeedMult', value: 1.02 }, label: 'Thousandth Answer — +2% champion speed' },
    scenes: [
      {
        id: 'unanswer', painter: 'countdown', durMs: 8600,
        lines: [
          { at: 0.8, text: 'One by one, Myriad’s answers go dark.' },
          { at: 3.6, text: 'A thousand remembered victories, useless against ONE new question.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_ping' }, { at: 2.2, cue: 'cin_ping' }, { at: 4.0, cue: 'cin_cut' }, { at: 6.4, cue: 'cin_shriek' }],
      },
      {
        id: 'mirror', painter: 'veinsplit', durMs: 9200,
        lines: [
          { at: 0.9, text: 'Its hide is a museum of every weapon ever raised against it.' },
          { at: 3.8, text: 'And there — new among the scars — a shape you recognize.' },
          { at: 6.4, text: 'It had already started learning YOU.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_creep' }, { at: 3.4, cue: 'cin_ping' }, { at: 6.0, cue: 'cin_alarm' }, { at: 7.8, cue: 'cin_heart' }],
      },
      {
        id: 'question', painter: 'root', durMs: 8800,
        lines: [
          { at: 1.0, text: 'Every answer it kept was for a question asked from BELOW.' },
          { at: 4.0, text: 'Something down there is still asking.' },
          { at: 6.4, text: 'And now it will have to ask you directly.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_rumble' }, { at: 3.4, cue: 'cin_heart' }, { at: 5.8, cue: 'cin_heart' }, { at: 7.4, cue: 'cin_alarm' }],
      },
    ],
  },

  // ── Story milestones — the Core's own awakening (4 films, docs/CUTSCENES.md §arc) ──
  {
    id: 'story:awakening',
    kind: 'story',
    title: 'FIRST MEMORY',
    subtitle: 'What the Core was, before it was a weapon',
    palette: { body: '#1d3a2a', glow: '#7ce6a0', accent: '#ffd24d' },
    unlock: { kind: 'stage', stage: 3 },
    unlockHint: 'Clear Campaign Stage 3',
    boost: { effect: { op: 'mul', field: 'towerDamageMult', value: 1.01 }, label: 'First Memory — +1% tower damage' },
    scenes: [
      {
        id: 'glass', painter: 'lab', durMs: 9000,
        lines: [
          { at: 0.8, text: 'A memory surfaces that is not yours. Or is only yours.' },
          { at: 3.6, text: 'Glass. Instruments. Voices arguing about a cage.' },
          { at: 6.2, text: 'PROJECT ASSIMILATE. Phase one.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_ping' }, { at: 2.4, cue: 'cin_creep' }, { at: 5.8, cue: 'cin_alarm' }, { at: 7.2, cue: 'cin_heart' }],
      },
      {
        id: 'kin', painter: 'veinsplit', durMs: 8600,
        lines: [
          { at: 0.9, text: 'They did not build you to fight the hunger.' },
          { at: 3.4, text: 'They built you FROM it.' },
          { at: 5.8, text: 'The enemy shares your genome. You are the cage.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_creep' }, { at: 3.0, cue: 'cin_snap' }, { at: 5.4, cue: 'cin_heart' }, { at: 7.0, cue: 'cin_bloom' }],
      },
    ],
  },
  {
    id: 'story:hollow-signal',
    kind: 'story',
    title: 'THE HOLLOW SIGNAL',
    subtitle: 'The transmission, decoded at last',
    palette: { body: '#26203f', glow: '#b48ae0', accent: '#8fd0ff' },
    unlock: { kind: 'stage', stage: 12 },
    unlockHint: 'Clear Campaign Stage 12',
    boost: { effect: { op: 'mul', field: 'integrityMult', value: 1.01 }, label: 'The Countdown Heard — +1% Nucleus integrity' },
    scenes: [
      {
        id: 'decode', painter: 'countdown', durMs: 9200,
        lines: [
          { at: 0.8, text: 'The signal that woke you — 11,204 days of silence, ended.' },
          { at: 3.8, text: 'Decoded, it is not a distress call.' },
          { at: 6.2, text: 'It is a COUNTDOWN. And it did not start at the surface.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_ping' }, { at: 2.2, cue: 'cin_ping' }, { at: 4.1, cue: 'cin_ping' }, { at: 6.0, cue: 'cin_alarm' }, { at: 7.8, cue: 'cin_heart' }],
      },
      {
        id: 'heralds', painter: 'root', durMs: 8800,
        lines: [
          { at: 0.9, text: 'The Choir are not generals. They are HERALDS.' },
          { at: 3.6, text: 'Each one a syllable of something below,' },
          { at: 6.0, text: 'announcing itself. Slowly. Politely.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_rumble' }, { at: 3.2, cue: 'cin_heart' }, { at: 5.6, cue: 'cin_heart' }, { at: 7.4, cue: 'cin_rumble' }],
      },
    ],
  },
  {
    id: 'story:first-molt',
    kind: 'story',
    title: 'MOLT',
    subtitle: 'The Core sheds its first body',
    palette: { body: '#3f2a3a', glow: '#e6a2ff', accent: '#ffd24d' },
    unlock: { kind: 'molt' },
    unlockHint: 'Perform your first Ascension Molt',
    boost: { effect: { op: 'mul', field: 'heroMaxHpMult', value: 1.02 }, label: 'Molted Resolve — +2% champion HP' },
    scenes: [
      {
        id: 'shed', painter: 'molt', durMs: 9000,
        lines: [
          { at: 0.8, text: 'The old body drifts away like a season.' },
          { at: 3.4, text: 'You watch it go, and the watching does not hurt.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_creep' }, { at: 2.8, cue: 'cin_bloom' }, { at: 5.2, cue: 'cin_heart' }],
      },
      {
        id: 'cycles', painter: 'deep', durMs: 9400,
        lines: [
          { at: 0.9, text: 'In the shed skin: older skins. Dozens.' },
          { at: 3.6, text: 'This war has been fought before. By you. Every time deeper.' },
          { at: 6.6, text: 'Whatever waits below has been PATIENT.', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_ping' }, { at: 2.8, cue: 'cin_rumble' }, { at: 5.4, cue: 'cin_heart' }, { at: 7.6, cue: 'cin_alarm' }],
      },
    ],
  },
  {
    id: 'story:the-deep',
    kind: 'story',
    title: 'WHAT THE DEEP KEEPS',
    subtitle: 'Past wave forty, the war changes its question',
    palette: { body: '#14202e', glow: '#6ad4e8', accent: '#ff5d73' },
    unlock: { kind: 'wave', wave: 40 },
    unlockHint: 'Reach Wave 40 in Infinite',
    boost: { effect: { op: 'mul', field: 'heroCooldownMult', value: 0.99 }, label: 'Deep Attunement — −1% champion cooldowns' },
    scenes: [
      {
        id: 'pressure', painter: 'deep', durMs: 8800,
        lines: [
          { at: 0.8, text: 'This deep, the waves stop screaming.' },
          { at: 3.2, text: 'They arrive quietly, almost gently,' },
          { at: 5.6, text: 'the way blood returns to a heart.', em: true },
        ],
        beats: [{ at: 0.3, cue: 'cin_rumble' }, { at: 2.8, cue: 'cin_creep' }, { at: 5.2, cue: 'cin_heart' }],
      },
      {
        id: 'question', painter: 'root', durMs: 9200,
        lines: [
          { at: 0.9, text: 'They are not attacking the Nucleus.' },
          { at: 3.2, text: 'They are RETURNING to it.' },
          { at: 5.8, text: 'You must ask, eventually: who assimilated whom?', em: true },
        ],
        beats: [{ at: 0.4, cue: 'cin_heart' }, { at: 2.8, cue: 'cin_heart' }, { at: 5.4, cue: 'cin_alarm' }, { at: 7.4, cue: 'cin_rumble' }],
      },
    ],
  },
];

// ── Lookups (docs/CUTSCENES.md §api) ──────────────────────────────────────────────────────

const BY_ID = new Map(CUTSCENES.map((c) => [c.id, c]));

export function cutsceneDef(id: string): CutsceneDef | undefined {
  return BY_ID.get(id);
}

/** The defeat cutscene for a mega boss — THE RULE says this never returns undefined for a
 *  shipped MEGA_BOSS_DEFS id (cutscenes.test.ts enforces it). */
export function cutsceneForMega(megaId: string): CutsceneDef | undefined {
  return CUTSCENES.find((c) => c.unlock.kind === 'mega' && c.unlock.megaId === megaId);
}

/** Every unlocked cutscene's passive (the Archive's "small boost" lane). Pure fold input —
 *  a fresh save unlocks nothing, so this is [] at baseline (golden-safe). */
export function cutsceneEffects(unlockedIds: readonly string[]): CardEffect[] {
  return CUTSCENES.filter((c) => unlockedIds.includes(c.id)).map((c) => c.boost.effect);
}
