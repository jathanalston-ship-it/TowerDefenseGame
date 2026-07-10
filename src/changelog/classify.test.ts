// Chronicle classifier (docs/CHANGELOG-PIPELINE.md): conventional types map to their
// categories, keywords beat paths, paths decide when words don't, vague messages are
// flagged for review and stay internal, and every output category is standard.

import { describe, expect, it } from 'vitest';
import { classifyCommit } from './classify';
import { NOTE_CATEGORIES } from './types';

const c = (subject: string, files: string[] = [], body = '') => classifyCommit({ subject, body, files });

describe('chronicle classifier', () => {
  it('maps conventional types straight to categories', () => {
    expect(c('fix: daily seed drift on DST boundaries').cat).toBe('Bug Fixes');
    expect(c('perf: pool enemy projectiles').cat).toBe('Performance');
    expect(c('balance: soften wave 30 spike').cat).toBe('Balance');
    expect(c('docs: rewrite EXPEDITIONS.md').internal).toBe(true);
  });

  it('classifies by scope/keyword before paths', () => {
    expect(c('feat(expeditions): risk tiers + rare finds').cat).toBe('Heroes');
    expect(c('feat: two new mega boss raid organisms').cat).toBe('Mega Bosses');
    expect(c('feat: new tower Rift Anchor with pull field', ['src/core/config.ts']).cat).toBe('Towers');
    expect(c('feat(site): marketing page becomes the front door').cat).toBe('Website');
    expect(c('feat: authored boss theme soundtrack').cat).toBe('Music');
    expect(c('chore: harden CSP security headers').cat).toBe('Security');
  });

  it('falls back to changed-file paths', () => {
    expect(c('feat: sharpen the breach transition', ['src/render/introScenes.ts']).cat).toBe('Visuals');
    expect(c('feat: colder open on first boot', ['functions/api/save.ts']).cat).toBe('Backend');
  });

  it('flags vague subjects for review and keeps them internal', () => {
    const r = c('wip', ['src/core/game.ts']);
    expect(r.needsReview).toBe(true);
    expect(r.internal).toBe(true);
    expect(c('update', ['src/ui/Hub.tsx']).needsReview).toBe(true);
  });

  it('keeps docs/tooling-only commits out of player notes', () => {
    expect(c('feat: regenerate dependency graph', ['docs/DEPENDENCY_GRAPH.md', 'scripts/gen-depgraph.ts']).internal).toBe(true);
    expect(c('refactor: extract hash primitive', ['src/core/hash.ts']).internal).toBe(true);
  });

  it('cleans subjects into player text and only emits standard categories', () => {
    const r = c('feat(towers): spitfang turret joins the roster.');
    expect(r.text).toBe('Spitfang turret joins the roster');
    for (const probe of ['fix: x pops', 'feat: quieter menus please', 'perf: less gc', 'nonsense message here', 'wip']) {
      expect(NOTE_CATEGORIES).toContain(c(probe, ['src/core/game.ts']).cat);
    }
  });
});
