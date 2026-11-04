/// <reference types="vite/client" />
// CUE COVERAGE (docs/GAME-FEEL.md §feel table): every cue the game can fire must RESOLVE — to a
// synth case in audio/sound.ts or a row in the feel table (render/feel.ts FEEL) — and every
// stinger must exist in the score. A cue with neither is SILENT and feel-less: the 2026-11 audit
// found arena `victory`/`defeat` and the maw reflux `shot` failing exactly that way. This test
// statically scans src/ for cue('…') / pushSfx('…') / stinger('…') literals (ternary branches
// included) plus the data-driven cue tables, so the next silent cue fails the build instead.

import { describe, expect, it } from 'vitest';
import { FEEL } from '../render/feel';
import { STINGERS } from './music';
import { ENEMY_DEFS, TOWER_ORDER, enemyDeathCue, towerFireCue } from '../core/config';
import { branchRegistry } from '../core/branches';
import { MEGA_BOSS_DEFS } from '../core/megaboss';

const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).filter(([p]) => !/\.test\.tsx?$/.test(p) && !p.endsWith('.testutil.ts'));
const soundSrc = sources['/src/audio/sound.ts'];

/** Every `case 'x':` label of the synth switch — what can actually make a sound. */
const SOUND_CASES = new Set([...soundSrc.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]));
const resolves = (tag: string): boolean => SOUND_CASES.has(tag) || tag in FEEL;

/** The balanced-paren argument text of the call whose '(' is at `open`. */
function argsAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

/** Cue ids a call's argument text can evaluate to: the leading literal, every ternary branch
 *  literal, and the static base of a suffixed template (`flip@${n}` → flip). Comparison operands
 *  (`=== 'win'`) are NOT ids. Fully dynamic arguments yield nothing (covered by the data checks). */
function literalIds(args: string): string[] {
  const ids: string[] = [];
  for (const m of args.matchAll(/(?:^\s*|\?\s*|:\s*)'([\w-]+)'/g)) ids.push(m[1]);
  const tpl = /^\s*`([A-Za-z_]\w*)[@:~]/.exec(args);
  if (tpl) ids.push(tpl[1]);
  return ids;
}

function scan(call: RegExp): { file: string; id: string }[] {
  const out: { file: string; id: string }[] = [];
  for (const [file, src] of files) {
    for (const m of src.matchAll(call)) {
      const open = m.index! + m[0].length - 1;
      for (const id of literalIds(argsAt(src, open))) out.push({ file, id });
    }
  }
  return out;
}

describe('every cue resolves (no silent, feel-less cue ids)', () => {
  it('audio.cue(…) / pushSfx(…) literals map to a sound.ts case or a FEEL row', () => {
    const calls = [...scan(/\bcue\(/g), ...scan(/\bpushSfx\(/g)];
    expect(calls.length, 'the scanner found almost no call sites — the regex broke').toBeGreaterThan(120);
    // The scanner sees the forms that hid the audit's silent cues (a ternary + a sim pushSfx).
    expect(calls.some((c) => c.id === 'defeat' && c.file.endsWith('/ArenaView.tsx'))).toBe(true);
    expect(calls.some((c) => c.id === 'shot' && c.file.endsWith('/core/game.ts'))).toBe(true);
    expect(calls.some((c) => c.id === 'draftPick' && c.file.endsWith('/DraftModal.tsx'))).toBe(true);
    const silent = calls.filter((c) => !resolves(c.id)).map((c) => `${c.file}: '${c.id}'`);
    expect([...new Set(silent)]).toEqual([]);
  });

  it('music.stinger(…) literals and FEEL stingers exist in the score', () => {
    const calls = scan(/\bstinger\(/g);
    expect(calls.length).toBeGreaterThan(3);
    const missing = calls.filter((c) => !(c.id in STINGERS)).map((c) => `${c.file}: '${c.id}'`);
    for (const [id, row] of Object.entries(FEEL)) if (row.stinger && !(row.stinger in STINGERS)) missing.push(`FEEL.${id} → '${row.stinger}'`);
    expect(missing).toEqual([]);
  });

  it('data-driven cue tables resolve: tower fire, enemy death, branch kits, mega themes, film beats', () => {
    const bad: string[] = [];
    for (const k of TOWER_ORDER) { const c = towerFireCue(k); if (c && !resolves(c)) bad.push(`towerFireCue(${k}) → ${c}`); }
    for (const [k, def] of Object.entries(ENEMY_DEFS)) { const c = enemyDeathCue(def); if (!resolves(c)) bad.push(`enemyDeathCue(${k}) → ${c}`); }
    for (const b of branchRegistry.all()) for (const t of b.tiers) if (t.sfx && !resolves(t.sfx)) bad.push(`branch ${b.id} tier ${t.tier} → ${t.sfx}`);
    for (const [id, def] of Object.entries(MEGA_BOSS_DEFS)) if (!resolves(def.themeCue)) bad.push(`mega ${id} themeCue → ${def.themeCue}`);
    // Scripted cinematic beats (data rows fired through audio.cue).
    for (const f of ['/src/core/cutscenes.ts', '/src/ui/InitCutscene.tsx']) {
      for (const m of (sources[f] ?? '').matchAll(/\bcue: '([\w-]+)'/g)) if (!resolves(m[1])) bad.push(`${f} beat → ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it('the cues the 2026-11 audit found silent now sound', () => {
    for (const tag of ['victory', 'defeat', 'shot', 'crit', 'launch', 'draftPick', 'bossFall', 'abilityImpact', 'hover']) {
      expect(SOUND_CASES.has(tag), tag).toBe(true);
    }
  });
});
