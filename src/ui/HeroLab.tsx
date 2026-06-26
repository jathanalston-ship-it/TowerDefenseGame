// Hero Lab — pick which hero to field, and spend hero Shards on Stars. Mirrors the
// Tower Lab (stars + infinite mastery), plus a roster selector for slot 1. Reads the
// reactive save store; purchases/selection go through the meta layer.

import { heroProgress, masteryProgress, meta, nextHeroStarCost } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, STAR } from '../core/config';
import { ProgressBar } from './components/ProgressBar';

export function HeroLab(): JSX.Element {
  const save = meta.use();
  const prog = heroProgress(save);

  return (
    <div className="panel">
      <div className="panel-title">Hero Lab</div>
      <div className="panel-sub">
        Choose the hero you deploy, then spend hero Shards on Stars. Mastery rises forever as a hero fights.
      </div>
      <div className="lab-list">
        {HERO_ORDER.map((k) => {
          const def = HERO_DEFS[k];
          const stars = save.heroStars[k] ?? 0;
          const shards = save.heroShards[k] ?? 0;
          const cost = nextHeroStarCost(save, k);
          const maxed = cost === null;
          const affordable = cost !== null && shards >= cost;
          const mp = masteryProgress(save.heroMasteryXp[k] ?? 0);
          const dmgPct = Math.round((prog[k].damageMult - 1) * 100);
          const cdPct = Math.round((1 - prog[k].cooldownMult) * 100);
          const selected = save.selectedHero === k;

          return (
            <div className={`lab-item ${selected ? 'is-selected' : ''}`} key={k}>
              <div className="lab-head">
                <span className="lab-name" style={{ color: def.color }}>
                  {def.name} <span className="lab-class">· {def.combatClass}</span>
                </span>
                <span className="lab-shards" title="Hero Shards">
                  {shards} ✦
                </span>
              </div>

              <div className="lab-stars">
                <button
                  className={`shop-buy ${selected ? '' : 'is-afford'}`}
                  disabled={selected}
                  onClick={() => meta.setSelectedHero(k)}
                >
                  {selected ? 'FIELDED' : 'Field'}
                </button>
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
                  onClick={() => meta.buyHeroStar(k)}
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
                    +{dmgPct}% dmg{cdPct ? ` · -${cdPct}% cd` : ''}
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
