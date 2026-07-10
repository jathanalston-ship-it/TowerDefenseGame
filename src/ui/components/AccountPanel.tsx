// ACCOUNT UI (docs/ACCOUNTS.md) — every player-facing account surface in one place:
//   · AccountPanel  — Settings: status, sign in / create / upgrade, password, sign out, manual sync
//   · AccountCard   — Player Profile: identity + cloud/platform status at a glance
//   · ConflictModal — the sync engine's conflict resolution (preview → player decides)
//   · WelcomeGate   — first-launch choice: Continue as Guest / Sign In (offline-aware)
// All state comes from the account store + sync engine + connectivity — components
// never talk to endpoints directly (providers own that seam).

import { useEffect, useState, useSyncExternalStore } from 'react';
import { account, type AccountState } from '../../account/accountStore';
import { accountApi, ensureGuestRegistered } from '../../account/providers';
import { syncEngine, type SyncState } from '../../net/syncEngine';
import { connectivity } from '../../net/connectivity';
import { meta } from '../../state/meta';

export function useAccount(): AccountState {
  return useSyncExternalStore(account.subscribe, account.get);
}

export function useSync(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.get);
}

export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline);
}

const fmtWhen = (ms: number): string => (ms > 0 ? new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'never');
const fmtHours = (sec: number): string => (sec >= 3600 ? `${(sec / 3600).toFixed(1)}h` : `${Math.round(sec / 60)}m`);

function syncLine(s: SyncState, online: boolean, lastSyncedAt: number): { dot: string; text: string } {
  if (!online) return { dot: 'off', text: 'Offline — progress is saved on this device and will sync when you reconnect.' };
  switch (s.phase) {
    case 'syncing': return { dot: 'busy', text: 'Syncing…' };
    case 'conflict': return { dot: 'warn', text: 'Sync conflict — your decision is needed.' };
    case 'error': return { dot: 'warn', text: `Sync trouble (${s.lastError ?? 'unknown'}) — retrying automatically.` };
    case 'synced': return { dot: 'on', text: `Cloud up to date — last sync ${fmtWhen(lastSyncedAt)}.` };
    default: return { dot: syncEngine.isDirty() ? 'busy' : 'on', text: lastSyncedAt > 0 ? `Last sync ${fmtWhen(lastSyncedAt)}.` : 'Waiting for the first sync.' };
  }
}

// ── shared auth forms ────────────────────────────────────────────────────────────

function AuthForms({ mode, onDone }: { mode: 'register' | 'signin'; onDone?: () => void }): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const online = useOnline();

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = mode === 'register' ? await accountApi.register(email, password, meta.get().profileName) : await accountApi.signIn(email, password);
    setBusy(false);
    if (!r.ok) {
      setError(humanError(r.error));
      return;
    }
    void syncEngine.syncNow(); // register ⇒ first mirror; sign-in ⇒ pull (or conflict flow)
    onDone?.();
  };

  const forgot = async (): Promise<void> => {
    if (!email) { setError('Enter your email first, then tap Forgot password.'); return; }
    const r = await accountApi.requestPasswordReset(email);
    if (r.ok) setResetSent(true);
    else setError(humanError(r.error));
  };

  return (
    <div className="acct-form">
      <input className="acct-input" type="email" placeholder="Email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <input
        className="acct-input" type="password" value={password} disabled={busy}
        placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
      />
      <div className="acct-form-row">
        <button className="acct-btn primary" onClick={() => void submit()} disabled={busy || !online || !email || password.length < 8}>
          {busy ? '…' : mode === 'register' ? 'Create Account' : 'Sign In'}
        </button>
        {mode === 'signin' && (
          <button className="acct-btn ghost" onClick={() => void forgot()} disabled={busy || !online}>Forgot password</button>
        )}
      </div>
      {!online && <div className="acct-note">You're offline — accounts need a connection (play continues without one).</div>}
      {resetSent && <div className="acct-note">If that email has an account, a reset link is on its way.</div>}
      {error && <div className="acct-error">{error}</div>}
    </div>
  );
}

function humanError(code: string): string {
  const map: Record<string, string> = {
    'email-taken': 'That email already has an account — try signing in instead.',
    'already-registered': 'This device is already attached to a full account.',
    'bad-credentials': 'Email or password did not match.',
    'password-too-short': 'Passwords need at least 8 characters.',
    'email-not-configured': 'Password reset email is not set up on this server yet.',
    'rate-limited': 'Too many attempts — give it a few minutes.',
    network: 'Could not reach the server — check your connection.',
  };
  return map[code] ?? `Something went wrong (${code}).`;
}

// ── Settings panel ───────────────────────────────────────────────────────────────

export function AccountPanel(): JSX.Element {
  const acct = useAccount();
  const sync = useSync();
  const online = useOnline();
  const [form, setForm] = useState<'none' | 'register' | 'signin' | 'password'>('none');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const line = syncLine(sync, online, acct.lastSyncedAt);

  const changePassword = async (): Promise<void> => {
    const r = await accountApi.changePassword(oldPass, newPass);
    setPassMsg(r.ok ? 'Password changed — other devices were signed out.' : humanError(r.error));
    if (r.ok) { setOldPass(''); setNewPass(''); setForm('none'); }
  };

  return (
    <div className="acct">
      <div className="acct-status">
        <span className={`acct-badge ${acct.provider}`}>{acct.provider === 'email' ? '◈ ACCOUNT' : '◌ GUEST'}</span>
        <div className="acct-who">
          <b>{acct.provider === 'email' ? acct.email : 'Guest on this device'}</b>
          <small>ID {acct.accountId.slice(0, 8)} · platforms: {acct.platforms.join(', ') || 'web'}</small>
        </div>
      </div>

      <div className="acct-sync">
        <span className={`acct-dot ${line.dot}`} aria-hidden />
        <span className="acct-sync-text">{line.text}</span>
        <button className="acct-btn ghost" onClick={() => void syncEngine.syncNow()} disabled={!online || sync.phase === 'syncing'}>
          Sync now
        </button>
      </div>

      {acct.provider === 'guest' ? (
        <>
          <div className="acct-note">
            A free account makes this progress PORTABLE — continue on any device, and purchases stay yours.
            Upgrading keeps everything (docs: nothing moves, your guest simply becomes permanent).
          </div>
          <div className="acct-form-row">
            <button className={`acct-btn ${form === 'register' ? 'on' : ''}`} onClick={() => setForm(form === 'register' ? 'none' : 'register')}>Create Account</button>
            <button className={`acct-btn ${form === 'signin' ? 'on' : ''}`} onClick={() => setForm(form === 'signin' ? 'none' : 'signin')}>Sign In</button>
          </div>
          {form === 'register' && <AuthForms mode="register" onDone={() => setForm('none')} />}
          {form === 'signin' && <AuthForms mode="signin" onDone={() => setForm('none')} />}
        </>
      ) : (
        <div className="acct-form-row">
          <button className={`acct-btn ${form === 'password' ? 'on' : ''}`} onClick={() => setForm(form === 'password' ? 'none' : 'password')}>Change password</button>
          <button
            className="acct-btn danger"
            onClick={() => {
              if (confirm('Sign out on this device? Your local save stays playable; new progress starts a fresh guest until you sign in again.')) void accountApi.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}

      {form === 'password' && acct.provider === 'email' && (
        <div className="acct-form">
          <input className="acct-input" type="password" placeholder="Current password" value={oldPass} autoComplete="current-password" onChange={(e) => setOldPass(e.target.value)} />
          <input className="acct-input" type="password" placeholder="New password (8+ characters)" value={newPass} autoComplete="new-password" onChange={(e) => setNewPass(e.target.value)} />
          <button className="acct-btn primary" onClick={() => void changePassword()} disabled={!online || oldPass.length === 0 || newPass.length < 8}>
            Change password
          </button>
        </div>
      )}
      {passMsg && <div className="acct-note">{passMsg}</div>}
    </div>
  );
}

// ── Profile card ─────────────────────────────────────────────────────────────────

export function AccountCard(): JSX.Element {
  const acct = useAccount();
  const sync = useSync();
  const online = useOnline();
  const save = meta.use();
  const line = syncLine(sync, online, acct.lastSyncedAt);
  return (
    <section className="pf-account" aria-label="Account & sync">
      <span className={`acct-badge ${acct.provider}`}>{acct.provider === 'email' ? '◈ ACCOUNT' : '◌ GUEST'}</span>
      <div className="pf-account-rows">
        <span>{acct.provider === 'email' ? acct.email : 'Guest — upgrade in Settings to play anywhere'}</span>
        <small>
          <i className={`acct-dot ${line.dot}`} aria-hidden /> {line.text}
        </small>
        <small>Playtime {fmtHours(save.stats.playtimeSec)} · platforms {acct.platforms.join(' · ') || 'web'} · since {new Date(acct.createdAt).toLocaleDateString()}</small>
      </div>
    </section>
  );
}

// ── Conflict resolution ──────────────────────────────────────────────────────────

export function ConflictModal(): JSX.Element | null {
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  if (sync.phase !== 'conflict' || !sync.conflict) return null;
  const c = sync.conflict;
  const cloud = c.cloudMeta;
  const rows: { k: string; local: string; cloud: string }[] = [
    { k: 'Saved', local: fmtWhen(c.local.savedAt), cloud: cloud.savedAt ? fmtWhen(cloud.savedAt) : fmtWhen(c.cloudUpdatedAt * 1000) },
    { k: 'Playtime', local: fmtHours(c.local.playtimeSec), cloud: cloud.playtimeSec !== undefined ? fmtHours(cloud.playtimeSec) : '—' },
    { k: 'Power', local: String(c.local.power), cloud: cloud.power !== undefined ? String(cloud.power) : '—' },
    { k: 'Campaign stage', local: String(c.local.campaignStage), cloud: cloud.campaignStage !== undefined ? String(cloud.campaignStage) : '—' },
  ];
  const resolve = async (choice: 'local' | 'cloud' | 'merge'): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await syncEngine.resolveConflict(choice);
    setBusy(false);
  };
  return (
    <div className="acct-scrim" role="dialog" aria-modal="true" aria-label="Sync conflict">
      <div className="acct-conflict">
        <div className="acct-conflict-h">⚠ SAVE CONFLICT</div>
        <p className="acct-conflict-sub">
          This account was played somewhere else. Nothing has been overwritten — choose which progress wins.
          (Keeping cloud snapshots a local backup first; merge combines records and keeps the bigger life.)
        </p>
        <table className="acct-conflict-table">
          <thead>
            <tr><th /><th>This device</th><th>Cloud</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}><td>{r.k}</td><td>{r.local}</td><td>{r.cloud}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="acct-conflict-btns">
          <button className="acct-btn" onClick={() => void resolve('local')} disabled={busy}>Keep this device</button>
          <button className="acct-btn" onClick={() => void resolve('cloud')} disabled={busy}>Keep cloud</button>
          <button className="acct-btn primary" onClick={() => void resolve('merge')} disabled={busy}>Smart merge</button>
        </div>
      </div>
    </div>
  );
}

// ── First launch ─────────────────────────────────────────────────────────────────

export function WelcomeGate(): JSX.Element | null {
  const acct = useAccount();
  const save = meta.use();
  const online = useOnline();
  const [signin, setSignin] = useState(false);
  const meaningful = save.totalRuns > 0 || save.stats.playtimeSec > 60 || save.tutorial.completed.length > 0;
  // Grandfather clause: an existing life predates the gate — never nag it.
  useEffect(() => {
    if (!acct.onboarded && meaningful) account.set({ onboarded: true });
  }, [acct.onboarded, meaningful]);
  if (acct.onboarded || meaningful) return null;

  const asGuest = (): void => {
    account.set({ onboarded: true });
    void ensureGuestRegistered(); // lazy + fail-soft: offline guests register on first contact
  };

  return (
    <div className="acct-scrim" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="acct-welcome">
        <div className="acct-welcome-h">ASSIMILATE</div>
        <p className="acct-welcome-sub">
          Your progress lives on an account — play here, continue anywhere. Or stay a guest on this
          device and upgrade later without losing anything.
        </p>
        {!signin ? (
          <div className="acct-welcome-btns">
            <button className="acct-btn primary big" onClick={asGuest}>Continue as Guest</button>
            <button className="acct-btn big" onClick={() => setSignin(true)} disabled={!online} title={online ? undefined : 'Signing in needs a connection'}>
              I have an account
            </button>
            {!online && <div className="acct-note">Offline — guest play works fully; sign in any time later.</div>}
          </div>
        ) : (
          <>
            <AuthForms mode="signin" onDone={() => account.set({ onboarded: true })} />
            <button className="acct-btn ghost" onClick={() => setSignin(false)}>← Back</button>
          </>
        )}
      </div>
    </div>
  );
}
