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
  // ── Auction House (docs/AUCTION-HOUSE.md §server) ──
  marketWallets = new Map<string, Row>(); // key: player_id
  marketLedger = new Map<string, Row>(); // key: op_id
  marketItems = new Map<string, Row>(); // key: global_item_id
  marketListings = new Map<string, Row>(); // key: listing_id
  marketBids: Row[] = [];
  marketTrades = new Map<string, Row>(); // key: listing_id
  marketHistory = new Map<string, Row>(); // key: family|day
  marketAuthority: Row | null = null;
  marketWindows = new Map<number, Row>();
  marketFlags: Row[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql.replace(/\s+/g, ' ').trim());
  }

  /** D1 batch = one transaction: statements run in order; ANY thrown error (the wallet
   *  CHECK, the active-listing UNIQUE index) rolls the whole batch back — mirrored here
   *  with a snapshot/restore of the auction tables. */
  async batch(stmts: FakeStatement[]): Promise<{ meta: { changes: number } }[]> {
    const snap = structuredClone({
      wallets: [...this.marketWallets], ledger: [...this.marketLedger], items: [...this.marketItems],
      listings: [...this.marketListings], bids: this.marketBids, trades: [...this.marketTrades],
      history: [...this.marketHistory], authority: this.marketAuthority, windows: [...this.marketWindows],
      flags: this.marketFlags,
    });
    const out: { meta: { changes: number } }[] = [];
    try {
      for (const s of stmts) out.push(await s.run());
      return out;
    } catch (e) {
      this.marketWallets = new Map(snap.wallets as [string, Row][]);
      this.marketLedger = new Map(snap.ledger as [string, Row][]);
      this.marketItems = new Map(snap.items as [string, Row][]);
      this.marketListings = new Map(snap.listings as [string, Row][]);
      this.marketBids = snap.bids as Row[];
      this.marketTrades = new Map(snap.trades as [string, Row][]);
      this.marketHistory = new Map(snap.history as [string, Row][]);
      this.marketAuthority = snap.authority as Row | null;
      this.marketWindows = new Map(snap.windows as [number, Row][]);
      this.marketFlags = snap.flags as Row[];
      throw e;
    }
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
    // ── auction auth reads ──
    if (sql.startsWith('SELECT token_hash, meta FROM cloud_saves')) {
      const row = db.cloudSaves.get(String(args[0]));
      return { rows: row ? [{ token_hash: row.token_hash, meta: row.meta ?? '{}' }] : [], changes: 0 };
    }
    if (sql.startsWith('SELECT created_at FROM accounts')) {
      const row = db.accounts.get(String(args[0]));
      return { rows: row ? [{ created_at: row.created_at }] : [], changes: 0 };
    }
    const auction = auctionExec(db, sql, args);
    if (auction) return auction;
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

// ── Auction House query fakes (docs/AUCTION-HOUSE.md §server) ─────────────────
// Structural interpretation of exactly the SQL auctionHost + the auction endpoints issue.
// Schema guards are simulated faithfully: wallet CHECKs throw (rolled back by batch()),
// and the active-listing partial UNIQUE index throws on a double-list.

type ExecOut = { rows: Row[]; changes: number };

function num(v: unknown): number {
  return Number(v ?? 0);
}

function auctionExec(db: FakeD1, sql: string, args: unknown[]): ExecOut | null {
  // ── wallets ──
  if (sql.startsWith('INSERT INTO market_wallets')) {
    const id = String(args[0]);
    if (db.marketWallets.has(id)) return { rows: [], changes: 0 };
    db.marketWallets.set(id, {
      player_id: id, balance: 0, escrow: 0, deposited_lifetime: 0, withdrawn_lifetime: 0,
      created_at: args[1], updated_at: args[1],
    });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('SELECT balance, escrow, deposited_lifetime, withdrawn_lifetime, created_at FROM market_wallets')) {
    const row = db.marketWallets.get(String(args[0]));
    return { rows: row ? [row] : [], changes: 0 };
  }
  if (sql.startsWith('SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS bal')) {
    let bal = 0; let esc = 0;
    for (const w of db.marketWallets.values()) { bal += num(w.balance); esc += num(w.escrow); }
    return { rows: [{ n: db.marketWallets.size, bal, esc }], changes: 0 };
  }
  if (sql.startsWith('SELECT balance FROM market_wallets ORDER BY balance')) {
    const sorted = [...db.marketWallets.values()].sort((a, b) => num(a.balance) - num(b.balance));
    const row = sorted[num(args[0])];
    return { rows: row ? [{ balance: row.balance }] : [], changes: 0 };
  }
  if (sql.startsWith('UPDATE market_wallets SET')) {
    return walletUpdate(db, sql, args);
  }
  // ── wallet ledger ──
  if (sql.startsWith('INSERT INTO market_wallet_ledger')) {
    return ledgerInsert(db, sql, args);
  }
  if (sql.startsWith('SELECT COALESCE(SUM(amount), 0) AS s FROM market_wallet_ledger')) {
    let s = 0;
    for (const r of db.marketLedger.values()) {
      if (r.player_id === '@burn' && num(r.at) >= num(args[0]) && num(r.at) < num(args[1])) s += num(r.amount);
    }
    return { rows: [{ s }], changes: 0 };
  }
  if (sql.startsWith('SELECT op_id, kind, amount, at FROM market_wallet_ledger')) {
    const rows = [...db.marketLedger.values()]
      .filter((r) => r.player_id === args[0])
      .sort((a, b) => num(b.at) - num(a.at)).slice(0, 30);
    return { rows, changes: 0 };
  }
  // ── items ──
  if (sql.startsWith('INSERT INTO market_items')) {
    // Two shapes: player ingress (10 binds) and authority restock (7 binds).
    const gid = String(args[0]);
    if (db.marketItems.has(gid)) return { rows: [], changes: 0 };
    const row: Row = args.length >= 10
      ? {
          global_item_id: gid, ref_key: args[1], category: args[2], family_key: args[3], rarity: args[4],
          season: args[5], owner_id: args[6], state: 'escrow', source: args[7], transfers: 0,
          history: '[]', payload: args[8], fraud_flag: 0, created_at: args[9],
        }
      : {
          global_item_id: gid, ref_key: args[1], category: args[2], family_key: args[3], rarity: args[4],
          season: 0, owner_id: '@authority', state: 'escrow', source: 'authority', transfers: 0,
          history: '[]', payload: args[5], fraud_flag: 0, created_at: args[6],
        };
    db.marketItems.set(gid, row);
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('SELECT owner_id, state FROM market_items')) {
    const row = db.marketItems.get(String(args[0]));
    return { rows: row ? [{ owner_id: row.owner_id, state: row.state }] : [], changes: 0 };
  }
  if (sql.startsWith('SELECT history FROM market_items')) {
    const row = db.marketItems.get(String(args[0]));
    return { rows: row ? [{ history: row.history }] : [], changes: 0 };
  }
  if (sql.startsWith('SELECT COUNT(*) AS n FROM market_items')) {
    const n = [...db.marketItems.values()]
      .filter((r) => r.ref_key === args[0] && r.state === 'escrow' && r.owner_id !== args[1]).length;
    return { rows: [{ n }], changes: 0 };
  }
  if (sql.startsWith('SELECT global_item_id, ref_key, category, family_key, rarity, season, payload FROM market_items')) {
    const row = db.marketItems.get(String(args[0]));
    return { rows: row ? [row] : [], changes: 0 };
  }
  if (sql.startsWith('SELECT global_item_id, ref_key, category, family_key, rarity, season, state, source, transfers, history, payload FROM market_items')) {
    const rows = [...db.marketItems.values()]
      .filter((r) => r.owner_id === args[0] && (r.state === 'delivered' || r.state === 'returned')).slice(0, 50);
    return { rows, changes: 0 };
  }
  if (sql.startsWith('SELECT global_item_id, ref_key, category, family_key, owner_id, transfers, history FROM market_items')) {
    return { rows: [...db.marketItems.values()].filter((r) => num(r.fraud_flag) === 1).slice(0, 100), changes: 0 };
  }
  if (sql.startsWith('UPDATE market_items SET')) {
    return itemUpdate(db, sql, args);
  }
  // ── listings ──
  if (sql.startsWith('INSERT INTO market_listings')) {
    return listingInsert(db, sql, args);
  }
  if (sql.startsWith('UPDATE market_listings SET')) {
    return listingUpdate(db, sql, args);
  }
  if (!sql.startsWith('SELECT')) return auctionExecTail(db, sql, args);
  if (sql.includes('FROM market_listings WHERE listing_id = ?1')) {
    const row = db.marketListings.get(String(args[0]));
    return { rows: row ? [row] : [], changes: 0 };
  }
  if (sql.includes("MIN(COALESCE(buy_now, ask)) AS m FROM market_listings WHERE state = 'active' AND family_key")) {
    const prices = activeListings(db).filter((l) => l.family_key === args[0]).map(priceOfRow);
    return { rows: [{ m: prices.length > 0 ? Math.min(...prices) : null }], changes: 0 };
  }
  if (sql.includes("family_key, MIN(COALESCE(buy_now, ask)) AS m FROM market_listings WHERE state = 'active' GROUP BY")) {
    const map = new Map<string, number>();
    for (const l of activeListings(db)) {
      const p = priceOfRow(l);
      const cur = map.get(String(l.family_key));
      if (cur === undefined || p < cur) map.set(String(l.family_key), p);
    }
    return { rows: [...map].map(([family_key, m]) => ({ family_key, m })), changes: 0 };
  }
  if (sql.includes("family_key, COUNT(*) AS n FROM market_listings WHERE state = 'active' AND authority = 1 GROUP BY")) {
    const map = new Map<string, number>();
    for (const l of activeListings(db)) {
      if (num(l.authority) === 1) map.set(String(l.family_key), (map.get(String(l.family_key)) ?? 0) + 1);
    }
    return { rows: [...map].map(([family_key, n]) => ({ family_key, n })), changes: 0 };
  }
  if (sql.includes("FROM market_listings WHERE state = 'active' AND ends_at <= ?1 ORDER BY ends_at")) {
    const rows = activeListings(db).filter((l) => num(l.ends_at) <= num(args[0]))
      .sort((a, b) => num(a.ends_at) - num(b.ends_at)).slice(0, num(args[1]));
    return { rows, changes: 0 };
  }
  if (sql.includes("COUNT(*) AS n FROM market_listings WHERE state = 'active' AND bid IS NULL")) {
    const n = activeListings(db).filter((l) => l.bid === null && num(l.created_at) + num(l.ends_at) < num(args[0])).length;
    return { rows: [{ n }], changes: 0 };
  }
  if (sql.includes("COUNT(*) AS n FROM market_listings WHERE state = 'active' AND rarity NOT IN")) {
    const n = activeListings(db).filter((l) => l.rarity !== 'common' && l.rarity !== 'uncommon').length;
    return { rows: [{ n }], changes: 0 };
  }
  if (sql.includes("COUNT(*) AS n FROM market_listings WHERE state = 'active'")) {
    return { rows: [{ n: activeListings(db).length }], changes: 0 };
  }
  if (sql.includes('COUNT(*) AS n FROM market_listings WHERE created_at >= ?1 AND created_at < ?2')) {
    const n = [...db.marketListings.values()].filter((l) => num(l.created_at) >= num(args[0]) && num(l.created_at) < num(args[1])).length;
    return { rows: [{ n }], changes: 0 };
  }
  if (sql.includes('COUNT(*) AS n FROM market_listings WHERE seller_id = ?1 AND created_at >= ?2')) {
    const n = [...db.marketListings.values()]
      .filter((l) => l.seller_id === args[0] && num(l.created_at) >= num(args[1]) && num(l.authority) === 0).length;
    return { rows: [{ n }], changes: 0 };
  }
  if (sql.includes('SELECT seller_id, family_key, global_item_id, created_at, closed_at, state, ask FROM market_listings')) {
    const cutoff = num(args[0]);
    const rows = [...db.marketListings.values()].filter((l) =>
      num(l.authority) === 0 && (num(l.created_at) >= cutoff || (l.closed_at !== null && num(l.closed_at) >= cutoff)));
    return { rows: rows.slice(0, 1000), changes: 0 };
  }
  if (sql.includes("FROM market_listings WHERE state = 'active' AND authority = 0 LIMIT")) {
    return { rows: activeListings(db).filter((l) => num(l.authority) === 0).slice(0, 1000), changes: 0 };
  }
  if (sql.includes("FROM market_listings WHERE state = 'active' AND ends_at > ?1 AND (?2 IS NULL OR category = ?2)")) {
    return searchListings(db, sql, args);
  }
  if (sql.includes('FROM market_listings WHERE seller_id = ?1 ORDER BY created_at DESC')) {
    const rows = [...db.marketListings.values()].filter((l) => l.seller_id === args[0])
      .sort((a, b) => num(b.created_at) - num(a.created_at)).slice(0, 30);
    return { rows, changes: 0 };
  }
  if (sql.includes("FROM market_listings WHERE bidder_id = ?1 AND state = 'active'")) {
    const rows = activeListings(db).filter((l) => l.bidder_id === args[0])
      .sort((a, b) => num(a.ends_at) - num(b.ends_at)).slice(0, 30);
    return { rows, changes: 0 };
  }
  if (sql.startsWith('SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS vol')) {
    const inWin = [...db.marketTrades.values()].filter((t) => num(t.at) >= num(args[0]) && num(t.at) < num(args[1]));
    const vol = inWin.reduce((a, t) => a + num(t.price), 0);
    return { rows: [{ n: inWin.length, vol, avgp: inWin.length > 0 ? vol / inWin.length : 0 }], changes: 0 };
  }
  if (sql.startsWith('SELECT buyer_id AS id FROM market_trades')) {
    const ids = new Set<string>();
    for (const t of db.marketTrades.values()) {
      if (num(t.at) >= num(args[0]) && num(t.at) < num(args[1])) { ids.add(String(t.buyer_id)); ids.add(String(t.seller_id)); }
    }
    return { rows: [...ids].map((id) => ({ id })), changes: 0 };
  }
  if (sql.startsWith('SELECT price FROM market_trades')) {
    const rows = [...db.marketTrades.values()]
      .filter((t) => t.family_key === args[0] && num(t.at) >= num(args[1]) && num(t.at) < num(args[2]))
      .map((t) => ({ price: t.price }));
    return { rows, changes: 0 };
  }
  if (sql.includes('FROM market_trades WHERE at >= ?1 ORDER BY at DESC')) {
    const rows = [...db.marketTrades.values()].filter((t) => num(t.at) >= num(args[0]))
      .sort((a, b) => num(b.at) - num(a.at)).slice(0, 2000);
    return { rows, changes: 0 };
  }
  if (sql.includes('FROM market_trades WHERE buyer_id = ?1 OR seller_id = ?1')) {
    const rows = [...db.marketTrades.values()].filter((t) => t.buyer_id === args[0] || t.seller_id === args[0])
      .sort((a, b) => num(b.at) - num(a.at)).slice(0, 20);
    return { rows, changes: 0 };
  }
  // ── history ──
  if (sql.startsWith('SELECT day, sales, median_price, low_price, high_price FROM market_history')) {
    const rows = [...db.marketHistory.values()]
      .filter((h) => h.family_key === args[0] && String(h.day) >= String(args[1]))
      .sort((a, b) => (String(a.day) < String(b.day) ? -1 : 1));
    return { rows, changes: 0 };
  }
  if (sql.startsWith('SELECT family_key, day, sales, median_price, low_price, high_price FROM market_history')) {
    return { rows: [...db.marketHistory.values()].filter((h) => String(h.day) >= String(args[0])), changes: 0 };
  }
  // ── authority + flags (reads) ──
  if (sql.startsWith('SELECT state FROM market_authority')) {
    return { rows: db.marketAuthority ? [{ state: db.marketAuthority.state }] : [], changes: 0 };
  }
  if (sql.startsWith('SELECT flag_id, kind, detail, at, reviewed FROM market_flags WHERE reviewed = 0')) {
    return { rows: db.marketFlags.filter((f) => num(f.reviewed) === 0).slice(-200).reverse(), changes: 0 };
  }
  if (sql.startsWith('SELECT flag_id, kind, detail, at, reviewed FROM market_flags')) {
    return { rows: db.marketFlags.slice(-200).reverse(), changes: 0 };
  }
  return null;
}

/** Non-SELECT auction statements past the listings section (writes to bids/trades/history/
 *  authority/windows/flags). Split out so INSERT…SELECT statements can never be shadowed by
 *  the listing-SELECT substring matches above. */
function auctionExecTail(db: FakeD1, sql: string, args: unknown[]): ExecOut | null {
  if (sql.startsWith('INSERT INTO market_bids')) {
    const l = db.marketListings.get(String(args[0]));
    if (!l || l.bidder_id !== args[1] || l.bid !== args[2]) return { rows: [], changes: 0 };
    db.marketBids.push({ listing_id: args[0], bidder_id: args[1], amount: args[2], at: args[3] });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('INSERT INTO market_trades')) {
    const id = String(args[0]);
    const l = db.marketListings.get(id);
    if (!l || l.state !== 'sold') return { rows: [], changes: 0 };
    if (sql.includes('AND closed_at = ?9') && l.closed_at !== args[8]) return { rows: [], changes: 0 };
    if (db.marketTrades.has(id)) return { rows: [], changes: 0 };
    db.marketTrades.set(id, {
      listing_id: id, global_item_id: args[1], family_key: args[2], seller_id: args[3], buyer_id: args[4],
      price: args[5], tax: args[6], authority: args[7], at: args[8],
    });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('INSERT INTO market_history')) {
    db.marketHistory.set(`${String(args[0])}|${String(args[1])}`, {
      family_key: args[0], day: args[1], sales: args[2], median_price: args[3], low_price: args[4], high_price: args[5],
    });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('INSERT INTO market_authority')) {
    db.marketAuthority = { id: 0, state: args[0], updated_at: args[1] };
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('INSERT INTO market_windows')) {
    const key = num(args[0]);
    if (db.marketWindows.has(key)) return { rows: [], changes: 0 };
    db.marketWindows.set(key, { window_key: key, metrics: '', created_at: args[1] });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('UPDATE market_windows SET metrics')) {
    const row = db.marketWindows.get(num(args[0]));
    if (row) row.metrics = args[1];
    return { rows: [], changes: row ? 1 : 0 };
  }
  if (sql.startsWith('INSERT INTO market_flags')) {
    db.marketFlags.push({ flag_id: db.marketFlags.length + 1, kind: args[0], detail: args[1], at: args[2], reviewed: 0 });
    return { rows: [], changes: 1 };
  }
  if (sql.startsWith('UPDATE market_flags SET reviewed = 1')) {
    const row = db.marketFlags.find((f) => num(f.flag_id) === num(args[0]));
    if (row) row.reviewed = 1;
    return { rows: [], changes: row ? 1 : 0 };
  }
  return null;
}

function activeListings(db: FakeD1): Row[] {
  return [...db.marketListings.values()].filter((l) => l.state === 'active');
}

function priceOfRow(l: Row): number {
  return num(l.buy_now ?? l.ask);
}

/** Wallet mutations: parse the SET deltas, honor the EXISTS condition, enforce the CHECKs. */
function walletUpdate(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  const w = db.marketWallets.get(String(args[0]));
  if (!w) return { rows: [], changes: 0 };
  if (!existsHolds(db, sql, args)) return { rows: [], changes: 0 };
  let balance = num(w.balance);
  let escrow = num(w.escrow);
  if (sql.includes('balance = balance + ?2')) balance += num(args[1]);
  if (sql.includes('balance = balance - ?2')) balance -= num(args[1]);
  if (sql.includes('escrow = escrow + ?2')) escrow += num(args[1]);
  if (sql.includes('escrow = escrow - ?2')) escrow -= num(args[1]);
  if (balance < 0 || escrow < 0) throw new Error('CHECK constraint failed: market_wallets');
  w.balance = balance;
  w.escrow = escrow;
  if (sql.includes('deposited_lifetime = deposited_lifetime + ?3')) w.deposited_lifetime = num(w.deposited_lifetime) + num(args[2]);
  if (sql.includes('withdrawn_lifetime = withdrawn_lifetime + ?4')) w.withdrawn_lifetime = num(w.withdrawn_lifetime) + num(args[3]);
  return { rows: [], changes: 1 };
}

/** Evaluate the conditioning EXISTS(...) clauses used by the money statements. */
function existsHolds(db: FakeD1, sql: string, args: unknown[]): boolean {
  const at = (n: number): unknown => args[n - 1];
  let m = sql.match(/EXISTS \(SELECT 1 FROM market_listings WHERE listing_id = \?(\d+) AND bidder_id = \?(\d+) AND bid = \?(\d+)\)/);
  if (m) {
    const l = db.marketListings.get(String(at(+m[1])));
    return !!l && l.bidder_id === at(+m[2]) && l.bid === at(+m[3]);
  }
  m = sql.match(/EXISTS \(SELECT 1 FROM market_listings WHERE listing_id = \?(\d+) AND state = '(\w+)'\)/);
  if (m) {
    const l = db.marketListings.get(String(at(+m[1])));
    return !!l && l.state === m[2];
  }
  m = sql.match(/EXISTS \(SELECT 1 FROM market_listings WHERE listing_id = \?(\d+)\)/);
  if (m) return db.marketListings.has(String(at(+m[1])));
  m = sql.match(/EXISTS \(SELECT 1 FROM market_trades WHERE listing_id = \?(\d+) AND buyer_id = \?(\d+)\)/);
  if (m) {
    const t = db.marketTrades.get(String(at(+m[1])));
    return !!t && t.buyer_id === at(+m[2]);
  }
  m = sql.match(/EXISTS \(SELECT 1 FROM market_wallet_ledger WHERE op_id = \?(\d+) AND at = \?(\d+)\)/);
  if (m) {
    const r = db.marketLedger.get(String(at(+m[1])));
    return !!r && r.at === at(+m[2]);
  }
  m = sql.match(/EXISTS \(SELECT 1 FROM market_items WHERE global_item_id = \?(\d+) AND owner_id = \?(\d+) AND state = 'escrow'\)/);
  if (m) {
    const it = db.marketItems.get(String(at(+m[1])));
    return !!it && it.owner_id === at(+m[2]) && it.state === 'escrow';
  }
  return !sql.includes('EXISTS ('); // no condition ⇒ unconditional
}

function ledgerInsert(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  if (!existsHolds(db, sql, args)) return { rows: [], changes: 0 };
  const opId = String(args[0]);
  if (db.marketLedger.has(opId)) return { rows: [], changes: 0 };
  const burn = sql.includes("'@burn'");
  const kindMatch = sql.match(/'(listingFee|saleTax|authoritySale|saleProceeds|auctionWin|buyNow)'/);
  const row: Row = burn
    ? { op_id: opId, player_id: '@burn', kind: kindMatch?.[1] ?? 'burn', amount: args[1], at: args[2] }
    : kindMatch
      ? { op_id: opId, player_id: args[1], kind: kindMatch[1], amount: args[2], at: args[3] }
      : { op_id: opId, player_id: args[1], kind: args[2], amount: args[3], at: args[4] };
  db.marketLedger.set(opId, row);
  return { rows: [], changes: 1 };
}

function listingInsert(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  const conditioned = sql.includes('WHERE EXISTS');
  if (conditioned && !existsHolds(db, sql, args)) return { rows: [], changes: 0 };
  // The partial UNIQUE index: one ACTIVE listing per item — violating it throws.
  const gid = String(args[1]);
  for (const l of db.marketListings.values()) {
    if (l.state === 'active' && l.global_item_id === gid) throw new Error('UNIQUE constraint failed: idx_market_listings_active_item');
  }
  const id = String(args[0]);
  const row: Row = conditioned
    ? { // player listing: 12 binds (bid/bidder NULL, closed_at NULL, authority 0)
        listing_id: id, global_item_id: gid, family_key: args[2], category: args[3], rarity: args[4],
        seller_id: args[5], season: args[6], ask: args[7], buy_now: args[8], bid: null, bidder_id: null,
        ends_at: args[9], created_at: args[10], closed_at: null, state: 'active', fee_paid: args[11], authority: 0,
      }
    : { // authority restock: 8 binds (ask = buy_now = price)
        listing_id: id, global_item_id: gid, family_key: args[2], category: args[3], rarity: args[4],
        seller_id: '@authority', season: 0, ask: args[5], buy_now: args[5], bid: null, bidder_id: null,
        ends_at: args[6], created_at: args[7], closed_at: null, state: 'active', fee_paid: 0, authority: 1,
      };
  db.marketListings.set(id, row);
  return { rows: [], changes: 1 };
}

function listingUpdate(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  const l = db.marketListings.get(String(args[0]));
  if (!l) return { rows: [], changes: 0 };
  if (sql.includes('SET bid = ?2')) {
    const prevOk = (l.bid ?? -1) === (args[4] ?? -1);
    if (l.state !== 'active' || !prevOk) return { rows: [], changes: 0 };
    l.bid = args[1]; l.bidder_id = args[2]; l.ends_at = args[3];
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET state = 'sold'")) {
    if (l.state !== 'active') return { rows: [], changes: 0 };
    if (sql.includes('ends_at > ?2') && !(num(l.ends_at) > num(args[1]))) return { rows: [], changes: 0 };
    if (sql.includes('buy_now IS NOT NULL') && l.buy_now === null) return { rows: [], changes: 0 };
    l.state = 'sold'; l.closed_at = args[1];
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET state = 'expired'")) {
    if (l.state !== 'active') return { rows: [], changes: 0 };
    l.state = 'expired'; l.closed_at = args[1];
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET state = 'cancelled'")) {
    if (l.state !== 'active' || l.seller_id !== args[2] || l.bid !== null) return { rows: [], changes: 0 };
    l.state = 'cancelled'; l.closed_at = args[1];
    return { rows: [], changes: 1 };
  }
  throw new Error(`FakeD1: unsupported listing update:\n${sql}`);
}

function itemUpdate(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  if (sql.includes('SET fraud_flag = 1')) {
    let changes = 0;
    for (const it of db.marketItems.values()) if (it.ref_key === args[0]) { it.fraud_flag = 1; changes++; }
    return { rows: [], changes };
  }
  const it = db.marketItems.get(String(args[0]));
  if (!it) return { rows: [], changes: 0 };
  if (sql.includes("SET state = 'escrow', payload = ?3")) {
    if (it.owner_id !== args[1]) return { rows: [], changes: 0 };
    it.state = 'escrow'; it.payload = args[2];
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET state = 'returned'")) {
    if (!existsHolds(db, sql, args)) return { rows: [], changes: 0 };
    it.state = 'returned';
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET state = 'collected'")) {
    if (it.owner_id !== args[1] || (it.state !== 'delivered' && it.state !== 'returned')) return { rows: [], changes: 0 };
    it.state = 'collected';
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET owner_id = ?2, state = 'delivered', transfers = transfers + 1, history = ?3")) {
    it.owner_id = args[1]; it.state = 'delivered'; it.transfers = num(it.transfers) + 1; it.history = args[2];
    return { rows: [], changes: 1 };
  }
  if (sql.includes("SET owner_id = ?2, state = 'delivered', transfers = transfers + 1")) {
    const m = sql.match(/EXISTS \(SELECT 1 FROM market_trades WHERE listing_id = \?(\d+) AND buyer_id = \?(\d+)\)/);
    if (m) {
      const t = db.marketTrades.get(String(args[+m[1] - 1]));
      if (!t || t.buyer_id !== args[+m[2] - 1]) return { rows: [], changes: 0 };
    }
    it.owner_id = args[1]; it.state = 'delivered'; it.transfers = num(it.transfers) + 1;
    return { rows: [], changes: 1 };
  }
  if (sql.includes('SET history = json_insert')) {
    let h: unknown[] = [];
    try { h = JSON.parse(String(it.history)) as unknown[]; } catch { h = []; }
    h.push(args[1]);
    it.history = JSON.stringify(h);
    return { rows: [], changes: 1 };
  }
  throw new Error(`FakeD1: unsupported item update:\n${sql}`);
}

function searchListings(db: FakeD1, sql: string, args: unknown[]): ExecOut {
  const [nowV, cat, rarity, familiesJson, season, minPrice, maxPrice, limit, offset] = args;
  let rows = activeListings(db).filter((l) => num(l.ends_at) > num(nowV));
  if (cat !== null) rows = rows.filter((l) => l.category === cat);
  if (rarity !== null) rows = rows.filter((l) => l.rarity === rarity);
  if (familiesJson !== null) {
    const fams = new Set(JSON.parse(String(familiesJson)) as string[]);
    rows = rows.filter((l) => fams.has(String(l.family_key)));
  }
  if (season !== null) rows = rows.filter((l) => num(l.season) === num(season));
  const price = (l: Row): number => num(l.buy_now ?? l.bid ?? l.ask);
  if (minPrice !== null) rows = rows.filter((l) => price(l) >= num(minPrice));
  if (maxPrice !== null) rows = rows.filter((l) => price(l) <= num(maxPrice));
  if (sql.includes('ORDER BY ends_at ASC')) rows.sort((a, b) => num(a.ends_at) - num(b.ends_at));
  else if (sql.includes('ORDER BY COALESCE(buy_now, bid, ask) ASC')) rows.sort((a, b) => price(a) - price(b));
  else if (sql.includes('ORDER BY COALESCE(buy_now, bid, ask) DESC')) rows.sort((a, b) => price(b) - price(a));
  else rows.sort((a, b) => num(b.created_at) - num(a.created_at));
  return { rows: rows.slice(num(offset), num(offset) + num(limit)), changes: 0 };
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
