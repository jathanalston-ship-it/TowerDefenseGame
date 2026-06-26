import type { Game } from '../core/game';
import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { HudSnapshot } from '../core/types';
import { Icon } from './components/Icon';

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
                game.selectTower(sel ? null : kind);
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
                <Icon name="diamond" size={12} /> {def.cost}
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
        <div className="hero-disc" aria-hidden>
          <Icon name="diamond" size={16} />
        </div>
        <button
          className={`ability-btn tt ${hud.armedAbility ? 'is-armed' : ''}`}
          disabled={!hud.hero.abilityReady || !playable}
          onClick={() => {
            game.armAbility();
            refresh();
          }}
        >
          <Icon name="bolt" size={14} /> Apex Leap
          <span className="hotkey">Q</span>
          <span className="tt-bubble">
            {hud.armedAbility
              ? 'Armed — click the battlefield to leap.'
              : hud.hero.abilityReady
                ? 'AoE leap that fractures enemies.'
                : 'Recharging…'}
          </span>
        </button>
      </div>

      {hud.phase === 'prep' && hud.wave < hud.totalWaves && (
        <button
          className="primary start-btn"
          onClick={() => {
            game.startWave();
            refresh();
          }}
        >
          Start Wave {Math.min(hud.totalWaves, hud.wave + 1)} <span className="hotkey">␣</span>
        </button>
      )}
    </div>
  );
}
