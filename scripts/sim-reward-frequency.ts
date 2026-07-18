// REWARD FREQUENCY SIMULATION (docs/REWARD-FREQUENCY.md) — npm run sim:frequency.
// Walks every persona's typical session minute-by-minute (core/rewardFrequency.ts — beat
// rates derived from the live registries/curves), prints the hour map + fatigue metrics,
// and enforces the FREQUENCY_BANDS contract. Exit 1 on any violation — the same gate the
// test suite runs, here with the full diagnostic view.

import {
  DEAD_WINDOW_MIN, FREQUENCY_BANDS, FREQUENCY_PERSONAS, INTERACTION_VERBS,
  measureSession, missionCompletesPerHour, passLevelsPerHour, personaHour,
  rewardFrequencyProblems, runsPerHourOf, walkSession,
} from '../src/core/rewardFrequency';

console.log('REWARD FREQUENCY SIMULATION — interactions/hour per persona (value untouched)\n');
console.log(`bands: ${FREQUENCY_BANDS.perHour.floor}–${FREQUENCY_BANDS.perHour.ceiling}/hour · dead window > ${FREQUENCY_BANDS.maxGapMin}min fails · taps/interaction ≤ ${FREQUENCY_BANDS.tapsPerInteraction} · choices ${FREQUENCY_BANDS.choicesPerHour.floor}–${FREQUENCY_BANDS.choicesPerHour.ceiling}/h · peak ≤ ${FREQUENCY_BANDS.peakPerMinute}/min\n`);

for (const p of FREQUENCY_PERSONAS) {
  const m = personaHour(p);
  console.log(`── ${p.id} ${p.premium ? '(premium)' : '(free)'} — ${p.sessionMinutes}min session · ${runsPerHourOf(p).toFixed(1)} runs/h · quests ${missionCompletesPerHour(p).toFixed(2)}/h · pass ${passLevelsPerHour(p).toFixed(1)} lv/h`);
  console.log(`   ${m.perHour.toFixed(1)} interactions/hour · max gap ${m.maxGapMin}min · dead windows(≥${DEAD_WINDOW_MIN}m) ${m.deadWindows.toFixed(2)} · taps/i ${m.tapsPerInteraction.toFixed(2)} · choices ${m.choicesPerHour.toFixed(1)}/h · peak ${m.peakPerMinute}/min · verbs ${m.verbSpread}/10`);
  const verbs = INTERACTION_VERBS.map((v) => `${v} ${m.byVerb[v].toFixed(1)}`).join(' · ');
  console.log(`   ${verbs}`);
  // One seed's literal minute map — the momentum picture a designer reads at a glance.
  const beats = walkSession(p, 7);
  const perMin = new Array<number>(p.sessionMinutes).fill(0);
  for (const b of beats) perMin[Math.min(p.sessionMinutes - 1, b.minute)] += 1;
  const bars = perMin.map((n) => (n === 0 ? '·' : n === 1 ? '▁' : n === 2 ? '▃' : n <= 4 ? '▅' : '█')).join('');
  console.log(`   [${bars}]\n`);
}

const problems = rewardFrequencyProblems();
if (problems.length > 0) {
  console.error('FREQUENCY CONTRACT VIOLATIONS:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('ALL PERSONAS INSIDE THE BANDS — momentum floor met, no dead windows, fatigue ceilings hold.');
