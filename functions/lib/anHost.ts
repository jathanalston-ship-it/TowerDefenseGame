// Analytics server core (docs/ANALYTICS.md §server) — the ingest fold + the read shapes
// the dev API serves. Pure functions over D1: endpoints stay thin, tests drive this
// directly. The event contract is the SAME shared registry the client validates against
// (src/core/analyticsEvents.ts) — one row is the whole truth on both ends.

import { AN_EVENT_BY_KIND, AN_LIMITS, batchProblem, eventProblem } from '../../src/core/analyticsEvents';
import type { AnBatch, AnEvent } from '../../src/core/analyticsEvents';

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Clamp a client-claimed timestamp into a sane window around server time: at most
 *  48 h back (an outbox retried next session) and 5 min forward (clock skew). */
export function clampAt(at: number, now: number): number {
  return Math.max(now - 48 * 3600_000, Math.min(now + 300_000, at));
}

const VER_TOKEN = /^[a-z0-9_.\-]{1,24}$/i;

/** Validate + normalize one batch. Returns the accepted events (per-event enforcement is
 *  reject-the-event, never reject-the-batch) or a problem string for a hopeless envelope. */
export function acceptBatch(raw: unknown): { batch: AnBatch; events: AnEvent[] } | { problem: string } {
  if (!raw || typeof raw !== 'object') return { problem: 'bad-json' };
  const batch = raw as AnBatch;
  const envelope = batchProblem(batch);
  if (envelope) return { problem: envelope };
  if (typeof batch.playerId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(batch.playerId)) return { problem: 'bad-player' };
  if (!VER_TOKEN.test(batch.ver)) return { problem: 'bad-version' };
  const events = batch.events.filter((e) => e && typeof e === 'object' && eventProblem(e) === null);
  if (events.length === 0) return { problem: 'no-valid-events' };
  return { batch, events };
}

/** One rollup delta (grouped client-side of D1 so a batch writes FEW upsert rows). */
export interface RollupDelta { day: string; kind: string; dim: string; ver: string; n: number; sum: number; sum2: number }

export function foldRollups(events: AnEvent[], ver: string, now: number): RollupDelta[] {
  const acc = new Map<string, RollupDelta>();
  for (const e of events) {
    const def = AN_EVENT_BY_KIND[e.k];
    if (!def?.rollup) continue;
    const day = utcDay(clampAt(e.at, now));
    const dim = e.d ?? '';
    const key = `${day}|${e.k}|${dim}`;
    const v = typeof e.v === 'number' ? e.v : 0;
    const cur = acc.get(key) ?? { day, kind: e.k, dim, ver, n: 0, sum: 0, sum2: 0 };
    cur.n += 1;
    cur.sum += v;
    cur.sum2 += v * v;
    acc.set(key, cur);
  }
  return [...acc.values()];
}

export interface IngestContext { now: number; region: string }

/** Apply one accepted batch to D1. Statement shapes are FEW and distinctive on purpose —
 *  the test fake matches them structurally. All writes ride ONE D1 batch (atomic). */
export async function ingestBatch(db: D1Database, batch: AnBatch, events: AnEvent[], ctx: IngestContext): Promise<void> {
  const { now } = ctx;
  const region = /^[A-Z]{2}$/.test(ctx.region) ? ctx.region : '';
  const day = utcDay(now);
  const ver = batch.ver;
  const stmts: D1PreparedStatement[] = [];

  // 1) Daily rollups — the bounded spine.
  for (const r of foldRollups(events, ver, now)) {
    stmts.push(db.prepare(
      'INSERT INTO an_daily (day, kind, dim, ver, n, sum, sum2) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ' +
      'ON CONFLICT(day, kind, dim, ver) DO UPDATE SET n = n + excluded.n, sum = sum + excluded.sum, sum2 = sum2 + excluded.sum2',
    ).bind(r.day, r.kind, r.dim, r.ver, r.n, r.sum, r.sum2));
  }

  // 2) Durable raw rows (player timelines) + the deduped error ledger.
  for (const e of events) {
    const def = AN_EVENT_BY_KIND[e.k];
    if (!def) continue;
    const at = clampAt(e.at, now);
    if (def.durable) {
      stmts.push(db.prepare(
        'INSERT INTO an_events (player_id, session, kind, at, screen, mode, dim, val, extras, ver, day) ' +
        'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)',
      ).bind(batch.playerId, batch.session, e.k, at, e.sc ?? null, e.md ?? null, e.d ?? null,
        typeof e.v === 'number' ? e.v : null, e.x ? JSON.stringify(e.x) : null, ver, utcDay(at)));
    }
    if (e.k === 'err' && e.d) {
      const msg = String(e.x?.msg ?? '').slice(0, AN_LIMITS.extraStringMax);
      const stack = String(e.x?.stack ?? '').slice(0, AN_LIMITS.extraStringMax);
      stmts.push(db.prepare(
        'INSERT INTO an_errors (hash, first_at, last_at, count, msg, stack, ver) VALUES (?1, ?2, ?2, 1, ?3, ?4, ?5) ' +
        'ON CONFLICT(hash) DO UPDATE SET last_at = ?2, count = count + 1, ver = ?5',
      ).bind(e.d, at, msg, stack, ver));
    }
  }

  // 3) Player headline (upsert; sessions/revenue increment via batch-derived deltas).
  const newSessions = events.filter((e) => e.k === 'ses_start').length;
  const revenue = events.filter((e) => e.k === 'buy').reduce((s, e) => s + (e.v ?? 0), 0);
  stmts.push(db.prepare(
    'INSERT INTO an_players (player_id, first_seen, last_seen, first_ver, last_ver, region, platform, lang, power, stage, sessions, revenue_cents) ' +
    'VALUES (?1, ?2, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ' +
    'ON CONFLICT(player_id) DO UPDATE SET last_seen = ?2, last_ver = ?3, region = ?4, platform = ?5, lang = ?6, power = ?7, stage = ?8, ' +
    'sessions = sessions + ?9, revenue_cents = revenue_cents + ?10',
  ).bind(batch.playerId, now, ver, region, batch.platform.slice(0, 16), batch.lang.slice(0, 12),
    Math.max(0, Math.floor(batch.power)), Math.max(0, Math.floor(batch.stage)), newSessions, revenue));

  // 4) Live session heartbeat (+ duration once ses_end arrives).
  const endDur = events.find((e) => e.k === 'ses_end')?.v ?? 0;
  const started = events.find((e) => e.k === 'ses_start');
  stmts.push(db.prepare(
    'INSERT INTO an_sessions (session, player_id, started_at, last_ping, ver, region, dur_sec, events) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ' +
    'ON CONFLICT(session) DO UPDATE SET last_ping = ?4, dur_sec = MAX(dur_sec, ?7), events = events + ?8',
  ).bind(batch.session, batch.playerId, started ? clampAt(started.at, now) : now, now, ver, region, endDur, events.length));

  // 5) The retention spine: one row per (player, active day).
  stmts.push(db.prepare('INSERT OR IGNORE INTO an_activity (player_id, day) VALUES (?1, ?2)').bind(batch.playerId, day));

  await db.batch(stmts);
}

/** Retention prune — piggybacks on session starts (no daemon; "always running" is a
 *  property of the data, same policy as the market windows). */
export async function pruneRaw(db: D1Database, now: number): Promise<void> {
  const rawCut = utcDay(now - AN_LIMITS.rawDays * 86_400_000);
  const durableCut = utcDay(now - AN_LIMITS.durableDays * 86_400_000);
  await db.batch([
    db.prepare('DELETE FROM an_events WHERE day < ?1').bind(durableCut),
    db.prepare('DELETE FROM an_sessions WHERE last_ping < ?1').bind(now - AN_LIMITS.rawDays * 86_400_000),
    db.prepare('DELETE FROM an_daily WHERE day < ?1').bind(utcDay(now - 400 * 86_400_000)),
    db.prepare('DELETE FROM an_activity WHERE day < ?1').bind(rawCut),
  ]);
}

/** The one read shape every dashboard series/insight/export uses: rollup rows since a day. */
export async function dailyRowsSince(db: D1Database, fromDay: string, kind?: string): Promise<{ day: string; kind: string; dim: string; ver: string; n: number; sum: number; sum2: number }[]> {
  const res = kind
    ? await db.prepare('SELECT day, kind, dim, ver, n, sum, sum2 FROM an_daily WHERE day >= ?1 AND kind = ?2').bind(fromDay, kind).all()
    : await db.prepare('SELECT day, kind, dim, ver, n, sum, sum2 FROM an_daily WHERE day >= ?1').bind(fromDay).all();
  return (res.results ?? []) as { day: string; kind: string; dim: string; ver: string; n: number; sum: number; sum2: number }[];
}

/** Retention cohorts from the activity spine: for each first-seen day in the window,
 *  what fraction of that cohort returned on day +1 / +7 / +30. */
export async function retentionCohorts(db: D1Database, now: number, days: number): Promise<{ cohortDay: string; size: number; d1: number; d7: number; d30: number }[]> {
  const from = utcDay(now - days * 86_400_000);
  const players = (await db.prepare('SELECT player_id, first_seen FROM an_players WHERE first_seen >= ?1').bind(now - days * 86_400_000).all())
    .results as { player_id: string; first_seen: number }[];
  const activity = (await db.prepare('SELECT player_id, day FROM an_activity WHERE day >= ?1').bind(from).all())
    .results as { player_id: string; day: string }[];
  const active = new Map<string, Set<string>>();
  for (const a of activity) {
    const set = active.get(a.player_id) ?? new Set<string>();
    set.add(a.day);
    active.set(a.player_id, set);
  }
  const cohorts = new Map<string, { size: number; d1: number; d7: number; d30: number }>();
  for (const p of players) {
    const day0 = utcDay(p.first_seen);
    const c = cohorts.get(day0) ?? { size: 0, d1: 0, d7: 0, d30: 0 };
    c.size += 1;
    const set = active.get(p.player_id);
    if (set?.has(utcDay(p.first_seen + 86_400_000))) c.d1 += 1;
    if (set?.has(utcDay(p.first_seen + 7 * 86_400_000))) c.d7 += 1;
    if (set?.has(utcDay(p.first_seen + 30 * 86_400_000))) c.d30 += 1;
    cohorts.set(day0, c);
  }
  return [...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([cohortDay, c]) => ({ cohortDay, ...c }));
}
