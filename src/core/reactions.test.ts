import { describe, it, expect } from 'vitest';
import { REACTION_DEFS, pendingReaction, reactionDef } from './reactions';
import type { Enemy } from './types';

// Minimal enemy stub carrying only the status fields the matrix reads.
const E = (p: Partial<Enemy>): Enemy => ({ fracture: 0, corrosion: 0, infection: 0, disrupt: 0, ...(p as object) } as Enemy);

describe('reaction matrix', () => {
  it('covers all six unordered status pairs exactly once', () => {
    expect(REACTION_DEFS.length).toBe(6);
    const ids = REACTION_DEFS.map((r) => r.id);
    expect(new Set(ids).size).toBe(6); // no duplicates
  });

  it('Shred (Fracture+Corrosion) is first — preserving the historical priority', () => {
    expect(REACTION_DEFS[0].id).toBe('shred');
    expect(pendingReaction(E({ fracture: 3, corrosion: 1 }))!.id).toBe('shred');
  });

  it('a single status never reacts (needs a pair)', () => {
    expect(pendingReaction(E({ fracture: 4 }))).toBeNull();
    expect(pendingReaction(E({ corrosion: 2 }))).toBeNull();
    expect(pendingReaction(E({ infection: 5 }))).toBeNull();
    expect(pendingReaction(E({ disrupt: 1 }))).toBeNull();
    expect(pendingReaction(E({}))).toBeNull();
  });

  it('each pair maps to its distinct reaction', () => {
    expect(pendingReaction(E({ fracture: 2, infection: 3 }))!.id).toBe('virulence');
    expect(pendingReaction(E({ fracture: 2, disrupt: 1 }))!.id).toBe('detonate');
    expect(pendingReaction(E({ corrosion: 1, infection: 3 }))!.id).toBe('putrefy');
    expect(pendingReaction(E({ corrosion: 1, disrupt: 1 }))!.id).toBe('dissolve');
    expect(pendingReaction(E({ infection: 3, disrupt: 1 }))!.id).toBe('plaguebloom');
  });

  it('priority is deterministic when several reactions are ready (Shred wins)', () => {
    expect(pendingReaction(E({ fracture: 2, corrosion: 1, infection: 3, disrupt: 1 }))!.id).toBe('shred');
  });

  it('reactionDef looks up by id and carries a label + color', () => {
    const r = reactionDef('dissolve')!;
    expect(r.name).toBe('DISSOLVE');
    expect(r.color).toMatch(/^#/);
  });
});
