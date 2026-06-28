import type { Game } from '../core/game';
import { ENEMY_DEFS } from '../core/config';
import { audio } from '../audio/sound';
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
          ⟳ Auto {hud.autoStart ? (hud.autoStartIn > 0 ? `${Math.ceil(hud.autoStartIn)}s` : 'ON') : 'OFF'}
        </button>
      </div>
    </div>
  );
}
