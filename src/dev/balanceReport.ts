// THE BALANCE REPORT ENGINE (docs/SIMULATION-FRAMEWORK.md) — the permanent, automated
// progression-health instrument. Runs the persona matrix through the REAL-meta simulator
// (progressionSim), measures pacing/dopamine/economy health per persona-band, detects
// bottlenecks automatically, and renders docs/BALANCE_REPORT.md ranked by severity.
//
// ⚠ REPORT-ONLY BY DESIGN: this module never mutates balance values, never writes to
// config, never "fixes" anything. Every bottleneck is surfaced for a HUMAN to review —
// suggested solutions are candidate directions, not applied changes. (The change protocol
// stays docs/BALANCE_ARCHITECTURE.md §4: propose → simulate → check invariants → record.)
//
// Dev-only (src/dev/* is never imported by app code). Consumers: balanceReport.test.ts
// (small-matrix CI pins) and scripts/sim-balance-report.ts (the full report generator).

import { simulateAccount } from './progressionSim';
import type { SimCheckpoint, SimTrace } from './progressionSim';
import { PERSONAS } from './personas';
import type { Persona } from './personas';

// ── Matrix runner ─────────────────────────────────────────────────────────────────────

export interface PersonaRun {
  persona: Persona;
  traces: SimTrace[]; // one per seed
}

/** Run every persona × seed through the simulator. Personas cap their own horizon
 *  (`maxHours`) — a fresh account is only measured where fresh accounts live. */
export function runMatrix(bands: number[], seeds: number[], personas: Persona[] = Object.values(PERSONAS)): PersonaRun[] {
  return personas.map((persona) => ({
    persona,
    traces: seeds.map((seed) =>
      simulateAccount(seed, bands.filter((b) => b <= persona.maxHours), persona)),
  }));
}

// ── Bottleneck detection ──────────────────────────────────────────────────────────────

export type BottleneckKind =
  | 'dead-zone' // farming, but power barely moves
  | 'wall-stall' // stuck at the same frontier, readiness flat
  | 'dopamine-gap' // a band with almost no acquisitions (the unlock cadence collapses)
  | 'sink-exhaustion' // Genome Cores compound with nothing to buy
  | 'currency-shortage' // broke AND stuck (income starvation at the frontier)
  | 'power-spike' // a single band jumps far beyond the loop's texture
  | 'grind-saturation' // nearly every run is a farm run for a whole band
  | 'push-futility'; // campaign-focused: most under-ready pushes fail (wasted sessions)

export interface Bottleneck {
  kind: BottleneckKind;
  personaId: string;
  band: string; // "50h→150h"
  bandStart: number;
  frequency: number; // share of seeds that hit it (0..1)
  severity: 'critical' | 'major' | 'minor';
  score: number; // the ranking key (frequency × band weight × kind weight)
  confidence: 'High' | 'Medium' | 'Low';
  frustration: string; // estimated player feeling, in words
  evidence: string; // supporting numbers pulled from the traces
}

/** How structurally damaging each kind is (multiplies the ranking score). */
const KIND_WEIGHT: Record<BottleneckKind, number> = {
  'wall-stall': 1.6, 'dead-zone': 1.5, 'currency-shortage': 1.4, 'dopamine-gap': 1.2,
  'push-futility': 1.0, 'grind-saturation': 0.9, 'sink-exhaustion': 0.8, 'power-spike': 0.7,
};

const FRUSTRATION: Record<BottleneckKind, string> = {
  'dead-zone': 'High — sessions end with the same numbers they started with.',
  'wall-stall': 'Very high — the next goal is visible and refuses to get closer.',
  'dopamine-gap': 'Moderate-high — nothing new to click on for hours erodes the return habit.',
  'sink-exhaustion': 'Moderate — earning feels pointless once the wallet only goes up.',
  'currency-shortage': 'High — every screen says "can\'t afford" while the wall stands.',
  'power-spike': 'Low-moderate — thrilling once, but it flattens the ramp that follows.',
  'grind-saturation': 'Moderate — the loop reads as "farm forever", not "farm to return".',
  'push-futility': 'High for this persona — repeated failed attempts feel like a rigged door.',
};

function confidenceOf(freq: number, seeds: number): Bottleneck['confidence'] {
  if (seeds >= 4 && freq >= 0.75) return 'High';
  if (freq >= 0.4) return 'Medium';
  return 'Low';
}

/** Per persona-band detector pass over all seeds — one Bottleneck per (kind, band) that fires. */
export function detectBottlenecks(runs: PersonaRun[]): Bottleneck[] {
  const out: Bottleneck[] = [];
  for (const { persona, traces } of runs) {
    if (traces.length === 0 || traces[0].checkpoints.length < 2) continue;
    const nBands = Math.min(...traces.map((t) => t.checkpoints.length));
    for (let i = 1; i < nBands; i++) {
      const pairs = traces.map((t) => [t.checkpoints[i - 1], t.checkpoints[i]] as const);
      const [a0, b0] = pairs[0];
      const band = `${a0.hours}h→${b0.hours}h`;
      const bandHours = b0.hours - a0.hours;
      // Band weight: what happens in the first 50 hours shapes retention hardest.
      const bandWeight = a0.hours < 50 ? 1.5 : a0.hours < 400 ? 1.0 : 0.8;
      const hit = (kind: BottleneckKind, pred: (a: SimCheckpoint, b: SimCheckpoint) => boolean, evidence: (hits: (readonly [SimCheckpoint, SimCheckpoint])[]) => string): void => {
        const hits = pairs.filter(([a, b]) => pred(a, b));
        if (hits.length === 0) return;
        const freq = hits.length / pairs.length;
        const score = freq * bandWeight * KIND_WEIGHT[kind];
        out.push({
          kind, personaId: persona.id, band, bandStart: a0.hours, frequency: Number(freq.toFixed(2)),
          severity: freq >= 0.66 && KIND_WEIGHT[kind] >= 1.2 ? 'critical' : freq >= 0.33 ? 'major' : 'minor',
          score: Number(score.toFixed(3)),
          confidence: confidenceOf(freq, pairs.length),
          frustration: FRUSTRATION[kind],
          evidence: evidence(hits),
        });
      };

      hit('dead-zone', (a, b) => b.farmRuns > a.farmRuns && b.power < a.power * 1.01,
        (h) => `power ${h[0][0].power}→${h[0][1].power} across ${h[0][1].farmRuns - h[0][0].farmRuns} farm runs (seed ${traces[pairs.indexOf(h[0])]?.seed ?? '?'})`);
      hit('wall-stall', (a, b) => b.farmRuns > a.farmRuns && b.stage === a.stage && b.readiness <= a.readiness + 0.005,
        (h) => `stage ${h[0][1].stage} for the whole band; readiness ${h[0][0].readiness}→${h[0][1].readiness}`);
      hit('dopamine-gap', (a, b) => (b.unlocks - a.unlocks) / bandHours < 0.5 && b.runs > a.runs,
        (h) => `${h[0][1].unlocks - h[0][0].unlocks} acquisitions in ${bandHours}h (${((h[0][1].unlocks - h[0][0].unlocks) / bandHours).toFixed(2)}/h)`);
      hit('sink-exhaustion', (a, b) => a.unspentShards > 5000 && b.unspentShards > a.unspentShards * 2,
        (h) => `unspent Cores ${h[0][0].unspentShards}→${h[0][1].unspentShards}`);
      hit('currency-shortage', (a, b) => b.unspentShards < 50 && b.stage === a.stage && b.runs > a.runs,
        (h) => `wallet ≈${h[0][1].unspentShards} Cores while stage held at ${h[0][1].stage}`);
      // Power spike = a DISCONTINUITY, not the curve: bands are wide (250h late), so the whole
      // cohort legitimately grows many-fold inside one. Only a seed leaping far beyond its own
      // cohort's median growth for the same band flags (single-seed cohorts can never flag —
      // a discontinuity needs a baseline).
      const growths = pairs.map(([a, b]) => b.power / Math.max(1, a.power)).sort((x, y) => x - y);
      const medianGrowth = growths[Math.floor(growths.length / 2)];
      hit('power-spike', (a, b) => b.power / Math.max(1, a.power) > Math.max(2, medianGrowth * 3),
        (h) => `power ×${(h[0][1].power / Math.max(1, h[0][0].power)).toFixed(1)} vs cohort median ×${medianGrowth.toFixed(1)} for the band`);
      hit('grind-saturation', (a, b) => b.runs > a.runs && (b.farmRuns - a.farmRuns) / Math.max(1, b.runs - a.runs) > 0.9,
        (h) => `${h[0][1].farmRuns - h[0][0].farmRuns}/${h[0][1].runs - h[0][0].runs} runs were farm runs`);
      hit('push-futility', (a, b) => b.failedPushes - a.failedPushes >= 3,
        (h) => `${h[0][1].failedPushes - h[0][0].failedPushes} failed frontier attempts in the band`);
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

// ── Root causes + candidate directions (rule table — kind-keyed, human-reviewed) ─────

interface Diagnosis { rootCause: string; systems: string; fixes: string[]; difficulty: 'Low' | 'Medium' | 'High' }

const DIAGNOSIS: Record<BottleneckKind, Diagnosis> = {
  'dead-zone': {
    rootCause: 'Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.',
    systems: 'Mastery curve · star/upgrade sinks · loot→power conversion',
    fixes: ['Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).',
      'Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).',
      'Extend star caps / gene levels for the affected band (content, not systems).'],
    difficulty: 'Medium',
  },
  'wall-stall': {
    rootCause: 'The campaign requirement curve outruns achievable Power growth in this band — farming no longer closes the readiness gap.',
    systems: 'Campaign gates (recommendedPowerScore) · Difficulty Director · Power sources',
    fixes: ['Soften the requirement slope across the affected stages (BALANCE_ARCHITECTURE §4 protocol).',
      'Add a band-scoped catch-up factor through DIRECTOR_ADAPTIVE (weight-0 seam; simulate first).',
      'Introduce an alternate Power source that unlocks in this band.'],
    difficulty: 'Medium',
  },
  'dopamine-gap': {
    rootCause: 'Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.',
    systems: 'Unlock pacing · achievements · next-goal engine · container cadence',
    fixes: ['Author micro-milestones (achievements/timeline beats) across the gap band.',
      'Split one large unlock into staged partial unlocks (visible progress).',
      'Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).'],
    difficulty: 'Low',
  },
  'sink-exhaustion': {
    rootCause: 'Genome Core income continues while every sink is capped out — the wallet inflates with nothing to want.',
    systems: 'Genome Core sinks (upgrades/gene slots/respec) · prestige cycle',
    fixes: ['Add a scaling repeatable sink (e.g. escalating-cost infusions) gated to the band.',
      'Route overflow into the prestige loop (deeper Ascendant tiers).',
      'Let Adaptation respec/planned Ascension consume the surplus.'],
    difficulty: 'Medium',
  },
  'currency-shortage': {
    rootCause: 'Income at the stuck frontier undershoots the next purchase tier — the player is broke AND walled simultaneously.',
    systems: 'Economy framework (income floors) · campaign rewards · loot yield',
    fixes: ['Raise the band income floor via ECONOMY_ADAPTIVE (weight-0 seam; simulate first).',
      'Add a first-clear retry consolation (partial reward on failed frontier attempts).',
      'Rebalance the affected purchase tier costs downward (protocol §4).'],
    difficulty: 'Low',
  },
  'power-spike': {
    rootCause: 'A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.',
    systems: 'Prestige payout curve · Ascendant node pricing',
    fixes: ['Smooth the payout (smaller first Molt, faster subsequent ramps).',
      'Stage the Ascendant node unlocks across several molts.'],
    difficulty: 'Medium',
  },
  'grind-saturation': {
    rootCause: 'The farm share of the loop approaches 100% for the band — Campaign returns are too rare to feel like the destination.',
    systems: 'Progression loop tuning (readiness curve) · farm yield',
    fixes: ['Tighten the farm→return interval (lower the readiness bar or raise farm yield slightly).',
      'Add band-scoped farm variety (doctrine/objective rotations) so the farm reads as choice.'],
    difficulty: 'Medium',
  },
  'push-futility': {
    rootCause: 'Under-ready frontier attempts carry near-zero win chance with full time cost — impatient players pay a heavy invisible tax.',
    systems: 'Campaign difficulty at the frontier · failure feedback',
    fixes: ['Surface the readiness estimate harder at mission start (UI, zero balance risk).',
      'Grant partial consolation rewards on failed frontier attempts.',
      'Slightly widen the winnable readiness window at low stages only.'],
    difficulty: 'Low',
  },
};

export function diagnose(kind: BottleneckKind): Diagnosis {
  return DIAGNOSIS[kind];
}

// ── Report rendering ──────────────────────────────────────────────────────────────────

const KIND_TITLE: Record<BottleneckKind, string> = {
  'dead-zone': 'Dead progression zone', 'wall-stall': 'Campaign wall stall',
  'dopamine-gap': 'Unlock-cadence gap', 'sink-exhaustion': 'Currency sink exhaustion',
  'currency-shortage': 'Currency shortage at the wall', 'power-spike': 'Power spike',
  'grind-saturation': 'Grind saturation', 'push-futility': 'Futile frontier pushes',
};

/** Render the full BALANCE_REPORT.md. Pure string building — the caller writes the file. */
export function renderReport(runs: PersonaRun[], bottlenecks: Bottleneck[], opts: { bands: number[]; seeds: number[]; generatedAt: string }): string {
  const L: string[] = [];
  L.push('# BALANCE_REPORT — automated progression health', '');
  L.push(`> Generated ${opts.generatedAt} by \`npm run sim:report\` (docs/SIMULATION-FRAMEWORK.md).`);
  L.push('> **Report-only:** nothing here was auto-applied. Every bottleneck below awaits human review;');
  L.push('> the change protocol remains docs/BALANCE_ARCHITECTURE.md §4 (propose → simulate → record).', '');
  L.push(`Matrix: ${runs.length} personas × ${opts.seeds.length} seeds · bands ${opts.bands.join(' / ')} hours · world model + policy in \`src/dev/progressionSim.ts\`.`, '');

  L.push('## Personas', '');
  L.push('| Persona | Behavior |', '|---|---|');
  for (const r of runs) L.push(`| **${r.persona.name}** | ${r.persona.blurb} |`);
  L.push('');

  L.push('## Persona pacing (median seed, final band)', '');
  L.push('| Persona | Hours | Power | Stage | Best wave | Molts | Acquisitions | Failed pushes |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const finals = r.traces.map((t) => t.checkpoints[t.checkpoints.length - 1]).filter(Boolean);
    if (finals.length === 0) continue;
    const med = finals.sort((a, b) => a.power - b.power)[Math.floor(finals.length / 2)];
    L.push(`| ${r.persona.name} | ${med.hours} | ${med.power} | ${med.stage} | ${med.bestWave} | ${med.molts} | ${med.unlocks} | ${med.failedPushes} |`);
  }
  L.push('');

  L.push('## Top progression bottlenecks', '');
  const top = bottlenecks.slice(0, 20);
  if (top.length === 0) L.push('_No bottlenecks fired at this matrix size — widen bands/seeds for the full instrument._', '');
  top.forEach((b, i) => {
    const d = diagnose(b.kind);
    const persona = runs.find((r) => r.persona.id === b.personaId)?.persona.name ?? b.personaId;
    L.push(`### ${i + 1}. ${KIND_TITLE[b.kind]} — ${persona}, ${b.band}`, '');
    L.push(`- **Severity:** ${b.severity.toUpperCase()} (score ${b.score}) · **Confidence:** ${b.confidence} (${Math.round(b.frequency * 100)}% of seeds)`);
    L.push(`- **Estimated player frustration:** ${b.frustration}`);
    L.push(`- **Root cause:** ${d.rootCause}`);
    L.push(`- **Affected systems:** ${d.systems}`);
    L.push(`- **Supporting data:** ${b.evidence}`);
    L.push('- **Suggested solutions (candidates for human review):**');
    for (const f of d.fixes) L.push(`  - ${f}`);
    L.push(`- **Estimated implementation difficulty:** ${d.difficulty}`, '');
  });

  L.push('## Methodology & caveats', '');
  L.push('- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).');
  L.push('- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.');
  L.push('- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.');
  L.push('- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.');
  return L.join('\n') + '\n';
}
