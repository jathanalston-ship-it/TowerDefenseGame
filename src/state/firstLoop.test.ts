// THE FIRST LOOP (docs/TUTORIAL.md §first-loop): the hands-on coach for a new account's first hub
// visits. Pins: every step points at a control the UI really renders; copy stays short; the beats run
// in their run windows and NEVER for a veteran; skipping ends it for good; a finished beat archives
// what it taught; and the Command Center grows as the loop is walked (and is whole once it's done).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FIRST_LOOP, FIRST_LOOP_MAX_RUNS, beatKey, dueBeat, firstLoopDone, loopPast } from './firstLoop';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { meta } from './meta';
import { MECHANIC_BY_ID } from './mechanics';
import { homeRegistry } from '../ui/homeModel';
import { navGroups } from '../ui/navModel';
import { REPO_ROOT } from '../dev/docSync';

const uiSource = (): string => {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && !e.name.endsWith('.test.tsx')) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(REPO_ROOT, 'src/ui'));
  return out.join('\n');
};

/** A graduate (the Combat Tutorial done) with `runs` campaign runs behind them. */
const graduate = (runs: number, milestones: string[] = []): SaveData => {
  const s = defaultSave();
  s.tutorial = { ...s.tutorial, completed: ['combat'], milestones };
  s.totalRuns = runs;
  s.campaign = { cleared: { standard: runs }, bestTime: {} };
  return s;
};

describe('the first loop — every step points at something real', () => {
  const src = uiSource();
  const groups = new Set<string>(navGroups().map((g) => g.id));
  const navKeys = new Set<string>(navGroups().flatMap((g) => g.items.map((i) => i.key)));

  it('each anchor selector names a control the UI renders', () => {
    for (const beat of FIRST_LOOP) {
      for (const st of beat.steps) {
        if (!st.anchor) continue;
        for (const sel of st.anchor.split(',').map((x) => x.trim())) {
          for (const m of sel.matchAll(/\.([\w-]+)/g)) expect(src, `${beat.id}: class .${m[1]}`).toMatch(new RegExp(`className=[{"\`][^\\n]*\\b${m[1]}\\b`));
          for (const m of sel.matchAll(/\[data-([\w-]+)="([\w-]+)"\]/g)) {
            const [, attr, val] = m;
            if (attr === 'hub') expect(groups.has(val), `${beat.id}: hub group ${val}`).toBe(true); // data-hub={group.id}
            else if (attr === 'nav') expect(navKeys.has(val) || val === 'home', `${beat.id}: nav ${val}`).toBe(true); // data-nav={key}
            else if (attr === 'cur') expect(src, `${beat.id}: wallet ${val}`).toContain(`cur="${val}"`); // WalletChip → data-cur
            else expect(src, `${beat.id}: [data-${attr}="${val}"]`).toContain(`data-${attr}="${val}"`);
          }
        }
      }
    }
  });

  it('copy stays short — a step is a glance, not a lecture', () => {
    for (const beat of FIRST_LOOP) {
      expect(beat.steps.length, beat.id).toBeLessThanOrEqual(8);
      for (const st of beat.steps) {
        expect(st.title.length, st.title).toBeLessThanOrEqual(28);
        expect(st.text.length, st.text).toBeLessThanOrEqual(130);
        expect((st.text.match(/[.!?](\s|$)/g) ?? []).length, st.text).toBeLessThanOrEqual(2);
      }
    }
  });

  it('action steps are hands-on: every beat has the player click real controls', () => {
    for (const beat of FIRST_LOOP) expect(beat.steps.some((s) => s.advance === 'click'), beat.id).toBe(true);
    for (const id of FIRST_LOOP.flatMap((b) => b.teaches)) expect(MECHANIC_BY_ID.has(id), id).toBe(true);
  });
});

describe('the first loop — when it runs', () => {
  it('runs its beats in order across the first runs: deploy → grow → collect', () => {
    expect(dueBeat(graduate(0))?.id).toBe('deploy');
    expect(dueBeat(graduate(1, [beatKey('deploy')]))?.id).toBe('grow');
    expect(dueBeat(graduate(2, [beatKey('deploy')]))?.id).toBe('grow'); // a grow beat left mid-way resumes
    expect(dueBeat(graduate(2, [beatKey('deploy'), beatKey('grow')]))?.id).toBe('collect');
    expect(dueBeat(graduate(3, [beatKey('deploy'), beatKey('grow'), beatKey('collect')]))).toBeNull();
  });

  it('never for a veteran, never before the Combat Tutorial, never after a skip', () => {
    expect(dueBeat(graduate(FIRST_LOOP_MAX_RUNS))).toBeNull();
    expect(dueBeat(graduate(21))).toBeNull();
    const fresh = defaultSave(); // still in (or before) the Combat Tutorial
    expect(dueBeat(fresh)).toBeNull();
    expect(firstLoopDone(fresh)).toBe(true); // …and its board is never held bare without a coach
    expect(dueBeat(graduate(1, [beatKey('skip')]))).toBeNull();
    expect(firstLoopDone(graduate(1, [beatKey('skip')]))).toBe(true);
  });

  it('a beat waits for its wing: a lost Stage 2 holds COLLECT until the Genetic Vault opens', () => {
    const lost = graduate(2, [beatKey('deploy'), beatKey('grow')]);
    lost.campaign = { cleared: { standard: 1 }, bestTime: {} }; // two runs, one clear — the Vault (stage 2) is sealed
    expect(dueBeat(lost)).toBeNull();
    lost.campaign = { cleared: { standard: 2 }, bestTime: {} };
    expect(dueBeat(lost)?.id).toBe('collect');
  });

  it('a beat whose window closed is never shown late (the board stops waiting for it)', () => {
    expect(dueBeat(graduate(3, [beatKey('deploy')]))?.id).toBe('collect'); // grow's window (1–2) passed
    expect(loopPast(graduate(3, [beatKey('deploy')]), 'grow')).toBe(true);
  });
});

describe('the first loop — what it changes', () => {
  it('a finished beat records itself and archives what it taught (What\'s New never repeats it)', () => {
    meta.reset();
    meta.completeTutorial('combat');
    meta.completeCoachBeat('grow');
    const s = meta.get();
    expect(s.tutorial.milestones).toContain(beatKey('grow'));
    for (const id of FIRST_LOOP.find((b) => b.id === 'grow')!.teaches) expect(s.help.seen).toContain(id);
    meta.completeCoachBeat('grow'); // idempotent
    expect(meta.get().tutorial.milestones.filter((m) => m === beatKey('grow'))).toHaveLength(1);
    meta.skipFirstLoop();
    expect(dueBeat(meta.get())).toBeNull();
    meta.reset();
  });

  it('the Command Center grows with the loop: a short board while coached, the whole board after', () => {
    const ids = (s: SaveData): string[] => (['main', 'side', 'feed'] as const).flatMap((z) => homeRegistry.zone(s, z).map((w) => w.id));
    const coached = graduate(1, [beatKey('deploy')]);
    const whole = graduate(1, [beatKey('skip')]);
    for (const id of ['recommend', 'forecast', 'live-events', 'roadmap', 'dashboard']) {
      expect(ids(coached), id).not.toContain(id);
      expect(ids(whole), id).toContain(id);
    }
    expect(ids(coached)).toContain('mission-control'); // the deploy card is always there
  });
});
