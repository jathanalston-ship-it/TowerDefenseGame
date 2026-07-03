import type { Game } from '../core/game';
import { HERO_DEFS, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { audio } from '../audio/sound';
import type { HudSnapshot } from '../core/types';
import { meta, masteryLevel } from '../state/meta';
import { BiomassIcon, BoltIcon, HeroIcon } from './components/Icon';

export function Toolbar({
  game,
  hud,
  refresh,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
}): JSX.Element {
  const playable = hud.phase === 'prep' || hud.phase === 'wave';
  const heroDef = HERO_DEFS[hud.hero.kind];
  const save = meta.use(); // stars + mastery ranks on the cards (permanent identity at a glance)

  return (
    <div className="toolbar">
      <div className="tower-rail" data-tut="tower-rail">
        {TOWER_ORDER.map((kind, i) => {
          const def = TOWER_DEFS[kind];
          const sel = hud.selectedTower === kind;
          const afford = hud.biomass >= def.cost;
          const dps = def.fireInterval > 0 ? Math.round(def.damage / def.fireInterval) : 0;
          const stars = save.towerStars[kind] ?? 0;
          const mastery = masteryLevel(save.towerMasteryXp[kind] ?? 0);
          const placed = game.towers.reduce((n, t) => n + (t.kind === kind ? 1 : 0), 0);
          return (
            <button
              key={kind}
              data-tut={i === 0 ? 'tower-card-first' : undefined}
              className={`tcard ${def.combatClass.toLowerCase()} tt ${sel ? 'is-sel' : ''}${afford && playable ? ' is-ready' : ''}`}
              disabled={(!afford && !sel) || !playable}
              onClick={() => {
                audio.resume();
                game.selectTower(sel ? null : kind);
                if (!sel) audio.cue('select');
                refresh();
              }}
            >
              <span className="tcard-edge" />
              <span className="tcard-sheen" aria-hidden />
              <span className="tcard-head">
                <span className="tcard-name">{def.name}</span>
                {mastery > 0 && (
                  <span
                    className="tcard-mring"
                    title={`Mastery rank ${mastery}`}
                    style={{ ['--mp' as string]: Math.min(1, mastery / 50) }}
                  >
                    {Math.min(99, mastery)}
                  </span>
                )}
                <span className="hotkey">{i + 1}</span>
              </span>
              {stars > 0 && (
                <span className="tcard-stars" aria-label={`${stars} evolution stars`}>
                  {'◈'.repeat(Math.min(5, stars))}
                  {stars > 5 && <i>+{stars - 5}</i>}
                </span>
              )}
              <span className="tcard-blurb">{def.blurb}</span>
              <span className="tcard-foot">
                <span className={`cost-chip ${afford ? 'is-afford' : 'is-broke'}`}>
                  <BiomassIcon /> {def.cost}
                </span>
                {dps > 0 && <span className="tcard-dps">{dps} dps</span>}
                {placed > 0 && <span className="tcard-placed" title={`${placed} deployed this run`}>×{placed}</span>}
              </span>
              <span className="tt-bubble tt-rich">
                <b style={{ color: `var(--${def.combatClass.toLowerCase()})` }}>{def.name}</b>
                <span className="tt-class">{def.combatClass}</span>
                <span className="tt-stats">
                  {dps > 0 && <span>DPS ~{dps}</span>}
                  {def.range > 0 && <span>Range {def.range}</span>}
                  {def.splash > 0 && <span>Splash {def.splash}</span>}
                  {def.kind === 'reactor' && <span>Support · overcharges neighbors</span>}
                </span>
                <span className="tt-desc">{def.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="spacer" />

      <div className="hero-pod" data-tut="ability">
        <div className="hero-disc" aria-hidden><HeroIcon /></div>
        <button
          className={`ability-btn tt ${hud.armedAbility ? 'is-armed' : ''}`}
          disabled={!hud.hero.abilityReady || !playable}
          onClick={() => {
            audio.resume();
            game.armAbility();
            refresh();
          }}
        >
          <BoltIcon /> {heroDef.ability.name}
          <span className="hotkey">Q</span>
          <span className="tt-bubble">
            {hud.armedAbility
              ? 'Armed — click the battlefield to cast.'
              : hud.hero.abilityReady
                ? heroDef.ability.blurb
                : 'Recharging…'}
          </span>
        </button>
      </div>
    </div>
  );
}
