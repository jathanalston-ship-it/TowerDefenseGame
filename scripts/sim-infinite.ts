// INFINITE WALL probe (docs/ENDLESS-SCALING.md §wall) — a REAL account plays Infinite headless the
// way a Hive-Intelligence player does, and the REAL settle counts what the run banks:
//   • the client's own run setup (App.begin → GameView options: meta modifiers, tower/hero progress,
//     gear, set effects, ability kits, run effects, class bonds, Early Call, the squeeze, the wall);
//   • one hivePulse at every prep and every few seconds mid-wave (it builds the whole board — deploys,
//     branches, merges), Auto Wave + Hive Call on, the recommended (◆ PICK) draft card;
//   • live syncRunLoot per wave + finishRun at the fall → depth, sim minutes, Bio-Containers banked.
// The owner's report (2026-11-11): a Campaign-Stage-12 account that opened every cache rode Infinite
// to depth 60 with ~250 caches; the target is a wall near depth 20 with a handful of caches.
// Run: npm run sim:infinite -- --save <export.json> [--stage N] [--seeds 3] [--max-min 60] [--no-wall]
//      tuning: [--wall-base B] [--wall-per P] [--wall-hp G]

import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game';
import { ENDLESS_WALL, SIM_DT } from '../src/core/config';
import { draftPickIndex } from '../src/core/cards';
import { meta, metaModifiers, endlessWallFor } from '../src/state/meta';
import type { RunResult } from '../src/state/meta';
import { featureRevealed } from '../src/state/unlocks';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const SAVE = arg('save');
if (!SAVE) { console.error('usage: npm run sim:infinite -- --save <export.json> [--stage N] [--seeds 3] [--max-min 60] [--no-wall]'); process.exit(2); }
const STAGE = arg('stage');
const SEEDS = Number(arg('seeds', '3'));
const MAX_SEC = Number(arg('max-min', '60')) * 60;
const WALL = !process.argv.includes('--no-wall');
// Tuning overrides (the shipped values live in config.ENDLESS_WALL): --wall-base / --wall-per / --wall-hp.
if (arg('wall-base')) ENDLESS_WALL.baseDepth = Number(arg('wall-base'));
if (arg('wall-per')) ENDLESS_WALL.perStage = Number(arg('wall-per'));
if (arg('wall-hp')) ENDLESS_WALL.hpGrowth = Number(arg('wall-hp'));
const PULSE_EVERY = 4; // sim seconds between mid-wave presses (a player tapping the pill)

function load(): void {
  const blob = JSON.parse(readFileSync(SAVE!, 'utf8'));
  if (STAGE !== undefined) blob.data.campaign = { ...blob.data.campaign, cleared: { ...blob.data.campaign.cleared, standard: Number(STAGE) } };
  const r = meta.importText(JSON.stringify(blob));
  if (!r.ok) throw new Error(`import failed: ${'error' in r ? r.error : '?'}`);
}

interface Probe { seed: number; depth: number; minutes: number; kills: number; containers: number; runCaches: number; power: number; wall: number | null }

function play(seed: number): Probe {
  load();
  const s = meta.get();
  const wall = WALL ? endlessWallFor(s) : null;
  const g = new Game(seed, metaModifiers(s), meta.towerProgress(), meta.selectedHero(), meta.heroProgress(), {
    runEffects: [...meta.genomeRunEffects(), ...meta.collectionRunEffects(), ...meta.trophyRunEffects(), ...meta.infestationRunEffects(), ...meta.cutsceneRunEffects(), ...meta.mulliganGlobalEffects(), ...meta.battlePassRunEffects(), ...meta.wardrobeRunEffects()],
    mode: 'endless',
    heroRoster: meta.fieldedLoadout(),
    heroEquip: meta.heroRosterEquip(),
    setEffects: meta.fieldedSetEffects(),
    heroAbilityKits: meta.heroAbilityKits(),
    automationAllowed: true,
    earlyCall: true,
    squeeze: true,
    ...(wall ? { endlessWall: wall } : {}),
    ...(featureRevealed(s, 'bonds') ? { classBonds: meta.bondLevels() } : {}),
    favorite: meta.favoriteTower(),
    unlocked: meta.unlockedTowers(),
  });
  g.setAutoStart(true);
  g.hivePulse();
  g.startWave();
  let lastPulse = 0;
  let lastWave = 0;
  let t = 0;
  for (; t < MAX_SEC && g.phase !== 'lost'; t += SIM_DT) {
    if (g.phase === 'draft' && g.draft && g.draft.length > 0) g.chooseCard(g.draft[draftPickIndex(g.draft)].id);
    if (g.phase === 'prep' || (g.phase === 'wave' && t - lastPulse >= PULSE_EVERY)) { g.hivePulse(); lastPulse = t; }
    g.advance(SIM_DT);
    if (g.waveIndex !== lastWave) { lastWave = g.waveIndex; meta.syncRunLoot(g.waveIndex, g.kills, true); }
  }
  const result: RunResult = { wave: g.waveIndex, kills: g.kills, won: false, mastery: g.getMasteryAccrual(), heroMastery: g.getHeroMasteryAccrual(), stats: g.getRunStats(), endless: true, durationSec: g.time };
  // What the RUN banks: the loot-meter boxes (live + settle remainder) and its run cache — not the
  // one-off quest/pass/achievement rewards the settle auto-claims (those depend on the save, not Infinite).
  const out = meta.finishRun(result);
  const banked = out.loot.banked;
  const containers = banked.filter((c) => c.kind === 'loot').length;
  const runCaches = banked.filter((c) => c.kind === 'cache').length;
  return { seed, depth: g.waveIndex, minutes: Math.round(t / 6) / 10, kills: g.kills, containers, runCaches, power: Math.round(meta.power().score), wall: wall?.depth ?? null };
}

const rows: Probe[] = [];
for (let i = 0; i < SEEDS; i++) {
  const p = play(11 + i * 8);
  rows.push(p);
  console.log(`seed ${p.seed}: depth ${p.depth}${p.minutes * 60 >= MAX_SEC ? '+ (time cap)' : ''} · ${p.minutes} min · ${p.kills} kills · ${p.containers} meter containers + ${p.runCaches} run cache · Power ${p.power} · wall ${p.wall ?? 'off'}`);
}
const mean = (k: 'depth' | 'containers'): number => Math.round((rows.reduce((a, r) => a + r[k], 0) / rows.length) * 10) / 10;
console.log(`MEAN depth ${mean('depth')} · containers ${mean('containers')} (stage ${STAGE ?? 'save'}, wall ${WALL ? 'on' : 'off'})`);
