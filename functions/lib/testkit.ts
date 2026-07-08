// Test doubles for the Pages Functions suite (vitest, Node): an in-memory D1
// implementing exactly the query surface this backend uses, plus request/context
// builders. Lives beside the code it fakes so the SQL strings stay in one repo
// hop of the real schema.

import type { Env } from './env';

type Row = Record<string, unknown>;

/** A tiny SQL interpreter for OUR queries only — not a database. Each supported
 *  statement is matched structurally; anything unrecognized throws loudly so a
 *  new endpoint query gets a fake on purpose, never by accident. */
export class FakeD1 {
  purchases = new Map<string, Row>();
  fulfillments = new Map<string, Row>();
  webhookEvents = new Map<string, Row>();
  cloudSaves = new Map<string, Row>();
  analytics = new Map<string, Row>(); // key: day|kind
  leaderboard = new Map<string, Row>(); // key: mode|day|player
  rateLimits = new Map<string, Row>();

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql.replace(/\s+/g, ' ').trim());
  }
}

class FakeStatement {
  private args: unknown[] = [];
  constructor(
    private db: FakeD1,
    private sql: string,
  ) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  private exec(): { rows: Row[]; changes: number } {
    const { db, sql, args } = this;
    // ── rate_limits upsert ──
    if (sql.startsWith('INSERT INTO rate_limits')) {
      const key = String(args[0]);
      const existing = db.rateLimits.get(key);
      const row = existing
        ? { ...existing, count: Number(existing.count) + 1 }
        : { rl_key: key, window_start: args[1], count: 1 };
      db.rateLimits.set(key, row);
      return { rows: [{ count: row.count }], changes: 1 };
    }
    if (sql.startsWith('DELETE FROM rate_limits')) {
      for (const [k, v] of db.rateLimits) if (Number(v.window_start) < Number(args[0])) db.rateLimits.delete(k);
      return { rows: [], changes: 0 };
    }
    // ── analytics counters ──
    if (sql.startsWith('INSERT INTO analytics_counters')) {
      const key = `${args[0]}|${args[1]}`;
      const existing = db.analytics.get(key);
      db.analytics.set(key, existing
        ? { ...existing, count: Number(existing.count) + Number(args[2]) }
        : { day: args[0], kind: args[1], count: args[2] });
      return { rows: [], changes: 1 };
    }
    // ── webhook_events dedupe ──
    if (sql.startsWith('INSERT INTO webhook_events')) {
      const id = String(args[0]);
      if (db.webhookEvents.has(id)) return { rows: [], changes: 0 };
      db.webhookEvents.set(id, { event_id: id, type: args[1], received_at: args[2] });
      return { rows: [], changes: 1 };
    }
    // ── purchases ──
    if (sql.startsWith('INSERT INTO purchases')) {
      const id = String(args[0]);
      if (db.purchases.has(id)) return { rows: [], changes: 0 };
      db.purchases.set(id, {
        session_id: id, event_id: args[1], player_id: args[2], offer_id: args[3],
        amount_total: args[4], currency: args[5], payment_intent: args[6], status: 'paid', created_at: args[7], refunded_at: null,
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT session_id, player_id, offer_id, status FROM purchases')) {
      const row = db.purchases.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith("UPDATE purchases SET status = 'refunded'")) {
      let changes = 0;
      for (const row of db.purchases.values()) {
        if (row.payment_intent === args[0] && row.status !== 'refunded') {
          row.status = 'refunded';
          row.refunded_at = args[1];
          changes++;
        }
      }
      return { rows: [], changes };
    }
    if (sql.startsWith('SELECT session_id, offer_id, amount_total, currency, status, created_at FROM purchases')) {
      const rows = [...db.purchases.values()].filter((r) => r.player_id === args[0]);
      return { rows, changes: 0 };
    }
    // ── fulfillments ──
    if (sql.startsWith('INSERT INTO fulfillments')) {
      const id = String(args[0]);
      if (db.fulfillments.has(id)) return { rows: [], changes: 0 };
      db.fulfillments.set(id, { session_id: id, player_id: args[1], offer_id: args[2], granted_at: args[3] });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM fulfillments WHERE player_id = ?1 AND offer_id = ?2 AND granted_at >= ?3')) {
      const n = [...db.fulfillments.values()].filter(
        (r) => r.player_id === args[0] && r.offer_id === args[1] && Number(r.granted_at) >= Number(args[2]),
      ).length;
      return { rows: [{ n }], changes: 0 };
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM fulfillments WHERE player_id = ?1 AND offer_id = ?2')) {
      const n = [...db.fulfillments.values()].filter((r) => r.player_id === args[0] && r.offer_id === args[1]).length;
      return { rows: [{ n }], changes: 0 };
    }
    // ── cloud_saves ──
    if (sql.startsWith('SELECT token_hash FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [{ token_hash: row.token_hash }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT token_hash, blob, updated_at FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO cloud_saves')) {
      db.cloudSaves.set(String(args[0]), {
        player_id: args[0], token_hash: args[1], blob: args[2], size: args[3], updated_at: args[4],
      });
      return { rows: [], changes: 1 };
    }
    // ── leaderboard ──
    if (sql.startsWith('INSERT INTO leaderboard')) {
      const key = `${args[0]}|${args[1]}|${args[2]}`;
      const existing = db.leaderboard.get(key);
      const next = {
        mode: args[0], day_key: args[1], player_id: args[2], name: args[3],
        score: args[4], wave: args[5], power: args[6], submitted_at: args[7],
      };
      if (!existing) db.leaderboard.set(key, next);
      else if (Number(next.score) > Number(existing.score)) db.leaderboard.set(key, next);
      return { rows: [], changes: 1 };
    }
    if (sql.includes('COUNT(*) + 1 AS rank FROM leaderboard') && sql.includes('SELECT score FROM leaderboard')) {
      const mine = [...db.leaderboard.values()].find((r) => r.mode === args[0] && r.day_key === args[1] && r.player_id === args[2]);
      const rank = mine
        ? [...db.leaderboard.values()].filter((r) => r.mode === args[0] && r.day_key === args[1] && Number(r.score) > Number(mine.score)).length + 1
        : null;
      return { rows: [{ rank }], changes: 0 };
    }
    if (sql.includes('COUNT(*) + 1 AS rank FROM leaderboard')) {
      const rank = [...db.leaderboard.values()].filter((r) => r.mode === args[0] && r.day_key === args[1] && Number(r.score) > Number(args[2])).length + 1;
      return { rows: [{ rank }], changes: 0 };
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM leaderboard')) {
      const n = [...db.leaderboard.values()].filter((r) => r.mode === args[0] && r.day_key === args[1]).length;
      return { rows: [{ n }], changes: 0 };
    }
    if (sql.startsWith('SELECT player_id, name, score, wave, power FROM leaderboard')) {
      const rows = [...db.leaderboard.values()]
        .filter((r) => r.mode === args[0] && r.day_key === args[1])
        .sort((a, b) => Number(b.score) - Number(a.score) || Number(a.submitted_at) - Number(b.submitted_at))
        .slice(0, 20);
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT score FROM leaderboard')) {
      const row = [...db.leaderboard.values()].find((r) => r.mode === args[0] && r.day_key === args[1] && r.player_id === args[2]);
      return { rows: row ? [{ score: row.score }] : [], changes: 0 };
    }
    if (sql === 'SELECT 1') return { rows: [{ 1: 1 }], changes: 0 };
    throw new Error(`FakeD1: unsupported query — add a fake for it:\n${sql}`);
  }

  async first<T>(): Promise<T | null> {
    const { rows } = this.exec();
    return (rows[0] as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.exec().rows as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: this.exec().changes } };
  }
}

// ── Context builders ──────────────────────────────────────────────────────────

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: new FakeD1() as unknown as D1Database, ...overrides };
}

export function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: JSON.stringify(body),
  });
}

/** Minimal PagesFunction context — the endpoints only touch request/env. */
export function ctx(request: Request, env: Env): Parameters<PagesFunction<Env>>[0] {
  return { request, env } as unknown as Parameters<PagesFunction<Env>>[0];
}
