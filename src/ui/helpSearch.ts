// HELP SEARCH RANKING (docs/HELP.md §search) — what the Field Manual's search box returns, in
// what order. A query matches a mechanic on its title, summary, body or category (the same
// haystack the wiki always searched), and results RANK by where the hit landed: a TITLE hit
// beats a summary hit beats a body mention — so "threat" opens The Threat Ladder, not Infinite
// (whose body merely mentions threat). Ties keep the registry's own order. Pure: no React.

import type { MechanicDef } from '../state/mechanics';
import { MECHANIC_TEXT } from '../state/mechanicsText';

const normalize = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Lower = better. 0 title starts with the query · 1 a title word starts with it · 2 the title
 *  contains it · 3 the summary contains it · 4 only the body/category does · 5 all words
 *  occur across fields (without an exact phrase) · null = no match. */
export function helpMatchTier(m: MechanicDef, q: string): number | null {
  q = normalize(q);
  const title = normalize(m.title);
  if (title.startsWith(q)) return 0;
  if (title.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1;
  if (title.includes(q)) return 2;
  const summary = normalize(m.summary);
  if (summary.includes(q)) return 3;
  const text = MECHANIC_TEXT[m.id];
  const body = normalize(`${text?.what ?? ''} ${text?.why ?? ''} ${text?.where ?? ''} ${text?.next ?? ''} ${text?.mistakes ?? ''} ${m.category}`);
  if (body.includes(q)) return 4;
  // Multi-word searches may span teaching sections; exact phrases still rank ahead.
  const haystack = `${title} ${summary} ${body}`;
  if (q.split(' ').every((word) => haystack.includes(word))) return 5;
  return null;
}

/** The mechanics matching `query`, best match first (stable within a tier). Empty query ⇒ all. */
export function searchMechanics(all: readonly MechanicDef[], query: string): MechanicDef[] {
  const q = normalize(query);
  if (!q) return [...all];
  return all
    .map((m, i) => ({ m, i, tier: helpMatchTier(m, q) }))
    .filter((r): r is { m: MechanicDef; i: number; tier: number } => r.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((r) => r.m);
}
