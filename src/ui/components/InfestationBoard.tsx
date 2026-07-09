// Infestation board (docs/INFESTATION.md) — the home conquest map: four regions, four
// sector pips each (live effective levels), the region passive at its current strength,
// and a click-to-pin target. Every mode feeds this board; neglect visibly drains it.

import { useState } from 'react';
import { meta } from '../../state/meta';
import { audio } from '../../audio/sound';

export function InfestationBoard(): JSX.Element {
  meta.use();
  const [, bump] = useState(0);
  const view = meta.infestationView();
  const pin = (id: string): void => {
    meta.setInfestTarget(view.target === id ? null : id);
    audio.cue('ui');
    bump((n) => n + 1);
  };
  return (
    <div className="inf-board panel" aria-label="Infestation map">
      <div className="liveops-head">
        <span className="liveops-k">⬢ INFESTATION MAP</span>
        <span className="liveops-next">{view.target ? 'feeding the pinned sector' : 'auto-spreading to the emptiest'}</span>
      </div>
      {view.regions.map(({ def, fraction, bonusNow }) => (
        <div className="inf-region" key={def.id} style={{ ['--rc' as string]: def.accent }}>
          <div className="inf-region-h">
            <span className="inf-region-name">{def.name}</span>
            <span className="inf-region-bonus">{fraction > 0 ? bonusNow : def.blurb}</span>
          </div>
          <div className="inf-sectors">
            {def.sectors.map((s) => {
              const lvl = Math.round(view.sectors[s.id] ?? 0);
              const pinned = view.target === s.id;
              return (
                <button
                  key={s.id}
                  className={`inf-sector${pinned ? ' is-pinned' : ''}`}
                  onClick={() => pin(s.id)}
                  title={`${s.name} — ${lvl}/100${pinned ? ' · pinned (runs feed here)' : ' · click to pin'}`}
                >
                  <i className="inf-fill" style={{ height: `${lvl}%` }} aria-hidden />
                  <span className="inf-sector-n">{pinned ? '◉' : lvl}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
