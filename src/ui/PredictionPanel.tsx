// Progress prediction panel (docs/PREDICTION.md) — a futuristic readout of how far the account is
// expected to reach, with a confidence indicator, a trend arrow, an animated range graph, and 1–2
// soft recommendations. Estimates, never guarantees. Reads the reactive save via meta.predict.

import { meta } from '../state/meta';
import { AdviceGo } from './components/AdviceLink';

const TREND = {
  up: { icon: '↑', label: 'Improving', cls: 'up' },
  stable: { icon: '→', label: 'Stable', cls: 'stable' },
  down: { icon: '↓', label: 'Underpowered', cls: 'down' },
} as const;

export function PredictionPanel({ mode, difficultyId, label }: {
  mode: 'campaign' | 'infinite' | 'bossRush';
  difficultyId?: string;
  label: string; // e.g. 'Campaign Stage' / 'Infinite Wave'
}): JSX.Element {
  meta.use(); // re-render when progression changes
  const { p, advice } = meta.predict(mode, difficultyId);
  const t = TREND[p.trend];
  const scaleMax = Math.max(1, p.high * 1.15);
  const pct = (n: number): number => Math.min(100, Math.max(0, (n / scaleMax) * 100));

  return (
    <div className={`predict-panel trend-${t.cls}`} role="group" aria-label={`Estimated ${label}`}>
      <div className="predict-head">
        <span className="predict-eyebrow">◇ Estimated {label}</span>
        <span className={`predict-conf conf-${p.confidence.toLowerCase()}`}>{p.confidence} confidence</span>
      </div>
      <div className="predict-hero">
        <span className="predict-approx">≈</span>
        <span className="predict-num">{p.estimate}</span>
        <span className="predict-trend" title={t.label}><span className="pt-icon">{t.icon}</span> {t.label}</span>
      </div>
      {/* Animated range graph — the confidence band with the estimate marker. */}
      <div className="predict-graph" aria-hidden>
        <div className="predict-track" />
        <div className="predict-band" style={{ left: `${pct(p.low)}%`, width: `${pct(p.high) - pct(p.low)}%` }} />
        <div className="predict-fill" style={{ width: `${pct(p.estimate)}%` }} />
        <div className="predict-marker" style={{ left: `${pct(p.estimate)}%` }} />
      </div>
      <div className="predict-range">Likely range <b>{p.low}–{p.high}</b> · sharpens as you play</div>
      {advice.length > 0 && (
        <ul className="predict-recs">
          {advice.map((r) => <li key={r.text}>{r.text} <AdviceGo nav={r.nav} /></li>)}
        </ul>
      )}
    </div>
  );
}
