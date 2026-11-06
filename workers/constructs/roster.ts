// CONSTRUCT ROSTER (docs/CONSTRUCTS.md §host) — the scheduled loop over the roster table: make
// sure every construct in src/core/constructs.ts has a row (and so a credential), then tick each
// one in turn (the meta layer holds ONE save at a time) and record what it did. Host-agnostic:
// the Worker passes its D1 binding; the tests pass the FakeD1 testkit.
//
// LEASE: a construct is ticked only under a lease claimed by compare-and-set (lease_until). Two
// overlapping scheduled runs must never tick the same construct — both would load the same save,
// both would spend + credit a deposit, and only one save would survive (a mint). A crashed run's
// lease simply expires.

import { CONSTRUCTS } from '../../src/core/constructs';
import { constructWire } from './router';
import { tickConstruct } from './engine';
import type { TickReport } from './engine';

export interface RosterRow {
  player_id: string; name: string; token: string; credit_sec: number; last_tick_at: number;
  runs_total: number; last_report: string;
}

const ROSTER_SELECT = 'SELECT player_id, name, token, credit_sec, last_tick_at, runs_total, last_report FROM constructs';

/** How long a tick's lease holds (far above a tick's real duration; a crashed run frees it). */
export const LEASE_MS = 4 * 60_000;

/** Claim the construct for one tick; false ⇒ another run holds it (skip). */
export async function claimLease(db: D1Database, id: string, now: number): Promise<boolean> {
  const r = await db.prepare('UPDATE constructs SET lease_until = ?2 WHERE player_id = ?1 AND lease_until < ?3')
    .bind(id, now + LEASE_MS, now).run();
  return (r.meta?.changes ?? 0) > 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rows for every construct, creating any missing one (idempotent — a concurrent run's insert wins). */
export async function ensureRoster(db: D1Database, now: number): Promise<Map<string, RosterRow>> {
  let rows = (await db.prepare(ROSTER_SELECT).all<RosterRow>()).results ?? [];
  const have = new Set(rows.map((r) => r.player_id));
  const missing = CONSTRUCTS.filter((c) => !have.has(c.id));
  if (missing.length > 0) {
    for (const c of missing) {
      await db.prepare('INSERT INTO constructs (player_id, name, token, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(player_id) DO NOTHING')
        .bind(c.id, c.name, randomToken(), now).run();
    }
    rows = (await db.prepare(ROSTER_SELECT).all<RosterRow>()).results ?? [];
  }
  return new Map(rows.map((r) => [r.player_id, r]));
}

// ISOLATE LOCK: the meta layer is ONE module-level save per isolate, so two runs interleaving in the
// same isolate (overlapping cron events can share one) would cross saves between constructs at
// every await. Runs in one isolate therefore QUEUE; across isolates the D1 lease rules.
let isolateQueue: Promise<unknown> = Promise.resolve();

/** One scheduled run: tick every construct once (queued behind any run already in this isolate). */
export function runRoster(db: D1Database, now: number): Promise<TickReport[]> {
  const run = isolateQueue.then(() => runRosterNow(db, Math.max(now, Date.now())));
  isolateQueue = run.catch(() => undefined);
  return run;
}

async function runRosterNow(db: D1Database, now: number): Promise<TickReport[]> {
  const rows = await ensureRoster(db, now);
  const reports: TickReport[] = [];
  for (const c of CONSTRUCTS) {
    const row = rows.get(c.id);
    if (!row || !(await claimLease(db, c.id, now))) continue;
    const prev = { token: row.token, creditSec: Number(row.credit_sec) || 0, lastTickAt: Number(row.last_tick_at) || 0 };
    let state = prev;
    let report: TickReport;
    try {
      ({ state, report } = await tickConstruct(c, prev, constructWire(db, c.id), now));
    } catch (e) {
      // An unexpected throw: keep the pacing (the next tick replays), record it, free the lease.
      report = {
        id: c.id, name: c.name, runs: 0, stage: 0, power: 0, saved: false, errors: [`tick-${String(e).slice(0, 120)}`],
        market: { visited: false, listed: 0, bought: 0, bid: 0, deposited: 0, withdrawn: 0, delivered: 0 },
      };
    }
    await db.prepare('UPDATE constructs SET credit_sec = ?2, last_tick_at = ?3, runs_total = runs_total + ?4, last_report = ?5, lease_until = 0 WHERE player_id = ?1')
      .bind(c.id, state.creditSec, state.lastTickAt, report.runs, JSON.stringify(report)).run();
    reports.push(report);
  }
  return reports;
}

/** The public status view: no credentials, just who is playing and how it is going. */
export async function rosterStatus(db: D1Database): Promise<Record<string, unknown>[]> {
  const rows = (await db.prepare(ROSTER_SELECT).all<RosterRow>()).results ?? [];
  return rows.map((r) => {
    let last: unknown = null;
    try { last = r.last_report ? JSON.parse(r.last_report) : null; } catch { last = null; }
    return { id: r.player_id, name: r.name, lastTickAt: r.last_tick_at, runsTotal: r.runs_total, last };
  });
}
