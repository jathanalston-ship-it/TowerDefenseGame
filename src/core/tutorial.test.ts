import { describe, it, expect } from 'vitest';
import {
  COMBAT_TUTORIAL,
  advance,
  atFinalCheckpoint,
  currentCheckpoint,
  isComplete,
  pause,
  restartCheckpoint,
  resume,
  sanitizeProgress,
  skipToEnd,
  startProgress,
  tutorialDef,
} from './tutorial';

const def = COMBAT_TUTORIAL;

describe('tutorial progress', () => {
  it('starts at the first checkpoint, active', () => {
    const p = startProgress(def);
    expect(p).toEqual({ id: 'combat', checkpoint: 0, status: 'active', attempt: 0 });
    expect(currentCheckpoint(p, def)).toBe(def.checkpoints[0]);
    expect(isComplete(p, def)).toBe(false);
  });

  it('completes ONLY after the final checkpoint is finished', () => {
    let p = startProgress(def);
    for (let i = 0; i < def.checkpoints.length; i++) {
      expect(isComplete(p, def)).toBe(false); // not done until we advance PAST the last one
      expect(atFinalCheckpoint(p, def)).toBe(i === def.checkpoints.length - 1);
      p = advance(p, def);
    }
    expect(isComplete(p, def)).toBe(true);
    expect(currentCheckpoint(p, def)).toBeNull();
    expect(advance(p, def)).toBe(p); // idempotent at the end
  });

  it('restartCheckpoint keeps the index but bumps the attempt (retry a step, not the tutorial)', () => {
    const p = advance(startProgress(def), def); // on checkpoint 1
    const r = restartCheckpoint(p);
    expect(r.checkpoint).toBe(1);
    expect(r.attempt).toBe(1);
    expect(advance(r, def).attempt).toBe(0); // advancing resets attempt
  });

  it('pause / resume toggle status without moving the cursor', () => {
    const p = startProgress(def);
    expect(pause(p).status).toBe('paused');
    expect(resume(pause(p))).toEqual(p);
    expect(pause(p).checkpoint).toBe(p.checkpoint);
  });

  it('skipToEnd jumps to complete', () => {
    expect(isComplete(skipToEnd(startProgress(def), def), def)).toBe(true);
  });
});

describe('sanitizeProgress', () => {
  it('rejects junk, keeps valid, clamps out-of-range checkpoints to the def', () => {
    expect(sanitizeProgress(null)).toBeNull();
    expect(sanitizeProgress({})).toBeNull();
    expect(sanitizeProgress({ id: 'combat', checkpoint: 2, status: 'paused', attempt: 3 })).toEqual({
      id: 'combat', checkpoint: 2, status: 'paused', attempt: 3,
    });
    // a checkpoint beyond the def clamps to complete (never strands a shrunken def)
    expect(sanitizeProgress({ id: 'combat', checkpoint: 999 }, def)?.checkpoint).toBe(def.checkpoints.length);
    expect(sanitizeProgress({ id: 'combat', checkpoint: -5 }, def)?.checkpoint).toBe(0);
  });
});

describe('registry', () => {
  it('resolves the combat tutorial def by id', () => {
    expect(tutorialDef('combat')).toBe(COMBAT_TUTORIAL);
    expect(tutorialDef('nope')).toBeUndefined();
  });
});

// Onboarding pass 2026-11 (docs/TUTORIAL-AUDIT.md §G): the lesson plan follows the REAL run
// rhythm and never teaches over its own subject.
describe('combat lesson plan', () => {
  const ids = def.checkpoints.map((c) => c.id);

  it('runs in natural wave → draft → build → wave order', () => {
    expect(ids.indexOf('gene-card')).toBe(ids.indexOf('wave-1') + 1); // the draft deals as wave 1 settles
    expect(ids.indexOf('hero-ability')).toBeGreaterThan(ids.indexOf('second-tower')); // after the build lessons …
    expect(ids.indexOf('graduation')).toBe(ids.indexOf('hero-ability') + 1); // … taught DURING wave 2
    expect(def.waves).toBe(2); // the HUD reports this, not the host stage's length
  });

  it('every lesson shown while a wave runs keeps its bubble off the lane', () => {
    for (const id of ['wave-1', 'hero-ability', 'graduation']) {
      expect(def.checkpoints.find((c) => c.id === id)?.cue?.callout?.avoid, id).toBe('canvas.board');
    }
    expect(def.checkpoints.find((c) => c.id === 'gene-card')?.cue?.callout?.avoid).toBe('.overlay .cards');
  });

  it('the ability arrow targets the real ability BUTTON, not the whole pod', () => {
    const cue = def.checkpoints.find((c) => c.id === 'hero-ability')?.cue;
    expect(cue?.arrow?.target).toBe('[data-tut="ability"] .ability-btn');
    expect(cue?.callout?.target).toBe(cue?.arrow?.target);
  });
});
