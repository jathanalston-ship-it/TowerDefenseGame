// TOUCH-REACHABLE TOP BAR (docs/UI-STANDARDS.md §touch-info) — a `title=` tooltip is hover-only,
// so on a phone it answers nothing. Every top-bar essential (each wallet chip, the Materials
// chip, the account level) must be a real BUTTON that opens an explanation; and the top bar's
// own markup in the Hub may not smuggle in a title-only chip. Scoped to the essentials on
// purpose — the wider `title=` surface is a separate, gradual sweep.

import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { WalletChip } from './WalletChip';
import { MaterialsChip } from './MaterialsChip';
import { AccountXpBar } from './AccountXpBar';
import { defaultSave } from '../../save/saveStore';

const base = defaultSave();
// A veteran save (every wallet revealed) holding some materials — the chip renders only then.
const save = { ...base, campaign: { ...base.campaign, cleared: { standard: 30 } }, mats: { mutagen: 3, scrap: 2, catalyst: 1 } };
const ESSENTIALS: [string, ReactElement][] = [
  ['Genome Cores chip', createElement(WalletChip, { cur: 'genomeCores', value: 1200, label: 'Genome Cores' })],
  ['Ichor chip', createElement(WalletChip, { cur: 'ichor', value: 40, label: 'Ichor' })],
  ['Cells chip', createElement(WalletChip, { cur: 'ascendantCells', value: 3, label: 'Cells' })],
  ['Materials chip', createElement(MaterialsChip, { save })],
  ['Account Level chip', createElement(AccountXpBar, { compact: true })],
];

describe('top bar — essentials answer on tap, not only on hover', () => {
  it.each(ESSENTIALS)('%s is a button that opens an explanation', (_name, el) => {
    const html = renderToStaticMarkup(el);
    expect(html, 'must render a tappable <button aria-expanded>').toMatch(/<button[^>]*aria-expanded="false"/);
    // The wrapper itself may not lean on a hover tooltip for its meaning.
    const root = html.slice(0, html.indexOf('>') + 1);
    expect(root, 'the chip wrapper must not be title-only').not.toMatch(/\btitle=/);
  });

  it('the Hub top bar renders no raw title-only chips', () => {
    const hub = readFileSync('src/ui/Hub.tsx', 'utf-8');
    const start = hub.indexOf('<header className="hub-topbar"');
    expect(start, 'top bar not found in Hub.tsx').toBeGreaterThan(0);
    const bar = hub.slice(start, hub.indexOf('</header>', start));
    expect(bar).not.toMatch(/\btitle=/);
  });
});
