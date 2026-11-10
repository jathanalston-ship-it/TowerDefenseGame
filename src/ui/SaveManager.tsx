import { useRef, useState, type ChangeEvent } from 'react';
import { meta } from '../state/meta';
import type { BackupMeta } from '../save/saveStore';
import { DownloadIcon, PlusIcon, UploadIcon } from './components/Icon';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import './SaveManager.css';

export function SaveManager(): JSX.Element {
  const save = meta.use(); // reactive: reflects imports/restores
  const fileRef = useRef<HTMLInputElement>(null);
  const [backups, setBackups] = useState<BackupMeta[]>(() => meta.listBackups());
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = (): void => setBackups(meta.listBackups());

  const onImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (file) {
      const r = await meta.importFromFile(file);
      setMsg(r.ok ? 'Save imported.' : `Import failed: ${r.error}`);
      refresh();
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="panel">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Save Data</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 6 }}>
        Stored in this browser (no account). Export a JSON backup, import it on another
        device, or restore a snapshot.
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
        Current: <b style={{ color: 'var(--gold)' }}>{save.shards}</b> {ACCOUNT_CURRENCY.name} · best wave{' '}
        {save.bestWave} · {save.totalRuns} runs
      </div>
      <div className="row">
        <button onClick={() => meta.exportToFile()}><DownloadIcon /> Export JSON</button>
        <button onClick={() => fileRef.current?.click()}><UploadIcon /> Import JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onImport}
        />
        <button
          onClick={() => {
            const backup = meta.backupNow();
            refresh();
            setMsg(backup ? 'Backup created.' : 'Backup could not be created. Export JSON to keep a copy of your current progress.');
          }}
        >
          <PlusIcon /> Backup now
        </button>
      </div>
      <div role="status" style={{ marginTop: msg ? 8 : 0, fontSize: 13, color: 'var(--muted)' }}>{msg}</div>
      {backups.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 4,
            }}
          >
            Backups
          </div>
          {backups.map((b) => (
            <div className="shop-item" key={b.id}>
              <div className="info">
                <div className="desc">{new Date(b.at).toLocaleString()}</div>
              </div>
              <button
                aria-label={`Restore backup from ${new Date(b.at).toLocaleString()}`}
                onClick={() => {
                  if (!window.confirm(`Restore the backup from ${new Date(b.at).toLocaleString()}? This replaces your current progress. Export JSON first if you want a separate copy.`)) return;
                  const restored = meta.restoreBackup(b.id);
                  refresh();
                  setMsg(restored ? 'Backup restored.' : 'Restore failed. Your current progress has not been replaced.');
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
