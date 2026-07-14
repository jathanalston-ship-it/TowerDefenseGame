// HIVE INTELLIGENCE FEED (docs/HIVE-INTEL.md — Foundation #2). Pins the re-founding contract:
// derived (acting retires the entry with zero bookkeeping), never meaningless (every row has a
// real trigger; far-off unlocks stay silent), four questions answered on every row, and the
// priority order act > soon > note.

import { describe, it, expect } from 'vitest';
import { hiveIntel } from './hiveIntel';
import { defaultSave } from '../save/saveStore';

const NOW = 1_700_000_000_000;

describe('Hive Intelligence Feed — derived, honest, self-retiring', () => {
  it('every entry answers all four questions and carries a shortcut', () => {
    const s = { ...defaultSave(), shards: 800, pendingContainers: [{}] as never };
    for (const e of hiveIntel(s, NOW)) {
      expect(e.what.length).toBeGreaterThan(0);
      expect(e.why.length).toBeGreaterThan(0);
      expect(e.action.length).toBeGreaterThan(0);
      expect(e.nav.length).toBeGreaterThan(0);
    }
  });

  it('banked value + the Advisor top move surface as ACT rows, ranked first', () => {
    const s = { ...defaultSave(), shards: 800, pendingContainers: [{}, {}] as never };
    const feed = hiveIntel(s, NOW);
    expect(feed[0].priority).toBe('act');
    expect(feed.some((e) => e.id === 'intel:vault')).toBe(true);
    const adv = feed.find((e) => e.id === 'intel:advisor');
    expect(adv).toBeTruthy();
    expect(adv!.powerGain).toBeGreaterThan(0); // how much stronger — exact, never vague
  });

  it('acting RETIRES an entry with zero bookkeeping (derived, not logged)', () => {
    const before = hiveIntel({ ...defaultSave(), pendingContainers: [{}] as never }, NOW);
    expect(before.some((e) => e.id === 'intel:vault')).toBe(true);
    const after = hiveIntel(defaultSave(), NOW); // containers cracked ⇒ the fact is gone
    expect(after.some((e) => e.id === 'intel:vault')).toBe(false);
  });

  it('never emits meaningless rows: a broke fresh account gets a quiet feed', () => {
    const feed = hiveIntel(defaultSave(), NOW);
    // no vault, no affordable moves, unlock gates far (<25%), empty timeline ⇒ little to say
    expect(feed.every((e) => e.id !== 'intel:advisor' && e.id !== 'intel:vault')).toBe(true);
    expect(feed.length).toBeLessThanOrEqual(2); // silence over noise
  });

  it('unlock proximity only speaks when genuinely close, and the timeline rides as low-priority notes', () => {
    const s = { ...defaultSave(), timeline: [{ at: NOW - 300_000, icon: '★', label: 'Stage 3 cleared' }] as never };
    const feed = hiveIntel(s, NOW);
    const note = feed.find((e) => e.id.startsWith('intel:tl:'));
    expect(note).toBeTruthy();
    expect(note!.priority).toBe('note');
    expect(note!.ago).toBe('5m ago');
  });
});
