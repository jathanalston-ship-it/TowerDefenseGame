import { useState } from 'react';
import type { Game } from '../core/game';
import { ENEMY_DEFS } from '../core/config';
import { audio } from '../audio/sound';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import type { HudSnapshot } from '../core/types';

// Build-Phase controls (Incoming telegraph · Start Wave · Auto-start) rendered as an
// absolutely-positioned overlay INSIDE .canvas-wrap. It is always mounted and never
// participates in layout — visibility is a CSS class toggle (opacity + slide), so
// entering/leaving prep can never shift the HUD, toolbar, or battlefield. Anchored
// top-center: the bottom holds the tower slots + core (placed during prep), while the
// top is empty until the wave spawns there — so the bar obstructs nothing it shouldn't.
export function BuildControls({
  game,
  hud,
  refresh,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
}): JSX.Element {
  const visible = hud.phase === 'prep' && hud.wave < hud.totalWaves;
  const preview = visible ? game.getNextWavePreview() : null;
  // Auto Gene Selection lives in the same prep bar as Auto Wave, so the two semi-idle
  // automations are toggled together (and in-run, not only from the Hub's Settings). Both
  // persist to localStorage; the DraftModal reads the pref when the next draft opens.
  const [autoGene, setAutoGene] = useState(autoGenePref());

  return (
    <div className={`build-controls ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
      <div className="build-bar">
        {preview && (
          <div className="incoming" aria-label="incoming enemies">
            <span className="incoming-k">Incoming</span>
            {preview.map((e) => {
              const def = ENEMY_DEFS[e.kind];
              return (
                <span className="inc-chip tt" key={e.kind} tabIndex={visible ? 0 : -1}>
                  <span className="inc-dot" style={{ background: def.color }} />×{e.count}
                  <span className="tt-bubble">{def.name}</span>
                </span>
              );
            })}
          </div>
        )}
        <button
          className="primary start-btn"
          tabIndex={visible ? 0 : -1}
          onClick={() => {
            audio.resume();
            game.startWave();
            refresh();
          }}
        >
          Start Wave {Math.min(hud.totalWaves, hud.wave + 1)} <span className="hotkey">␣</span>
        </button>
        <button
          type="button"
          className={`auto-btn ${hud.autoStart ? 'is-on' : ''}`}
          aria-pressed={hud.autoStart}
          tabIndex={visible ? 0 : -1}
          title="Auto-start the next wave after a short countdown"
          onClick={() => {
            game.setAutoStart(!game.autoStart);
            try { localStorage.setItem('assimilate.autostart', game.autoStart ? '1' : '0'); } catch { /* storage unavailable */ }
            refresh();
          }}
        >
          ⟳ Auto Wave {hud.autoStart ? (hud.autoStartIn > 0 ? `${Math.ceil(hud.autoStartIn)}s` : 'ON') : 'OFF'}
        </button>
        <button
          type="button"
          className={`auto-btn ${autoGene ? 'is-on' : ''}`}
          aria-pressed={autoGene}
          tabIndex={visible ? 0 : -1}
          title="Auto-draft the recommended ◆ PICK gene card after a countdown (pick any card to override)"
          onClick={() => {
            const next = !autoGene;
            setAutoGene(next);
            setAutoGenePref(next);
          }}
        >
          ◆ Auto Gene {autoGene ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
