// SITE FRESHNESS CONTRACT (docs/CHANGELOG-PIPELINE.md §freshness) — the committed Chronicle
// artifacts must never drift apart. The ledger is the source of truth; releases.gen.ts (the
// in-game briefing), site/patchnotes.json (the website data) and public/news/index.html (the
// rendered page) are all regenerated from it by `npm run site`. If any of them lags — someone
// edited the ledger by hand, or ran `npm run notes` without the site render — this suite goes
// red, exactly like the DIL graph drift test. Deploys then carry provably-current notes
// (plus the CI ephemeral re-run for the final commit).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASES } from './releases.gen';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string): string => fs.readFileSync(path.join(root, p), 'utf8');

interface LedgerRelease { id: string; date: string; title: string; sealed: boolean; entries: { cat: string; text: string }[] }

function newestLedgerRelease(): LedgerRelease {
  const ledger = JSON.parse(read('changelog/ledger.json')) as { releases: LedgerRelease[] };
  expect(ledger.releases.length).toBeGreaterThan(0);
  return ledger.releases[ledger.releases.length - 1];
}

describe('Chronicle site sync (regen drift gate — run `npm run site`)', () => {
  it('releases.gen.ts carries the ledger newest release verbatim (id + entry count)', () => {
    const newest = newestLedgerRelease();
    expect(RELEASES[0].id).toBe(newest.id);
    expect(RELEASES[0].entries.length).toBe(newest.entries.length);
    expect(RELEASES[0].title).toBe(newest.title);
  });

  it('site/patchnotes.json is regenerated from the same ledger state', () => {
    const newest = newestLedgerRelease();
    const site = JSON.parse(read('site/patchnotes.json')) as { date: string; title: string; items: unknown[] }[];
    expect(site.length).toBeGreaterThan(0);
    expect(site[0].date).toBe(newest.date);
    expect(site[0].title).toBe(newest.title);
    expect(site[0].items.length).toBe(newest.entries.length);
  });

  it('the rendered /news/ page contains the newest release (date + title + a real entry)', () => {
    const newest = newestLedgerRelease();
    const html = read('public/news/index.html');
    // The page renders human dates ("July 19, 2026") — accept either that or the ISO form.
    const human = new Date(`${newest.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    expect(html.includes(newest.date) || html.includes(human)).toBe(true);
    expect(html).toContain(newest.title);
    // A concrete entry from the newest release must appear on the page (HTML-escape tolerant:
    // compare on a marker slice free of &<>" characters).
    const sample = newest.entries[0].text.replace(/[&<>"']/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' ');
    if (sample.length > 8) expect(html.replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ')).toContain(sample);
  });

  it('an auto-seal candidate never lingers: the open release is dated no earlier than the newest history row', () => {
    // gen-notes auto-seals by calendar date — an UNSEALED release older than the newest
    // processed commit day means `npm run notes` has not run since that day's first commit.
    const ledger = JSON.parse(read('changelog/ledger.json')) as { releases: LedgerRelease[]; history: { date: string }[] };
    const open = ledger.releases[ledger.releases.length - 1];
    if (!open.sealed && ledger.history.length > 0) {
      const newestHistory = ledger.history[ledger.history.length - 1].date;
      expect(open.date >= newestHistory).toBe(true);
    }
  });
});
