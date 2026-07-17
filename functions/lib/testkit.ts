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
  accounts = new Map<string, Row>(); // key: account_id
  sessions = new Map<string, Row>(); // key: token_hash
  resetTokens = new Map<string, Row>(); // key: token_hash
  arenaRatings = new Map<string, Row>(); // key: player|season
  arenaMatches = new Map<string, Row>(); // key: match|player

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
    if (sql.startsWith('SELECT token_hash, blob, updated_at, rev, meta FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT rev, meta, size, updated_at FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT token_hash, blob, updated_at FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('DELETE FROM cloud_saves')) {
      const existed = db.cloudSaves.delete(String(args[0]));
      return { rows: [], changes: existed ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO cloud_saves')) {
      db.cloudSaves.set(String(args[0]), {
        player_id: args[0], token_hash: args[1], blob: args[2], size: args[3], updated_at: args[4],
        rev: args[5] ?? 1, meta: args[6] ?? '{}',
      });
      return { rows: [], changes: 1 };
    }
    // ── accounts ──
    if (sql.startsWith('SELECT * FROM accounts WHERE account_id')) {
      const row = db.accounts.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT * FROM accounts WHERE email')) {
      const row = [...db.accounts.values()].find((r) => r.email === args[0]);
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO accounts')) {
      db.accounts.set(String(args[0]), {
        account_id: args[0], provider: 'guest', email: null, pass_hash: null, pass_salt: null, pass_iters: null,
        guest_token_hash: args[1], display_name: '', icon: '', created_at: args[2], last_login: args[2],
        playtime_sec: 0, platforms: args[3],
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('UPDATE accounts SET last_login')) {
      const row = db.accounts.get(String(args[0]));
      if (row) { row.last_login = args[1]; row.platforms = args[2]; }
      return { rows: [], changes: row ? 1 : 0 };
    }
    if (sql.startsWith("UPDATE accounts SET provider = 'email'")) {
      const row = db.accounts.get(String(args[0]));
      if (row) {
        row.provider = 'email'; row.email = args[1]; row.pass_hash = args[2];
        row.pass_salt = args[3]; row.pass_iters = args[4]; row.display_name = args[5];
      }
      return { rows: [], changes: row ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE accounts SET pass_hash')) {
      const row = db.accounts.get(String(args[0]));
      if (row) { row.pass_hash = args[1]; row.pass_salt = args[2]; row.pass_iters = args[3]; }
      return { rows: [], changes: row ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE accounts SET display_name')) {
      const row = db.accounts.get(String(args[0]));
      if (row) { row.display_name = args[1]; row.icon = args[2]; row.playtime_sec = args[3]; }
      return { rows: [], changes: row ? 1 : 0 };
    }
    // ── sessions ──
    if (sql.startsWith('INSERT INTO sessions')) {
      db.sessions.set(String(args[0]), {
        token_hash: args[0], account_id: args[1], platform: args[2], created_at: args[3], expires_at: args[4],
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT account_id, expires_at FROM sessions')) {
      const row = db.sessions.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('DELETE FROM sessions WHERE token_hash')) {
      const existed = db.sessions.delete(String(args[0]));
      return { rows: [], changes: existed ? 1 : 0 };
    }
    if (sql.startsWith('DELETE FROM sessions WHERE account_id')) {
      let changes = 0;
      for (const [k, v] of db.sessions) if (v.account_id === args[0]) { db.sessions.delete(k); changes++; }
      return { rows: [], changes };
    }
    // ── reset_tokens ──
    if (sql.startsWith('INSERT INTO reset_tokens')) {
      db.resetTokens.set(String(args[0]), { token_hash: args[0], account_id: args[1], created_at: args[2], expires_at: args[3] });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT account_id, expires_at FROM reset_tokens')) {
      const row = db.resetTokens.get(String(args[0]));
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('DELETE FROM reset_tokens')) {
      const existed = db.resetTokens.delete(String(args[0]));
      return { rows: [], changes: existed ? 1 : 0 };
    }
    // ── leaderboard ──
    if (sql.startsWith('INSERT INTO leaderboard')) {
      const key = `${args[0]}|${args[1]}|${args[2]}`;
      const existing = db.leaderboard.get(key);
      const next = {
        mode: args[0], day_key: args[1], player_id: args[2], name: args[3],
        score: args[4], wave: args[5], power: args[6], submitted_at: args[7],
        replay: args[8] ?? null, verified: 0,
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
    if (sql.startsWith('SELECT player_id, name, score, wave, power, verified FROM leaderboard')) {
      const rows = [...db.leaderboard.values()]
        .filter((r) => r.mode === args[0] && r.day_key === args[1])
        .sort((a, b) => Number(b.score) - Number(a.score) || Number(a.submitted_at) - Number(b.submitted_at))
        .slice(0, 20);
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT score, wave FROM leaderboard')) {
      const row = [...db.leaderboard.values()].find((r) => r.mode === args[0] && r.day_key === args[1] && r.player_id === args[2]);
      return { rows: row ? [{ score: row.score, wave: row.wave }] : [], changes: 0 };
    }
    // ── arena (docs/ARENA.md §7) ──
    if (sql.startsWith('SELECT rating, wins, losses, placements, streak, peak FROM arena_ratings')) {
      const row = db.arenaRatings.get(`${args[0]}|${args[1]}`);
      return { rows: row ? [row] : [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO arena_matches')) {
      const key = `${args[0]}|${args[1]}`;
      if (db.arenaMatches.has(key)) return { rows: [], changes: 0 }; // ON CONFLICT DO NOTHING
      db.arenaMatches.set(key, {
        match_id: args[0], player_id: args[1], season: args[2], outcome: args[3], vs_ai: args[4],
        opp_rating: args[5], duration_sec: args[6], wave: args[7], power: args[8], rating_after: args[9], created_at: args[10],
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT rating_after FROM arena_matches')) {
      const row = db.arenaMatches.get(`${args[0]}|${args[1]}`);
      return { rows: row ? [{ rating_after: row.rating_after }] : [], changes: 0 };
    }
    if (sql.startsWith('INSERT INTO arena_ratings')) {
      db.arenaRatings.set(`${args[0]}|${args[1]}`, {
        player_id: args[0], season: args[1], rating: args[2], wins: args[3], losses: args[4],
        placements: args[5], streak: args[6], peak: args[7], updated_at: args[8], name: args[9] ?? '',
      });
      return { rows: [], changes: 1 };
    }
    if (sql.startsWith('SELECT player_id, name, rating, wins, losses, peak FROM arena_ratings')) {
      const rows = [...db.arenaRatings.values()]
        .filter((r) => r.season === args[0])
        .sort((a, b) => Number(b.rating) - Number(a.rating) || Number(a.updated_at) - Number(b.updated_at))
        .slice(0, 50)
        .map((r) => ({ player_id: r.player_id, name: r.name ?? '', rating: r.rating, wins: r.wins, losses: r.losses, peak: r.peak }));
      return { rows, changes: 0 };
    }
    if (sql.startsWith('SELECT COUNT(*) + 1 AS rank FROM arena_ratings')) {
      const rank = 1 + [...db.arenaRatings.values()].filter((r) => r.season === args[0] && Number(r.rating) > Number(args[1])).length;
      return { rows: [{ rank }], changes: 0 };
    }
    if (sql.startsWith('UPDATE arena_matches SET rating_after')) {
      const row = db.arenaMatches.get(`${args[1]}|${args[2]}`);
      if (row) row.rating_after = args[0];
      return { rows: [], changes: row ? 1 : 0 };
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
