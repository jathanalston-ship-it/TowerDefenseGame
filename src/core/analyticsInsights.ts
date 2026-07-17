// AUTOMATIC INSIGHTS (docs/ANALYTICS.md §insights) — the platform does not merely collect;
// it CONCLUDES. Pure functions over daily rollup rows (day, kind, dim, ver → n/sum/sum²)
// producing ranked, human-readable findings with statistical honesty: proportion findings
// carry a two-proportion z-test against the pooled rate and are flagged `significant` only
// at |z| ≥ 1.96 (95%); volume findings state their sample sizes. The dashboard, the /api/dev
// endpoint, and the scalability sims all run THIS module — one brain, three surfaces.
//
// Pure: no DOM, no fetch, no Date.now (the caller supplies the window).

export interface DailyRow {
  day: string; // UTC YYYY-MM-DD
  kind: string;
  dim: string; // '' when the kind has no dimension
  ver: string; // app version ('' = unversioned aggregate)
  n: number; // event count
  sum: number; // Σ value
  sum2: number; // Σ value² (variance for spike detection)
}

export interface Finding {
  id: string;
  severity: 'info' | 'watch' | 'action';
  title: string;
  detail: string;
  metric: number; // the headline number (rate, count, ratio — see detail)
  sample: number; // observations behind it
  z?: number; // test statistic when a significance test applies
  significant: boolean;
}

// ── Statistics ────────────────────────────────────────────────────────────────
/** Two-proportion z-test: is rate (k1/n1) different from pooled baseline (k2/n2)? */
export function twoProportionZ(k1: number, n1: number, k2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (p1 - p2) / se : 0;
}

export const SIGNIFICANT_Z = 1.96;

/** Aggregate rows by dim for one kind (optionally one version). */
function byDim(rows: readonly DailyRow[], kind: string, ver?: string): Map<string, { n: number; sum: number }> {
  const out = new Map<string, { n: number; sum: number }>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    if (ver !== undefined && r.ver !== ver) continue;
    const cur = out.get(r.dim) ?? { n: 0, sum: 0 };
    cur.n += r.n;
    cur.sum += r.sum;
    out.set(r.dim, cur);
  }
  return out;
}

function total(rows: readonly DailyRow[], kind: string): { n: number; sum: number } {
  let n = 0; let sum = 0;
  for (const r of rows) if (r.kind === kind) { n += r.n; sum += r.sum; }
  return { n, sum };
}

// ── Rate outliers (the workhorse: win rates, exit rates, ignore rates) ────────
/** For success/attempt kind pairs sharing dims: find the dims whose success rate deviates
 *  most from the pooled rate, z-tested. minAttempts keeps noise out. */
export function rateOutliers(
  rows: readonly DailyRow[],
  attemptKind: string,
  successKind: string,
  minAttempts: number,
): { dim: string; rate: number; pooled: number; attempts: number; z: number }[] {
  const attempts = byDim(rows, attemptKind);
  const successes = byDim(rows, successKind);
  const totA = total(rows, attemptKind).n;
  const totS = total(rows, successKind).n;
  const out: { dim: string; rate: number; pooled: number; attempts: number; z: number }[] = [];
  for (const [dim, a] of attempts) {
    if (a.n < minAttempts) continue;
    const s = successes.get(dim)?.n ?? 0;
    const restA = totA - a.n;
    const restS = totS - s;
    const z = twoProportionZ(s, a.n, Math.max(0, restS), Math.max(1, restA));
    out.push({ dim, rate: s / a.n, pooled: totA > 0 ? totS / totA : 0, attempts: a.n, z });
  }
  return out.sort((x, y) => x.z - y.z); // most-below-pooled first
}

// ── The findings battery ─────────────────────────────────────────────────────
export interface InsightInputs {
  rows: readonly DailyRow[];
  /** Retention cohorts the server derives from activity rows. */
  cohorts?: { cohortDay: string; size: number; d1: number; d7: number; d30: number }[];
  /** Screens currently in the product (so "least visited" ignores unreleased keys). */
  knownScreens?: readonly string[];
  minSample?: number; // default 30
}

export function computeInsights(inp: InsightInputs): Finding[] {
  const rows = inp.rows;
  const minN = inp.minSample ?? 30;
  const out: Finding[] = [];
  const push = (f: Finding): void => { out.push(f); };

  // Worst / best performing towers (win rate among fielded, z vs pool).
  const towers = rateOutliers(rows, 'tw_field', 'tw_win', minN);
  if (towers.length >= 2) {
    const worst = towers[0];
    const best = towers[towers.length - 1];
    push({
      id: 'tower-worst', severity: worst.z <= -SIGNIFICANT_Z ? 'action' : 'watch',
      title: `Worst performing tower: ${worst.dim}`,
      detail: `${(worst.rate * 100).toFixed(1)}% win rate over ${worst.attempts} runs vs ${(worst.pooled * 100).toFixed(1)}% pooled.`,
      metric: worst.rate, sample: worst.attempts, z: worst.z, significant: Math.abs(worst.z) >= SIGNIFICANT_Z,
    });
    push({
      id: 'tower-best', severity: 'info',
      title: `Strongest tower: ${best.dim}`,
      detail: `${(best.rate * 100).toFixed(1)}% win rate over ${best.attempts} runs — nerf-watch if it also dominates usage.`,
      metric: best.rate, sample: best.attempts, z: best.z, significant: Math.abs(best.z) >= SIGNIFICANT_Z,
    });
  }

  // Hero pick vs win (least effective hero) + least PICKED hero.
  const heroes = rateOutliers(rows, 'hero_pick', 'hero_win', minN);
  if (heroes.length >= 2) {
    const worst = heroes[0];
    push({
      id: 'hero-worst', severity: worst.z <= -SIGNIFICANT_Z ? 'action' : 'watch',
      title: `Least effective hero: ${worst.dim}`,
      detail: `${(worst.rate * 100).toFixed(1)}% win rate over ${worst.attempts} picks vs ${(worst.pooled * 100).toFixed(1)}% pooled.`,
      metric: worst.rate, sample: worst.attempts, z: worst.z, significant: Math.abs(worst.z) >= SIGNIFICANT_Z,
    });
    const picks = [...byDim(rows, 'hero_pick')].sort((a, b) => a[1].n - b[1].n);
    if (picks.length > 0) {
      push({
        id: 'hero-ignored', severity: 'info',
        title: `Least picked hero: ${picks[0][0]}`,
        detail: `${picks[0][1].n} picks in the window — kit or unlock position may need attention.`,
        metric: picks[0][1].n, sample: picks[0][1].n, significant: false,
      });
    }
  }

  // Most abandoned campaign stage + biggest difficulty spike (loss/quit concentration).
  const losses = byDim(rows, 'run_loss');
  const quits = byDim(rows, 'run_quit');
  const abandonment = new Map<string, number>();
  for (const [dim, v] of losses) abandonment.set(dim, (abandonment.get(dim) ?? 0) + v.n);
  for (const [dim, v] of quits) abandonment.set(dim, (abandonment.get(dim) ?? 0) + v.n);
  const abandonTop = [...abandonment].sort((a, b) => b[1] - a[1]);
  if (abandonTop.length > 0 && abandonTop[0][1] >= minN) {
    const [dim, n] = abandonTop[0];
    const share = n / [...abandonment.values()].reduce((a, b) => a + b, 0);
    push({
      id: 'abandon-hotspot', severity: share > 0.2 ? 'action' : 'watch',
      title: `Most abandoned location: ${dim}`,
      detail: `${n} losses/quits — ${(share * 100).toFixed(0)}% of all recorded failures. The difficulty spike candidate.`,
      metric: share, sample: n, significant: share > 0.2,
    });
  }

  // Stage funnel cliff: consecutive stage_clear drop-off.
  const clears = [...byDim(rows, 'stage_clear')]
    .map(([dim, v]) => ({ stage: Number(dim.replace(/\D/g, '')), n: v.n }))
    .filter((s) => Number.isFinite(s.stage) && s.stage > 0)
    .sort((a, b) => a.stage - b.stage);
  let cliff: { from: number; drop: number; n1: number; n2: number } | null = null;
  for (let i = 0; i + 1 < clears.length; i++) {
    if (clears[i].n < minN) continue;
    const drop = 1 - clears[i + 1].n / clears[i].n;
    if (!cliff || drop > cliff.drop) cliff = { from: clears[i].stage, drop, n1: clears[i].n, n2: clears[i + 1].n };
  }
  if (cliff && cliff.drop > 0) {
    const z = twoProportionZ(cliff.n2, cliff.n1, cliff.n1, cliff.n1); // survival vs perfect carry-through
    push({
      id: 'funnel-cliff', severity: cliff.drop > 0.35 ? 'action' : 'watch',
      title: `Progression cliff after stage ${cliff.from}`,
      detail: `${(cliff.drop * 100).toFixed(0)}% of stage-${cliff.from} clearers never clear ${cliff.from + 1} (${cliff.n1} → ${cliff.n2}).`,
      metric: cliff.drop, sample: cliff.n1, z, significant: cliff.drop > 0.35 && cliff.n1 >= minN,
    });
  }

  // Highest exit-rate screen (quit_loc share vs nav share) + most skipped menu.
  const navs = byDim(rows, 'nav');
  const quitLocs = byDim(rows, 'quit_loc');
  const navTotal = total(rows, 'nav').n;
  const quitTotal = total(rows, 'quit_loc').n;
  if (navTotal >= minN && quitTotal >= minN) {
    let worstScreen: { dim: string; z: number; rate: number; n: number } | null = null;
    for (const [dim, q] of quitLocs) {
      const nv = navs.get(dim)?.n ?? 0;
      if (nv + q.n < minN) continue;
      const z = twoProportionZ(q.n, q.n + nv, quitTotal, quitTotal + navTotal);
      if (!worstScreen || z > worstScreen.z) worstScreen = { dim, z, rate: q.n / (q.n + nv), n: q.n + nv };
    }
    if (worstScreen) {
      push({
        id: 'exit-screen', severity: worstScreen.z >= SIGNIFICANT_Z ? 'watch' : 'info',
        title: `Highest exit-rate screen: ${worstScreen.dim}`,
        detail: `${(worstScreen.rate * 100).toFixed(1)}% of visits end the session there (${worstScreen.n} observations).`,
        metric: worstScreen.rate, sample: worstScreen.n, z: worstScreen.z, significant: worstScreen.z >= SIGNIFICANT_Z,
      });
    }
  }
  if (inp.knownScreens && navTotal >= minN) {
    const least = [...inp.knownScreens]
      .map((s) => ({ s, n: navs.get(s)?.n ?? 0 }))
      .sort((a, b) => a.n - b.n)[0];
    if (least) {
      push({
        id: 'skipped-screen', severity: 'info',
        title: `Most skipped screen: ${least.s}`,
        detail: `${least.n} views against ${navTotal} total navigations.`,
        metric: least.n, sample: navTotal, significant: false,
      });
    }
  }

  // Most ignored notification channel.
  const notif = byDim(rows, 'notif');
  const perChannel = new Map<string, { act: number; seen: number }>();
  for (const [dim, v] of notif) {
    const [channel, act] = [dim.slice(0, dim.lastIndexOf(':')), dim.slice(dim.lastIndexOf(':') + 1)];
    const cur = perChannel.get(channel) ?? { act: 0, seen: 0 };
    if (act === 'act') cur.act += v.n;
    else cur.seen += v.n;
    perChannel.set(channel, cur);
  }
  let worstNotif: { channel: string; rate: number; n: number } | null = null;
  for (const [channel, v] of perChannel) {
    const n = v.act + v.seen;
    if (n < minN) continue;
    const rate = v.act / n;
    if (!worstNotif || rate < worstNotif.rate) worstNotif = { channel, rate, n };
  }
  if (worstNotif) {
    push({
      id: 'notif-ignored', severity: worstNotif.rate < 0.1 ? 'watch' : 'info',
      title: `Most ignored notification: ${worstNotif.channel}`,
      detail: `${(worstNotif.rate * 100).toFixed(1)}% act rate over ${worstNotif.n} impressions.`,
      metric: worstNotif.rate, sample: worstNotif.n, significant: worstNotif.rate < 0.1 && worstNotif.n >= minN,
    });
  }

  // Tutorial abandonment step.
  const tut = byDim(rows, 'tut');
  const abandons = [...tut].filter(([d]) => d.startsWith('abandon:')).sort((a, b) => b[1].n - a[1].n);
  if (abandons.length > 0 && abandons[0][1].n >= Math.max(5, minN / 6)) {
    push({
      id: 'tutorial-abandon', severity: 'action',
      title: `Tutorial abandonment peak: ${abandons[0][0].slice(8)}`,
      detail: `${abandons[0][1].n} players left the tutorial at this step in the window.`,
      metric: abandons[0][1].n, sample: abandons[0][1].n, significant: true,
    });
  }

  // Economy bottleneck: worst gain/spend coverage per currency.
  const gains = byDim(rows, 'cur_gain');
  const spends = byDim(rows, 'cur_spend');
  const perCur = new Map<string, { gain: number; spend: number }>();
  const fold = (m: Map<string, { n: number; sum: number }>, key: 'gain' | 'spend'): void => {
    for (const [dim, v] of m) {
      const cur = dim.slice(0, dim.indexOf(':'));
      const row = perCur.get(cur) ?? { gain: 0, spend: 0 };
      row[key] += v.sum;
      perCur.set(cur, row);
    }
  };
  fold(gains, 'gain');
  fold(spends, 'spend');
  let bottleneck: { cur: string; cover: number; spend: number } | null = null;
  for (const [cur, v] of perCur) {
    if (v.spend < 1000) continue;
    const cover = v.gain / v.spend;
    if (!bottleneck || cover < bottleneck.cover) bottleneck = { cur, cover, spend: v.spend };
  }
  if (bottleneck && bottleneck.cover < 0.9) {
    push({
      id: 'economy-bottleneck', severity: bottleneck.cover < 0.6 ? 'action' : 'watch',
      title: `Economy bottleneck: ${bottleneck.cur}`,
      detail: `Earning covers only ${(bottleneck.cover * 100).toFixed(0)}% of attempted spending (${bottleneck.spend.toLocaleString('en-US')} spent in the window).`,
      metric: bottleneck.cover, sample: bottleneck.spend, significant: bottleneck.cover < 0.6,
    });
  }

  // Best-selling bundle.
  const buys = [...byDim(rows, 'buy')].sort((a, b) => b[1].sum - a[1].sum);
  if (buys.length > 0 && buys[0][1].n > 0) {
    push({
      id: 'top-bundle', severity: 'info',
      title: `Most purchased bundle: ${buys[0][0]}`,
      detail: `${buys[0][1].n} purchases, $${(buys[0][1].sum / 100).toFixed(2)} in the window.`,
      metric: buys[0][1].sum, sample: buys[0][1].n, significant: false,
    });
  }

  // Retention headline.
  if (inp.cohorts && inp.cohorts.length > 0) {
    const size = inp.cohorts.reduce((a, c) => a + c.size, 0);
    const d1 = inp.cohorts.reduce((a, c) => a + c.d1, 0);
    const d7 = inp.cohorts.reduce((a, c) => a + c.d7, 0);
    if (size >= minN) {
      const r1 = d1 / size;
      push({
        id: 'retention-d1', severity: r1 < 0.25 ? 'action' : r1 < 0.4 ? 'watch' : 'info',
        title: `D1 retention ${(r1 * 100).toFixed(1)}%`,
        detail: `${d1}/${size} returned next day; D7 ${(100 * d7 / size).toFixed(1)}%.`,
        metric: r1, sample: size, significant: size >= 100,
      });
    }
  }

  // Crash/error pressure.
  const errs = total(rows, 'err');
  const sessions = total(rows, 'ses_start');
  if (errs.n > 0 && sessions.n >= minN) {
    const perSession = errs.n / sessions.n;
    push({
      id: 'error-rate', severity: perSession > 0.1 ? 'action' : perSession > 0.02 ? 'watch' : 'info',
      title: `Errors per session: ${perSession.toFixed(3)}`,
      detail: `${errs.n} errors across ${sessions.n} sessions — top hashes in the error log.`,
      metric: perSession, sample: sessions.n, significant: perSession > 0.1,
    });
  }

  const rank = { action: 0, watch: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || Number(b.significant) - Number(a.significant));
}

/** Patch impact: for one kind(+dim), compare per-day rate across two versions. */
export function patchImpact(
  rows: readonly DailyRow[],
  kind: string,
  dim: string,
  verA: string,
  verB: string,
): { a: { n: number; sum: number }; b: { n: number; sum: number }; z: number } {
  const pick = (ver: string): { n: number; sum: number } => {
    let n = 0; let sum = 0;
    for (const r of rows) if (r.kind === kind && r.dim === dim && r.ver === ver) { n += r.n; sum += r.sum; }
    return { n, sum };
  };
  const a = pick(verA);
  const b = pick(verB);
  // Rate comparison over event counts (per-day volumes normalized by total version traffic).
  const totalA = rows.filter((r) => r.ver === verA).reduce((x, r) => x + r.n, 0);
  const totalB = rows.filter((r) => r.ver === verB).reduce((x, r) => x + r.n, 0);
  return { a, b, z: twoProportionZ(a.n, Math.max(1, totalA), b.n, Math.max(1, totalB)) };
}
