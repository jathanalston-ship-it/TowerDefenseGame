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
  // …or a large decorative arc `Npx Npx 0 0` (N ≥ 20 — sculpted panel tops, not drift)…
  const arc = v.match(/^(\d+)px \1px 0 0$/);
  if (arc && Number(arc[1]) >= 20) return true;
  // …or an ORGANIC BLOB `A% B% C% D% / E% F% G% H%` with every radius 30–70% — the sanctioned
  // bio-form category (eggs, sacs, membranes: the hatching ceremony, docs/UI-STANDARDS.md
  // §Corners). The band keeps blobs near-elliptical and sculpted, not arbitrary drift.
  const blob = v.match(/^(\d+% ){3}\d+% \/ (\d+% ){3}\d+%$/);
  if (blob) {
    const nums = [...v.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    return nums.length === 8 && nums.every((n) => n >= 30 && n <= 70);
  }
  return false;
}

describe('UI standards — the stylesheet stays on the design scale', () => {
  it('typography: no fractional font sizes (whole-pixel type scale only)', () => {
    const bad = css().match(/font-size: \d+\.\d+px/g) ?? [];
    expect(bad, `off-scale font sizes (use the whole-px scale, docs/UI-STANDARDS.md §Typography): ${bad.join(', ')}`).toEqual([]);
  });

  it('typography: px font sizes come from the type scale (docs/UI_STYLE_GUIDE.md §1)', () => {
    // 10–26 = the working scale; 34/40/58 = sanctioned display numerals. clamp()/em pass untouched.
    const SCALE = new Set([10, 11, 12, 13, 14, 16, 18, 20, 26, 34, 40, 58]);
    const bad = [...css().matchAll(/font-size: (\d+)px/g)].map((m) => Number(m[1])).filter((v) => !SCALE.has(v));
    expect([...new Set(bad)], `off-scale font sizes (scale: ${[...SCALE].join('/')}px): ${bad.join(', ')}`).toEqual([]);
  });

  it('typography: letter-spacing comes from the tracking scale (docs/UI_STYLE_GUIDE.md §1)', () => {
    // 0.02–0.28 = working scale; 0.34/0.42 = ceremonial display tier (huge dramatic tracking).
    const SCALE = new Set(['0.02', '0.04', '0.06', '0.08', '0.1', '0.12', '0.14', '0.16', '0.2', '0.24', '0.28', '0.34', '0.42']);
    const bad = [...css().matchAll(/letter-spacing: (-?[\d.]+)em/g)].map((m) => m[1]).filter((v) => !SCALE.has(v));
    expect([...new Set(bad)], `off-scale tracking (scale: ${[...SCALE].join('/')}em): ${bad.join(', ')}`).toEqual([]);
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

  it('viewport height: full-screen shells use var(--app-h), never a bare 100vh/100dvh (docs/RESPONSIVE-DESIGN.md §browser)', () => {
    // A phone BROWSER's 100vh is the toolbar-hidden height: a 100vh shell runs under the address bar.
    // Only the --app-h token itself may name the raw units (comments excluded).
    const code = css().replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = code.split('\n').filter((l) => /100d?vh/.test(l) && !/--app-h:\s*100d?vh/.test(l) && !/@supports \(height: 100dvh\)/.test(l));
    expect(bad.map((l) => l.trim()), 'use var(--app-h) for viewport heights').toEqual([]);
  });

  it('the design tokens the standards reference actually exist in :root', () => {
    const root = css().slice(0, css().indexOf('}', css().indexOf(':root')));
    for (const t of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--dur-1', '--dur-2', '--dur-3', '--dur-4', '--ease-out', '--r-common', '--r-mythic', '--r-exotic', '--r-exotic-2', '--viral']) {
      expect(root.includes(`${t}:`), `missing token ${t}`).toBe(true);
    }
  });
});
