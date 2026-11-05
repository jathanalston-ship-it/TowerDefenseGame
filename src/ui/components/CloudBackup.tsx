// Cloud Backup panel (Settings) — one manual slot per identity, on top of the
// existing local file/backup tools. docs/DEPLOYMENT.md §cloud-save.

import { useState } from 'react';
import { backupToCloud, deleteCloudSave, restoreFromCloud } from '../../net/cloudSave';
import { account } from '../../account/accountStore';
import { meta } from '../../state/meta';
import { useGuestMode } from '../../state/guestMode';
import { adoptSyncCode, syncCode } from '../../net/identity';
import './CloudBackup.css';

export function CloudBackup(): JSX.Element {
  const guest = useGuestMode();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; detail?: string; error?: string }>, okMsg: string): void => {
    setBusy(true);
    setMsg(null);
    void fn().then((r) => {
      setBusy(false);
      setMsg(r.ok ? `${okMsg}${'detail' in r && r.detail ? ` (${r.detail})` : ''}` : `Failed: ${('error' in r && r.error) || 'unknown'}`);
    });
  };

  const enterCode = (): void => {
    const code = window.prompt('Paste a sync code from another device:');
    if (!code) return;
    if (!adoptSyncCode(code)) {
      setMsg('That code is not valid.');
      return;
    }
    run(restoreFromCloud, 'Restored from cloud.');
  };

  const named = meta.use().profileName.length > 0;
  const lastAuto = account.get().lastSyncedAt;
  // Guest Mode is fully offline — the whole panel collapses to one honest line.
  if (guest) {
    return (
      <div className="cloudbk">
        <div className="cloudbk-auto">◌ Guest Mode — nothing leaves this device and nothing is kept after this session. Create an account (Settings → Account) to enable cloud backup.</div>
      </div>
    );
  }
  return (
    <div className="cloudbk">
      <div className="cloudbk-auto">
        {named
          ? `☁ Auto-sync armed${lastAuto > 0 ? ` — last mirror ${new Date(lastAuto).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' — first mirror on the next checkpoint'}`
          : '☁ Auto-sync arms once you designate a Commander name (Profile).'}
      </div>
      <div className="cloudbk-row">
        <button className="set-switch" disabled={busy} onClick={() => run(backupToCloud, 'Backed up to cloud.')}>▲ Back up now</button>
        <button className="set-switch" disabled={busy} onClick={() => { if (confirm('Replace this device’s save with the cloud backup? A local backup is kept.')) run(restoreFromCloud, 'Restored from cloud.'); }}>▼ Restore</button>
      </div>
      <div className="cloudbk-row">
        <button className="set-switch" onClick={() => setShowCode((v) => !v)}>{showCode ? 'Hide sync code' : 'Show sync code'}</button>
        <button className="set-switch" onClick={enterCode}>Enter code from another device</button>
      </div>
      {showCode && (
        <div className="cloudbk-code">
          <code>{syncCode()}</code>
          <button
            className="set-switch"
            onClick={() => { void navigator.clipboard?.writeText(syncCode()).then(() => setMsg('Sync code copied — treat it like a password.')); }}
          >
            Copy
          </button>
        </div>
      )}
      <div className="cloudbk-row">
        <button
          className="set-switch"
          disabled={busy}
          onClick={() => { if (confirm('Erase the CLOUD copy of your save? Your local save stays on this device.')) run(deleteCloudSave, 'Cloud data erased.'); }}
        >
          ✕ Delete cloud data
        </button>
      </div>
      {msg && <div className="cloudbk-msg" role="status">{msg}</div>}
    </div>
  );
}
