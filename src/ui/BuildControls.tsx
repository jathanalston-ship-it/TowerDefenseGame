import { useMemo, useState } from 'react';
import type { Game } from '../core/game';
import { ENEMY_DEFS } from '../core/config';
import type { EnemyDef } from '../core/config';
import { ENEMY_TIER } from '../render/theme';
import { audio } from '../audio/sound';
import { AUTOSTART_KEY } from '../state/prefs';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import type { HudSnapshot } from '../core/types';

// The WAVE BRIEFING console (Build Phase) — Incoming threat intel · Start Wave · the two
// semi-idle automations. Rendered as an absolutely-positioned overlay INSIDE .canvas-wrap:
// always mounted, never in layout — visibility is a CSS class toggle (opacity + slide), so
// entering/leaving prep can never shift the HUD, toolbar, or battlefield. Anchored
// top-center: the bottom holds the tower slots + core, while the top is empty until the
// wave spawns there — so the console obstructs nothing it shouldn't.
//
// The threat list is INTEL, not decoration: every incoming kind shows its name, count,
// threat tier (elite/boss ranked) and battlefield ROLE tag — the same role vocabulary the
// enemies now wear on the field (docs/ENEMIES.md §8), so the briefing teaches the tells.

/** The chip's role tag — derived from the def's mechanical traits (one, most-defining). */
function roleTag(def: EnemyDef): string | null {
  if (def.siege) return 'ARTILLERY';
  if (def.explodeDamage) return 'SUICIDE';
  if (def.summon) return 'SUMMONER';
  if (def.auraRegenPerSec || def.auraShield) return 'SUPPORT';
  if (def.shieldHp) return 'SHIELDED';
  if (def.regenPerSec) return 'REGEN';
  if (def.behavior.flying) return 'AIRBORNE';
  if (def.behavior.burrowing) return 'BURROWER';
  return null;
}

export function BuildControls({
  game,
  hud,
  refresh,
  tutorialLock = false,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
  /** Tutorial: the director scripts every wave start — the console shows intel only, with the
   * launch controls held so the game can never outrun the lesson. */
  tutorialLock?: boolean;
}): JSX.Element {
  const visible = hud.phase === 'prep' && hud.wave < hud.totalWaves;
  // The preview only changes per wave — memo it so the ~10 Hz HUD refresh never re-aggregates.
  const preview = useMemo(
    () => (visible ? game.getNextWavePreview() : null),
    [game, visible, hud.wave],
  );
  const hostiles = useMemo(() => (preview ? preview.reduce((n, e) => n + e.count, 0) : 0), [preview]);
  // Auto Gene Selection lives in the same console as Auto Wave, so the two semi-idle
  // automations are toggled together (and in-run, not only from the Hub's Settings). Both
  // persist to localStorage; the DraftModal reads the pref when the next draft opens.
  const [autoGene, setAutoGene] = useState(autoGenePref());
  const nextWave = Math.min(hud.totalWaves, hud.wave + 1);

  return (
    <div className={`build-controls ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
      <div className="build-bar">
        <div className="wb-brief">
          <div className="wb-head">
            <span className="wb-eyebrow">◉ INCOMING</span>
            <span className="wb-wave">{hud.endless ? `DEPTH ${nextWave}` : `WAVE ${nextWave}`}</span>
            {!hud.endless && <span className="wb-of">/ {hud.totalWaves}</span>}
            {hostiles > 0 && <span className="wb-count">{hostiles} hostiles</span>}
          </div>
          {preview && (
            <div className="wb-threats" aria-label="incoming enemies">
              {preview.map((e) => {
                const def = ENEMY_DEFS[e.kind];
                const tier = ENEMY_TIER[e.kind];
                const role = roleTag(def);
                return (
                  <span className={`wb-chip tt is-${tier}`} key={e.kind} tabIndex={visible ? 0 : -1} style={{ ['--ec' as string]: def.color }}>
                    <span className="wb-dot" aria-hidden />
                    <span className="wb-name">{def.name}</span>
                    <span className="wb-n">×{e.count}</span>
                    {role && <span className="wb-role">{role}</span>}
                    <span className="tt-bubble">
                      {def.name} — {def.hp} HP{def.armor > 0 ? ` · ${def.armor} armor` : ''}{role ? ` · ${role.toLowerCase()}` : ''}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="wb-actions">
          {tutorialLock ? (
            <div className="wb-tutlock" role="status">◈ Follow the lesson — deployment is scripted</div>
          ) : (
          <button
            className="primary start-btn"
            tabIndex={visible ? 0 : -1}
            onClick={() => {
              audio.resume();
              game.startWave();
              refresh();
            }}
          >
            ▶ Start Wave {nextWave} <span className="hotkey">␣</span>
          </button>
          )}
          {!tutorialLock && <div className="wb-autos">
            <button
              type="button"
              className={`auto-btn ${hud.autoStart ? (hud.autoStartWaiting ? 'is-waiting' : 'is-on') : ''}`}
              aria-pressed={hud.autoStart}
              tabIndex={visible ? 0 : -1}
              title={
                hud.autoStartWaiting
                  ? 'Auto Wave is armed but waiting — it starts once you place your first tower or start Wave 1'
                  : 'Auto-start the next wave after a short countdown'
              }
              onClick={() => {
                game.setAutoStart(!game.autoStart);
                try { localStorage.setItem(AUTOSTART_KEY, game.autoStart ? '1' : '0'); } catch { /* storage unavailable */ }
                refresh();
              }}
            >
              <i className="wb-led" aria-hidden />
              ⟳ Auto Wave
              <b>{hud.autoStart ? (hud.autoStartWaiting ? 'WAIT' : hud.autoStartIn > 0 ? `${Math.ceil(hud.autoStartIn)}s` : 'ON') : 'OFF'}</b>
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
              <i className="wb-led" aria-hidden />
              ◆ Auto Gene
              <b>{autoGene ? 'ON' : 'OFF'}</b>
            </button>
          </div>}
        </div>
      </div>
      {hud.autoStartWaiting && (
        <div className="auto-wait-note" role="status">
          Waiting for first placement…
        </div>
      )}
    </div>
  );
}
