// analyticsInsights — pins the automatic-conclusions engine (docs/ANALYTICS.md §insights):
// findings surface the planted pathologies, significance flags only fire with real
// statistical weight, and small samples stay silent instead of lying.

import { describe, expect, it } from 'vitest';
import { SIGNIFICANT_Z, computeInsights, patchImpact, rateOutliers, twoProportionZ } from './analyticsInsights';
import type { DailyRow } from './analyticsInsights';

const row = (kind: string, dim: string, n: number, sum = 0, ver = ''): DailyRow =>
  ({ day: '2026-07-17', kind, dim, ver, n, sum, sum2: 0 });

describe('statistics', () => {
  it('two-proportion z: equal rates ≈ 0; a real gap at volume crosses 1.96', () => {
    expect(Math.abs(twoProportionZ(50, 100, 500, 1000))).toBeLessThan(0.01);
    expect(twoProportionZ(20, 100, 500, 1000)).toBeLessThan(-SIGNIFICANT_Z); // 20% vs 50%
    expect(twoProportionZ(3, 5, 5, 10)).toBeLessThan(SIGNIFICANT_Z); // tiny n: not significant
  });

  it('rateOutliers ranks the weakest dim first with the pooled baseline', () => {
    const rows = [
      row('tw_field', 'spitter', 200), row('tw_win', 'spitter', 40), // 20%
      row('tw_field', 'lasher', 200), row('tw_win', 'lasher', 120), // 60%
      row('tw_field', 'newbie', 3), row('tw_win', 'newbie', 0), // below minAttempts
    ];
    const out = rateOutliers(rows, 'tw_field', 'tw_win', 30);
    expect(out).toHaveLength(2);
    expect(out[0].dim).toBe('spitter');
    expect(out[0].z).toBeLessThan(-SIGNIFICANT_Z);
  });
});

describe('computeInsights — the findings battery', () => {
  it('surfaces worst tower, abandonment hotspot, funnel cliff, and economy bottleneck', () => {
    const rows: DailyRow[] = [
      // Towers: crippled 'spitter' at volume.
      row('tw_field', 'spitter', 300), row('tw_win', 'spitter', 45),
      row('tw_field', 'lasher', 300), row('tw_win', 'lasher', 180),
      // Loss concentration on campaign stage 12.
      row('run_loss', 'campaign:c12', 90), row('run_loss', 'campaign:c4', 10), row('run_quit', 'campaign:c12', 30),
      // Stage funnel cliff after 12.
      row('stage_clear', 'c11', 200), row('stage_clear', 'c12', 190), row('stage_clear', 'c13', 70),
      // Economy: essence spending far above earning.
      row('cur_gain', 'essence:run', 10, 4_000), row('cur_spend', 'essence:upgrade', 20, 10_000),
      // Sessions for the error-rate denominator.
      row('ses_start', '', 500), row('err', 'eabc', 3),
    ];
    const findings = computeInsights({ rows });
    const ids = findings.map((f) => f.id);
    expect(ids).toContain('tower-worst');
    expect(ids).toContain('abandon-hotspot');
    expect(ids).toContain('funnel-cliff');
    expect(ids).toContain('economy-bottleneck');
    const worst = findings.find((f) => f.id === 'tower-worst')!;
    expect(worst.title).toContain('spitter');
    expect(worst.significant).toBe(true);
    const cliff = findings.find((f) => f.id === 'funnel-cliff')!;
    expect(cliff.title).toContain('12');
    const hotspot = findings.find((f) => f.id === 'abandon-hotspot')!;
    expect(hotspot.title).toContain('campaign:c12');
    // Ranking: actions lead the feed.
    expect(findings[0].severity).toBe('action');
  });

  it('stays silent on small samples (no lying with n=4)', () => {
    const rows = [row('tw_field', 'x', 4), row('tw_win', 'x', 0), row('tw_field', 'y', 4), row('tw_win', 'y', 4)];
    const findings = computeInsights({ rows });
    expect(findings.find((f) => f.id === 'tower-worst')).toBeUndefined();
  });

  it('retention + notification + tutorial findings read their inputs', () => {
    const rows: DailyRow[] = [
      row('notif', 'vault:act', 5), row('notif', 'vault:seen', 95),
      row('notif', 'quests:act', 60), row('notif', 'quests:seen', 40),
      row('tut', 'abandon:place_tower', 12), row('tut', 'step1', 300),
      row('nav', 'home', 500), row('quit_loc', 'home', 20),
      row('nav', 'store', 40), row('quit_loc', 'store', 30),
    ];
    const findings = computeInsights({
      rows,
      cohorts: [{ cohortDay: '2026-07-10', size: 200, d1: 50, d7: 20, d30: 5 }],
      knownScreens: ['home', 'store', 'genes'],
    });
    const ids = findings.map((f) => f.id);
    expect(ids).toContain('notif-ignored');
    expect(findings.find((f) => f.id === 'notif-ignored')!.title).toContain('vault');
    expect(ids).toContain('tutorial-abandon');
    expect(ids).toContain('exit-screen');
    expect(findings.find((f) => f.id === 'exit-screen')!.title).toContain('store');
    expect(ids).toContain('skipped-screen');
    expect(findings.find((f) => f.id === 'skipped-screen')!.title).toContain('genes');
    const d1 = findings.find((f) => f.id === 'retention-d1')!;
    expect(d1.metric).toBeCloseTo(0.25, 5);
  });
});

describe('patchImpact — version-over-version comparison', () => {
  it('detects a rate shift between versions', () => {
    const rows = [
      row('run_loss', 'campaign:c12', 100, 0, '1.0.0'), row('nav', 'home', 900, 0, '1.0.0'),
      row('run_loss', 'campaign:c12', 20, 0, '1.1.0'), row('nav', 'home', 980, 0, '1.1.0'),
    ];
    const r = patchImpact(rows, 'run_loss', 'campaign:c12', '1.0.0', '1.1.0');
    expect(r.a.n).toBe(100);
    expect(r.b.n).toBe(20);
    expect(Math.abs(r.z)).toBeGreaterThan(SIGNIFICANT_Z);
  });
});
