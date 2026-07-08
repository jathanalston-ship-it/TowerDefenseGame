import { describe, it, expect } from 'vitest';
import { REACTION_DEFS, pendingReaction, reactionDef } from './reactions';
import type { Enemy } from './types';

// Minimal enemy stub carrying only the status fields the matrix reads.
const E = (p: Partial<Enemy>): Enemy => ({ fracture: 0, corrosion: 0, infection: 0, disrupt: 0, mark: 0, resonance: 0, ...(p as object) } as Enemy);

// Present-value per status: Fracture reads `>= 1` (stacks); the rest read `> 0`.
const PRESENT: Record<string, Partial<Enemy>> = {
  fracture: { fracture: 2 }, corrosion: { corrosion: 1 }, infection: { infection: 3 },
  disrupt: { disrupt: 1 }, mark: { mark: 2 }, resonance: { resonance: 2 },
};
// The 15 unordered pairings of the SIX statuses → the reaction each combusts into.
const PAIR_TO_REACTION: [string, string, string][] = [
  ['fracture', 'corrosion', 'shred'], ['fracture', 'infection', 'virulence'], ['fracture', 'disrupt', 'detonate'],
  ['corrosion', 'infection', 'putrefy'], ['corrosion', 'disrupt', 'dissolve'], ['infection', 'disrupt', 'plaguebloom'],
  ['mark', 'fracture', 'harvest'], ['mark', 'corrosion', 'ferment'], ['mark', 'infection', 'bloomrot'], ['mark', 'disrupt', 'synapticbloom'],
  ['resonance', 'fracture', 'resonantshear'], ['resonance', 'corrosion', 'resonantmelt'], ['resonance', 'infection', 'resonantrupture'], ['resonance', 'disrupt', 'resonantovertone'],
  ['mark', 'resonance', 'synthesis'],
];

describe('reaction matrix', () => {
  it('covers all 15 unordered pairs of the six statuses, each a distinct reaction', () => {
    expect(REACTION_DEFS.length).toBe(15); // C(6,2)
    const ids = REACTION_DEFS.map((r) => r.id);
    expect(new Set(ids).size).toBe(15); // no duplicates
    expect(PAIR_TO_REACTION.length).toBe(15);
    expect(new Set(PAIR_TO_REACTION.map((p) => p[2])).size).toBe(15); // each pair → a distinct reaction
  });

  it('each of the 15 status pairs combusts into exactly its reaction', () => {
    for (const [a, b, id] of PAIR_TO_REACTION) {
      const e = E({ ...PRESENT[a], ...PRESENT[b] });
      expect(pendingReaction(e)?.id, `${a}+${b}`).toBe(id);
    }
  });

  it('Shred (Fracture+Corrosion) is first — preserving the historical priority + golden path', () => {
    expect(REACTION_DEFS[0].id).toBe('shred');
    expect(pendingReaction(E({ fracture: 3, corrosion: 1 }))!.id).toBe('shred');
    // The original six precede every new (Vital/Resonant) reaction, so legacy priority is unchanged.
    const legacy = ['shred', 'virulence', 'detonate', 'putrefy', 'dissolve', 'plaguebloom'];
    expect(REACTION_DEFS.slice(0, 6).map((r) => r.id)).toEqual(legacy);
  });

  it('a single status never reacts (needs a pair) — including the two new statuses', () => {
    for (const k of ['fracture', 'corrosion', 'infection', 'disrupt', 'mark', 'resonance']) {
      expect(pendingReaction(E(PRESENT[k])), k).toBeNull();
    }
    expect(pendingReaction(E({}))).toBeNull();
  });

  it('golden-safety: no Mark/Resonance reaction can fire without its (gated-tower) status present', () => {
    // A run without the Siphon/Coil has mark=resonance=0, so only the original 6 are ever reachable.
    const newIds = ['synthesis', 'harvest', 'ferment', 'bloomrot', 'synapticbloom', 'resonantshear', 'resonantmelt', 'resonantrupture', 'resonantovertone'];
    for (const r of REACTION_DEFS) {
      if (!newIds.includes(r.id)) continue;
      // With every LEGACY status maxed but mark=resonance=0, no new reaction is ready.
      expect(r.ready(E({ fracture: 9, corrosion: 9, infection: 9, disrupt: 9 })), r.id).toBe(false);
    }
  });

  it('Synthesis (Mark+Resonance) outranks either family when both new statuses are present', () => {
    // mark+resonance+fracture could match harvest or resonantshear; synthesis wins (listed first of the new set).
    expect(pendingReaction(E({ mark: 2, resonance: 2, fracture: 3 }))!.id).toBe('synthesis');
  });

  it('reactionDef looks up by id and carries a label + color', () => {
    for (const id of ['dissolve', 'harvest', 'synthesis', 'resonantshear'] as const) {
      const r = reactionDef(id)!;
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.color).toMatch(/^#/);
    }
  });
});
