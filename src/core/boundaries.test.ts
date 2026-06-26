/// <reference types="vite/client" />
// Architecture guard (ARCHITECTURE.md §2/§18): the simulation core is deterministic
// and headless, so nothing under src/core may import React/DOM or an app layer
// (ui/render/state/save/audio/debug). This fails loudly if that rule is broken — the
// enforcement the project lacked, with zero new tooling (runs under `npm test`).
// Uses Vite's import.meta.glob (no node:fs dependency, so it typechecks without
// @types/node).

import { describe, expect, it } from 'vitest';

// Every core source (this dir, recursive), excluding tests, loaded as raw text.
const sources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FORBIDDEN_BARE = /^(react($|\/|-dom)|pixi|@pixi|zustand)/;
const APP_LAYER = /(^|\/)(ui|render|state|save|audio|debug)\//;

/** Module specifiers a file imports (from-imports + bare side-effect imports). */
function importsOf(src: string): string[] {
  const specs: string[] = [];
  const fromRe = /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const bareRe = /\bimport\s*['"]([^'"]+)['"]/g;
  for (const re of [fromRe, bareRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]);
  }
  return specs;
}

describe('core dependency boundary', () => {
  it('no core module imports React/DOM or an app layer', () => {
    const violations: string[] = [];
    for (const [path, src] of Object.entries(sources)) {
      if (path.endsWith('.test.ts')) continue;
      for (const spec of importsOf(src)) {
        if (FORBIDDEN_BARE.test(spec)) violations.push(`${path} → ${spec} (forbidden library)`);
        else if (spec.startsWith('../')) violations.push(`${path} → ${spec} (escapes core/)`);
        else if (APP_LAYER.test(spec)) violations.push(`${path} → ${spec} (app layer)`);
      }
    }
    expect(violations).toEqual([]);
  });
});
