// Statistics screen (menu panel). Renders the data-driven STAT_ROWS plus per-kind
// breakdowns for enemies killed and tower usage. Reads the reactive save store, so
// it reflects the latest run the moment you return to the menu.

import { meta } from '../state/meta';
import { ENEMY_DEFS, ENEMY_KINDS, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { STAT_ROWS } from '../state/stats';

export function Statistics(): JSX.Element {
  const s = meta.use().stats;

  return (
    <div className="panel stats-panel">
      <div className="panel-title">Statistics</div>
      <div className="panel-sub">Your lifetime record across every run.</div>

      <div className="stats-grid">
        {STAT_ROWS.map((r) => (
          <div className="stat-cell" key={r.label}>
            <div className="stat-k">{r.label}</div>
            <div className="stat-v">{r.value(s)}</div>
          </div>
        ))}
      </div>

      <div className="side-k stats-sub">Enemies Killed</div>
      <div className="stat-breakdown">
        {ENEMY_KINDS.map((k) => (
          <div className="stat-chip" key={k}>
            <span className="dot" style={{ background: ENEMY_DEFS[k].color }} />
            <span className="nm">{ENEMY_DEFS[k].name}</span>
            <b>{(s.killsByEnemy[k] ?? 0).toLocaleString()}</b>
          </div>
        ))}
      </div>

      <div className="side-k stats-sub">Tower Usage</div>
      <div className="stat-breakdown">
        {TOWER_ORDER.map((k) => (
          <div className="stat-chip" key={k}>
            <span className="dot" style={{ background: TOWER_DEFS[k].color }} />
            <span className="nm">{TOWER_DEFS[k].name}</span>
            <b>{(s.towerUsage[k] ?? 0).toLocaleString()}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
