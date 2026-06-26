// RIGHT panel — "what I'm inspecting right now" (HUD.md §5). Contextual:
//   • a tower kind is selected → its live combat stats (also the mobile-friendly
//     stat readout, since hover tooltips don't exist on touch — VISUAL-AUDIT P2);
//   • otherwise → hero status + a live run summary so the panel is never dead space.
// (The ★ star track lands here when the star system is built.)

import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import type { HudSnapshot } from '../core/types';

function StatRow({ k, v }: { k: string; v: string | number }): JSX.Element {
  return (
    <div className="ins-stat">
      <span className="ins-stat-k">{k}</span>
      <span className="ins-stat-v">{v}</span>
    </div>
  );
}

function InsHead({ title, onCollapse }: { title: string; onCollapse?: () => void }): JSX.Element {
  return (
    <div className="side-head">
      <span>{title}</span>
      {onCollapse && (
        <button className="panel-collapse" onClick={onCollapse} title="Hide panel" aria-label="Hide panel">
          »
        </button>
      )}
    </div>
  );
}

export function Inspector({ hud, onCollapse }: { hud: HudSnapshot; onCollapse?: () => void }): JSX.Element {
  const kind = hud.selectedTower;

  if (kind) {
    const def = TOWER_DEFS[kind];
    const cls = def.combatClass.toLowerCase();
    const dps = def.fireInterval > 0 ? Math.round(def.damage / def.fireInterval) : 0;
    const rate = def.fireInterval > 0 ? (1 / def.fireInterval).toFixed(1) : null;
    return (
      <aside className="side-panel inspector" aria-label="Tower inspector">
        <InsHead title="Inspect" onCollapse={onCollapse} />
        <div className="ins-title">
          <span className="ins-name" style={{ color: `var(--${cls})` }}>
            {def.name}
          </span>
          <span className="class-badge" style={{ background: `var(--${cls})` }}>
            {def.combatClass}
          </span>
        </div>
        <div className="ins-stats">
          {dps > 0 && def.firing !== 'field' && <StatRow k="DPS" v={`~${dps}`} />}
          {def.range > 0 && <StatRow k="Range" v={def.range} />}
          {rate && def.firing !== 'field' && <StatRow k="Fire rate" v={`${rate}/s`} />}
          {def.firing === 'field' && rate && <StatRow k="Pulse" v={`${rate}/s`} />}
          {def.splash > 0 && <StatRow k="Splash" v={def.splash} />}
          {def.firing === 'support' && <StatRow k="Role" v="Support" />}
          {def.firing === 'field' && <StatRow k="Role" v="Control" />}
          {def.firing === 'infest' && <StatRow k="Role" v="DoT / Spread" />}
          <StatRow k="Cost" v={`${def.cost} biomass`} />
        </div>
        <p className="ins-blurb">{def.blurb}</p>
        <p className="side-hint">Tap a glowing slot to grow it here.</p>
      </aside>
    );
  }

  const heroDef = HERO_DEFS[hud.hero.kind];
  const abName = heroDef.ability.name;
  const ability = hud.hero.down
    ? `Reviving ${Math.ceil(hud.hero.respawn)}s`
    : hud.hero.abilityReady
      ? `${abName} ready`
      : `${abName} ${Math.ceil(hud.hero.abilityCd)}s`;

  return (
    <aside className="side-panel inspector" aria-label="Run inspector">
      <InsHead title="Status" onCollapse={onCollapse} />

      <div className="ins-title">
        <span className="ins-name" style={{ color: heroDef.color }}>
          {heroDef.name}
        </span>
        <span className="class-badge" style={{ background: heroDef.color, color: '#1a1206' }}>
          {heroDef.combatClass}
        </span>
      </div>
      <div className="ins-stats">
        <StatRow k="Health" v={`${hud.hero.hp}/${hud.hero.maxHp}`} />
        <StatRow k="Ability" v={ability} />
      </div>

      <div className="side-k">Run</div>
      <div className="ins-stats">
        <StatRow k="Wave" v={`${Math.max(1, hud.wave)}/${hud.totalWaves}`} />
        <StatRow k="Kills" v={hud.kills} />
        <StatRow k="Threat" v={`${hud.enemiesAlive} alive`} />
        <StatRow k="Biomass" v={hud.biomass} />
      </div>

      <p className="side-hint">Select a tower to inspect its stats.</p>
    </aside>
  );
}
