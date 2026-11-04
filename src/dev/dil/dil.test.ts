// DIL ENFORCEMENT (docs/DIL.md §validation) — the tests that make the brain SELF-MAINTAINING:
// the graph must stay internally consistent, every registry entity must be represented, curated
// knowledge can never point at ghosts, every shipped entity must pass its auto checklist (a
// half-integrated tower fails CI), and the committed DIL_GRAPH.md can never lag the built graph.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDil, REPO_ROOT } from './nodes';
import { buildDilDoc } from './dilDoc';
import { EDGE_KINDS } from './graph';
import { KNOWLEDGE_EDGES } from './knowledge';
import { allAutoFailures } from './checklists';
import { SYSTEMS } from '../systemRegistry';
import { ENEMY_DEFS, HERO_DEFS, TOWER_DEFS } from '../../core/config';
import { BIOMES } from '../../core/biomes';
import { BOSS_DEFS } from '../../core/boss';
import { MEGA_BOSS_DEFS } from '../../core/megaboss';
import { ACHIEVEMENTS } from '../../state/achievements';

const g = buildDil();

describe('DIL — graph integrity', () => {
  it('no dangling edges, no orphan nodes, no duplicate ids', () => {
    expect(g.validate()).toEqual([]);
  });

  it('every curated knowledge edge resolves at both ends (knowledge cannot rot)', () => {
    for (const e of KNOWLEDGE_EDGES) {
      expect(g.node(e.from), `knowledge edge FROM unknown '${e.from}'`).toBeTruthy();
      expect(g.node(e.to), `knowledge edge TO unknown '${e.to}'`).toBeTruthy();
      expect(EDGE_KINDS).toContain(e.kind);
      expect(e.note.length, `${e.from}→${e.to}: curated edges must say WHY`).toBeGreaterThan(8);
    }
  });
});

describe('DIL — ingestion completeness (new content joins automatically)', () => {
  it('every system, tower, hero, enemy, boss, mega, biome and achievement is a node', () => {
    for (const s of SYSTEMS) expect(g.node(`system:${s.id}`), `system:${s.id}`).toBeTruthy();
    for (const k of Object.keys(TOWER_DEFS)) expect(g.node(`tower:${k}`), `tower:${k}`).toBeTruthy();
    for (const k of Object.keys(HERO_DEFS)) expect(g.node(`hero:${k}`), `hero:${k}`).toBeTruthy();
    for (const k of Object.keys(ENEMY_DEFS)) expect(g.node(`enemy:${k}`), `enemy:${k}`).toBeTruthy();
    for (const k of Object.keys(BOSS_DEFS)) expect(g.node(`boss:${k}`), `boss:${k}`).toBeTruthy();
    for (const k of Object.keys(MEGA_BOSS_DEFS)) expect(g.node(`mega:${k}`), `mega:${k}`).toBeTruthy();
    for (const b of BIOMES) expect(g.node(`biome:${b.id}`), `biome:${b.id}`).toBeTruthy();
    // generated ladder rungs (docs/PROGRESSION-SYSTEMS.md §ladders) join as ONE node per family — its first rung
    for (const a of ACHIEVEMENTS) if (!a.ladder || a.ladder.tier === 1) expect(g.node(`achievement:${a.id}`), `achievement:${a.id}`).toBeTruthy();
  });

  it('the graph answers the canonical questions non-trivially', () => {
    expect(g.affects('concept:power-score').length).toBeGreaterThan(5); // "what does Power touch?"
    expect(g.who('tests', 'system:towers').length).toBeGreaterThan(3); // "what validates towers?"
    expect(g.who('documents', 'system:mulligans').length).toBeGreaterThan(0); // "what documents X?"
    expect(g.requires('system:daily').length).toBeGreaterThan(3); // "what is the daily built on?"
    expect(g.find('siphon').length).toBeGreaterThan(2);
  });

  it('every system is documented; the untested-system list can only SHRINK (ratchet)', () => {
    expect(g.missing('system', 'documents').map((n) => n.id)).toEqual([]);
    // The known test-coverage debt, pinned. Adding a system without a test grows this list and
    // FAILS here; paying the debt means deleting a line. It never silently grows.
    const KNOWN_UNTESTED = [
      'system:infinite', 'system:field-research', 'system:shards-economy', 'system:i18n',
      'system:expeditions', 'system:nemesis', 'system:run-ui', 'system:devtools', 'system:ui-kit',
    ];
    const untested = g.missing('system', 'tests').map((n) => n.id);
    for (const id of untested) expect(KNOWN_UNTESTED, `NEW untested system ${id} — add a test or (deliberately) extend the ratchet`).toContain(id);
  });
});

describe('DIL — feature checklists (shipped content must be fully integrated)', () => {
  it('every shipped tower/hero/enemy passes ALL its automatic probes', () => {
    expect(allAutoFailures()).toEqual([]);
  });
});

describe('DIL — the committed brain doc stays in sync (run `npm run dil -- regen`)', () => {
  it('docs/DIL_GRAPH.md matches the built graph', () => {
    const committed = readFileSync(join(REPO_ROOT, 'docs/DIL_GRAPH.md'), 'utf8');
    expect(committed).toBe(buildDilDoc());
  });
});
