// LIST ORGANIZATION framework (docs/UI-STANDARDS.md §lists) — the generic organizer every
// long-list screen rides: query → AND-chips → stable sort → lead-first → grouping.

import { describe, expect, it } from 'vitest';
import { defaultListState, organizeList, toggleIn } from './listOrg';
import type { ListOrgSpec } from './listOrg';

interface Row { id: string; name: string; cls: string; power: number; fav: boolean; ready: boolean }
const ROWS: Row[] = [
  { id: 'a', name: 'Needle Spitter', cls: 'Assault', power: 40, fav: false, ready: true },
  { id: 'b', name: 'Bone Mortar', cls: 'Siege', power: 90, fav: false, ready: false },
  { id: 'c', name: 'Flesh Reactor', cls: 'Economy', power: 20, fav: true, ready: false },
  { id: 'd', name: 'Spore Launcher', cls: 'Siege', power: 90, fav: false, ready: true },
];
const SPEC: ListOrgSpec<Row> = {
  searchText: (r) => `${r.name} ${r.cls}`,
  sorts: [
    { id: 'default', label: 'Doctrine order', by: (r) => ROWS.indexOf(r), dir: 'asc' },
    { id: 'power', label: 'Highest Power', by: (r) => r.power },
    { id: 'name', label: 'Name', by: (r) => r.name },
  ],
  filters: [
    { id: 'ready', label: 'Ready', test: (r) => r.ready },
    { id: 'siege', label: 'Siege', test: (r) => r.cls === 'Siege' },
  ],
  groups: [{ id: 'cls', label: 'By class', keyOf: (r) => r.cls, groupOrder: ['Assault', 'Siege', 'Economy'] }],
  lead: (r) => (r.fav ? 1 : 0),
};

describe('listOrg — the generic long-list organizer', () => {
  it('defaults to the first sort, no filters, flat view', () => {
    const s = defaultListState(SPEC);
    expect(s.sort).toBe('default');
    const out = organizeList(ROWS, SPEC, s);
    // Favorites lead even in the default order (curation beats sorting).
    expect(out.rows.map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(out.groups).toBeNull();
    expect(out.shown).toBe(4);
  });

  it('query matches the declared search text, case-insensitive', () => {
    const out = organizeList(ROWS, SPEC, { ...defaultListState(SPEC), query: 'SIEGE' });
    expect(out.rows.map((r) => r.id)).toEqual(['b', 'd']);
    expect(out.shown).toBe(2);
    expect(out.total).toBe(4);
  });

  it('filter chips AND together', () => {
    const st = { ...defaultListState(SPEC), filters: ['ready', 'siege'] };
    expect(organizeList(ROWS, SPEC, st).rows.map((r) => r.id)).toEqual(['d']);
  });

  it('numeric sorts run DESC and stay stable; string sorts run ASC', () => {
    const power = organizeList(ROWS, SPEC, { ...defaultListState(SPEC), sort: 'power' });
    // b and d tie at 90 — authored order (b before d) is preserved; fav c still leads its weight class.
    expect(power.rows.map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
    const name = organizeList(ROWS, SPEC, { ...defaultListState(SPEC), sort: 'name' });
    expect(name.rows.filter((r) => !r.fav).map((r) => r.name)).toEqual(['Bone Mortar', 'Needle Spitter', 'Spore Launcher']);
  });

  it('an unknown sort id falls back to the default order (a removed mode can never crash)', () => {
    const out = organizeList(ROWS, SPEC, { ...defaultListState(SPEC), sort: '__gone__' });
    expect(out.rows.map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('grouping buckets the ORGANIZED order under the declared group order', () => {
    const out = organizeList(ROWS, SPEC, { ...defaultListState(SPEC), sort: 'power', group: 'cls' });
    expect(out.groups!.map((g) => g.key)).toEqual(['Assault', 'Siege', 'Economy']);
    expect(out.groups!.find((g) => g.key === 'Siege')!.rows.map((r) => r.id)).toEqual(['b', 'd']);
    // The flat list is untouched by grouping (membership + order identical).
    expect(out.rows.map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('toggleIn flips membership without mutating', () => {
    const a = ['x'];
    expect(toggleIn(a, 'y')).toEqual(['x', 'y']);
    expect(toggleIn(a, 'x')).toEqual([]);
    expect(a).toEqual(['x']);
  });
});
