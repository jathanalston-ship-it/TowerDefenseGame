import type { Game } from '../core/game';
import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { HudSnapshot } from '../core/types';

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
      {TOWER_ORDER.map((kind) => {
        const def = TOWER_DEFS[kind];
        const sel = hud.selectedTower === kind;
        const afford = hud.biomass >= def.cost;
        return (
          <button
            key={kind}
            className={`tbtn ${def.combatClass.toLowerCase()} ${sel ? 'sel' : ''}`}
            disabled={(!afford && !sel) || !playable}
            onClick={() => {
              game.selectTower(sel ? null : kind);
              refresh();
            }}
          >
            <span className="n">{def.name}</span>
            <span className="c">
              {def.cost} biomass · {def.blurb}
            </span>
          </button>
        );
      })}

      <div className="spacer" />

      <button
        disabled={!hud.hero.abilityReady || !playable}
        className={hud.armedAbility ? 'sel' : ''}
        onClick={() => {
          game.armAbility();
          refresh();
        }}
      >
        ⚡ Apex Leap{hud.armedAbility ? ' — click map' : hud.hero.abilityReady ? '' : ' (cooldown)'}
      </button>

      {hud.phase === 'prep' && hud.wave < hud.totalWaves && (
        <button
          className="primary"
          onClick={() => {
            game.startWave();
            refresh();
          }}
        >
          Start Wave {Math.min(hud.totalWaves, hud.wave + 1)} ▶
        </button>
      )}
    </div>
  );
}
