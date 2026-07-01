// UI STANDARDS enforcement (docs/UI-STANDARDS.md) — future screens inherit the design system
// AUTOMATICALLY because off-scale CSS fails the build. Scope: the stylesheet's drift-prone axes
// (type scale, corner radii, motion durations). Inline component styles are covered by review +
// the standards doc; this pins the 5.3k-line stylesheet where drift historically accumulated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './docSync';

const css = (): string => readFileSync(join(REPO_ROOT, 'src/index.css'), 'utf8');

const RADIUS_TOKEN = /^var\(--r-(xs|sm|md|lg)(, ?\d+px)?\)$/;
function radiusValueAllowed(v: string): boolean {
  // Single value first (the fallback form `var(--r-sm, 8px)` contains a space — test whole).
  if (RADIUS_TOKEN.test(v) || ['999px', '50%', '0', '1px', '2px', 'inherit'].includes(v)) return true;
  const parts = v.split(/\s+/);
  if (parts.length === 1) return false;
  // Compounds: every part a token or 0 (e.g. `var(--r-md) var(--r-md) 0 0`)…
  if (parts.every((p) => RADIUS_TOKEN.test(p) || p === '0')) return true;
  // …or a large decorative arc `Npx Npx 0 0` (N ≥ 20 — sculpted panel tops, not drift).
  const arc = v.match(/^(\d+)px \1px 0 0$/);
  return !!arc && Number(arc[1]) >= 20;
}

describe('UI standards — the stylesheet stays on the design scale', () => {
  it('typography: no fractional font sizes (whole-pixel type scale only)', () => {
    const bad = css().match(/font-size: \d+\.\d+px/g) ?? [];
    expect(bad, `off-scale font sizes (use the whole-px scale, docs/UI-STANDARDS.md §Typography): ${bad.join(', ')}`).toEqual([]);
  });

  it('corners: border-radius uses the radius tokens (or pill/circle/hairline/arc)', () => {
    const bad = [...css().matchAll(/border-radius: ([^;]+);/g)].map((m) => m[1].trim()).filter((v) => !radiusValueAllowed(v));
    expect(bad, `off-scale radii (use --r-xs/sm/md/lg · 999px pill · 50% circle): ${bad.join(', ')}`).toEqual([]);
  });

  it('motion: transition durations use the --dur tokens (or an annotated `/* bespoke */`)', () => {
    const bad: string[] = [];
    for (const m of css().matchAll(/transition:[^;]+;[^\n]*/g)) {
      if (m[0].includes('/* bespoke')) continue; // sanctioned exception, self-documented in place
      for (const d of m[0].matchAll(/(\d*\.?\d+)(s|ms)\b/g)) {
        const ms = parseFloat(d[1]) * (d[2] === 's' ? 1000 : 1);
        if (ms > 1) bad.push(m[0].trim());
      }
    }
    expect(bad, `raw transition durations (use var(--dur-1..4), docs/UI-STANDARDS.md §Animation): ${bad.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('the design tokens the standards reference actually exist in :root', () => {
    const root = css().slice(0, css().indexOf('}', css().indexOf(':root')));
    for (const t of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--dur-1', '--dur-2', '--dur-3', '--dur-4', '--ease-out', '--r-common', '--r-mythic', '--viral']) {
      expect(root.includes(`${t}:`), `missing token ${t}`).toBe(true);
    }
  });
});
