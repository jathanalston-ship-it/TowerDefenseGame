// Tutorial anchor integrity (docs/TUTORIAL-AUDIT.md §debt) — the lesson defs and tour stops
// reference UI anchors as CSS-selector STRINGS. A renamed data attribute or class silently
// degrades a lesson to the centered-callout / full-dim fallback (a soft failure nobody sees in
// CI). This guard cross-checks every selector the defs use against the UI source: each
// data-tut/data-tour/data-nav/data-hub value and class token must appear as a literal in src/ui.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMBAT_TUTORIAL } from '../core/tutorial';
import { TOUR } from '../ui/HudTour';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui');

function uiSource(dir = UI_DIR, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) uiSource(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
const ALL_UI = uiSource().join('\n');

/** Every selector a checkpoint cue references (spotlight, arrow target, callout target). */
function cueSelectors(): string[] {
  const sels: string[] = [];
  for (const cp of COMBAT_TUTORIAL.checkpoints) {
    const c = cp.cue;
    if (!c) continue;
    if (c.spotlight) sels.push(c.spotlight);
    if (c.arrow) sels.push(c.arrow.target);
    if (c.callout?.target) sels.push(c.callout.target);
    if (c.callout?.avoid) sels.push(c.callout.avoid);
    if (c.focus) sels.push(c.focus);
  }
  return sels;
}

/** A selector "resolves" if each attribute value / class token appears literally in src/ui. */
function missingTokens(sel: string): string[] {
  const missing: string[] = [];
  for (const m of sel.matchAll(/\[data-(?:tut|tour|nav|hub)="([^"]+)"\]/g)) {
    if (!new RegExp(`['"\`]${m[1]}['"\`]`).test(ALL_UI)) missing.push(m[0]);
  }
  for (const m of sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)) {
    if (!ALL_UI.includes(m[1])) missing.push(`.${m[1]}`);
  }
  return missing;
}

describe('tutorial anchors resolve against the UI source', () => {
  it('every Combat Tutorial cue selector has a live anchor', () => {
    for (const sel of cueSelectors()) {
      expect(missingTokens(sel), `unresolved anchor in COMBAT_TUTORIAL: ${sel}`).toEqual([]);
    }
  });

  it('every Field Orientation stop anchor has a live anchor', () => {
    for (const stop of TOUR) {
      if (!stop.anchor) continue;
      expect(missingTokens(stop.anchor), `unresolved anchor in TOUR "${stop.area}": ${stop.anchor}`).toEqual([]);
    }
  });
});
