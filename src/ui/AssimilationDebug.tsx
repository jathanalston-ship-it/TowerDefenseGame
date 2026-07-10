// ASSIMILATION DEBUG PANEL (docs/ASSIMILATION.md §Developer tools) — the complete developer surface
// for the master state: the live index + contribution breakdown, the tier ladder with thresholds, a
// derived-presentation readout, a live FX veil preview, and manual override + instant tier-preview
// controls that drive the WHOLE game's presentation in real time. Reads the active run's render-only
// `game.assimilation`; the override snaps every consumer (music/camera/screen/HUD) to the previewed
// value with no gameplay effect. Rendered as a section inside the existing DebugPanel.

import { useEffect, useReducer, useRef, useState } from 'react';
import { getActiveGame } from '../debug/debug';
import {
  ASSIMILATION_GROUPS,
  ASSIMILATION_TIERS,
  assimilationPresentation,
  computeAssimilation,
  tierAt,
  tierColorAt,
  zeroSignals,
  type AssimilationState,
} from '../core/assimilation';
import { drawAssimilationFx } from '../render/assimilationFx';

// Group ids + labels come from the canonical pillar table — a new pillar shows up here for free.
const GROUPS: { id: string; label: string }[] = ASSIMILATION_GROUPS.map((g) => ({ id: g.id, label: g.label }));

const rgb = (c: [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Build a throwaway state at a fixed index (for previewing with no run active). */
function previewState(index: number): AssimilationState {
  const { tier, progress } = tierAt(index);
  return { index, target: index, tier: tier.index, tierProgress: progress, override: index, peakTier: tier.index, ascensionPulse: 0, ascendedTier: tier.index };
}

function Bar({ v, color, label, sub }: { v: number; color?: string; label: string; sub?: string }): JSX.Element {
  return (
    <div style={{ margin: '3px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.85 }}>
        <span>{label}</span>
        <span>{sub ?? `${Math.round(v * 100)}%`}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, v * 100))}%`, height: '100%', background: color ?? '#5ac8fa' }} />
      </div>
    </div>
  );
}

export function AssimilationDebug(): JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [previewIdx, setPreviewIdx] = useState(0.5);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Live tick while open — the index/breakdown update continuously (the run loop mutates the state).
  useEffect(() => {
    const id = setInterval(() => force(), 200);
    return () => clearInterval(id);
  }, []);

  const game = getActiveGame();
  const inRun = game !== null;
  // Live state when in a run; otherwise a synthetic state at the preview slider for offline previews.
  const state = inRun ? game.assimilation : previewState(previewIdx);
  const pres = assimilationPresentation(state);
  const breakdown = computeAssimilation(inRun ? game.assimilationSignals() : { ...zeroSignals(), runPower: previewIdx * 12000, wave: previewIdx * 40, kills: previewIdx * 600 });
  const color = tierColorAt(state.index);

  // Live FX veil preview — the actual screen post-process at the current/previewed index.
  useEffect(() => {
    const cv = previewRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, cv.width, cv.height);
    drawAssimilationFx(ctx, pres, performance.now() / 1000, cv.width, cv.height);
  });

  const setOverride = (v: number | null): void => {
    const g = getActiveGame();
    if (g) g.assimilation.override = v;
    if (!g) setPreviewIdx(v ?? 0);
    force();
  };

  return (
    <div className="debug-sec">
      <div className="h">🧬 Assimilation Index {inRun ? '' : '— (offline preview)'}</div>

      {/* Live index + tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: rgb(color), minWidth: 56 }}>
          {Math.round(state.index * 100)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>
            T{pres.tier} · {pres.tierName}
          </div>
          <Bar v={state.index} color={rgb(color)} label="Index" sub={state.index.toFixed(3)} />
        </div>
      </div>
      <div className="debug-note">{ASSIMILATION_TIERS[pres.tier].blurb}</div>
      {state.ascensionPulse > 0.001 && (
        <div className="debug-note" style={{ color: rgb(color) }}>▲ Ascension pulse {state.ascensionPulse.toFixed(2)} → {ASSIMILATION_TIERS[state.ascendedTier]?.name}</div>
      )}

      {/* Four-pillar overview — the group-normalized fold: each pillar's weighted-mean score, its
          share of the final index, and its group weight. */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 }}>Pillars (group-normalized)</div>
        {breakdown.groups.map((g) => (
          <Bar key={g.group} v={g.score} label={g.group} color={rgb(color)} sub={`${Math.round(g.share * 100)}% · w${g.weight}`} />
        ))}
      </div>

      {/* Contribution breakdown, grouped */}
      <div style={{ marginTop: 6 }}>
        {GROUPS.map((grp) => {
          const rows = breakdown.contributions.filter((c) => c.group === grp.id);
          return (
            <div key={grp.id} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 }}>{grp.label}</div>
              {rows.map((c) => (
                <Bar key={c.id} v={c.score} label={c.label} sub={`${Math.round(c.share * 100)}% share`} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Derived presentation channels */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 }}>Presentation</div>
        <Bar v={pres.musicIntensity} label="Music intensity" color="#b48cff" />
        <Bar v={pres.vignette} label="Vignette" color={rgb(color)} />
        <Bar v={pres.glow} label="Rim glow" color={rgb(color)} />
        <Bar v={pres.spore} label="Spore density" color={rgb(color)} />
        <Bar v={pres.cameraAmp / 0.0042} label="Camera breath" sub={`${(pres.cameraHz).toFixed(2)} Hz`} color="#ffd479" />
        <Bar v={pres.hudGlow} label="HUD glow" color={rgb(color)} />
      </div>

      {/* Live FX veil preview */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 }}>FX veil preview</div>
        <canvas ref={previewRef} width={220} height={130} style={{ width: '100%', borderRadius: 4, display: 'block' }} />
      </div>

      {/* Tier ladder + instant preview buttons */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 0.5 }}>Tiers (instant preview)</div>
        <div className="debug-row" style={{ flexWrap: 'wrap' }}>
          {ASSIMILATION_TIERS.map((t) => {
            const next = ASSIMILATION_TIERS[t.index + 1];
            const mid = next ? (t.at + next.at) / 2 : 0.91;
            return (
              <button
                key={t.id}
                title={`≥ ${t.at.toFixed(2)} — ${t.blurb}`}
                style={{ borderColor: rgb(t.color), color: rgb(t.color) }}
                onClick={() => setOverride(mid)}
              >
                T{t.index}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual override */}
      <div className="debug-row" style={{ alignItems: 'center', gap: 6 }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.override ?? state.index}
          onChange={(e) => setOverride(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <button className={state.override !== null && inRun ? 'on' : ''} onClick={() => setOverride(null)}>
          {inRun ? 'Release' : 'Reset'}
        </button>
      </div>
      {inRun && state.override !== null && <div className="debug-note">Override engaged — driving live presentation. Release to resume the run’s own index.</div>}
    </div>
  );
}
