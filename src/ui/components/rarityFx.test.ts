// RARITY FX (docs/UI-STANDARDS.md §rarity): the ONE rarity language — which layers each tier mounts,
// the calm grid profile, and that every tier the game renders has a row in the CSS table + the colour
// comes from a token (exotic is ONE colour everywhere).

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RarityFx, rfxClass } from './RarityFx';
import { RARITY_COLOR, RARITY_ORDER } from '../../core/equipment';
import { RARITIES } from '../../core/loot';
import { WARDROBE_RARITY_COLOR } from '../../core/wardrobe';
import { REPO_ROOT } from '../../dev/docSync';

const html = (rarity: string, extra: Record<string, boolean> = {}): string => renderToStaticMarkup(createElement(RarityFx, { rarity, ...extra }));
const count = (s: string, cls: string): number => s.split(`class="${cls}"`).length - 1;

describe('RarityFx — layers scale with the tier', () => {
  it('common: glow + glint only; rare adds the edge; epic+ motes; legendary+ crown', () => {
    expect(count(html('common'), 'rfx-edge')).toBe(0);
    expect(html('common')).toContain('rfx-glow');
    expect(html('common')).toContain('rfx-sheen');
    expect(count(html('rare'), 'rfx-edge')).toBe(1);
    expect(html('rare')).not.toContain('rfx-motes');
    expect(html('epic')).toContain('rfx-motes');
    expect(html('epic')).not.toContain('rfx-crown');
    expect(html('legendary')).toContain('rfx-crown');
    expect(html('exotic')).toContain('rfx-crown');
  });

  it('grid (lite) profile stays calm at scale: no motes, no crown, edge only from legendary up', () => {
    for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'exotic', 'mythic']) {
      const s = html(r, { lite: true });
      expect(s, r).not.toContain('rfx-motes');
      expect(s, r).not.toContain('rfx-crown');
    }
    expect(html('epic', { lite: true })).not.toContain('rfx-edge');
    expect(html('legendary', { lite: true })).toContain('rfx-edge');
  });

  it('flash is opt-in; crown can be suppressed; unknown tiers degrade to glow + glint', () => {
    expect(html('epic')).not.toContain('rfx-flash');
    expect(html('epic', { flash: true })).toContain('rfx-flash');
    expect(html('legendary', { crown: false })).not.toContain('rfx-crown');
    const unknown = html('transcendent');
    expect(unknown).toContain('rfx-glow');
    expect(unknown).not.toContain('rfx-edge');
  });

  it('host class names the tier (and the grid profile)', () => {
    expect(rfxClass('epic')).toBe('rfx rfx-epic');
    expect(rfxClass('epic', true)).toBe('rfx rfx-epic rfx-lite');
  });
});

describe('one rarity palette', () => {
  const css = readFileSync(join(REPO_ROOT, 'src/index.css'), 'utf8');
  it('every rendered tier has a row in the RARITY FX table', () => {
    const tiers = new Set<string>([...RARITY_ORDER, ...RARITIES.map((r) => r.id), ...Object.keys(WARDROBE_RARITY_COLOR), 'uncommon']);
    for (const t of tiers) expect(css.includes(`.rfx-${t} `) || css.includes(`.rfx-${t}{`), `missing .rfx-${t} row`).toBe(true);
  });
  it('exotic is ONE token everywhere (it was --viral on gear, teal in the art, pink on draft cards)', () => {
    expect(RARITY_COLOR.exotic).toBe('var(--r-exotic)');
    for (const v of Object.values(WARDROBE_RARITY_COLOR)) expect(v.startsWith('var(--r-')).toBe(true);
  });
});
