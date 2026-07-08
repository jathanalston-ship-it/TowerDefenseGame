// Cloud save client (docs/DEPLOYMENT.md §cloud-save): manual backup/restore of
// the SAME export blob the file backup uses, keyed by the anonymous identity.
// Strictly a convenience lane — the game never depends on it, offline play is
// untouched, and restores run through the normal parseImport sanitizer.

import { meta } from '../state/meta';
import { serializeExport } from '../save/saveStore';
import { playerId, syncToken } from './identity';

export type CloudResult = { ok: true; detail?: string } | { ok: false; error: string };

export async function backupToCloud(): Promise<CloudResult> {
  try {
    const blob = serializeExport(meta.get());
    const res = await fetch('/api/save', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: playerId(), token: syncToken(), blob }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error ?? `backup failed (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function restoreFromCloud(): Promise<CloudResult> {
  try {
    const res = await fetch(`/api/save?playerId=${encodeURIComponent(playerId())}&token=${encodeURIComponent(syncToken())}`);
    const body = (await res.json().catch(() => null)) as { blob?: string; updatedAt?: number; error?: string } | null;
    if (!res.ok || typeof body?.blob !== 'string') return { ok: false, error: body?.error ?? `restore failed (${res.status})` };
    // importText = the same lenient parser + sanitizer as file import, and it
    // snapshots a local backup first — a bad restore is always recoverable.
    const parsed = meta.importText(body.blob);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const when = body.updatedAt ? new Date(body.updatedAt * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
    return { ok: true, detail: when ? `backup from ${when} UTC` : undefined };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Erase the cloud slot entirely (Settings → the privacy deletion right). Local
 *  saves are untouched — this only removes the server copy. */
export async function deleteCloudSave(): Promise<CloudResult> {
  try {
    const res = await fetch(`/api/save?playerId=${encodeURIComponent(playerId())}&token=${encodeURIComponent(syncToken())}`, { method: 'DELETE' });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error ?? `delete failed (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}
