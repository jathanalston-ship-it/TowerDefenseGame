// ACCOUNT PROVIDERS (docs/ACCOUNTS.md §providers) — the ONE client seam between the
// game and any identity backend. UI talks to `providers`/`accountApi`; nothing else
// in the codebase knows an endpoint or a provider name. Adding Steam/Google/Apple/
// Discord later = one more AccountProvider entry (their SDK dance lives inside it),
// zero changes anywhere else.
//
// Every call fails SOFT ({ok:false, error}) — offline or unconfigured backends never
// throw into gameplay code (offline play is first-class).

import { account, currentPlatform } from './accountStore';
import { guestModeActive } from '../state/guestMode';
import { syncToken } from '../net/identity';
import { trackEvent } from '../net/events';

export type AuthResult = { ok: true } | { ok: false; error: string };

interface AccountViewWire {
  accountId: string;
  provider: string;
  email: string | null;
  displayName: string;
  icon: string;
  createdAt: number;
  lastLogin: number;
  playtimeSec: number;
  platforms: string[];
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
    if (!res.ok || !data || data.ok === false) return { ok: false, error: data?.error ?? `request failed (${res.status})` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** A pluggable identity provider. `signIn` = returning player on a new device;
 *  `register` = create/upgrade on THIS device. Providers own their credentials
 *  shape; they all land in the same account store. */
export interface AccountProvider {
  id: string;
  label: string;
  /** True when this provider can run right now (future SDK providers gate here). */
  available(): boolean;
  register?(input: { email: string; password: string; displayName?: string }): Promise<AuthResult>;
  signIn?(input: { email: string; password: string }): Promise<AuthResult>;
}

// ── guest ────────────────────────────────────────────────────────────────────────

/** Formalize this device as a guest account server-side (lazy, idempotent — called
 *  by the sync engine whenever online; pure local play never needs it). */
export async function ensureGuestRegistered(): Promise<AuthResult> {
  if (guestModeActive()) return { ok: false, error: 'guest-mode' }; // Guest Mode is a local tryout — no server-side account exists until conversion
  const s = account.get();
  if (s.registered) return { ok: true };
  const r = await post<{ account: AccountViewWire }>('/api/account/guest', {
    playerId: s.accountId, token: syncToken(), platform: currentPlatform(),
  });
  if (!r.ok) return r;
  account.set({ registered: true, createdAt: r.data.account.createdAt * 1000, platforms: r.data.account.platforms });
  trackEvent('account_guest');
  return { ok: true };
}

const guestProvider: AccountProvider = {
  id: 'guest',
  label: 'Guest',
  available: () => true,
};

// ── email / password ─────────────────────────────────────────────────────────────

const emailProvider: AccountProvider = {
  id: 'email',
  label: 'Email & Password',
  available: () => true,

  /** Create the permanent account AS AN UPGRADE of this device's guest identity —
   *  same account id, so every save/purchase/record carries over (docs/ACCOUNTS.md). */
  async register({ email, password, displayName }): Promise<AuthResult> {
    const s = account.get();
    const r = await post<{ session: string; account: AccountViewWire }>('/api/account/register', {
      playerId: s.accountId, token: syncToken(), email, password,
      displayName: displayName || s.displayName || undefined, platform: currentPlatform(),
    });
    if (!r.ok) return r;
    account.set({
      provider: 'email', registered: true, email: r.data.account.email,
      displayName: r.data.account.displayName, session: r.data.session,
      onboarded: true, lastLoginAt: Date.now(),
    });
    trackEvent('account_register');
    return { ok: true };
  },

  /** Sign in on a new device: adopt the account identity, then the caller pulls
   *  the cloud save (App wires that through the sync engine). */
  async signIn({ email, password }): Promise<AuthResult> {
    const r = await post<{ session: string; account: AccountViewWire }>('/api/account/login', {
      email, password, platform: currentPlatform(),
    });
    if (!r.ok) return r;
    account.adoptSignIn(r.data.account.accountId, r.data.session, r.data.account);
    trackEvent('account_login');
    return { ok: true };
  },
};

// ── the registry ─────────────────────────────────────────────────────────────────

export const PROVIDERS: readonly AccountProvider[] = [guestProvider, emailProvider];

export const accountApi = {
  register: (email: string, password: string, displayName?: string): Promise<AuthResult> =>
    emailProvider.register!({ email, password, displayName }),

  signIn: (email: string, password: string): Promise<AuthResult> => emailProvider.signIn!({ email, password }),

  async signOut(): Promise<AuthResult> {
    const s = account.get();
    if (s.session) void post('/api/account/logout', { session: s.session }); // best-effort revoke
    account.signOutLocal();
    return { ok: true };
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
    const r = await post<{ session: string }>('/api/account/password', {
      ...account.credentials(), oldPassword, newPassword,
    });
    if (!r.ok) return r;
    account.set({ session: r.data.session }); // rotation keeps this device signed in
    return { ok: true };
  },

  requestPasswordReset: (email: string): Promise<AuthResult> =>
    post('/api/account/reset', { action: 'request', email }).then((r) => (r.ok ? { ok: true } : r)),

  confirmPasswordReset: (token: string, newPassword: string): Promise<AuthResult> =>
    post('/api/account/reset', { action: 'confirm', token, newPassword }).then((r) => (r.ok ? { ok: true } : r)),

  /** Push profile fields (display name / icon / playtime) to the account record.
   *  Fire-and-forget from UI; the server keeps playtime monotonic. */
  async pushProfile(fields: { displayName?: string; icon?: string; playtimeSec?: number }): Promise<AuthResult> {
    const r = await post('/api/account/me', { ...account.credentials(), ...fields });
    return r.ok ? { ok: true } : r;
  },
};
