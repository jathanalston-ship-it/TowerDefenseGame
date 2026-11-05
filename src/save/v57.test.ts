// SAVE v56 → v57 (the first-hour pass, docs/PROGRESSION-GATING.md §announcements) — the Tower Lab, Hero
// Hall and Infinite lessons stopped being always-known rows and now announce as their screens open. A
// player who already MET a screen (latched reveal) gets its lesson archived: a veteran never gets a
// "Towers — new system" card, while a new account (or a screen not reached yet) still briefs and guides.

import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, defaultSave, parseImport } from './saveStore';
import { pendingAnnouncements } from '../state/mechanics';

const v56Blob = (over: Record<string, unknown>): string => JSON.stringify({ schemaVersion: 56, data: { ...defaultSave(), ...over } });

describe('v56 → v57 migration', () => {
  it('the schema is v57', () => {
    expect(CURRENT_VERSION).toBe(57);
  });

  it('a player who met the screens archives their lessons (no veteran "new system" cards)', () => {
    const director = { revealed: { towers: 1, heroes: 2, infinite: 3 }, visits: {} };
    const res = parseImport(v56Blob({ totalRuns: 40, director, campaign: { cleared: { standard: 12 }, bestTime: {} }, help: { seen: ['containers'], primed: true, hudTour: true } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.help.seen).toEqual(expect.arrayContaining(['containers', 'towers', 'heroes', 'infinite']));
    const queued = pendingAnnouncements(res.data).map((m) => m.id);
    for (const id of ['towers', 'heroes', 'infinite']) expect(queued).not.toContain(id);
  });

  it('a screen the player has NOT reached yet still briefs on arrival (latch-precise)', () => {
    const director = { revealed: { towers: 1 }, visits: {} }; // met the Tower Lab only
    const res = parseImport(v56Blob({ totalRuns: 1, director, help: { seen: [], primed: true, hudTour: true } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.help.seen).toContain('towers');
    expect(res.data.help.seen).not.toContain('heroes');
    expect(res.data.help.seen).not.toContain('infinite');
  });

  it('a pre-director save that has played archives all three', () => {
    const res = parseImport(v56Blob({ totalRuns: 5, director: { revealed: {}, visits: {} }, help: { seen: [], primed: true, hudTour: true } }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.help.seen).toEqual(expect.arrayContaining(['towers', 'heroes', 'infinite']));
  });

  it('a save that never played keeps them — its first screens still brief and guide it', () => {
    const res = parseImport(v56Blob({ totalRuns: 0, help: { seen: [], primed: true, hudTour: false } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.help.seen).not.toContain('towers');
    expect(res.data.help.seen).not.toContain('heroes');
  });

  it('the migration is idempotent and leaves a v57 blob alone', () => {
    const once = parseImport(v56Blob({ totalRuns: 3, director: { revealed: { towers: 1 }, visits: {} }, help: { seen: ['towers'], primed: true, hudTour: true } }));
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(once.data.help.seen.filter((x) => x === 'towers')).toHaveLength(1);
    const v57 = parseImport(JSON.stringify({ schemaVersion: 57, data: { ...defaultSave(), totalRuns: 3, help: { seen: [], primed: true, hudTour: true } } }));
    expect(v57.ok).toBe(true);
    if (v57.ok) expect(v57.data.help.seen).toEqual([]);
  });
});
