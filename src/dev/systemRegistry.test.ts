// ENFORCEMENT for the system registry + doc synchronization (docs/DEPENDENCY_GRAPH.md).
// These tests are the "automatically" in "keep documentation synchronized": they run with every
// `npm test`, so a feature that forgets to register, a doc that drifts from a code value, a dead
// path, or a stale generated graph turns the build RED with instructions.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SYSTEMS, SYSTEM_BY_ID, globToRegExp, systemsForFile, consumersOf, impactOf } from './systemRegistry';
import { buildDependencyGraphDoc } from './depGraphDoc';
import { anchorProblems, deadDocPaths, REPO_ROOT } from './docSync';
import { MECHANICS } from '../state/mechanics';
import { TUTORIALS } from '../core/tutorial';
import { ACHIEVEMENTS } from '../state/achievements';
import { defaultSave } from '../save/saveStore';

function srcFiles(dir = join(REPO_ROOT, 'src'), out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) out.push(p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'));
  }
  return out;
}

describe('system registry — structural integrity', () => {
  it('ids are unique and dependsOn edges resolve (no self-dependency)', () => {
    expect(new Set(SYSTEMS.map((s) => s.id)).size).toBe(SYSTEMS.length);
    for (const s of SYSTEMS) {
      for (const d of s.dependsOn) {
        expect(SYSTEM_BY_ID.has(d), `${s.id} depends on unknown '${d}'`).toBe(true);
        expect(d).not.toBe(s.id);
      }
    }
  });

  it('every file glob matches at least one real file (no stale globs)', () => {
    const files = srcFiles();
    for (const s of SYSTEMS) {
      for (const g of s.files) {
        const rx = globToRegExp(g);
        expect(files.some((f) => rx.test(f)), `${s.id}: glob '${g}' matches nothing`).toBe(true);
      }
    }
  });

  it('EVERY non-test src file is claimed by a system — new features must register', () => {
    const orphans = srcFiles().filter((f) => systemsForFile(f).length === 0);
    expect(orphans, `unregistered files (add them to src/dev/systemRegistry.ts): ${orphans.join(', ')}`).toEqual([]);
  });

  it('every registered doc exists', () => {
    for (const s of SYSTEMS) {
      for (const d of s.docs) expect(existsSync(join(REPO_ROOT, d)), `${s.id}: missing doc ${d}`).toBe(true);
    }
  });

  it('help / tutorial / achievement / save references resolve against the REAL registries', () => {
    const helpIds = new Set(MECHANICS.map((m) => m.id));
    const achIds = new Set(ACHIEVEMENTS.map((a) => a.id));
    const saveKeys = new Set(Object.keys(defaultSave()));
    for (const s of SYSTEMS) {
      for (const h of s.help) expect(helpIds.has(h), `${s.id}: unknown help mechanic '${h}'`).toBe(true);
      for (const t of s.tutorial) expect(t in TUTORIALS, `${s.id}: unknown tutorial '${t}'`).toBe(true);
      for (const a of s.achievements) expect(achIds.has(a), `${s.id}: unknown achievement '${a}'`).toBe(true);
      for (const k of s.save) {
        if (k === 'ALL (owner)') continue; // the meta-store owns the whole blob
        expect(saveKeys.has(k), `${s.id}: unknown save field '${k}'`).toBe(true);
      }
    }
  });

  it('the impact view answers "what breaks if I change this?" for every system', () => {
    for (const s of SYSTEMS) {
      const imp = impactOf(s.id);
      expect(imp.consumers).toEqual(consumersOf(s.id));
      for (const d of imp.docsToUpdate) expect(existsSync(join(REPO_ROOT, d))).toBe(true);
    }
    // Spot-check a known heavy edge: power is consumed by many systems.
    expect(consumersOf('power').length).toBeGreaterThanOrEqual(5);
  });
});

describe('generated docs stay in sync (docs/DEPENDENCY_GRAPH.md)', () => {
  it('the committed graph matches the registry — else run `npm run docs:graph`', () => {
    const committed = readFileSync(join(REPO_ROOT, 'docs/DEPENDENCY_GRAPH.md'), 'utf8');
    expect(committed).toBe(buildDependencyGraphDoc());
  });
});

describe('documentation ↔ implementation synchronization', () => {
  it('every doc-anchor value matches the live code (docs cannot silently rot)', () => {
    expect(anchorProblems()).toEqual([]);
  });

  it('no doc references a src/docs path that does not exist', () => {
    expect(deadDocPaths()).toEqual([]);
  });
});
