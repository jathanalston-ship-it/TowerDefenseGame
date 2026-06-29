// Tower Lab — permanent per-tower progression on the main menu. Spend tower Shards
// (earned from run-end chests) on Stars, each of which unlocks an EVOLUTION (new
// targeting / projectiles / attacks — see stars.ts), not a stat bump. Reached forks are
// re-pickable here (loadout-level, applied next run). Mastery climbs from use.

import { masteryProgress, meta, nextStarCost, towerProgress } from '../state/meta';
import { STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { forksOf, isFork, stepAt } from '../core/stars';
import { MASTERY_RANK_EVERY, masteryRankTitle } from '../core/mastery';
import type { TowerKind } from '../core/types';
import { ProgressBar } from './components/ProgressBar';
import { CurrencyIcon } from './components/CurrencyIcon';

/** The re-pickable star forks the player has reached for a tower. */
function ForkPicker({ kind, stars }: { kind: TowerKind; stars: number }): JSX.Element | null {
  const save = meta.use();
  const reached = forksOf(kind).filter((f) => f.star <= stars);
  if (reached.length === 0) return null;
  return (
    <div className="lab-forks">
      {reached.map((f) => {
        const picked = save.towerForks[kind]?.[String(f.star)] ?? f.fork[0].id;
        return (
          <div className="lab-fork" key={f.star}>
            <div className="lab-fork-h">
              ★{f.star} {f.name}
            </div>
            <div className="lab-fork-opts">
              {f.fork.map((o) => (
                <button
                  key={o.id}
                  className={`fork-opt ${picked === o.id ? 'on' : ''}`}
                  title={o.desc}
                  onClick={() => meta.setTowerFork(kind, f.star, o.id)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TowerLab(): JSX.Element {
  const save = meta.use();
  const prog = towerProgress(save);

  return (
    <div className="panel">
      <div className="panel-title">Tower Lab</div>
      <div className="panel-sub">
        Spend per-tower Shards on Stars — each unlocks an <b>evolution</b> (new targeting, projectiles, or attacks), not
        just a number. Forks are re-pickable any run. Mastery rises forever from use.
      </div>
      <div className="lab-list">
        {TOWER_ORDER.map((k) => {
          const def = TOWER_DEFS[k];
          const stars = save.towerStars[k] ?? 0;
          const shards = save.towerShards[k] ?? 0;
          const cost = nextStarCost(save, k);
          const maxed = cost === null;
          const affordable = cost !== null && shards >= cost;
          const mp = masteryProgress(save.towerMasteryXp[k] ?? 0);
          const dmgPct = Math.round((prog[k].damageMult - 1) * 100);
          const ratePct = Math.round((prog[k].fireRateMult - 1) * 100);
          const next = maxed ? undefined : stepAt(k, stars + 1); // the unlock the next star buys

          return (
            <div className="lab-item" key={k}>
              <div className="lab-head">
                <span className="lab-name" style={{ color: def.color }}>
                  {def.name}
                </span>
                <span className="lab-shards">
                  {shards} <CurrencyIcon id="towerShards" color={def.color} size={13} />
                </span>
              </div>

              <div className="lab-stars">
                <span className="pips" aria-label={`${stars} of ${STAR.maxStars} stars`}>
                  {Array.from({ length: STAR.maxStars }, (_, i) => (
                    <span
                      key={i}
                      className={`pip ${i < stars ? 'on' : ''}`}
                      style={i < stars ? { color: def.color } : undefined}
                    >
                      ★
                    </span>
                  ))}
                </span>
                <button
                  className={`shop-buy ${affordable ? 'is-afford' : ''}`}
                  disabled={maxed || !affordable}
                  onClick={() => meta.buyStar(k)}
                >
                  {maxed ? 'MAX' : <>{cost} <CurrencyIcon id="towerShards" color={def.color} size={12} title="" /></>}
                </button>
              </div>

              {/* The next unlock — the "I want to buy this" preview. */}
              {next && (
                <div className="lab-evo" style={{ borderLeftColor: def.color }}>
                  <span className="lab-evo-tag" style={{ color: def.color }}>
                    ★{next.star} {next.name}
                    {isFork(next) ? ' — choose a path' : ''}
                  </span>
                  <span className="lab-evo-desc">{next.desc}</span>
                </div>
              )}

              <ForkPicker kind={k} stars={stars} />

              <div className="lab-mastery">
                <div className="lab-mline">
                  <span>
                    Mastery <b>Lv {mp.level}</b>
                    {mp.level >= MASTERY_RANK_EVERY && (
                      <span className="lab-rank" style={{ color: def.color }}>
                        {' '}
                        · {masteryRankTitle(mp.level)}
                      </span>
                    )}
                  </span>
                  <span className="lab-bonus">
                    +{dmgPct}% dmg{ratePct ? ` · +${ratePct}% rate` : ''}
                  </span>
                </div>
                <ProgressBar
                  value={mp.into}
                  max={mp.need}
                  color={def.color}
                  height={6}
                  label={`${def.name} mastery progress`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
