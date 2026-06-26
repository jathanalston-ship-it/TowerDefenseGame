import { useRef, useState, type ChangeEvent } from 'react';
import { meta } from '../state/meta';
import type { BackupMeta } from '../save/saveStore';

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
      setMsg(r.ok ? '✓ Save imported.' : `✗ Import failed: ${r.error}`);
      refresh();
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="panel">
      <div className="panel-title">Save Data</div>
      <div className="panel-sub">
        Stored in this browser (no account). Export a JSON backup, import it on another
        device, or restore a snapshot.
      </div>
      <div className="save-meta">
        Current: <b style={{ color: 'var(--gold)' }}>{save.shards}</b> shards · best wave{' '}
        {save.bestWave} · {save.totalRuns} runs
      </div>
      <div className="row">
        <button onClick={() => meta.exportToFile()}>⬇ Export JSON</button>
        <button onClick={() => fileRef.current?.click()}>⬆ Import JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onImport}
        />
        <button
          onClick={() => {
            meta.backupNow();
            refresh();
            setMsg('✓ Backup created.');
          }}
        >
          ＋ Backup now
        </button>
      </div>
      {msg && <div className="save-msg">{msg}</div>}
      {backups.length > 0 && (
        <div className="save-backups">
          <div className="eyebrow">Backups</div>
          {backups.map((b) => (
            <div className="shop-item" key={b.id}>
              <div className="info">
                <div className="desc">{new Date(b.at).toLocaleString()}</div>
              </div>
              <button
                onClick={() => {
                  setMsg(meta.restoreBackup(b.id) ? '✓ Backup restored.' : '✗ Restore failed.');
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
