// CLASS BONDS screen (docs/CLASS-BONDS.md) — the Evolution Hub wing for the class set bonus. One card
// per combat class: its members (every tower and hero of the class — the ones you have bright), its
// three tiers with what each gives at the account's bond level, and the level-up that strengthens all
// three in every run. Reads core/classBonds (the SAME tables the sim applies) — what this screen
// promises is exactly what a run gives. `data-guide` marks feed the guided walkthrough.

import { meta, isHeroUnlocked, isTowerUnlocked } from '../state/meta';
import { audio } from '../audio/sound';
import { COMBAT_CLASSES, COMBAT_CLASS_ORDER } from '../core/combatClass';
import { BOND, CLASS_BONDS, bondCost, bondFxLine, bondTierFx } from '../core/classBonds';
import type { BondTier } from '../core/classBonds';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { CombatClass } from '../core/types';
import { CurrencyIcon } from './components/CurrencyIcon';
import './BondsScreen.css';

const ROMAN = ['', 'I', 'II', 'III'] as const;

function BondCard({ cls, level, cores }: { cls: CombatClass; level: number; cores: number }): JSX.Element {
  const save = meta.get();
  const cc = COMBAT_CLASSES[cls];
  const def = CLASS_BONDS[cls];
  const towers = TOWER_ORDER.filter((k) => TOWER_DEFS[k].combatClass === cls);
  const heroes = HERO_ORDER.filter((k) => HERO_DEFS[k].combatClass === cls);
  const maxed = level >= BOND.maxLevel;
  const cost = bondCost(level);
  const buy = (): void => {
    if (meta.upgradeBond(cls)) audio.cue('power');
  };
  return (
    <section className="bond-card" style={{ ['--cc' as string]: cc.color }} aria-label={`${cls} bond`}>
      <header className="bond-card-head">
        <span className="bond-card-glyph" aria-hidden>{cc.glyph}</span>
        <span className="bond-card-names">
          <b className="bond-card-cls">{cls}</b>
          <span className="bond-card-bond">{def.name}</span>
        </span>
        <span className="bond-card-lvl" title={`Bond level ${level} of ${BOND.maxLevel}`}>L{level}</span>
      </header>
      <p className="bond-card-blurb">{def.blurb}</p>
      <div className="bond-members" aria-label="Members">
        {towers.map((k) => (
          <span key={k} className={`bond-member${isTowerUnlocked(save, k) ? '' : ' is-locked'}`}>{TOWER_DEFS[k].name}</span>
        ))}
        {heroes.map((k) => (
          <span key={k} className={`bond-member is-hero${isHeroUnlocked(save, k) ? '' : ' is-locked'}`}>♛ {HERO_DEFS[k].name}</span>
        ))}
      </div>
      <ol className="bond-tiers">
        {([1, 2, 3] as BondTier[]).map((t) => (
          <li key={t} className="bond-tier">
            <span className="bond-tier-k">{BOND.thresholds[t - 1]} units · {ROMAN[t]}</span>
            <span className="bond-tier-v">{bondFxLine(bondTierFx(cls, t, level))}</span>
          </li>
        ))}
      </ol>
      <div className="bond-level">
        <span className="bond-level-bar" aria-hidden><i style={{ width: `${(level / BOND.maxLevel) * 100}%` }} /></span>
        <button className="primary bond-up" data-guide="bonds-upgrade" disabled={maxed || cores < cost} onClick={buy}
          title={maxed ? 'This bond is at its maximum level' : `Level ${level + 1}: every tier of the ${def.name} grows by ${Math.round(BOND.levelStep * 100)}% of its base`}>
          {maxed ? 'Max level' : <>Level up · {cost.toLocaleString()} <CurrencyIcon id="genomeCores" size={12} title="Genome Cores" /></>}
        </button>
      </div>
    </section>
  );
}

export function BondsScreen(): JSX.Element {
  const save = meta.use();
  return (
    <div className="bonds-screen">
      <div className="panel-head">
        <div>
          <div className="panel-title">Class Bonds</div>
          <div className="panel-sub">
            Every tower and hero has a class. Field {BOND.thresholds[0]}, {BOND.thresholds[1]} or {BOND.thresholds[2]} units
            of one class in a run and its bond wakes, for as long as they stay deployed. Each tower on the board counts once,
            and so does each fielded hero. Level a bond up to strengthen all three tiers in every run.
          </div>
        </div>
      </div>
      <div className="bonds-grid" data-guide="bonds-grid">
        {COMBAT_CLASS_ORDER.map((c) => <BondCard key={c} cls={c} level={save.classBonds[c] ?? 0} cores={save.shards} />)}
      </div>
    </div>
  );
}
