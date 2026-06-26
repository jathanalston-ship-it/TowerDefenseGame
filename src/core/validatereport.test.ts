import { describe, it, expect } from 'vitest';
import { validateAllContentReport, validateEffects, formatReport } from './validate';
import type { ValidationCategory } from './validate';
import type { CardEffect } from './cards';

describe('structured content validation report', () => {
  it('shipping content is clean — zero ERRORS across all seven categories', () => {
    const report = validateAllContentReport();
    if (report.errors.length > 0) {
      // Surface what failed so the assertion message is actionable.
      throw new Error(`unexpected content errors:\n${formatReport(report)}`);
    }
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('every issue is tagged with one of the seven canonical categories', () => {
    const allowed: ValidationCategory[] = [
      'duplicate-id',
      'missing-asset',
      'invalid-reference',
      'invalid-stat',
      'missing-localization',
      'broken-upgrade-chain',
      'invalid-loot-table',
    ];
    for (const i of validateAllContentReport().issues) expect(allowed).toContain(i.category);
  });

  it('validateEffects accepts a well-formed effect list', () => {
    const ok: CardEffect[] = [
      { op: 'mul', field: 'towerDamageMult', value: 1.1 },
      { op: 'add', field: 'startBiomassBonus', value: 50 },
      { op: 'flag', field: 'mortarAppliesFracture' },
    ];
    expect(validateEffects(ok, 'item x')).toEqual([]);
  });

  it('validateEffects flags an unknown run-modifier field (invalid reference)', () => {
    const bad = [{ op: 'mul', field: 'notARealField', value: 1.1 }] as unknown as CardEffect[];
    const issues = validateEffects(bad, 'item x');
    expect(issues.some((i) => i.category === 'invalid-reference')).toBe(true);
  });

  it('validateEffects flags a non-positive multiplier and a non-finite value (invalid stat)', () => {
    expect(validateEffects([{ op: 'mul', field: 'towerDamageMult', value: 0 }], 't').some((i) => i.category === 'invalid-stat')).toBe(true);
    expect(validateEffects([{ op: 'add', field: 'startBiomassBonus', value: NaN }], 't').some((i) => i.category === 'invalid-stat')).toBe(true);
  });

  it('formatReport summarizes a clean report', () => {
    const report = validateAllContentReport();
    const text = formatReport(report);
    expect(typeof text).toBe('string');
    if (report.issues.length === 0) expect(text).toContain('content OK');
  });
});
