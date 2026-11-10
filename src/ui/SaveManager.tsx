import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { meta } from '../state/meta';
import { parseImport } from '../save/saveStore';
import type { BackupMeta, SaveData } from '../save/saveStore';
import { readTextFile } from '../save/saveFile';
import { DownloadIcon, PlusIcon, UploadIcon } from './components/Icon';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import './SaveManager.css';

export function SaveManager(): JSX.Element {
  const save = meta.use(); // reactive: reflects imports/restores
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const previewId = useId();
  const readEpoch = useRef(0);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState<{ name: string; text: string; data: SaveData } | null>(null);
  const [backups, setBackups] = useState<BackupMeta[]>(() => meta.listBackups());
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = (): void => setBackups(meta.listBackups());
  useEffect(() => () => { readEpoch.current++; }, []);
  useEffect(() => { if (pending) previewRef.current?.focus(); }, [pending]);

  const cancelImport = (): void => {
    setPending(null);
    setMsg('Import cancelled. Your progress is unchanged.');
    importRef.current?.focus();
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const epoch = ++readEpoch.current;
    setPending(null);
    setReading(true);
    setMsg('Reading save file…');
    try {
      const text = await readTextFile(file);
      if (epoch !== readEpoch.current) return;
      const result = parseImport(text);
      if (!result.ok) { setMsg(`Import failed: ${result.error}`); return; }
      setPending({ name: file.name, text, data: result.data });
      setMsg('File checked. Review it before replacing your progress.');
    } catch {
      if (epoch === readEpoch.current) setMsg('Import failed: Could not read the file.');
    } finally {
      if (epoch === readEpoch.current) setReading(false);
    }
  };

  return (
    <div className="panel">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Save Data</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 6 }}>
        Export a JSON copy of your current progress, review a file before importing it,
        or restore a snapshot saved in this browser.
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
        Current: <b style={{ color: 'var(--gold)' }}>{save.shards}</b> {ACCOUNT_CURRENCY.name} · best wave{' '}
        {save.bestWave} · {save.totalRuns} runs
      </div>
      <div className="row">
        <button onClick={() => meta.exportToFile()}><DownloadIcon /> Export JSON</button>
        <button ref={importRef} disabled={reading} onClick={() => fileRef.current?.click()}><UploadIcon /> {reading ? 'Reading…' : 'Import JSON'}</button>
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
      {pending && <section className="save-import-review" aria-labelledby={previewId} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelImport(); }
      }}>
        <h3 id={previewId} ref={previewRef} tabIndex={-1}>Review save import</h3>
        <p className="save-import-name">{pending.name}</p>
        <p>Incoming: <b>{pending.data.shards.toLocaleString()}</b> {ACCOUNT_CURRENCY.name} · best wave {pending.data.bestWave} · {pending.data.totalRuns} runs</p>
        <p>This replaces your current progress; it does not merge saves. Export JSON first if you want a separate copy.</p>
        <div className="row">
          <button onClick={cancelImport}>Cancel import</button>
          <button onClick={() => {
            const result = meta.importText(pending.text);
            refresh();
            setMsg(result.ok ? 'Save imported.' : `Import failed: ${result.error}`);
            if (result.ok) { setPending(null); importRef.current?.focus(); }
          }}>Replace progress</button>
        </div>
      </section>}
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
