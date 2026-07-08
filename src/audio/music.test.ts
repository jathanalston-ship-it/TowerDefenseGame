// The composition core must be MUSIC, not ambience (the explicit design goal): recognizable
// melody, harmonic progression, rhythm/percussion grammar, bass, and evolving structure — all
// provable on the PURE renderer without an AudioContext. Also pins the manager's data contract
// (all six categories, layer/gain sanity, intro ≠ loop, deterministic bars).

import { describe, it, expect } from 'vitest';
import { TRACKS, barNotes, chordAt } from './music';
import type { MusicCategory } from './music';

const CATEGORIES: MusicCategory[] = ['menu', 'combat', 'boss', 'mega', 'victory', 'defeat', 'events'];
const menu = TRACKS.menu;

describe('music tracks — the data contract', () => {
  it('all six categories exist with sane tempo, layers, and gain ranges', () => {
    for (const c of CATEGORIES) {
      const t = TRACKS[c];
      expect(t.category).toBe(c);
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(160);
      expect(t.progression.length).toBeGreaterThanOrEqual(4);
      expect(t.motif.some((d) => d >= 0)).toBe(true); // an actual melody is authored
      expect(t.layers.map((l) => l.id).sort()).toEqual(['arp', 'bass', 'drums', 'lead', 'pad', 'texture']);
      for (const l of t.layers) {
        expect(l.gain[0]).toBeGreaterThanOrEqual(0);
        expect(l.gain[1]).toBeLessThanOrEqual(1);
        expect(l.gain[1]).toBeGreaterThanOrEqual(l.gain[0]); // intensity can only ADD (adaptive seam)
      }
    }
    expect(TRACKS.victory.oneShot).toBe(true);
    expect(TRACKS.defeat.oneShot).toBe(true);
  });
});

describe('the menu track is a composition (NOT a drone)', () => {
  it('has HARMONIC PROGRESSION: the chord changes across the loop', () => {
    const chords = new Set<string>();
    for (let b = 0; b < menu.progression.length; b++) chords.add(chordAt(menu, b).join(','));
    expect(chords.size).toBeGreaterThanOrEqual(4); // ≥4 distinct harmonies — a progression
  });

  it('has RHYTHM + PERCUSSION: kick/snare/hat grammar with phrase-end fills', () => {
    const bar = barNotes(menu, menu.introBars + 2); // inside the loop
    const drums = bar.layers.drums;
    expect(drums.some((n) => n.midi === 36)).toBe(true); // kick
    expect(drums.some((n) => n.midi === 38)).toBe(true); // snare
    expect(drums.filter((n) => n.midi === 42).length).toBeGreaterThanOrEqual(8); // driving hats
    const phraseEnd = barNotes(menu, menu.introBars + 7).layers.drums.filter((n) => n.midi === 38);
    expect(phraseEnd.length).toBeGreaterThan(2); // the fill closes the 8-bar phrase
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

  it('has EVOLVING STRUCTURE: intro ≠ loop, and A/B halves differ', () => {
    const intro = barNotes(menu, 0);
    expect(intro.inIntro).toBe(true);
    expect(intro.layers.arp).toHaveLength(0); // intro breathes in (reduced layers)
    expect(intro.layers.drums.some((n) => n.midi === 36)).toBe(false); // no kick yet
    const a = barNotes(menu, menu.introBars + 1).layers.arp.map((n) => n.midi).join(',');
    const b = barNotes(menu, menu.introBars + 9).layers.arp.map((n) => n.midi).join(',');
    expect(a).not.toBe(b); // section B re-voices the arpeggio (structure evolves)
  });

  it('renders DETERMINISTICALLY (same bar → identical notes, ready for tests + replays)', () => {
    expect(barNotes(menu, 17)).toEqual(barNotes(menu, 17));
  });

  it('every rendered note stays in the track scale family (no random dissonance)', () => {
    for (let b = 0; b < 24; b++) {
      const bar = barNotes(menu, b);
      for (const layer of ['arp', 'lead', 'pad'] as const) {
        for (const n of bar.layers[layer]) {
          const pc = ((n.midi - menu.root) % 12 + 12) % 12;
          expect(menu.scale.includes(pc), `bar ${b} ${layer} midi ${n.midi}`).toBe(true);
        }
      }
      // Bass may use CHROMATIC APPROACH tones into the next bar (walking-bass grammar) — every
      // bass note must be in-scale OR within a whole step of the next bar's root.
      const nextRoot = chordAt(menu, Math.max(0, b - menu.introBars) + 1)[0] - 12;
      for (const n of bar.layers.bass) {
        const pc = ((n.midi - menu.root) % 12 + 12) % 12;
        const approach = Math.abs(n.midi - nextRoot) <= 2;
        expect(menu.scale.includes(pc) || approach, `bar ${b} bass midi ${n.midi}`).toBe(true);
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
