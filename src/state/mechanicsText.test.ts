// The registry ↔ text split (state/mechanicsText.ts): every MECHANICS row has its long-form copy and
// no orphan copy outlives its row — the split keeps the prose out of the boot bundle, never out of the game.

import { describe, expect, it } from 'vitest';
import { MECHANICS } from './mechanics';
import { MECHANIC_TEXT } from './mechanicsText';

describe('mechanic text coverage', () => {
  it('every mechanic has what · why · where · next', () => {
    for (const m of MECHANICS) {
      const t = MECHANIC_TEXT[m.id];
      expect(t, `${m.id} has no text in mechanicsText.ts`).toBeTruthy();
      for (const k of ['what', 'why', 'where', 'next'] as const) expect(t[k].length, `${m.id}.${k}`).toBeGreaterThan(10);
    }
  });

  it('no text row without a registry row', () => {
    const ids = new Set(MECHANICS.map((m) => m.id));
    expect(Object.keys(MECHANIC_TEXT).filter((id) => !ids.has(id))).toEqual([]);
  });
});
