// Music Console (docs/MUSIC.md §debug tools) — a DEV-only soundtrack workbench in Settings:
// audition any track / category transition / boss theme, drive the adaptive seams (intensity,
// duress, progression, scene) by hand, override individual layers, fire stingers, and PIN
// playback against rotation + app requests. Pure presentation over the MusicManager public API;
// renders nothing outside dev builds / the debug opt-in.

import { useEffect, useState } from 'react';
import { music, TRACK_LIBRARY, LAYER_IDS, STINGERS, bossTrackFor } from '../audio/music';
import type { MusicCategory, StingerId, LayerId } from '../audio/music';
import { isDebugEnabled } from '../debug/debug';

const isDevBuild = (): boolean => { try { return !!import.meta.env?.DEV; } catch { return false; } };
const CATEGORIES: MusicCategory[] = ['menu', 'combat', 'boss', 'mega', 'victory', 'defeat', 'events', 'cinema'];
const SCENES = [...new Set(TRACK_LIBRARY.flatMap((t) => t.scenes ?? []))];
const STINGER_IDS = Object.keys(STINGERS) as StingerId[];

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '6px 0' };
const lbl: React.CSSProperties = { fontSize: 11, opacity: 0.75, minWidth: 86 };

export function MusicDebug(): JSX.Element | null {
  const hidden = !isDevBuild() && !isDebugEnabled();
  const [, bump] = useState(0); // slow poll so Now Playing follows the manager (rotation etc.)
  const [pinned, setPinned] = useState(false);
  const [intensity, setIntensity] = useState(0.5);
  const [duress, setDuress] = useState(0);
  const [tier, setTier] = useState(0);
  const [scene, setScene] = useState('');
  const [bossName, setBossName] = useState('Broodmother');
  useEffect(() => {
    if (hidden) return;
    const t = setInterval(() => bump((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [hidden]);
  if (hidden) return null;

  const now = TRACK_LIBRARY.find((t) => t.id === music.currentTrackId) ?? null;
  const assigned = bossTrackFor(bossName || 'boss');

  const slider = (label: string, v: number, set: (n: number) => void, apply: (n: number) => void): JSX.Element => (
    <div style={row} key={label}>
      <span style={lbl}>{label}</span>
      <input
        type="range" min={0} max={1} step={0.01} value={v} style={{ flex: 1, minWidth: 120, minHeight: 24 }}
        onChange={(e) => { const n = Number(e.target.value); set(n); apply(n); }}
        aria-label={label}
      />
      <code style={{ fontSize: 11 }}>{v.toFixed(2)}</code>
    </div>
  );

  return (
    <div className="panel dev-panel">
      <div className="panel-title">Music Console</div>
      <p className="panel-sub">
        Soundtrack workbench (dev only). Now playing:{' '}
        <b>{now ? `${now.name}` : '—'}</b>
        {now && <code style={{ marginLeft: 6, fontSize: 11 }}>{now.id} · {now.category}</code>}
        {pinned && <b style={{ marginLeft: 6, color: 'var(--gold)' }}>· PINNED</b>}
      </p>

      <div style={row}>
        <span style={lbl}>Categories</span>
        {CATEGORIES.map((c) => (
          <button key={c} className="dev-reset-btn" onClick={() => music.play(c, { force: true })}>{c}</button>
        ))}
        <button className="dev-reset-btn is-danger" onClick={() => music.stop()}>stop</button>
        <button
          className={`dev-reset-btn${pinned ? ' is-danger' : ''}`}
          onClick={() => { const next = !pinned; setPinned(next); music.setPinned(next); }}
        >
          {pinned ? 'unpin' : 'pin track'}
        </button>
      </div>

      {CATEGORIES.map((c) => (
        <div style={row} key={c}>
          <span style={lbl}>{c}</span>
          {TRACK_LIBRARY.filter((t) => t.category === c).map((t) => (
            <button
              key={t.id}
              className="dev-reset-btn"
              style={t.id === music.currentTrackId ? { outline: '1px solid var(--gold)' } : undefined}
              title={`${t.id} · ${t.bpm}bpm · motif ${t.motif}${t.counterMotif ? ` / ${t.counterMotif}` : ''}`}
              onClick={() => music.play(c, { trackId: t.id, force: true })}
            >
              {t.name}
            </button>
          ))}
        </div>
      ))}

      <div style={row}>
        <span style={lbl}>Boss theme</span>
        <input
          value={bossName}
          onChange={(e) => setBossName(e.target.value)}
          placeholder="boss name / id"
          style={{ flex: 1, minWidth: 120, minHeight: 24 }}
          aria-label="Boss name for theme preview"
        />
        <code style={{ fontSize: 11 }}>→ {assigned.name}</code>
        <button className="dev-reset-btn" onClick={() => music.play('boss', { boss: bossName, force: true })}>play</button>
      </div>

      {slider('Intensity', intensity, setIntensity, (n) => music.setIntensity(n))}
      {slider('Duress', duress, setDuress, (n) => music.setDuress(n))}
      {slider('Progression', tier, setTier, (n) => music.setProgression(n))}

      <div style={row}>
        <span style={lbl}>Scene</span>
        <select
          value={scene}
          onChange={(e) => { setScene(e.target.value); music.setScene(e.target.value || null); }}
          aria-label="Menu scene bias"
        >
          <option value="">(none)</option>
          {SCENES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, opacity: 0.6 }}>biases the next menu pick — force a menu play to hear it</span>
      </div>

      <div style={row}>
        <span style={lbl}>Layers</span>
        {LAYER_IDS.map((id: LayerId) => (
          <button key={id} className="dev-reset-btn" title={`solo-ish: push ${id} to 0.8`} onClick={() => music.setLayerGain(id, 0.8)}>
            {id}+
          </button>
        ))}
        <button className="dev-reset-btn" title="reapply authored gains at the current intensity" onClick={() => music.setIntensity(intensity)}>
          reset mix
        </button>
      </div>

      <div style={row}>
        <span style={lbl}>Stingers</span>
        {STINGER_IDS.map((id) => (
          <button key={id} className="dev-reset-btn" onClick={() => music.stinger(id)}>{id}</button>
        ))}
      </div>
    </div>
  );
}
