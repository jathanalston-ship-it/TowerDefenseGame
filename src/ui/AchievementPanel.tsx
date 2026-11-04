// Menu achievements gallery — unlocked vs. locked milestones with live progress.
// Hidden achievements stay concealed ("???") until earned; trackable ones show a
// progress bar; rewards are previewed. Reads the reactive save; no gameplay. Icons
// are drawn monograms (no OS emoji), matching the game's art direction.

import { meta } from '../state/meta';
import { AUTHORED_ACHIEVEMENTS, LADDER_FAMILIES, ladderGoals } from '../state/achievements';
import { ProgressBar } from './components/ProgressBar';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';

export function AchievementPanel(): JSX.Element {
  const save = meta.use();
  const have = new Set(save.achievements);
  // Ladders (docs/PROGRESSION-SYSTEMS.md §ladders): one card per family — the rungs earned and
  // the next one — instead of hundreds of generated rows. Authored count stays the headline.
  const authoredGot = AUTHORED_ACHIEVEMENTS.filter((a) => have.has(a.id)).length;
  const next = new Map(ladderGoals(save).map((g) => [g.family, g]));
  const rungs = (family: string): number => save.achievements.filter((id) => id.startsWith(`ladder_${family}_`)).length;
  const totalRungs = LADDER_FAMILIES.reduce((n, f) => n + rungs(f.id), 0);

  return (
    <div className="panel">
      <div className="panel-title">
        Achievements <span className="achv-count">{authoredGot}/{AUTHORED_ACHIEVEMENTS.length}{totalRungs > 0 ? ` · ${totalRungs} ladder rung${totalRungs === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div className="panel-sub">Milestones to chase — unlocked as you push deeper and grow your towers.</div>
      <div className="achv-grid">
        {AUTHORED_ACHIEVEMENTS.map((a) => {
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
                <span className="achv-reward" title={`${ACCOUNT_CURRENCY.name} reward`}>
                  +{a.reward} <CurrencyIcon id="genomeCores" title="" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="panel-sub achv-ladder-h">Ladders — lifetime ledgers that keep paying at every depth.</div>
      <div className="achv-grid">
        {LADDER_FAMILIES.map((f) => {
          const got = rungs(f.id);
          const g = next.get(f.id);
          return (
            <div className={`achv-badge ${got > 0 ? 'got' : 'locked'}`} key={f.id} tabIndex={0}>
              <span className="achv-badge-icon" aria-hidden>{got > 0 ? got : f.title.charAt(0)}</span>
              <span className="achv-badge-text">
                <span className="achv-badge-name">{g ? g.name : `${f.title} — complete`}</span>
                <span className="achv-badge-desc">{g ? `${g.remaining} · ${got} rung${got === 1 ? '' : 's'} earned` : `Every rung earned.`}</span>
                {g && (
                  <span className="achv-progress">
                    <ProgressBar value={Math.round(g.progress * 100)} max={100} color="var(--r-rare)" height={5} label={`${g.name} progress`} />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
