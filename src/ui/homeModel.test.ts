// Command Center read-models + registry (docs/COMMAND-CENTER.md): the models stay calm and
// crash-free on a FRESH account, reflect a veteran save faithfully, and the widget registry
// is OPEN — a future system registers a widget and appears in its zone without shell surgery.

import { describe, it, expect } from 'vitest';
import { agoLabel, armyView, commandFeed, homeRegistry, worldStatus } from './homeModel';
import { defaultSave } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';

describe('worldStatus — the organism vitals', () => {
  it('fresh account: NASCENT, calm, one organ per OWNED strain (dormant strains absent)', () => {
    const s = defaultSave();
    const ws = worldStatus(s);
    expect(ws.era).toBe(0);
    expect(ws.eraName).toBe('NASCENT');
    expect(ws.stage).toBe(0);
    expect(ws.molts).toBe(0);
    // the organism only carries synthesized organs — locked expansion strains don't render
    expect(ws.organs.map((o) => o.kind)).toEqual(TOWER_ORDER.filter((k) => s.towerUnlocked.includes(k)));
    expect(ws.organs.length).toBeLessThan(TOWER_ORDER.length);
    expect(ws.organs.every((o) => o.stars === 0 && o.form === 0)).toBe(true);
    expect(ws.intensity).toBeGreaterThan(0); // floored — a fresh lab still breathes
    expect(ws.frontierBiome.length).toBeGreaterThan(0);
  });

  it('a developed account raises the era and carries FORM stages onto its organs', () => {
    const s = defaultSave();
    for (const k of TOWER_ORDER) s.towerStars[k] = 8;
    s.prestige = { ...s.prestige, molts: 3, lifetimeCells: 12 };
    s.bestWave = 60;
    s.adaptation = { 'tower:needle': ['needle.predation.10'] };
    const ws = worldStatus(s);
    expect(ws.era).toBeGreaterThanOrEqual(2);
    expect(ws.molts).toBe(3);
    expect(ws.organs.find((o) => o.kind === 'needle')?.form).toBe(3);
  });
});

describe('commandFeed — recent milestones, newest first', () => {
  it('empty timeline ⇒ empty feed; entries sort by recency with human ago labels', () => {
    expect(commandFeed(defaultSave(), Date.now())).toEqual([]);
    const s = defaultSave();
    const now = 1_000_000_000_000;
    s.timeline = [
      { at: now - 3 * 3600_000, icon: '✸', label: 'MOLT I' },
      { at: now - 30_000, icon: '★', label: 'Reached Stage 12' },
    ];
    const feed = commandFeed(s, now);
    expect(feed.map((e) => e.label)).toEqual(['Reached Stage 12', 'MOLT I']);
    expect(feed[0].ago).toBe('just now');
    expect(feed[1].ago).toBe('3h ago');
  });

  it('agoLabel speaks human scales', () => {
    const now = 10_000_000_000;
    expect(agoLabel(now - 5 * 60_000, now)).toBe('5m ago');
    expect(agoLabel(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});

describe('armyView — every strain + champion', () => {
  it('covers the full roster; heroes carry unlock/fielded state', () => {
    const s = defaultSave();
    const army = armyView(s);
    expect(army.towers.length).toBe(TOWER_ORDER.length);
    expect(army.heroes.length).toBe(HERO_ORDER.length);
    const fielded = army.heroes.filter((h) => h.fielded);
    expect(fielded.length).toBe(s.heroLoadout.length);
    expect(army.heroes.every((h) => h.unlocked === s.heroUnlocked.includes(h.kind as never))).toBe(true);
  });

  it('towers carry ownership: a fresh profile shows dormant strains LOCKED, never fielded', () => {
    const s = defaultSave();
    const army = armyView(s);
    expect(army.towers.every((t) => t.unlocked === s.towerUnlocked.includes(t.kind as never))).toBe(true);
    expect(army.towers.every((t) => t.fielded === t.unlocked)).toBe(true); // owned kinds ride the conveyor
    expect(army.towers.some((t) => !t.unlocked)).toBe(true); // the shard-gated expansion trio starts dormant
  });
});

describe('home widget registry — the shell renders THIS', () => {
  it('ships the launch board and honors `when` guards', () => {
    const fresh = defaultSave();
    expect(homeRegistry.zone(fresh, 'world').map((d) => d.id)).toEqual(['world-status']);
    expect(homeRegistry.zone(fresh, 'main').map((d) => d.id)).toEqual(['next-goal', 'live-events', 'contracts', 'mission-control']);
    // feed hides on an empty timeline; appears once history exists
    expect(homeRegistry.zone(fresh, 'feed').map((d) => d.id)).toEqual(['dashboard']);
    const vet = { ...fresh, timeline: [{ at: 1, icon: '★', label: 'x' }] };
    expect(homeRegistry.zone(vet, 'feed').map((d) => d.id)).toEqual(['command-feed', 'dashboard']);
  });

  it('is OPEN: a future system registers a widget and appears in zone order', () => {
    homeRegistry.register({ id: 'test-future-widget', zone: 'side', order: 5 });
    const ids = homeRegistry.zone(defaultSave(), 'side').map((d) => d.id);
    expect(ids[0]).toBe('test-future-widget'); // order 5 sorts before forecast/roadmap
  });
});
