// Generate site/patchnotes.json from the development history (docs/WEBSITE.md §patch-notes).
//   npm run site:patchnotes   (also runs as part of `npm run site`)
// Commits are classified into player-facing categories by subject keywords, grouped by day,
// newest first. Pure chore/merge noise is dropped. The JSON is COMMITTED (the Pages build
// machine has no git history), and /news/ renders it with client-side search.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

interface Item { cat: string; text: string }
interface Entry { date: string; title: string; categories: string[]; items: Item[] }

const RULES: [RegExp, string][] = [
  [/balance|tunab|cost|damage|nerf|buff/i, 'Balance'],
  [/hero|revenant|ravager|shepherd|overseer|vitriol|equipment|gear|armory/i, 'Heroes'],
  [/tower|spitfang|rift|siphon|coil|sower|branch|strain|star path/i, 'Towers'],
  [/boss|mega/i, 'Bosses'],
  [/audio|music|sound|sfx|hymn|score/i, 'Audio'],
  [/cinematic|cutscene|intro|tutorial|onboard/i, 'Onboarding'],
  [/render|visual|vfx|art|anim|gore|battlefield|terrain|cosmetic|skin/i, 'Visuals'],
  [/ui|hud|screen|panel|menu|codex|lab\b/i, 'UI'],
  [/perf|optimi|cache|lod|pool/i, 'Performance'],
  [/fix|bug|crash|repair/i, 'Bug Fixes'],
  [/daily|infinite|rush|campaign|expedition|mode/i, 'Modes'],
  [/card|gene|draft|mulligan|prestige|collection|mastery|progress/i, 'Progression'],
  [/save|schema|migration|cloud|account/i, 'Saves'],
  [/site|website|seo|adsense|domain|welcome/i, 'Website'],
  [/doc|readme|manifest\.md/i, 'Documentation'],
  [/test|golden|registry|refactor|chore|internal/i, 'Internal Framework'],
  [/secur|csp|auth/i, 'Security'],
];
const NOISE = /^(merge|wip)\b|^chore\(release\)|^bump\b/i;

function classify(subject: string): string {
  for (const [rx, cat] of RULES) if (rx.test(subject)) return cat;
  return 'Content';
}

const log = execSync('git log --date=short --pretty=format:%ad%s -n 400', { encoding: 'utf8' });
const byDay = new Map<string, Item[]>();
for (const line of log.split('\n')) {
  const [date, subject] = line.split('');
  if (!date || !subject || NOISE.test(subject)) continue;
  const text = subject.replace(/\s*\(#\d+\)\s*$/, '').trim();
  if (!byDay.has(date)) byDay.set(date, []);
  byDay.get(date)!.push({ cat: classify(text), text });
}

const entries: Entry[] = [...byDay.entries()]
  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
  .slice(0, 45)
  .map(([date, items]) => {
    const categories = [...new Set(items.map((i) => i.cat))];
    const headline = items[0]?.text ?? 'Maintenance';
    const title = items.length > 1 ? `${headline.split(/[—:]/)[0].trim()} + ${items.length - 1} more` : headline;
    return { date, title, categories, items };
  });

writeFileSync('site/patchnotes.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`gen-patchnotes: ${entries.length} daily entries (${[...byDay.values()].flat().length} changes) → site/patchnotes.json`);
