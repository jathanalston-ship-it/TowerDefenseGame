// SYNC ENGINE (docs/ACCOUNTS.md §sync) — bidirectional, silent-when-possible cloud
// synchronization. Local-first forever: the game saves to localStorage exactly as
// before; this engine mirrors snapshots to the account's cloud slot and pulls newer
// ones down, with optimistic-concurrency conflict detection (the server's rev).
//
//   boot ──▶ probe cloud meta ──▶ decideSync ──▶ pull | push | conflict | noop
//   save change ──▶ dirty ──▶ debounced push (baseRev) ──▶ ok | 409 → conflict
//   conflict ──▶ UI (ConflictModal) ──▶ resolve keepLocal | keepCloud | merge
//
// The DECISION CORE is pure (unit-tested); the runtime just feeds it reality.
// Every network failure degrades to "still dirty, retry later with backoff" —
// offline play never notices.

import { meta } from '../state/meta';
import { serializeExport, parseImport, type SaveData } from '../save/saveStore';
import { buildEnvelope, envelopeMeta, isEnvelope, openEnvelope, verifyEnvelope, type EnvelopeMeta } from '../save/envelope';
import { mergeSaves } from '../save/merge';
import { highestCampaignStage } from '../save/derive';
import { powerBreakdown } from '../state/profile';
import { account, currentPlatform } from '../account/accountStore';
import { ensureGuestRegistered } from '../account/providers';
import { connectivity } from './connectivity';
import { guard } from '../security/actionGuard';
import { trackEvent } from './events';

export const MIN_INTERVAL_MS = 150_000; // ≤4 PUTs / 10 min — well inside the server budget
const RETRY_BASE_MS = 30_000; // network-failure backoff: 30s · 2^n, capped
const RETRY_CAP_MS = 300_000;

export type SyncAction = 'push' | 'pull' | 'conflict' | 'noop';
export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';

/** The PURE decision — given local and cloud truth, what should happen?
 *    · cloud moved AND local changed → conflict (never silently pick a side)
 *    · NO shared lineage yet (lastSyncedRev 0) + a cloud slot + meaningful local
 *      progress → conflict (the "signed in on a device that already has a life"
 *      case — even if nothing changed THIS session, the player must choose)
 *    · cloud moved, local clean → pull (auto-download)
 *    · local changed, cloud where we left it (or absent) → push
 *  `cloudRev === null` means no cloud slot yet. */
export function decideSync(s: { online: boolean; dirty: boolean; cloudRev: number | null; lastSyncedRev: number; localMeaningful?: boolean }): SyncAction {
  if (!s.online) return 'noop';
  const cloudMoved = s.cloudRev !== null && s.cloudRev !== s.lastSyncedRev;
  if (cloudMoved && s.dirty) return 'conflict';
  if (cloudMoved && s.lastSyncedRev === 0 && s.localMeaningful) return 'conflict';
  if (cloudMoved) return 'pull';
  if (s.dirty) return 'push';
  return 'noop';
}

export interface ConflictInfo {
  cloudRev: number;
  cloudUpdatedAt: number; // sec epoch (server clock)
  cloudMeta: Partial<EnvelopeMeta>;
  local: EnvelopeMeta;
}

export interface SyncState {
  phase: SyncPhase;
  lastError: string | null;
  conflict: ConflictInfo | null;
  attempts: number; // consecutive failures (drives backoff)
  nextRetryAt: number; // ms epoch (0 = none scheduled)
}

let state: SyncState = { phase: 'idle', lastError: null, conflict: null, attempts: 0, nextRetryAt: 0 };
const listeners = new Set<() => void>();
let dirty = false;
let inFlight = false;
let started = false;
let lastPushAt = 0;

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

function localEnvelope(save: SaveData): ReturnType<typeof buildEnvelope> {
  return buildEnvelope(save, {
    accountId: account.get().accountId,
    platform: currentPlatform(),
    power: powerBreakdown(save).score,
    campaignStage: highestCampaignStage(save),
  });
}

async function fetchCloudMeta(): Promise<{ rev: number; updatedAt: number; meta: Partial<EnvelopeMeta> } | 'none' | 'error'> {
  try {
    const c = account.credentials();
    const q = c.session ? `session=${c.session}` : `token=${c.token}`;
    const res = await fetch(`/api/save?playerId=${encodeURIComponent(c.playerId)}&${q}&meta=1`);
    if (res.status === 404) return 'none';
    const body = (await res.json().catch(() => null)) as { rev?: number; updatedAt?: number; meta?: Partial<EnvelopeMeta> } | null;
    if (!res.ok || typeof body?.rev !== 'number') return 'error';
    return { rev: body.rev, updatedAt: body.updatedAt ?? 0, meta: body.meta ?? {} };
  } catch {
    return 'error';
  }
}

/** Upload the current save as a v2 envelope with optimistic concurrency. */
async function push(): Promise<'ok' | 'conflict' | 'error'> {
  // Security layer (docs/SECURITY.md): a client-side budget ON TOP of MIN_INTERVAL/backoff —
  // a blocked push simply stays dirty and retries on the normal cadence.
  if (!guard('sync.push').ok) return 'error';
  const save = meta.get();
  const env = localEnvelope(save);
  const c = account.credentials();
  try {
    const res = await fetch('/api/save', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...c, blob: JSON.stringify(env), baseRev: account.get().lastSyncedRev, meta: envelopeMeta(env) }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; rev?: number; updatedAt?: number; meta?: Partial<EnvelopeMeta> } | null;
    if (res.status === 409 && body) {
      setState({
        phase: 'conflict',
        conflict: { cloudRev: body.rev ?? 0, cloudUpdatedAt: body.updatedAt ?? 0, cloudMeta: body.meta ?? {}, local: envelopeMeta(env) },
      });
      trackEvent('sync_conflict');
      return 'conflict';
    }
    if (!res.ok || !body?.ok || typeof body.rev !== 'number') return 'error';
    dirty = false;
    lastPushAt = Date.now();
    account.set({ lastSyncedRev: body.rev, lastSyncedAt: Date.now(), pendingSince: 0 });
    trackEvent('sync_push');
    setState({ phase: 'synced', lastError: null, conflict: null, attempts: 0, nextRetryAt: 0 });
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Download the cloud save and import it (the importer snapshots a local backup
 *  first, so a pull is always recoverable). Accepts v2 envelopes AND legacy blobs. */
async function pull(): Promise<'ok' | 'error'> {
  try {
    const c = account.credentials();
    const q = c.session ? `session=${c.session}` : `token=${c.token}`;
    const res = await fetch(`/api/save?playerId=${encodeURIComponent(c.playerId)}&${q}`);
    const body = (await res.json().catch(() => null)) as { blob?: string; rev?: number } | null;
    if (!res.ok || typeof body?.blob !== 'string') return 'error';
    let text = body.blob;
    const parsed = JSON.parse(text) as unknown;
    if (isEnvelope(parsed)) {
      if (!verifyEnvelope(parsed)) return 'error'; // corrupted upload — refuse, keep local
      text = openEnvelope(parsed);
    }
    const imported = meta.importText(text);
    if (!imported.ok) return 'error';
    dirty = false; // the import IS the cloud state (importText persists → subscriber fires)
    account.set({ lastSyncedRev: body.rev ?? 0, lastSyncedAt: Date.now(), pendingSince: 0 });
    trackEvent('sync_pull');
    setState({ phase: 'synced', lastError: null, conflict: null, attempts: 0, nextRetryAt: 0 });
    return 'ok';
  } catch {
    return 'error';
  }
}

function failSoft(what: string): void {
  if (state.attempts === 0) trackEvent('sync_fail'); // once per failure streak, not per retry
  const attempts = state.attempts + 1;
  const delay = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempts - 1));
  setState({ phase: connectivity.isOnline() ? 'error' : 'offline', lastError: what, attempts, nextRetryAt: Date.now() + delay });
}

/** One full engine step: probe, decide, act. Serialized (never two in flight). */
export async function syncStep(reason: 'boot' | 'tick' | 'manual' | 'hidden'): Promise<SyncAction> {
  if (inFlight || state.phase === 'conflict') return 'noop';
  if (!connectivity.isOnline()) {
    setState({ phase: dirty ? 'offline' : state.phase === 'synced' ? 'synced' : 'offline' });
    return 'noop';
  }
  if (reason === 'tick' && state.nextRetryAt > Date.now()) return 'noop'; // honoring backoff
  if (reason === 'tick' && dirty && Date.now() - lastPushAt < MIN_INTERVAL_MS) return 'noop'; // upload cadence
  inFlight = true;
  try {
    await ensureGuestRegistered(); // lazy account formalization (fail-soft)
    const cloud = await fetchCloudMeta();
    if (cloud === 'error') {
      failSoft('cloud unreachable');
      return 'noop';
    }
    const save = meta.get();
    const action = decideSync({
      online: true,
      dirty,
      cloudRev: cloud === 'none' ? null : cloud.rev,
      lastSyncedRev: account.get().lastSyncedRev,
      localMeaningful: save.totalRuns > 0 || (save.stats?.playtimeSec ?? 0) > 60,
    });
    if (action === 'push') {
      setState({ phase: 'syncing' });
      const r = await push();
      if (r === 'error') failSoft('upload failed');
      return action;
    }
    if (action === 'pull') {
      setState({ phase: 'syncing' });
      const r = await pull();
      if (r === 'error') failSoft('download failed');
      return action;
    }
    if (action === 'conflict' && cloud !== 'none') {
      setState({
        phase: 'conflict',
        conflict: { cloudRev: cloud.rev, cloudUpdatedAt: cloud.updatedAt, cloudMeta: cloud.meta, local: envelopeMeta(localEnvelope(save)) },
      });
      return action;
    }
    if (!dirty && state.phase !== 'synced' && account.get().lastSyncedAt > 0) setState({ phase: 'synced' });
    return action;
  } finally {
    inFlight = false;
  }
}

/** Resolve a standing conflict. 'local' force-pushes this device; 'cloud' imports
 *  the server copy; 'merge' folds records together (docs/ACCOUNTS.md §conflicts)
 *  then force-pushes the merged result. Nothing is ever deleted silently — keepCloud
 *  snapshots a local backup via the normal import path. */
export async function resolveConflict(choice: 'local' | 'cloud' | 'merge'): Promise<boolean> {
  const conflict = state.conflict;
  if (!conflict) return false;
  if (choice === 'cloud') {
    setState({ phase: 'syncing', conflict: null });
    const r = await pull();
    if (r !== 'ok') { failSoft('download failed'); return false; }
    return true;
  }
  if (choice === 'merge') {
    // Fetch the cloud save, merge conservatively, adopt the merge locally, push it.
    try {
      const c = account.credentials();
      const q = c.session ? `session=${c.session}` : `token=${c.token}`;
      const res = await fetch(`/api/save?playerId=${encodeURIComponent(c.playerId)}&${q}`);
      const body = (await res.json().catch(() => null)) as { blob?: string } | null;
      if (!res.ok || typeof body?.blob !== 'string') { failSoft('download failed'); return false; }
      const parsedBlob = JSON.parse(body.blob) as unknown;
      const text = isEnvelope(parsedBlob) ? openEnvelope(parsedBlob) : body.blob;
      const cloudParsed = parseImport(text);
      if (!cloudParsed.ok) { failSoft('cloud save unreadable'); return false; }
      const merged = mergeSaves(meta.get(), cloudParsed.data);
      const imported = meta.importText(serializeExport(merged));
      if (!imported.ok) { failSoft('merge import failed'); return false; }
    } catch {
      failSoft('merge failed');
      return false;
    }
  }
  // 'local' (and post-merge): adopt the cloud rev as base and force the write.
  account.set({ lastSyncedRev: conflict.cloudRev });
  setState({ phase: 'syncing', conflict: null });
  const r = await push();
  if (r !== 'ok') { failSoft('upload failed'); return false; }
  return true;
}

// ── runtime wiring ────────────────────────────────────────────────────────────────

const TICK_MS = 30_000;

/** Idempotent boot hook (App calls once). Marks dirty on every save change, runs a
 *  boot sync (the auto-DOWNLOAD moment), then ticks quietly in the background. */
export function startSyncEngine(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  meta.subscribe(() => {
    dirty = true;
    if (account.get().pendingSince === 0) account.set({ pendingSince: Date.now() });
  });
  connectivity.subscribe(() => {
    if (connectivity.isOnline()) void syncStep('tick'); // reconnect ⇒ opportunistic sync
    else setState({ phase: 'offline' });
  });
  if (!connectivity.isOnline()) trackEvent('offline_session'); // queued locally; flushes on reconnect
  void syncStep('boot');
  window.setInterval(() => void syncStep('tick'), TICK_MS);
  document.addEventListener('visibilitychange', () => {
    // Tab hidden = the mobile "closed the game" moment — flush NOW if anything is new.
    if (document.visibilityState === 'hidden' && dirty) void syncStep('hidden');
  });
}

export const syncEngine = {
  get(): SyncState {
    return state;
  },
  isDirty(): boolean {
    return dirty;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  syncNow(): Promise<SyncAction> {
    return syncStep('manual');
  },
  resolveConflict,
};
