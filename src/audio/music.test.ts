// The composition core must be MUSIC, not ambience (the explicit design goal): recognizable
// melodies from a shared MOTIF library, harmonic progressions, rhythm/percussion grammar, bass,
// and evolving structure — all provable on the PURE renderer without an AudioContext. Also pins
// the soundtrack's data contracts: the track LIBRARY (8 adaptive layers, category coverage),
// selection (scene/rotation/progression weighting), stable per-boss theme assignment, and the
// stinger library. See docs/MUSIC.md.

import { describe, it, expect } from 'vitest';
import {
  TRACKS, TRACK_LIBRARY, LAYER_IDS, MOTIFS, STINGERS, BOSS_THEME_OVERRIDES,
  tracksOf, pickTrack, bossTrackFor, barNotes, chordAt,
} from './music';
import type { MusicCategory, MotifId, StingerId, TrackDef } from './music';

const CATEGORIES: MusicCategory[] = ['menu', 'combat', 'boss', 'mega', 'victory', 'defeat', 'events', 'cinema'];
const menu = TRACKS.menu;

/** Mirror the renderer's bar→loop-bar mapping (for harmony checks). */
const loopBarOf = (t: TrackDef, bar: number): number =>
  bar < t.introBars ? 0 : (bar - t.introBars) % t.progression.length;

describe('the track LIBRARY — the data contract', () => {
  it('every category is covered, with real variety where rotation needs it', () => {
    for (const c of CATEGORIES) expect(tracksOf(c).length, c).toBeGreaterThanOrEqual(1);
    expect(tracksOf('menu').length).toBeGreaterThanOrEqual(4); // menu rotation variety
    expect(tracksOf('combat').length).toBeGreaterThanOrEqual(3); // the run's musical arc
    expect(tracksOf('boss').length).toBeGreaterThanOrEqual(3); // hash-assignable theme families
    for (const c of CATEGORIES) expect(TRACKS[c].category).toBe(c); // defaults resolve
  });

  it('every track is well-formed: 8 adaptive layers, sane tempo/gains, a named identity', () => {
    const ids = new Set<string>();
    for (const t of TRACK_LIBRARY) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(160);
      expect(t.progression.length).toBeGreaterThanOrEqual(4);
      expect(t.introBars).toBeGreaterThanOrEqual(0);
      expect(MOTIFS[t.motif], `${t.id} motif`).toBeDefined();
      if (t.counterMotif) expect(MOTIFS[t.counterMotif], `${t.id} counterMotif`).toBeDefined();
      if (t.rotateAfterLoops !== undefined) expect(t.rotateAfterLoops).toBeGreaterThanOrEqual(2);
      expect(t.layers.map((l) => l.id).sort()).toEqual([...LAYER_IDS].sort());
      for (const l of t.layers) {
        expect(l.gain[0]).toBeGreaterThanOrEqual(0);
        expect(l.gain[1]).toBeLessThanOrEqual(1);
        expect(l.gain[1]).toBeGreaterThanOrEqual(l.gain[0]); // intensity can only ADD (adaptive seam)
      }
    }
  });

  it('victory/defeat are one-shot cadences; everything else loops', () => {
    for (const t of TRACK_LIBRARY) {
      if (t.category === 'victory' || t.category === 'defeat') expect(t.oneShot, t.id).toBe(true);
      else expect(t.oneShot, t.id).toBeUndefined();
    }
  });

  it('combat + boss author the AWAKENING: choir/hits are silent until intensity wakes them', () => {
    for (const t of TRACK_LIBRARY.filter((t) => t.category === 'combat' || t.category === 'boss')) {
      for (const id of ['choir', 'hits'] as const) {
        const l = t.layers.find((x) => x.id === id)!;
        expect(l.gain[0], `${t.id} ${id} floor`).toBe(0); // absent at calm…
        expect(l.gain[1], `${t.id} ${id} ceiling`).toBeGreaterThan(0); // …emerges as assimilation rises
      }
    }
  });
});

describe('the MOTIF library — themes players remember', () => {
  it('every motif is an authored melody with phrasing (notes AND breaths)', () => {
    for (const [id, m] of Object.entries(MOTIFS)) {
      expect(m.some((d) => d >= 0), id).toBe(true); // an actual melody
      expect(m.some((d) => d < 0), id).toBe(true); // …that breathes (rests)
    }
  });

  it('motifs RECUR across categories — the same themes bind the whole score', () => {
    const spread = new Map<MotifId, Set<MusicCategory>>();
    for (const t of TRACK_LIBRARY) {
      for (const m of [t.motif, t.counterMotif]) {
        if (!m) continue;
        if (!spread.has(m)) spread.set(m, new Set());
        spread.get(m)!.add(t.category);
      }
    }
    const recurring = [...spread.values()].filter((s) => s.size >= 2);
    expect(recurring.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pickTrack — scene, rotation, and progression selection (pure + seedable)', () => {
  it('is deterministic for a fixed roll', () => {
    expect(pickTrack('menu', { roll: 0.37 }).id).toBe(pickTrack('menu', { roll: 0.37 }).id);
  });

  it('routes hub scenes to their scene-tagged tracks', () => {
    expect(pickTrack('menu', { scene: 'vault', roll: 0.9 }).id).toBe('menu_vault');
    expect(pickTrack('menu', { scene: 'home', roll: 0.9 }).id).toBe('menu_hive');
  });

  it('falls back to the whole category for unknown scenes', () => {
    expect(pickTrack('menu', { scene: 'no_such_scene', roll: 0 }).category).toBe('menu');
  });

  it('rotation never immediately repeats (exclude), but never empties the pool either', () => {
    const first = tracksOf('combat')[0].id;
    expect(pickTrack('combat', { exclude: first, roll: 0 }).id).not.toBe(first);
    // A single-candidate pool ignores exclude rather than going silent:
    expect(pickTrack('menu', { scene: 'vault', exclude: 'menu_vault', roll: 0.5 }).id).toBe('menu_vault');
  });

  it('progression tier surfaces lateWeight tracks more for veterans', () => {
    const hits = (tier: number): number => {
      let n = 0;
      for (let r = 0; r < 100; r++) if (pickTrack('menu', { tier, roll: r / 100 }).id === 'menu_command') n++;
      return n;
    };
    expect(hits(1)).toBeGreaterThan(hits(0)); // the evolved theme plays more late-game
  });
});

describe('bossTrackFor — every boss has a STABLE musical identity, new bosses need no code', () => {
  it('the same boss always brings the same theme', () => {
    for (const key of ['Broodmother', 'Nucleus Prime', 'The Amalgam', 'colossus_7']) {
      expect(bossTrackFor(key).id).toBe(bossTrackFor(key).id);
      expect(bossTrackFor(key).category).toBe('boss');
    }
  });

  it('different bosses spread across the theme families', () => {
    const names = ['Broodmother', 'Nucleus Prime', 'The Amalgam', 'Vessel of Hunger', 'Apex Strain', 'The Choir-Flesh'];
    expect(new Set(names.map((n) => bossTrackFor(n).id)).size).toBeGreaterThanOrEqual(2);
  });

  it('explicit overrides beat the hash (content authoring hook)', () => {
    const target = tracksOf('boss')[1].id;
    BOSS_THEME_OVERRIDES['__test_boss__'] = target;
    try {
      expect(bossTrackFor('__test_boss__').id).toBe(target);
    } finally {
      delete BOSS_THEME_OVERRIDES['__test_boss__'];
    }
  });
});

describe('the default menu track is a composition (NOT a drone)', () => {
  it('has HARMONIC PROGRESSION: the chord changes across the loop', () => {
    const chords = new Set<string>();
    for (let b = 0; b < menu.progression.length; b++) chords.add(chordAt(menu, b).join(','));
    expect(chords.size).toBeGreaterThanOrEqual(4); // ≥4 distinct harmonies — a progression
  });

  it('has RHYTHM + PERCUSSION: kick/snare/hat grammar, phrase-end fills, phrase-open crashes', () => {
    const bar = barNotes(menu, menu.introBars + 2); // inside the loop
    const drums = bar.layers.drums;
    expect(drums.some((n) => n.midi === 36)).toBe(true); // kick
    expect(drums.some((n) => n.midi === 38)).toBe(true); // snare
    expect(drums.filter((n) => n.midi === 42).length).toBeGreaterThanOrEqual(8); // driving hats
    const phraseEnd = barNotes(menu, menu.introBars + 7).layers.drums.filter((n) => n.midi === 38);
    expect(phraseEnd.length).toBeGreaterThan(2); // the fill closes the 8-bar phrase
    const phraseOpen = barNotes(menu, menu.introBars).layers.drums;
    expect(phraseOpen.some((n) => n.midi === 49)).toBe(true); // the crash opens the phrase
  });

  it('has BASS: a driving line rooted on the harmony', () => {
    const bar = barNotes(menu, menu.introBars + 1);
    expect(bar.layers.bass.length).toBeGreaterThanOrEqual(8); // 8th-note motion
    expect(bar.layers.bass[0].midi).toBe(chordAt(menu, 1)[0] - 12); // rooted under the chord
  });

  it('has a RECOGNIZABLE MELODY: the authored motif renders with phrases and rests', () => {
    let leadNotes = 0;
    let bars = 0;
    for (let b = menu.introBars; b < menu.introBars + 32; b++) {
      const lead = barNotes(menu, b).layers.lead;
      if (lead.length > 0) { leadNotes += lead.length; bars++; }
    }
    expect(leadNotes).toBeGreaterThan(20); // the theme is really present…
    expect(bars).toBeLessThan(32); // …and BREATHES (sits out bars — phrasing, not wallpaper)
  });

  it('has a CHOIR COUNTERMELODY sung against the lead once the layer wakes', () => {
    let choirNotes = 0;
    for (let b = menu.introBars; b < menu.introBars + 8; b++) choirNotes += barNotes(menu, b).layers.choir.length;
    expect(choirNotes).toBeGreaterThan(4); // the counterMotif is really rendered
    expect(barNotes(menu, 0).layers.choir).toHaveLength(0); // …but not in the intro
  });

  it('lands INDUSTRIAL HITS in B halves and on phrase ends (impact = rarity)', () => {
    const bHalf = barNotes(menu, menu.introBars + 8); // loop bar 8 → the B half opens
    expect(bHalf.layers.hits.some((n) => n.midi === 33)).toBe(true);
    const aOpen = barNotes(menu, menu.introBars + 2); // plain A-half bar — no slam
    expect(aOpen.layers.hits).toHaveLength(0);
  });

  it('has EVOLVING STRUCTURE: intro ≠ loop, and A/B halves differ', () => {
    const intro = barNotes(menu, 0);
    expect(intro.inIntro).toBe(true);
    expect(intro.layers.arp).toHaveLength(0); // intro breathes in (reduced layers)
    expect(intro.layers.drums.some((n) => n.midi === 36)).toBe(false); // no kick yet
    const a = barNotes(menu, menu.introBars + 1).layers.arp.map((n) => n.midi).join(',');
    const b = barNotes(menu, menu.introBars + 9).layers.arp.map((n) => n.midi).join(',');
    expect(a).not.toBe(b); // section B re-voices the arpeggio (structure evolves)
  });
});

describe('the WHOLE library holds the musical contract', () => {
  it('renders DETERMINISTICALLY (same bar → identical notes, ready for tests + replays)', () => {
    for (const t of TRACK_LIBRARY) expect(barNotes(t, 17)).toEqual(barNotes(t, 17));
  });

  it('every pitched note in every track stays in its scale family (no random dissonance)', () => {
    for (const t of TRACK_LIBRARY) {
      for (let b = 0; b < 20; b++) {
        const bar = barNotes(t, b);
        for (const layer of ['arp', 'lead', 'pad', 'choir'] as const) {
          for (const n of bar.layers[layer]) {
            const pc = ((n.midi - t.root) % 12 + 12) % 12;
            expect(t.scale.includes(pc), `${t.id} bar ${b} ${layer} midi ${n.midi}`).toBe(true);
          }
        }
        // Bass may use CHROMATIC APPROACH tones into the next bar (walking-bass grammar) — every
        // bass note must be in-scale OR within a whole step of the next bar's root.
        const nextRoot = chordAt(t, loopBarOf(t, b) + 1)[0] - 12;
        for (const n of bar.layers.bass) {
          const pc = ((n.midi - t.root) % 12 + 12) % 12;
          const approach = Math.abs(n.midi - nextRoot) <= 2;
          expect(t.scale.includes(pc) || approach, `${t.id} bar ${b} bass midi ${n.midi}`).toBe(true);
        }
      }
    }
  });
});

describe('the Colossus Hymn (mega category)', () => {
  it('is its own composition: slowest combat tempo, deepest root, longest processional', () => {
    const m = TRACKS.mega;
    expect(m.bpm).toBeLessThan(TRACKS.combat.bpm);
    expect(m.bpm).toBeLessThan(TRACKS.boss.bpm);
    expect(m.root).toBeLessThanOrEqual(TRACKS.boss.root);
    expect(m.progression.length).toBeGreaterThanOrEqual(16); // a hymn, not a vamp
    expect(m.oneShot).toBeUndefined(); // raids can run long — it loops
  });
  it('renders real bars for every layer at the loop start', () => {
    const b = barNotes(TRACKS.mega, TRACKS.mega.introBars);
    expect(b.layers.bass.length).toBeGreaterThan(0);
    expect(b.layers.lead.length + b.layers.pad.length).toBeGreaterThan(0);
  });
});

describe('STINGERS — reward payoffs are short MUSIC in the home-key family', () => {
  const IDS: StingerId[] = ['legendary', 'achievement', 'unlock', 'prestige', 'bossDown', 'chapter', 'mastery', 'power'];
  const E_MINOR = new Set([4, 6, 7, 9, 11, 0, 2]); // E natural minor pitch classes

  it('every stinger id is authored with sane notes', () => {
    for (const id of IDS) {
      const notes = STINGERS[id];
      expect(notes.length, id).toBeGreaterThanOrEqual(2); // a gesture, not a blip
      for (const n of notes) {
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.len).toBeGreaterThan(0);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('stingers stay in the score’s home-key family (they belong to the same world)', () => {
    for (const id of IDS) {
      for (const n of STINGERS[id]) expect(E_MINOR.has(n.midi % 12), `${id} midi ${n.midi}`).toBe(true);
    }
  });
});
