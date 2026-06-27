// Hero picker — choose who leads the defense. The roster is data-driven (config HEROES);
// the choice persists via heroStore (its own localStorage key) and is folded into each
// run's GameConfig at launch (App.startRun). Reuses the menu panel styling.

import { heroSelect } from '../state/heroStore';
import { HEROES } from '../core/config';
import type { HeroId } from '../core/types';
import { audio } from '../audio/audio';

const ROSTER: HeroId[] = ['ravager', 'bulwark'];

export function HeroPanel(): JSX.Element {
  const selected = heroSelect.use();
  return (
    <div className="panel">
      <div className="panel-title">Hero</div>
      <div className="panel-sub">
        Choose who leads the defense — each plays differently. Your pick carries into every run.
      </div>
      <div className="hero-roster">
        {ROSTER.map((id) => {
          const h = HEROES[id];
          const sel = id === selected;
          const cls = h.combatClass.toLowerCase();
          return (
            <button
              key={id}
              className={`hero-card ${cls} ${sel ? 'is-sel' : ''}`}
              aria-pressed={sel}
              onClick={() => {
                if (!sel) {
                  audio.unlock();
                  audio.play('select');
                  heroSelect.select(id);
                }
              }}
            >
              <div className="hero-card-head">
                <span className="hero-card-name">{h.name}</span>
                <span className="hero-card-class" style={{ color: `var(--${cls})` }}>{h.combatClass}</span>
              </div>
              <div className="hero-card-role">{h.role}</div>
              <div className="hero-card-stats">
                <span>HP <b>{h.maxHp}</b></span>
                <span>DMG <b>{h.attackDamage}</b></span>
                <span>SPD <b>{h.speed}</b></span>
                <span>★ {h.ability.name}</span>
              </div>
              {sel && <span className="hero-card-badge">✓ Selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
