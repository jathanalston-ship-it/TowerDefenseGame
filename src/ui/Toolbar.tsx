import { useLayoutEffect, useRef } from 'react';
import type { Game } from '../core/game';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import { audio } from '../audio/sound';
import { telemetry } from '../net/telemetry';
import type { HudSnapshot } from '../core/types';
import { meta, masteryLevel } from '../state/meta';
import { COMBAT_CLASSES } from '../core/combatClass';
import { BiomassIcon, BoltIcon, HeroIcon } from './components/Icon';

/** Best strain-merge target for `kind` (mirrors Game.strainFromConveyor's pick) + its cost. */
function mergeTargetOf(game: Game, kind: string): { strain: number; cost: number } | null {
  let best: { tier: number; strain: number; id: number } | null = null;
  for (const t of game.towers) {
    if (t.kind !== kind || t.strain >= 5) continue;
    if (best === null || t.tier > best.tier || (t.tier === best.tier && t.strain > best.strain) || (t.tier === best.tier && t.strain === best.strain && t.id < best.id)) {
      best = { tier: t.tier, strain: t.strain, id: t.id };
    }
  }
  return best === null ? null : { strain: best.strain, cost: 0 };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export function Toolbar({
  game,
  hud,
  refresh,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
}): JSX.Element {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const consumedFocus = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const removed = consumedFocus.current;
    consumedFocus.current = null;
    if (!removed || removed.isConnected || document.activeElement !== document.body) return;
    // A consumed card must not strand keyboard focus or move it onto another recycle action.
    const toolbar = toolbarRef.current;
    const next = toolbar?.querySelector<HTMLElement>('.cv-deploy:not(:disabled)')
      ?? toolbar?.querySelector<HTMLElement>('.tcard:not(:disabled)')
      ?? toolbar?.querySelector<HTMLElement>('.conveyor');
    next?.focus();
  });
  const playable = hud.phase === 'prep' || hud.phase === 'wave';
  const heroDef = HERO_DEFS[hud.hero.kind];
  const abilityStatus = hud.hero.down
    ? `Hero recovering — ${Math.ceil(hud.hero.respawn)}s`
    : hud.armedAbility ? 'Armed — click the battlefield to cast.'
      : hud.hero.abilityReady ? heroDef.ability.blurb : `Recharging — ${Math.ceil(hud.hero.abilityCd)}s`;
  const save = meta.use(); // stars + mastery ranks on the cards (permanent identity at a glance)
  // The tutorial rails the SAME conveyor model as every real run (docs/TUTORIAL.md §accuracy) —
  // teaching a full classic rail the player never sees again was the #1 playtest confusion.
  const conveyorMode = true;
  const railKinds = [hud.conveyor.favorite]; // the always-available favorite; everything else arrives on the belt

  return (
    <div className="toolbar" ref={toolbarRef}>
      <div className="tower-rail" data-tut="tower-rail">
        {railKinds.map((kind, i) => {
          const def = TOWER_DEFS[kind];
          const sel = hud.selectedTower === kind && game.selectedConveyorId === null;
          const cost = conveyorMode ? hud.conveyor.deployCost : def.cost;
          const afford = hud.biomass >= cost;
          const dps = def.fireInterval > 0 ? Math.round(def.damage / def.fireInterval) : 0;
          const stars = save.towerStars[kind] ?? 0;
          const mastery = masteryLevel(save.towerMasteryXp[kind] ?? 0);
          const placed = game.towers.reduce((n, t) => n + (t.kind === kind ? 1 : 0), 0);
          return (
            <button
              key={kind}
              data-tut={i === 0 ? 'tower-card-first' : undefined}
              className={`tcard ${def.combatClass.toLowerCase()} tt ${sel ? 'is-sel' : ''}${afford && playable ? ' is-ready' : ''}`}
              aria-pressed={sel}
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
                {conveyorMode && <span className="tcard-fav" title="Favorite — always available (change it in the Tower Lab)">★</span>}
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
                  <BiomassIcon /> {cost}
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

        {conveyorMode && (
          <div className="conveyor" data-tut="conveyor" role="group" tabIndex={-1} aria-label="Biomorph Conveyor">
            {hud.conveyor.items.map((c, idx) => {
              const def = TOWER_DEFS[c.kind];
              const ready = c.growFrac >= 1;
              const armed = game.selectedConveyorId === c.id;
              const refund = c.free ? 0 : hud.conveyor.recycleValue;
              const target = mergeTargetOf(game, c.kind);
              const mergeCost = target ? hud.conveyor.strainCostFrom[Math.max(0, Math.min(3, target.strain - 1))] : 0;
              return (
                <div
                  key={c.id}
                  className={`cv-slot ${c.rarity}${ready ? ' is-ready' : ' is-growing'}${armed ? ' is-armed' : ''}`}
                  style={{ ['--cv' as string]: def.color, ['--grow' as string]: c.growFrac }}
                >
                  <div className="cv-head">
                    <span className="cv-cls" style={{ color: COMBAT_CLASSES[def.combatClass].color }} title={hud.bonds ? `${def.combatClass} — counts toward the ${def.combatClass} bond` : def.combatClass} aria-label={def.combatClass}>{COMBAT_CLASSES[def.combatClass].glyph}</span>
                    <span className="cv-name">{def.name}</span>
                    {c.strain > 1 && <span className="cv-strain">Strain {ROMAN[c.strain - 1]}</span>}
                    {idx < 3 && <span className="hotkey" title={`Press ${idx + 2} to arm this pod`}>{idx + 2}</span>}
                  </div>
                  {!ready && (
                    <div className="cv-grow" role="progressbar" aria-label={`${def.name} growth`}
                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, c.growFrac)) * 100)}
                      aria-valuetext={`${Math.ceil(c.readyIn)} seconds until ready`}>
                      <span className="cv-grow-fill" />
                      <span className="cv-timer">{Math.ceil(c.readyIn)}s</span>
                    </div>
                  )}
                  {ready && (
                    <div className="cv-actions">
                      <button
                        className={`cv-btn cv-deploy${armed ? ' is-on' : ''}${c.free ? ' is-free' : ''}`}
                        aria-pressed={armed}
                        aria-label={`${def.name} — ${c.free ? 'Deploy free' : `Deploy for ${hud.conveyor.deployCost} Biomass`}`}
                        disabled={!playable || (!c.free && hud.biomass < hud.conveyor.deployCost)}
                        title={c.free
                          ? `Deploy — FREE (the run-start gift)${c.strain > 1 ? ` (arrives at Strain ${ROMAN[c.strain - 1]})` : ''}`
                          : `Deploy — ${hud.conveyor.deployCost} Biomass${c.strain > 1 ? ` (arrives at Strain ${ROMAN[c.strain - 1]})` : ''}`}
                        onClick={() => {
                          audio.resume();
                          game.selectConveyorItem(armed ? null : c.id);
                          if (!armed) audio.cue('select');
                          refresh();
                        }}
                      >
                        {c.free ? 'Deploy FREE' : `Deploy ${hud.conveyor.deployCost}`}
                      </button>
                      <button
                        className="cv-btn cv-strainb"
                        aria-label={`Merge ${def.name}${target ? ` for ${mergeCost} Biomass` : ' — no eligible tower'}`}
                        disabled={!playable || target === null || hud.biomass < mergeCost}
                        title={target === null ? `No ${def.name} on the field below Strain V` : `Strain — consume to evolve your strongest ${def.name} to Strain ${ROMAN[Math.min(4, target.strain)]} (${mergeCost} Biomass)`}
                        onClick={(event) => {
                          if (document.activeElement === event.currentTarget) consumedFocus.current = event.currentTarget;
                          audio.resume();
                          game.strainFromConveyor(c.id); // the sim queues the successful purchase cue
                          refresh();
                        }}
                      >
                        Strain{target ? ` ${mergeCost}` : ''}
                      </button>
                      <button
                        className="cv-btn cv-discard"
                        aria-label={`Recycle ${def.name} for ${refund} Biomass`}
                        disabled={!playable}
                        title={`Discard — recycle for ${refund} Biomass${c.free ? ' (free starting organism)' : ''}`}
                        onClick={(event) => {
                          if (document.activeElement === event.currentTarget) consumedFocus.current = event.currentTarget;
                          audio.resume();
                          if (game.discardConveyor(c.id)) audio.cue('dissolve');
                          refresh();
                        }}
                      >
                        ♻ {refund}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="hero-pod" data-tut="ability">
        <div className="hero-disc" aria-hidden><HeroIcon /></div>
        <button
          className={`ability-btn tt ${hud.armedAbility ? 'is-armed' : ''}`}
          disabled={!hud.hero.abilityReady || !playable}
          aria-label={`${heroDef.ability.name} — ${abilityStatus}`}
          aria-pressed={hud.armedAbility}
          // Cooldown ring (--cd 0→1): the recharge is visible at a glance; the ring closes and
          // yields to the ready-glow the moment the ability comes back.
          style={{ ['--cd' as string]: hud.hero.abilityReady ? 1 : Math.max(0, Math.min(1, 1 - hud.hero.abilityCd / Math.max(0.01, hud.hero.abilityCdMax))) }}
          onClick={() => {
            audio.resume();
            const wasArmed = game.armedAbility;
            game.armAbility();
            if (!wasArmed && game.armedAbility) telemetry.emit('ability', { d: hud.hero.kind, v: 1 });
            refresh();
          }}
        >
          <BoltIcon /> {heroDef.ability.name}
          <span className="hotkey" title={abilityStatus}>{hud.hero.down ? `↻ ${Math.ceil(hud.hero.respawn)}s` : hud.hero.abilityReady ? 'Q' : `${Math.ceil(hud.hero.abilityCd)}s`}</span>
          <span className="tt-bubble">
            {abilityStatus}
          </span>
        </button>
        <button
          className={`autocast-btn tt${(hud.hiveActive || hud.autocast.on) ? ' is-on' : ''}`}
          aria-pressed={hud.hiveActive || hud.autocast.unlocked ? hud.hiveActive || hud.autocast.on : undefined}
          disabled={hud.hiveActive || !playable || (!hud.autocast.unlocked && !hud.autocast.affordable)}
          onClick={() => {
            audio.resume();
            if (hud.autocast.unlocked) game.toggleAutocast();
            else game.buyAutocast();
            refresh();
          }}
        >
          {hud.hiveActive ? 'HIVE AUTO' : hud.autocast.unlocked ? (hud.autocast.on ? 'AUTO ON' : 'AUTO OFF') : `AUTO ⌁ ${hud.autocast.cost}`}
          <span className="tt-bubble">
            {hud.hiveActive ? 'Hive Intelligence handles abilities. Turn it off to take control.' : hud.autocast.unlocked
              ? hud.autocast.on
                ? 'Auto-cast ON — the hero fires its ability automatically. Click to turn off.'
                : 'Auto-cast OFF. Click to turn on.'
              : `Unlock auto-cast for ${hud.autocast.cost} biomass — the hero then fires its ability on cooldown.`}
          </span>
        </button>
      </div>
    </div>
  );
}
