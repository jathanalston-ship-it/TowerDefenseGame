// Tower Lab — permanent per-tower progression on the main menu. Spend tower Shards
// (earned from run-end chests) on Stars; watch Mastery climb from use. Reads the
// reactive save store; star purchases go through meta.buyStar.

import { masteryProgress, meta, nextStarCost, towerProgress } from '../state/meta';
import { STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { ProgressBar } from './components/ProgressBar';

export function TowerLab(): JSX.Element {
  const save = meta.use();
  const prog = towerProgress(save);

  return (
    <div className="panel">
      <div className="panel-title">Tower Lab</div>
      <div className="panel-sub">
        Spend per-tower Shards on Stars. Mastery rises forever as you use a tower — each level a small permanent buff.
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

          return (
            <div className="lab-item" key={k}>
              <div className="lab-head">
                <span className="lab-name" style={{ color: def.color }}>
                  {def.name}
                </span>
                <span className="lab-shards" title="Tower Shards">
                  {shards} ✦
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
                  {maxed ? 'MAX' : `${cost} ✦`}
                </button>
              </div>

              <div className="lab-mastery">
                <div className="lab-mline">
                  <span>
                    Mastery <b>Lv {mp.level}</b>
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
