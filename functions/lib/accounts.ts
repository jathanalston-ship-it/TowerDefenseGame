// Account platform core (docs/ACCOUNTS.md): password hashing, sessions, and the ONE
// place credentials are resolved to an account. Endpoints call these helpers —
// provider-specific logic never leaks into route files, so a future provider
// (Steam/Google/Apple/Discord) is a new `provider` value + one resolve branch here.
//
// Crypto is WebCrypto-only (crypto.subtle) so the same code runs on Workers AND in
// the Node vitest suite. Passwords: PBKDF2-SHA256, per-account 16-byte salt, high
// iteration count stored per-row (a future cost bump rehashes lazily on login).
// Sessions/resets: 256-bit random opaque tokens, stored as SHA-256 only.

import type { Env } from './env';
import { sha256Hex, hex, timingSafeEqualStr } from './crypto';

export const PASS_ITERS = 210_000; // OWASP 2023+ guidance for PBKDF2-SHA256
export const SESSION_TTL_SEC = 90 * 24 * 3600; // 90 days, refreshed on login
export const RESET_TTL_SEC = 30 * 60; // password-reset tokens live 30 minutes

export const PROVIDERS = ['guest', 'email'] as const; // future: 'steam' | 'google' | 'apple' | 'discord'
export type Provider = (typeof PROVIDERS)[number];

export interface AccountRow {
  account_id: string;
  provider: string;
  email: string | null;
  pass_hash: string | null;
  pass_salt: string | null;
  pass_iters: number | null;
  guest_token_hash: string | null;
  display_name: string;
  icon: string;
  created_at: number;
  last_login: number;
  playtime_sec: number;
  platforms: string;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function randomToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return hex(buf);
}

// ── passwords ────────────────────────────────────────────────────────────────────

export async function hashPassword(password: string, saltHex?: string, iters = PASS_ITERS): Promise<{ hash: string; salt: string; iters: number }> {
  const salt = saltHex ?? hex(crypto.getRandomValues(new Uint8Array(16)));
  const saltBytes = new Uint8Array(salt.match(/../g)!.map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iters }, key, 256);
  return { hash: hex(new Uint8Array(bits)), salt, iters };
}

export async function verifyPassword(password: string, row: Pick<AccountRow, 'pass_hash' | 'pass_salt' | 'pass_iters'>): Promise<boolean> {
  if (!row.pass_hash || !row.pass_salt || !row.pass_iters) return false;
  const { hash } = await hashPassword(password, row.pass_salt, row.pass_iters);
  return timingSafeEqualStr(hash, row.pass_hash);
}

/** Minimal password policy — length is the only rule that reliably helps. */
export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'password-too-short';
  if (p.length > 256) return 'password-too-long';
  return null;
}

// ── accounts ─────────────────────────────────────────────────────────────────────

export async function getAccount(env: Env, accountId: string): Promise<AccountRow | null> {
  return await env.DB.prepare('SELECT * FROM accounts WHERE account_id = ?1').bind(accountId).first<AccountRow>();
}

export async function getAccountByEmail(env: Env, email: string): Promise<AccountRow | null> {
  return await env.DB.prepare('SELECT * FROM accounts WHERE email = ?1').bind(email.toLowerCase()).first<AccountRow>();
}

/** Formalize a device identity as a guest account (idempotent). TOFU like the cloud
 *  save slot: first presenter of a token claims the id; later calls must match. */
export async function upsertGuest(env: Env, accountId: string, tokenHash: string, platform: string): Promise<AccountRow | 'wrong-token'> {
  const existing = await getAccount(env, accountId);
  if (existing) {
    if (existing.guest_token_hash && !timingSafeEqualStr(existing.guest_token_hash, tokenHash)) return 'wrong-token';
    await touchLogin(env, existing, platform);
    return (await getAccount(env, accountId))!;
  }
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO accounts (account_id, provider, guest_token_hash, created_at, last_login, platforms)
     VALUES (?1, 'guest', ?2, ?3, ?3, ?4)`,
  ).bind(accountId, tokenHash, t, JSON.stringify([platform])).run();
  return (await getAccount(env, accountId))!;
}

/** Record a login: bump last_login and remember the platform (bounded history). */
export async function touchLogin(env: Env, row: AccountRow, platform: string): Promise<void> {
  let platforms: string[] = [];
  try { platforms = JSON.parse(row.platforms) as string[]; } catch { /* rebuilt below */ }
  if (!platforms.includes(platform)) platforms = [...platforms, platform].slice(-8);
  await env.DB.prepare('UPDATE accounts SET last_login = ?2, platforms = ?3 WHERE account_id = ?1')
    .bind(row.account_id, nowSec(), JSON.stringify(platforms)).run();
}

// ── sessions ─────────────────────────────────────────────────────────────────────

export async function mintSession(env: Env, accountId: string, platform: string): Promise<string> {
  const token = randomToken();
  const t = nowSec();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, account_id, platform, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  ).bind(await sha256Hex(token), accountId, platform, t, t + SESSION_TTL_SEC).run();
  return token;
}

export async function sessionAccount(env: Env, sessionToken: string): Promise<AccountRow | null> {
  const row = await env.DB.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?1')
    .bind(await sha256Hex(sessionToken)).first<{ account_id: string; expires_at: number }>();
  if (!row || row.expires_at < nowSec()) return null;
  return getAccount(env, row.account_id);
}

export async function revokeSession(env: Env, sessionToken: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(sessionToken)).run();
}

// ── unified credential resolution (THE provider seam) ───────────────────────────

export interface Credentials {
  playerId?: string;
  token?: string; // legacy device sync token (guest credential)
  session?: string; // account session token (any signed-in provider)
}

/** Resolve any supported credential to the account it proves ownership of.
 *  Order: session (strongest, provider-agnostic) → guest token. Returns null when
 *  nothing verifies. Save/entitlement endpoints call ONLY this. */
export async function resolveAccount(env: Env, c: Credentials): Promise<AccountRow | null> {
  if (c.session) {
    const acct = await sessionAccount(env, c.session);
    if (acct && (!c.playerId || c.playerId === acct.account_id)) return acct;
    return null;
  }
  if (c.playerId && c.token) {
    const acct = await getAccount(env, c.playerId);
    if (acct?.guest_token_hash && timingSafeEqualStr(acct.guest_token_hash, await sha256Hex(c.token))) return acct;
  }
  return null;
}

/** The public projection of an account row (never leaks hashes/salts). */
export function accountView(row: AccountRow): Record<string, unknown> {
  let platforms: string[] = [];
  try { platforms = JSON.parse(row.platforms) as string[]; } catch { /* empty */ }
  return {
    accountId: row.account_id,
    provider: row.provider,
    email: row.email,
    displayName: row.display_name,
    icon: row.icon,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    playtimeSec: row.playtime_sec,
    platforms,
  };
}
