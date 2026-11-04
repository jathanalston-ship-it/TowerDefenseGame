// TOKEN CONTRAST (docs/UI-STANDARDS.md §readability) — the text tiers in :root must stay
// readable on every surface tier, so no screen can inherit unreadable small print from a token.
// WCAG 2.x relative luminance; AA body-text bar 4.5:1. Pins the TOKENS (the 86-site --dim tier
// was 3.1:1 on --panel before the 2026-11 polish); per-screen rendered contrast is the
// cogload gauge's job (scripts/cogload.ts — reported, not failed).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './docSync';

const AA = 4.5;
const TEXT_TIERS = ['--text', '--muted', '--dim'] as const;
const SURFACES = ['--bg', '--panel', '--panel-2', '--panel-3', '--panel-deep'] as const;

function rootTokens(): Map<string, string> {
  const css = readFileSync(join(REPO_ROOT, 'src/index.css'), 'utf8');
  const start = css.indexOf(':root {');
  const root = css.slice(start, css.indexOf('\n}', start));
  const out = new Map<string, string>();
  for (const m of root.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out.set(m[1], m[2]);
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('UI standards — text tokens stay readable on every surface', () => {
  const tokens = rootTokens();

  it('every text tier reads ≥ 4.5:1 on every panel surface', () => {
    const bad: string[] = [];
    for (const fg of TEXT_TIERS) {
      for (const bg of SURFACES) {
        const f = tokens.get(fg); const b = tokens.get(bg);
        expect(f, `${fg} must be a hex token in :root`).toBeTruthy();
        expect(b, `${bg} must be a hex token in :root`).toBeTruthy();
        const cr = contrastRatio(f!, b!);
        if (cr < AA) bad.push(`${fg} on ${bg} = ${cr.toFixed(2)}:1`);
      }
    }
    expect(bad, `text tokens below ${AA}:1 (docs/UI-STANDARDS.md §readability)`).toEqual([]);
  });

  it('the tiers keep their order — text > muted > dim (hierarchy survives the readability floor)', () => {
    const l = (t: string): number => luminance(tokens.get(t)!);
    expect(l('--text')).toBeGreaterThan(l('--muted'));
    expect(l('--muted')).toBeGreaterThan(l('--dim'));
  });
});
