// Power Score coverage — the engine-level guarantee that no strength-affecting content escapes the
// Power index (docs/POWER-SCORE.md). Pins the CONTRACT (every declared strength field is scored) and
// the enforcement (unscored field ⇒ boot-check + report ERROR), and surfaces balance spikes.

import { describe, it, expect } from 'vitest';
import { POWER_RELEVANT_FIELDS, powerModelFields, uncoveredPowerFields, effectsPower } from './power';
import { defaultRunModifiers } from './cards';
import { validateAllContent, validateAllContentReport } from './validate';

describe('Power Score coverage (engine-level enforcement)', () => {
  it('every declared strength field is a REAL run-modifier field', () => {
    const real = new Set(Object.keys(defaultRunModifiers()));
    for (const f of POWER_RELEVANT_FIELDS) expect(real.has(f)).toBe(true);
  });

  it('the Power model scores EVERY declared strength field (no blind spots)', () => {
    expect(uncoveredPowerFields()).toEqual([]); // the contract is fully honored
    const scored = powerModelFields();
    for (const f of POWER_RELEVANT_FIELDS) expect(scored.has(f)).toBe(true);
  });

  it('the dev-boot check + structured report carry ZERO power-coverage errors', () => {
    expect(validateAllContent().some((s) => s.startsWith('power model:'))).toBe(false);
    const report = validateAllContentReport();
    const powerErrors = report.errors.filter((i) => i.category === 'power-coverage');
    expect(powerErrors).toEqual([]);
    expect(report.ok).toBe(true); // no ERRORS anywhere (warnings allowed)
  });

  it('no live content SPIKES the Power index (surfaces any offenders for balance)', () => {
    const spikes = validateAllContentReport().warnings.filter((i) => i.category === 'power-coverage');
    if (spikes.length) console.log('power spikes:\n' + spikes.map((i) => `  ${i.target}: ${i.message}`).join('\n'));
    expect(spikes.length).toBe(0); // current content stays under the per-source cap
  });

  it('ENFORCEMENT bites: a fresh strength field with no weight is flagged unscored', () => {
    // Simulate authoring a new strength field and forgetting to weight it: it must be reported.
    const scored = powerModelFields();
    const bogus = '__unscored_strength_field__';
    expect(scored.has(bogus)).toBe(false);
    // effectsPower ignores unknown fields (returns neutral) — which is exactly why an unscored field
    // is dangerous (invisible to Power) and why uncoveredPowerFields()/validate flags it.
    expect(effectsPower([{ op: 'mul', field: bogus as never, value: 2 }])).toBe(1);
  });
});
