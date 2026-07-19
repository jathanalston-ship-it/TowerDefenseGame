// MEGA FIGHT-TIMELINE PROBE (docs/MEGA-BOSS.md §feel) — the rebuild-decision instrument.
// Runs REAL fights (full board + hero, live wave plans) and measures what the player's HP
// bar actually does, so "the boss just stops" is a number, not a feeling:
//   • uptime        — % of the fight where boss hp is visibly falling
//   • longest flat  — the worst continuous stretch with NO net hp loss (+ its cause split:
//                     regen outpacing chip vs nothing landing at all)
//   • organ cadence — windows opened / burst / expired, mean gap between openings
//   • rotation      — telegraphs, interrupts, staggers, siege lashes
//   • pacing        — per-phase seconds, kill time vs the reward model's expected bar,
//                     death-sequence seconds, waves held (non-campaign wave-block rule)
// Run: npm run sim:mega  (exit 1 when any run breaks the feel thresholds below)
import { Game } from '../src/core/game';
import { SIM_DT } from '../src/core/config';
import { towerSlots } from '../src/core/map';
import { MEGA, megaExpectedKillSec, type MegaRuntime } from '../src/core/megaboss';
import type { MetaModifiers, TowerKind } from '../src/core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const BOARD: TowerKind[] = ['needle', 'mortar', 'coil', 'maw', 'spitfang', 'reactor', 'parasite', 'siphon'];

// Feel thresholds (the contract this probe enforces — tune here, in one place).
// Campaign is CHUNKY by design: the mega only fights DURING waves (prep/draft freeze the
// whole sim — that pause is the player's, not the fight's, so the probe excludes it) and
// mid-wave the guns split between defense duty and the raid, so its bar pauses longer than
// the continuous modes — but the drought valve caps any organ drought at ~organDroughtSec,
// and it must still DIE well inside the timeout. Infinite/rush hold the tight thresholds.
const THRESH = {
  campaign: { maxFlat: 26, minUptime: 0.3 },
  continuous: { maxFlat: 12, minUptime: 0.5 },
} as const;
const TIMEOUT_SEC = 600;

interface Guts { mega: MegaRuntime | null }

interface Report {
  label: string;
  killSec: number | null; // null = timeout
  expectedSec: number;
  uptime: number;
  longestFlat: number;
  flatRegenShare: number; // of all flat seconds, how many had active regen (the honest cause)
  phases: { phase: number; sec: number }[];
  windows: { opened: number; burst: number; expired: number; meanGapSec: number };
  rotation: { telegraphs: number; interrupts: number; staggers: number; lashes: number };
  deathSec: number;
  wavesDuring: number;
  ok: boolean;
  notes: string[];
}

function fight(label: string, mode: 'campaign' | 'endless' | 'bossRush', defId: string, tier: number, seed: number): Report {
  const th = mode === 'campaign' ? THRESH.campaign : THRESH.continuous;
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { mode });
  g.god = true; // pacing is the subject, not survival
  g.debugAddBiomass(20000);
  let placed = 0;
  const forward = [...towerSlots].sort((a, b) => a.y - b.y);
  for (const s of forward) if (g.placeTower(BOARD[placed % BOARD.length], s.x, s.y) && ++placed >= 10) break;
  g.spawnMegaBoss({ defId, tier }, mode === 'campaign' ? 'campaign' : mode === 'bossRush' ? 'bossRush' : 'infinite');
  g.startWave();
  const rt = (g as unknown as Guts).mega!;
  const def = { expected: megaExpectedKillSec(tier, 0, 0) };

  let t = 0; // wall clock (timeout guard)
  let fightSec = 0; // live combat seconds — the timeline every metric is measured on
  let lastHp = rt.hp;
  let upTicks = 0;
  let fightTicks = 0;
  let flatRun = 0;
  let longestFlat = 0;
  let flatTicks = 0;
  let flatRegenTicks = 0;
  let killAt: number | null = null;
  let deathWall = 0; // collapse-ceremony seconds (measured on the wall clock — it runs un-gated)
  const phaseAt: number[] = [0]; // fight-second each phase began
  let lastPhase = 0;
  // Organ-window tracking by object identity (state transitions polled per tick).
  const wpState = new Map<object, string>();
  let opened = 0;
  let burst = 0;
  let expired = 0;
  const openGaps: number[] = [];
  let lastOpenAt = 0;
  let telegraphs = 0;
  let hadTelegraph = false;
  const wave0 = g.waveIndex;

  while (t < TIMEOUT_SEC) {
    // Play the between-wave beats like an impatient player: the campaign draft PAUSES the
    // whole sim until a card is picked, and prep waits for a start — neither is fight time.
    if (g.phase === 'draft' && g.draft !== null && g.draft.length > 0) g.chooseCard(g.draft[0].id);
    if (g.phase === 'prep') g.startWave();
    const simT0 = g.time;
    g.advance(SIM_DT);
    t += SIM_DT;
    const mega = (g as unknown as Guts).mega;
    if (mega === null) break; // death sequence finished
    if (mega.deathT > 0) { killAt ??= fightSec; deathWall += SIM_DT; continue; } // dying — collapse plays out
    // Only LIVE combat ticks enter the timeline: the settle beat freezes the sim clock and
    // prep/draft freeze the mega itself (campaign chunkiness is the player's pacing, not
    // the fight's). Skipped ticks leave lastHp alone so a between-beat hero chip still
    // registers as movement on re-entry.
    if (g.phase !== 'wave' || g.time <= simT0) continue;
    fightSec += SIM_DT;
    fightTicks++;
    // HP-bar truth: falling vs flat (and WHY flat — regen active vs nothing landing).
    const falling = mega.hp < lastHp - 1e-6;
    if (falling) {
      upTicks++;
      if (flatRun > longestFlat) longestFlat = flatRun;
      flatRun = 0;
    } else {
      flatRun += SIM_DT;
      flatTicks++;
      // Cause attribution: regen was free to run during this flat tick (un-suppressed and
      // below max) — the honest split between "healing outpaced chip" and "nothing landed".
      if (g.time >= mega.regenOffUntil && mega.hp < mega.maxHp) flatRegenTicks++;
    }
    lastHp = mega.hp;
    if (mega.phase !== lastPhase) { phaseAt.push(fightSec); lastPhase = mega.phase; }
    // Window lifecycle edges.
    for (const wp of mega.weakPoints) {
      const prev = wpState.get(wp);
      if (wp.state === 'open' && prev !== 'open') {
        opened++;
        if (lastOpenAt > 0) openGaps.push(fightSec - lastOpenAt);
        lastOpenAt = fightSec;
      } else if (wp.state === 'destroyed' && prev === 'open') burst++;
      else if (wp.state === 'closed' && prev === 'open') expired++;
      wpState.set(wp, wp.state);
    }
    // Telegraph edges.
    const teleNow = mega.telegraph !== null;
    if (teleNow && !hadTelegraph) telegraphs++;
    hadTelegraph = teleNow;
  }
  if (flatRun > longestFlat) longestFlat = flatRun;
  const uptime = fightTicks > 0 ? upTicks / fightTicks : 0;
  const phases = phaseAt.map((at, i) => ({ phase: i + 1, sec: Math.round(((phaseAt[i + 1] ?? killAt ?? fightSec) - at) * 10) / 10 }));
  const notes: string[] = [];
  if (killAt === null) notes.push('TIMEOUT — never killed');
  if (longestFlat > th.maxFlat) notes.push(`flat stretch ${longestFlat.toFixed(1)}s > ${th.maxFlat}s`);
  if (uptime < th.minUptime) notes.push(`uptime ${(uptime * 100).toFixed(0)}% < ${th.minUptime * 100}%`);
  return {
    label,
    killSec: killAt !== null ? Math.round(killAt) : null,
    expectedSec: Math.round(def.expected),
    uptime,
    longestFlat,
    flatRegenShare: flatTicks > 0 ? flatRegenTicks / flatTicks : 0,
    phases,
    windows: {
      opened, burst, expired,
      meanGapSec: openGaps.length > 0 ? Math.round((openGaps.reduce((a, b) => a + b, 0) / openGaps.length) * 10) / 10 : 0,
    },
    rotation: { telegraphs, interrupts: rt.interrupts, staggers: rt.staggers, lashes: rt.lashes },
    deathSec: Math.round(deathWall * 10) / 10,
    wavesDuring: g.waveIndex - wave0,
    ok: killAt !== null && longestFlat <= th.maxFlat && uptime >= th.minUptime,
    notes,
  };
}

const runs: Report[] = [
  fight('voraxis · campaign t1 (the user repro)', 'campaign', 'voraxis', 1, 41),
  fight('voraxis · infinite t1 (wave-held)', 'endless', 'voraxis', 1, 42),
  fight('voraxis · boss rush t1', 'bossRush', 'voraxis', 1, 43),
  fight('meridia · infinite t1', 'endless', 'meridia', 1, 44),
  fight('voraxis · infinite t3 (deep tier)', 'endless', 'voraxis', 3, 45),
];

console.log(`mega fight-timeline probe — flat ≤ ${THRESH.continuous.maxFlat}s / uptime ≥ ${THRESH.continuous.minUptime * 100}% (campaign, chunky by design: ≤ ${THRESH.campaign.maxFlat}s / ≥ ${THRESH.campaign.minUptime * 100}%)\n`);
for (const r of runs) {
  console.log(`▸ ${r.label} ${r.ok ? '— PASS' : '— ⚠ ' + r.notes.join(' · ')}`);
  console.log(`    kill ${r.killSec !== null ? r.killSec + 's' : 'TIMEOUT'} (reward bar ~${r.expectedSec}s) · death seq ${r.deathSec}s · waves during: ${r.wavesDuring}`);
  console.log(`    hp-bar uptime ${(r.uptime * 100).toFixed(0)}% · longest flat ${r.longestFlat.toFixed(1)}s (regen present in ${(r.flatRegenShare * 100).toFixed(0)}% of flat time)`);
  console.log(`    organs: ${r.windows.opened} opened → ${r.windows.burst} burst / ${r.windows.expired} expired · mean gap ${r.windows.meanGapSec}s`);
  console.log(`    rotation: ${r.rotation.telegraphs} telegraphs · ${r.rotation.interrupts} interrupts · ${r.rotation.staggers} staggers`);
  console.log(`    phases: ${r.phases.map((p) => `P${p.phase} ${p.sec}s`).join(' → ')}`);
}
const bad = runs.filter((r) => !r.ok);
console.log(bad.length === 0 ? '\nall fights inside the feel thresholds — PASS' : `\n${bad.length} fight(s) outside thresholds — investigate before any rebuild`);
process.exit(bad.length === 0 ? 0 : 1);
