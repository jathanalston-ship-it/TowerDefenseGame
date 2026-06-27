import type { Game } from '../core/game';
import { ENEMY_DEFS, HERO_DEFS, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { audio } from '../audio/sound';
import type { HudSnapshot } from '../core/types';
import { BiomassIcon, BoltIcon, HeroIcon } from './components/Icon';

export function Toolbar({
  game,
  hud,
  refresh,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
}): JSX.Element {
  const playable = hud.phase === 'prep' || hud.phase === 'wave';
  const heroDef = HERO_DEFS[hud.hero.kind];

  return (
    <div className="toolbar">
      <div className="tower-rail">
        {TOWER_ORDER.map((kind, i) => {
          const def = TOWER_DEFS[kind];
          const sel = hud.selectedTower === kind;
          const afford = hud.biomass >= def.cost;
          const dps = def.fireInterval > 0 ? Math.round(def.damage / def.fireInterval) : 0;
          return (
            <button
              key={kind}
              className={`tcard ${def.combatClass.toLowerCase()} tt ${sel ? 'is-sel' : ''}`}
              disabled={(!afford && !sel) || !playable}
              onClick={() => {
                audio.resume();
                game.selectTower(sel ? null : kind);
                if (!sel) audio.cue('select');
                refresh();
              }}
            >
              <span className="tcard-edge" />
              <span className="tcard-head">
                <span className="tcard-name">{def.name}</span>
                <span className="hotkey">{i + 1}</span>
              </span>
              <span className="tcard-blurb">{def.blurb}</span>
              <span className={`cost-chip ${afford ? 'is-afford' : 'is-broke'}`}>
                <BiomassIcon /> {def.cost}
              </span>
              <span className="tt-bubble tt-rich">
                <b style={{ color: `var(--${def.combatClass.toLowerCase()})` }}>{def.name}</b>
                <span className="tt-class">{def.combatClass}</span>
                <span className="tt-stats">
                  {dps > 0 && <span>DPS ~{dps}</span>}
                  {def.range > 0 && <span>Range {def.range}</span>}
                  {def.splash > 0 && <span>Splash {def.splash}</span>}
                  {def.kind === 'reactor' && <span>Support · overcharges neighbors</span>}
                </span>
                <span className="tt-desc">{def.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="spacer" />

      <div className="hero-pod">
        <div className="hero-disc" aria-hidden><HeroIcon /></div>
        <button
          className={`ability-btn tt ${hud.armedAbility ? 'is-armed' : ''}`}
          disabled={!hud.hero.abilityReady || !playable}
          onClick={() => {
            audio.resume();
            game.armAbility();
            refresh();
          }}
        >
          <BoltIcon /> {heroDef.ability.name}
          <span className="hotkey">Q</span>
          <span className="tt-bubble">
            {hud.armedAbility
              ? 'Armed — click the battlefield to cast.'
              : hud.hero.abilityReady
                ? heroDef.ability.blurb
                : 'Recharging…'}
          </span>
        </button>
      </div>

      {hud.phase === 'prep' && hud.wave < hud.totalWaves && (
        <div className="next-wave">
          {(() => {
            const preview = game.getNextWavePreview();
            if (!preview) return null;
            return (
              <div className="incoming" aria-label="incoming enemies">
                <span className="incoming-k">Incoming</span>
                {preview.map((e) => {
                  const def = ENEMY_DEFS[e.kind];
                  return (
                    <span className="inc-chip tt" key={e.kind} tabIndex={0}>
                      <span className="inc-dot" style={{ background: def.color }} />×{e.count}
                      <span className="tt-bubble">{def.name}</span>
                    </span>
                  );
                })}
              </div>
            );
          })()}
          <button
            className="primary start-btn"
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
            aria-pressed={hud.autoStart}
            title="Auto-start the next wave after a short countdown"
            onClick={() => {
              game.setAutoStart(!game.autoStart);
              try { localStorage.setItem('assimilate.autostart', game.autoStart ? '1' : '0'); } catch { /* storage unavailable */ }
              refresh();
            }}
            style={{
              marginLeft: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${hud.autoStart ? 'var(--success)' : 'rgba(120,170,230,0.28)'}`,
              background: hud.autoStart ? 'rgba(90,209,140,0.16)' : 'rgba(14,22,34,0.85)',
              color: hud.autoStart ? 'var(--success)' : '#9fb2c8', letterSpacing: '0.06em', fontSize: 12,
            }}
          >
            ⟳ Auto {hud.autoStart ? (hud.autoStartIn > 0 ? `${Math.ceil(hud.autoStartIn)}s` : 'ON') : 'OFF'}
          </button>
        </div>
      )}
    </div>
  );
}
