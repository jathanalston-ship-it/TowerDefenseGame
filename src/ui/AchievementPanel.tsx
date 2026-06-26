// Menu achievements gallery — unlocked vs. locked milestones with live progress.
// Hidden achievements stay concealed ("???") until earned; trackable ones show a
// progress bar; rewards are previewed. Reads the reactive save; no gameplay. Icons
// are drawn monograms (no OS emoji), matching the game's art direction.

import { meta } from '../state/meta';
import { ACHIEVEMENTS } from '../state/achievements';
import { ProgressBar } from './components/ProgressBar';
import { ShardIcon } from './components/Icon';

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
          const concealed = !!a.hidden && !got;
          const name = concealed ? 'Hidden' : a.name;
          const desc = concealed ? 'A secret milestone — keep playing to reveal it.' : a.desc;
          const mono = concealed ? '?' : a.name.charAt(0).toUpperCase();
          const prog = !got && !concealed && a.progress ? a.progress({ save }) : null;
          return (
            <div className={`achv-badge ${got ? 'got' : 'locked'} ${concealed ? 'hidden' : ''}`} key={a.id} tabIndex={0}>
              <span className="achv-badge-icon" aria-hidden>{mono}</span>
              <span className="achv-badge-text">
                <span className="achv-badge-name">{name}</span>
                <span className="achv-badge-desc">{desc}</span>
                {prog && (
                  <span className="achv-progress">
                    <ProgressBar
                      value={Math.min(prog.cur, prog.max)}
                      max={prog.max}
                      color="var(--r-rare)"
                      height={5}
                      label={`${name} progress`}
                    />
                    <span className="achv-progress-num">
                      {Math.min(prog.cur, prog.max).toLocaleString()}/{prog.max.toLocaleString()}
                    </span>
                  </span>
                )}
              </span>
              {!got && !concealed && a.reward ? (
                <span className="achv-reward" title="Shard reward">
                  +{a.reward} <ShardIcon />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
