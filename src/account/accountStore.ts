// ACCOUNT STORE (docs/ACCOUNTS.md) — the device's view of "who am I". Lives OUTSIDE
// the game save (like src/net/identity.ts, which it wraps): signing in/out or
// importing a save never mixes the two. Persisted to its own localStorage key;
// storage-less environments run on the in-memory copy (offline-first everywhere).
//
// The state is deliberately tiny and JSON-safe. Sync bookkeeping (lastSyncedRev &
// friends) lives here too so the sync engine survives reloads.

import { playerId, syncToken, adoptSyncCode, resetIdentity } from '../net/identity';

export type AccountProviderId = 'guest' | 'email'; // future: 'steam' | 'google' | 'apple' | 'discord'

export interface AccountState {
  /** The account id — ALWAYS the identity playerId (guests + registered alike). */
  accountId: string;
  provider: AccountProviderId;
  /** Set once the account exists server-side (guest formalized or registered). */
  registered: boolean;
  email: string | null;
  displayName: string;
  icon: string;
  /** Bearer session for registered sign-ins (null ⇒ guest-token auth). */
  session: string | null;
  createdAt: number; // ms epoch (client clock; server owns the canonical one)
  lastLoginAt: number;
  platforms: string[];
  /** First-launch gate: has the player chosen Guest / Sign-in yet? */
  onboarded: boolean;
  // ── sync bookkeeping (the engine's durable memory) ──
  lastSyncedRev: number; // cloud rev this device last agreed with (0 = never)
  lastSyncedAt: number; // ms epoch of the last successful push/pull
  pendingSince: number; // ms epoch of the oldest unsynced local change (0 = clean)
}

const KEY = 'assimilate.account';

export function currentPlatform(): string {
  return 'web'; // future launchers (Steam/Android/iOS shells) override at boot
}

function defaults(): AccountState {
  return {
    accountId: playerId(),
    provider: 'guest',
    registered: false,
    email: null,
    displayName: '',
    icon: '',
    session: null,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    platforms: [currentPlatform()],
    onboarded: false,
    lastSyncedRev: 0,
    lastSyncedAt: 0,
    pendingSince: 0,
  };
}

function load(): AccountState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<AccountState>;
    const d = defaults();
    // Sanitize field-by-field (same posture as the save store): unknown/wrong-typed
    // values fall back — a tampered account blob can only ever hurt itself.
    return {
      ...d,
      ...parsed,
      accountId: typeof parsed.accountId === 'string' && parsed.accountId.length === 36 ? parsed.accountId : d.accountId,
      provider: parsed.provider === 'email' ? 'email' : 'guest',
      registered: parsed.registered === true,
      session: typeof parsed.session === 'string' && /^[0-9a-f]{64}$/.test(parsed.session) ? parsed.session : null,
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms.filter((p): p is string => typeof p === 'string').slice(0, 8) : d.platforms,
      lastSyncedRev: typeof parsed.lastSyncedRev === 'number' && parsed.lastSyncedRev >= 0 ? Math.floor(parsed.lastSyncedRev) : 0,
    };
  } catch {
    return defaults();
  }
}

let state: AccountState = typeof localStorage === 'undefined' ? defaults() : load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode — memory copy carries the session */
  }
}

export const account = {
  get(): AccountState {
    return state;
  },

  set(patch: Partial<AccountState>): void {
    state = { ...state, ...patch };
    persist();
    for (const fn of listeners) fn();
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** The auth credentials every backend call sends — session when signed in,
   *  the device sync token otherwise. ONE shape for every provider. */
  credentials(): { playerId: string; token?: string; session?: string } {
    return state.session
      ? { playerId: state.accountId, session: state.session }
      : { playerId: state.accountId, token: syncToken() };
  },

  /** Adopt a signed-in account from another device: the account id REPLACES the
   *  local identity (it keys the cloud save + purchases), and the session becomes
   *  the credential. The caller pulls the cloud save right after. */
  adoptSignIn(accountId: string, session: string, view: { provider?: string; email?: string | null; displayName?: string; icon?: string; createdAt?: number; platforms?: string[] }): void {
    adoptSyncCode(`${accountId}.${syncToken()}`); // keep identity module in agreement (token stays device-local)
    this.set({
      accountId,
      provider: view.provider === 'email' ? 'email' : 'guest',
      registered: true,
      email: view.email ?? null,
      displayName: view.displayName ?? '',
      icon: view.icon ?? '',
      session,
      createdAt: typeof view.createdAt === 'number' ? view.createdAt * 1000 : state.createdAt,
      lastLoginAt: Date.now(),
      platforms: view.platforms ?? state.platforms,
      onboarded: true,
      lastSyncedRev: 0, // new lineage — the next sync decision starts fresh
      lastSyncedAt: 0,
      pendingSince: 0,
    });
  },

  /** Sign out on this device only: drop the session AND mint a fresh guest
   *  identity — progress made after signing out must never ride the old account's
   *  id (its cloud slot/purchases stay untouched, reachable by signing back in).
   *  Local play continues; the game save itself is untouched. */
  signOutLocal(): void {
    const fresh = resetIdentity();
    this.set({
      accountId: fresh.playerId,
      provider: 'guest',
      registered: false,
      email: null,
      displayName: '',
      session: null,
      lastSyncedRev: 0,
      lastSyncedAt: 0,
      pendingSince: 0,
    });
  },
};
