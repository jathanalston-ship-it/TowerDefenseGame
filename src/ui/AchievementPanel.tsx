// Menu achievements gallery — a collection board of unlocked vs. locked milestones.
// Visible goals give the player something to chase across runs (retention), and the
// running count is its own small progress bar. Reads the reactive save; no gameplay.

import { meta } from '../state/meta';
import { ACHIEVEMENTS } from '../state/achievements';

export function AchievementPanel(): JSX.Element {
  const save = meta.use();
  const have = new Set(save.achievements);

  return (
    <div className="panel">
      <div className="panel-title">
        Achievements <span className="achv-count">{have.size}/{ACHIEVEMENTS.length}</span>
      </div>
      <div className="panel-sub">Milestones to chase — unlocked as you push deeper and grow your towers.</div>
      <div className="achv-grid">
        {ACHIEVEMENTS.map((a) => {
          const got = have.has(a.id);
          return (
            <div className={`achv-badge ${got ? 'got' : 'locked'}`} key={a.id} title={a.desc} tabIndex={0}>
              <span className="achv-badge-icon">{got ? a.icon : '🔒'}</span>
              <span className="achv-badge-text">
                <span className="achv-badge-name">{a.name}</span>
                <span className="achv-badge-desc">{a.desc}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
