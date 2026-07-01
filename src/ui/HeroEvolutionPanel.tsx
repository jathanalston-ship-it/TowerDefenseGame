// Hero Evolution menu (docs/HERO-EVOLUTION.md) — the in-run BIOMASS sink. A NON-MODAL overlay: the
// sim keeps running while it's open, so buying never pauses gameplay. Renders every category from the
// shared HERO_EVO_CATEGORIES (data-driven — a new axis needs no UI change), with live cost /
// affordability / effect, and shows the run Power Score updating on each purchase.

import { useRef, useState } from 'react';
import type { Game } from '../core/game';
import type { HudSnapshot } from '../core/types';
import { HERO_EVO, HERO_EVO_CATEGORIES, heroEvoCost, heroEvoEffectLabel } from '../core/heroEvolution';
import { meta } from '../state/meta';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';

export function HeroEvolutionPanel({
  game,
  hud,
  refresh,
  onClose,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
  onClose: () => void;
}): JSX.Element {
  // Track the last purchased axis to retrigger a per-card "just bought" flash (keyed by a bump count).
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const bumps = useRef(0);

  const totalOwned = hud.heroEvo.totalOwned;
  // Run Power Score WITH the hero-evolution temporary bucket — folds into the global composePower via
  // the shared effectsPower bridge, so it rises with every purchase (docs/POWER-SCORE.md).
  const power = meta.powerWith(game.heroEvoEffects()).score;

  const buy = (id: string): void => {
    audio.resume();
    if (game.buyHeroEvolution(id)) {
      bumps.current += 1;
      setFlash({ id, n: bumps.current });
    }
    refresh();
  };

  return (
    <div className="evo-menu" role="dialog" aria-label="Hero Evolution" aria-modal="false">
      <div className="evo-head">
        <div className="evo-title">
          <span className="evo-title-i" aria-hidden>🧬</span>
          <span>Hero Evolution</span>
        </div>
        <div className="evo-meters">
          <span className="evo-meter" title="In-run currency">⬢ <b>{hud.biomass}</b></span>
          <span className="evo-meter evo-power" title="Power Score with these upgrades">◆ <b>{formatPower(power)}</b></span>
        </div>
        <button className="evo-close" onClick={onClose} aria-label="Close Hero Evolution">✕</button>
      </div>
      <p className="evo-sub">Spend Biomass to permanently evolve <b>all heroes for this run</b> — reset when the run ends. Any hero unlocked later inherits every upgrade.</p>

      <div className="evo-grid">
        {HERO_EVO_CATEGORIES.map((cat) => {
          const level = hud.heroEvo.levels[cat.id] ?? 0;
          const maxed = level >= HERO_EVO.maxLevel;
          const cost = maxed ? 0 : heroEvoCost(cat, level, totalOwned);
          const affordable = !maxed && hud.biomass >= cost;
          const justFlashed = flash?.id === cat.id;
          return (
            <div
              key={`${cat.id}-${justFlashed ? flash!.n : 0}`}
              className={`evo-card${maxed ? ' is-maxed' : ''}${justFlashed ? ' is-bought' : ''}`}
            >
              <div className="evo-card-top">
                <span className="evo-icon" aria-hidden>{cat.icon}</span>
                <span className="evo-name">{cat.name}</span>
                <span className="evo-lv">{level}<span className="evo-lv-max">/{HERO_EVO.maxLevel}</span></span>
              </div>
              <div className="evo-pips" aria-hidden>
                {Array.from({ length: HERO_EVO.maxLevel }, (_, i) => (
                  <i key={i} className={i < level ? 'on' : ''} />
                ))}
              </div>
              <div className="evo-blurb">{cat.blurb}</div>
              <div className="evo-effect">
                <b>{heroEvoEffectLabel(cat, level)}</b>
                {!maxed && <span className="evo-next"> → {heroEvoEffectLabel(cat, level + 1)}</span>}
              </div>
              <button
                className={`evo-buy${affordable ? ' can' : ''}`}
                disabled={maxed || !affordable}
                onClick={() => buy(cat.id)}
                title={maxed ? 'Maxed out' : affordable ? `Buy for ${cost} Biomass` : `Need ${cost} Biomass`}
              >
                {maxed ? 'MAX' : <>Evolve · <b>{cost}</b> ⬢</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
