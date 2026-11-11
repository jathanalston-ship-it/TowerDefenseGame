// GROWTH PANEL (docs/POWER-SCORE.md §atlas) — the Command Center's meta-progression organ:
// the whole "what should I upgrade next?" loop on one card. Headline = the single biggest
// affordable Power gain anywhere (exact advisor math); below it, one row per Power system
// with its best move / status note + a ready-count badge; the trend strip is the save's
// daily Power ledger. Every row is a jump link — the panel navigates, the wings sell.

import { useMemo } from 'react';
import type { SaveData } from '../../save/saveStore';
import { powerAtlas } from '../../state/powerAtlas';
import type { AtlasAction } from '../../state/powerAtlas';
import { executePurchase } from '../../state/bestPurchase';
import { powerSeries, weeklyPowerDelta } from '../../state/powerLog';
import { meta } from '../../state/meta';
import { audio } from '../../audio/sound';
import { formatPower } from '../../core/power';
import type { HeroKind } from '../../core/types';
import { featureView } from '../../state/unlocks';

/** Execute an atlas move — every branch is the SAME guarded meta action its wing calls (and the
 *  atlas only ever offers moves on revealed wings — docs/PROGRESSION-GATING.md §seal). */
function runAtlasAction(a: AtlasAction): boolean {
  if (a.type === 'purchase') return executePurchase(a.surface, a.id);
  if (a.type === 'adapt') return meta.spendAdaptation(a.subject, a.unit, a.nodeId);
  meta.equip(a.hero as HeroKind, a.slot, a.uid);
  return true;
}

const ACTION_VERB: Record<AtlasAction['type'], string> = { purchase: 'Buy', adapt: 'Adapt', equip: 'Equip' };

/** The system's screen glyph (state/unlocks FEATURES), '◆' for a screen without one. */
function glyphOf(save: SaveData, nav: string): string {
  try { return featureView(save, nav).def.glyph; } catch { return '◆'; }
}

/** Inline sparkline over the daily ledger — pure SVG, no animation (an info readout).
 *  Shared: the Growth panel and the Profile's Power Breakdown both draw the same history. */
export function PowerSpark({ points }: { points: { day: string; score: number }[] }): JSX.Element | null {
  if (points.length < 2) return null;
  const w = 220;
  const h = 30;
  const min = Math.min(...points.map((p) => p.score));
  const max = Math.max(...points.map((p) => p.score));
  const span = Math.max(1, max - min);
  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((p.score - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="gp-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
      aria-label={`Power trend across ${points.length} days: ${points[0].score} to ${points[points.length - 1].score}`}>
      <polyline points={xy.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1].split(',')[0]} cy={xy[xy.length - 1].split(',')[1]} r="2" fill="currentColor" />
    </svg>
  );
}

export function GrowthPanel({ save, go }: { save: SaveData; go: (nav: string) => void }): JSX.Element {
  const atlas = useMemo(() => powerAtlas(save), [save]);
  const trend = useMemo(() => weeklyPowerDelta(save, atlas.score), [save, atlas.score]);
  const series = useMemo(() => powerSeries(save, 30), [save]);

  return (
    <section className="cc-growth" aria-label="Growth — best Power moves">
      <div className="gp-head">
        <span className="cc-panel-h">⚡ GROWTH</span>
        <span className="gp-score">{formatPower(atlas.score)}</span>
        {trend !== null && (
          <span className={`gp-trend ${trend > 0 ? 'is-up' : ''}`} title="Power gained over the trailing week">
            {trend > 0 ? `▲ +${formatPower(trend)}` : trend < 0 ? `▼ ${formatPower(trend)}` : '— steady'} · 7d
          </span>
        )}
      </div>
      <PowerSpark points={series} />

      {atlas.headline && (
        <div className="gp-best-row">
          <button className="gp-best" onClick={() => go(atlas.headline!.system.nav)}>
            <span className="gp-best-k">BEST MOVE</span>
            <span className="gp-best-what">
              <b>{atlas.headline.move.label}</b> · +{atlas.headline.move.powerDelta} Power · {atlas.headline.move.price}
            </span>
            <span className="gp-best-go" aria-hidden>▸</span>
          </button>
          {/* Quick-buy: executes the move in place (same guarded action the wing calls); the
              atlas recomputes on the save change, so the NEXT best move slides in. */}
          <button
            className="gp-buy"
            title={`${ACTION_VERB[atlas.headline.move.action.type]} now — ${atlas.headline.move.price}`}
            onClick={() => { if (runAtlasAction(atlas.headline!.move.action)) audio.cue('ui'); }}
          >
            {ACTION_VERB[atlas.headline.move.action.type]}
          </button>
        </div>
      )}

      <div className="gp-rows">
        {atlas.systems.map((sys) => (
          // Glyph + name + the Power on offer (2026-11-11 playtest: fewer words) — the move itself
          // (or the system's status) rides the tooltip.
          <button className="gp-row" key={sys.id} onClick={() => go(sys.nav)} title={sys.move ? `${sys.move.label} — ${sys.note}` : sys.note}>
            <span className="gp-row-g" aria-hidden>{glyphOf(save, sys.nav)}</span>
            <span className="gp-row-l">{sys.label}</span>
            {sys.readyCount > 0 && <span className="gp-ready">{sys.readyCount}</span>}
            <span className="gp-row-note">
              {sys.move && sys.move.powerDelta > 0 ? <b className="gp-row-gain">+{sys.move.powerDelta} ⚡</b> : sys.note}
            </span>
            <span className="gp-row-go" aria-hidden>▸</span>
          </button>
        ))}
      </div>
    </section>
  );
}
