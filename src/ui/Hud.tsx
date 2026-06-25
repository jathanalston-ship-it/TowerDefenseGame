import type { HudSnapshot } from '../core/types';

export function Hud({ hud }: { hud: HudSnapshot }): JSX.Element {
  const displayWave =
    hud.phase === 'prep' ? Math.min(hud.totalWaves, hud.wave + 1) : Math.max(1, hud.wave);
  const lowIntegrity = hud.integrity / hud.maxIntegrity < 0.34;

  return (
    <div className="hud">
      <div className="stat">
        <div className="k">Biomass</div>
        <div className="v" style={{ color: 'var(--caustic)' }}>
          {hud.biomass}
        </div>
      </div>
      <div className="stat">
        <div className="k">Integrity</div>
        <div className="v" style={{ color: lowIntegrity ? 'var(--danger)' : 'var(--text)' }}>
          {hud.integrity}/{hud.maxIntegrity}
        </div>
      </div>
      <div className="stat">
        <div className="k">Wave</div>
        <div className="v">
          {displayWave}/{hud.totalWaves}
        </div>
      </div>
      <div className="stat">
        <div className="k">Kills</div>
        <div className="v">{hud.kills}</div>
      </div>
      <div className="stat">
        <div className="k">Enemies</div>
        <div className="v">{hud.enemiesAlive}</div>
      </div>
      <div className="stat">
        <div className="k">Hero</div>
        <div className="v" style={{ color: hud.hero.down ? 'var(--danger)' : 'var(--gold)' }}>
          {hud.hero.down ? `DOWN ${Math.ceil(hud.hero.respawn)}s` : `${hud.hero.hp}/${hud.hero.maxHp}`}
        </div>
      </div>
      <div className="spacer" />
      <div className="stat">
        <div className="k">Phase</div>
        <div className="v" style={{ textTransform: 'uppercase' }}>
          {hud.phase}
        </div>
      </div>
    </div>
  );
}
