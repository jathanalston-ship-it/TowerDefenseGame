// MOBILE CONTENT CONTRACT — the data half of "new content is automatically mobile-fit"
// (the layout half is `npm run mobilecheck`, wired into `npm run validate`).
//
// Every player-facing label flows into layouts proven at 320px. These caps are the
// widths those layouts actually accommodate: a 60-char tower name would ellipsize or
// wrap into soup on a phone no matter how good the CSS is. Adding content that trips
// this test means the CONTENT must shorten — not the layout loosen.

import { describe, expect, it } from 'vitest';
import { TOWER_DEFS, HERO_DEFS, ENEMY_DEFS, META_UPGRADES } from '../core/config';
import { CARD_POOL } from '../core/cards';
import { BIOMES } from '../core/biomes';
import { megaBossRegistry } from '../core/megaboss';

const NAME_MAX = 26; // fits the narrowest card/rail header at 320px without ellipsis
const DESC_MAX = 240; // fits the tallest description well at phone line lengths

function checkNames(kind: string, rows: { name: string; desc?: string; description?: string; blurb?: string }[]): void {
  for (const r of rows) {
    expect(r.name.length, `${kind} name too long for phone layouts: "${r.name}"`).toBeLessThanOrEqual(NAME_MAX);
    const d = r.desc ?? r.description ?? r.blurb;
    if (typeof d === 'string') {
      expect(d.length, `${kind} "${r.name}" description too long for phone layouts (${d.length})`).toBeLessThanOrEqual(DESC_MAX);
    }
  }
}

describe('mobile content contract (name/description caps)', () => {
  it('towers', () => checkNames('tower', Object.values(TOWER_DEFS)));
  it('heroes', () => checkNames('hero', Object.values(HERO_DEFS)));
  it('enemies', () => checkNames('enemy', Object.values(ENEMY_DEFS)));
  it('gene cards', () => checkNames('card', CARD_POOL));
  it('meta upgrades', () => checkNames('upgrade', META_UPGRADES));
  it('biomes', () => checkNames('biome', BIOMES));
  it('mega bosses', () => checkNames('mega', megaBossRegistry.all()));
});
