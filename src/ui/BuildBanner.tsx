// Build-Phase presentation — a non-blocking banner that celebrates clearing a wave
// and frames the next one. Appears between waves (a wave was cleared + the auto-start
// countdown is running); pointer-events pass through so the player keeps building.

import { CountUp } from './components/CountUp';
import { ENEMY_DEFS } from '../core/config';
import type { HudSnapshot } from '../core/types';

function CountdownRing({ pct, seconds }: { pct: number; seconds: number }): JSX.Element {
  const R = 17;
  const C = 2 * Math.PI * R;
  return (
    <svg className="cd-ring" width="42" height="42" viewBox="0 0 42 42" aria-hidden>
      <circle className="cd-track" cx="21" cy="21" r={R} />
      <circle
        className="cd-arc"
        cx="21"
        cy="21"
        r={R}
        style={{ strokeDasharray: C, strokeDashoffset: C * (1 - Math.max(0, Math.min(1, pct))) }}
      />
      <text className="cd-text" x="21" y="21">
        {seconds}
      </text>
    </svg>
  );
}

export function BuildBanner({ hud }: { hud: HudSnapshot }): JSX.Element | null {
  // Only between waves: a wave was cleared and the build countdown is ticking.
  if (hud.phase !== 'prep' || !hud.waveSummary || hud.buildCountdown === null) return null;

  const { wave, kills, biomass } = hud.waveSummary;
  const pct = hud.buildCountdownTotal > 0 ? hud.buildCountdown / hud.buildCountdownTotal : 0;
  const next = Math.min(hud.totalWaves, hud.wave + 1);

  return (
    <div className="build-banner" key={wave /* re-mount per wave → replays the slide-in */}>
      <div className="bb-row bb-head">
        <span className="bb-title">BUILD PHASE</span>
        <CountdownRing pct={pct} seconds={Math.max(0, Math.ceil(hud.buildCountdown))} />
      </div>

      <div className="bb-summary">
        Wave {wave} cleared · <b>{kills}</b> slain ·{' '}
        <span className="bb-biomass">
          +<CountUp value={biomass} animateFrom={0} duration={700} /> ⬡
        </span>
      </div>

      <div className="bb-incoming">
        <span className="bb-label">Wave {next} incoming</span>
        <div className="bb-chips">
          {hud.incoming.map((e) => (
            <span
              key={`${e.kind}${e.elite ? 'e' : ''}`}
              className={`bb-chip ${e.isBoss ? 'is-boss' : ''} ${e.elite ? 'is-elite' : ''}`}
            >
              {e.isBoss ? '☠ ' : e.elite ? '★ ' : ''}
              {ENEMY_DEFS[e.kind].name} ×{e.count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
