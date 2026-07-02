// HERO COMBAT CONSOLE (docs/HERO-EVOLUTION.md §console) — the in-run Biomass sink as a
// premium command surface, not a spreadsheet. The battlefield AUTO-PAUSES while it is open
// (GameView holds the sim and restores the player's own pause state on close). Three regions:
// VITALS (the selected champion's live numbers), the SHOWCASE (living portrait + ability +
// active effects), and UPGRADES (all ten axes as compact rows with full comparisons). The
// roster tabs switch heroes INSTANTLY (upgrades are run-global — every champion benefits);
// buys support click / hold-to-repeat / shift×5 with the overspend guard. Opens from the HUD
// hero summary or the E hotkey; closes with ✕ / E / Escape.

import { useMemo, useRef, useState } from 'react';
import type { Game } from '../core/game';
import type { HeroKind, HudSnapshot } from '../core/types';
import { HERO_CRIT_BASE, HERO_EVO, HERO_EVO_CATEGORIES, deriveHeroEvoMods, heroEvoCost, heroEvoEffectLabel } from '../core/heroEvolution';
import type { HeroEvoCategory } from '../core/heroEvolution';
import { HERO_DEFS } from '../core/config';
import { CARD_POOL, cardSubject } from '../core/cards';
import { meta } from '../state/meta';
import { announcePower } from '../state/powerEvents';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';
import { HeroPortrait } from './components/HeroPortrait';
import { ProgressBar } from './components/ProgressBar';
import { usePressRepeat } from './components/usePressRepeat';

const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

/** Offense/survival factors for the estimate lines (docs/HERO-EVOLUTION.md §estimates). */
function factors(levels: Record<string, number>): { off: number; surv: number } {
  const m = deriveHeroEvoMods(levels);
  const crit = 1 + m.critChance * (HERO_CRIT_BASE - 1 + m.critDamageBonus);
  return { off: m.damageMult * m.attackSpeedMult * crit, surv: (m.maxHpMult * m.healingMult) / Math.max(0.05, 1 - m.armor) };
}

/** One upgrade axis row: compact by default; expanding reveals the full comparison. */
function UpgradeRow({
  cat, level, cost, affordable, expanded, onToggle, onBuy, accent, levels, powerDelta,
}: {
  cat: HeroEvoCategory;
  level: number;
  cost: number;
  affordable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onBuy: (steps: number) => boolean;
  accent: string;
  levels: Record<string, number>;
  powerDelta: (cat: HeroEvoCategory, level: number) => number;
}): JSX.Element {
  const maxed = level >= HERO_EVO.maxLevel;
  // Hold-to-buy (usePressRepeat): each fire attempts ONE level; a failed buy halts the hold.
  const press = usePressRepeat(() => !maxed && onBuy(1));
  const [flash, setFlash] = useState(0);

  // Full comparison for the expanded state — the REAL models end to end.
  const detail = useMemo(() => {
    if (maxed) return null;
    const next = { ...levels, [cat.id]: level + 1 };
    const fNow = factors(levels);
    const fNext = factors(next);
    return {
      cur: heroEvoEffectLabel(cat, level),
      nxt: heroEvoEffectLabel(cat, level + 1),
      power: powerDelta(cat, level),
      dps: fNext.off / fNow.off - 1,
      surv: fNext.surv / fNow.surv - 1,
      ability: cat.key === 'cooldownMult' ? 'Shortens every ability cooldown.'
        : cat.key === 'abilityRadiusMult' ? 'Widens every ability area of effect.'
        : cat.key === 'damageMult' ? 'Scales ability damage too.'
        : cat.key === 'healingMult' ? 'Amplifies ability healing.'
        : null,
    };
  }, [cat, level, levels, maxed, powerDelta]);

  return (
    <div className={`hcc-row${expanded ? ' is-open' : ''}${flash ? ' is-bought' : ''}`} key={flash}>
      <button className="hcc-row-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="hcc-row-icon" aria-hidden>{cat.icon}</span>
        <span className="hcc-row-name">{cat.name}</span>
        <span className="hcc-pips" aria-label={`level ${level} of ${HERO_EVO.maxLevel}`}>
          {Array.from({ length: HERO_EVO.maxLevel }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
        </span>
        <span className="hcc-row-effect">{heroEvoEffectLabel(cat, level)}</span>
        <span className="hcc-row-chev" aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>
      <button
        className={`hcc-buy${affordable ? ' can' : ''}`}
        disabled={maxed || !affordable}
        title={maxed ? 'Maxed out' : `Hold to repeat · shift-click buys 5 · ${cost} Biomass`}
        {...press}
        onClick={(e) => { if (e.shiftKey) { for (let i = 0; i < 4; i++) if (!onBuy(1)) break; } setFlash((n) => n + 1); }}
      >
        {maxed ? 'MAX' : <>{cost} ⬢</>}
      </button>
      {expanded && detail && (
        <div className="hcc-detail">
          <span className="hcc-cmp"><i>{detail.cur}</i> → <b style={{ color: accent }}>{detail.nxt}</b></span>
          <span className="hcc-est">
            <b className="hcc-gold">▲ +{detail.power} Power</b>
            {detail.dps > 0.0005 && <b className="hcc-up">≈ {pct(detail.dps)} hero DPS</b>}
            {detail.surv > 0.0005 && <b className="hcc-up">≈ {pct(detail.surv)} survivability</b>}
          </span>
          {detail.ability && <span className="hcc-abnote">◈ {detail.ability}</span>}
        </div>
      )}
      {expanded && maxed && <div className="hcc-detail"><span className="hcc-cmp">Fully evolved for this run.</span></div>}
    </div>
  );
}

export function HeroEvolutionPanel({
  game, hud, refresh, onClose,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
  onClose: () => void;
}): JSX.Element {
  const roster = game.heroes; // fielded champions (1–3) — tabs switch instantly, no reload
  const [selKind, setSelKind] = useState<HeroKind>(hud.hero.kind);
  const [expanded, setExpanded] = useState<string | null>(null);
  const floats = useRef(0);
  const [floatFx, setFloatFx] = useState<{ id: number; text: string }[]>([]);

  const hero = roster.find((h) => h.kind === selKind) ?? roster[0];
  const def = HERO_DEFS[hero?.kind ?? hud.hero.kind];
  const levels = hud.heroEvo.levels;
  const totalOwned = hud.heroEvo.totalOwned;
  const mods = useMemo(() => deriveHeroEvoMods(levels), [levels]);
  const power = meta.powerWith(game.heroEvoEffects()).score;
  // Preview === outcome: the marginal entry composed over the run's FULL effect set is
  // byte-equal to actually buying (mul appends the exact ratio; add appends the step).
  const powerDelta = (cat: HeroEvoCategory, level: number): number => {
    const cur = meta.powerWith(game.powerEffects()).score;
    const marginal = cat.op === 'mul'
      ? { op: 'mul' as const, field: cat.field, value: (1 + cat.perLevel * (level + 1)) / (1 + cat.perLevel * level) }
      : { op: 'add' as const, field: cat.field, value: cat.perLevel };
    return meta.powerWith([...game.powerEffects(), marginal] as Parameters<typeof meta.powerWith>[0]).score - cur;
  };
  const combat = game.getHeroMasteryAccrual()[def.kind];

  const buy = (id: string): boolean => {
    audio.resume();
    const powerBefore = meta.powerWith(game.powerEffects()).score;
    const cat = HERO_EVO_CATEGORIES.find((c) => c.id === id)!;
    if (!game.buyHeroEvolution(id)) return false;
    audio.cue('splice');
    announcePower('Hero Evolution', powerBefore, meta.powerWith(game.powerEffects()).score);
    const lvl = (hud.heroEvo.levels[id] ?? 0) + 1; // hud refreshes next tick; show the level just reached
    const gain = cat.op === 'mul' ? pct(Math.abs(cat.perLevel)) : pct(cat.perLevel);
    const fid = ++floats.current;
    setFloatFx((f) => [...f.slice(-3), { id: fid, text: `${gain} ${cat.name} · Lv ${lvl}` }]);
    setTimeout(() => setFloatFx((f) => f.filter((x) => x.id !== fid)), 1100);
    refresh();
    return true;
  };

  // Ability readout: base values folded through the LIVE evolution modifiers.
  const ab = def.ability;
  const abCd = ab.cooldown * mods.cooldownMult;
  const abDmg = Math.round(ab.damage * mods.damageMult);
  const abRadius = Math.round(ab.radius * mods.abilityRadiusMult);
  // Gene interactions: drafted cards whose subject is a hero (docs/GENE-CARDS.md subjects).
  const heroGenes = hud.cards
    .map((c) => CARD_POOL.find((d) => d.id === c.id))
    .filter((d) => d && cardSubject(d).kind === 'hero')
    .map((d) => d!.name);
  const equipCount = meta.heroRosterEquip()[def.kind]?.length ?? 0;

  return (
    <div className="evo-menu hcc" role="dialog" aria-label="Hero Combat Console" aria-modal="false">
      <div className="evo-head">
        <div className="evo-title">
          <span className="evo-title-i" aria-hidden>🧬</span>
          <span>Hero Combat Console</span>
          <span className="hcc-key" aria-hidden>E</span>
          <span className="hcc-held" title="The battlefield is paused while the console is open">❚❚ SIM HELD</span>
        </div>
        <div className="evo-meters">
          <span className="evo-meter" title="Biomass — the in-run currency">⬢ <b>{hud.biomass}</b></span>
          <span className="evo-meter" title={`Invested this run · ~${totalOwned > 0 ? Math.round(game.heroEvoSpent / totalOwned) : 0} per upgrade`}>⤵ <b>{game.heroEvoSpent}</b></span>
          <span className="evo-meter evo-power" title="Run Power Score with these upgrades">◆ <b>{formatPower(power)}</b></span>
        </div>
        <button className="evo-close" onClick={onClose} aria-label="Close (E)">✕</button>
      </div>

      {/* Roster tabs — instant switch; every upgrade below empowers ALL champions. */}
      <div className="hcc-tabs" role="tablist" aria-label="Champions">
        {roster.map((h) => {
          const d = HERO_DEFS[h.kind];
          return (
            <button
              key={h.kind}
              role="tab"
              aria-selected={h.kind === def.kind}
              className={`hcc-tab${h.kind === def.kind ? ' on' : ''}${h.down ? ' is-down' : ''}`}
              style={{ ['--hc' as string]: d.color }}
              onClick={() => setSelKind(h.kind)}
            >
              <HeroPortrait def={d} size={30} />
              <span>{d.name}</span>
            </button>
          );
        })}
        <span className="hcc-tabs-note">Evolution empowers the whole roster</span>
      </div>

      <div className="hcc-body" style={{ ['--hc' as string]: def.color }}>
        {/* ── VITALS — the selected champion's live numbers ── */}
        <div className="hcc-vitals">
          <div className="hcc-vname" style={{ color: def.color }}>{def.name} <span className="hcc-vclass">{def.combatClass}</span></div>
          {hero && (hero.down
            ? <div className="hcc-down">DOWN · revives in {Math.ceil(hud.hero.respawn)}s</div>
            : <ProgressBar value={Math.round(hero.hp)} max={hero.maxHp} color={def.color} height={8} label={`${def.name} HP`} />)}
          {hero && !hero.down && <div className="hcc-hp">{Math.round(hero.hp)} / {hero.maxHp}{hud.hero.shield > 0 && def.kind === hud.hero.kind ? ` · ⛨${hud.hero.shield}` : ''}</div>}
          <div className="hcc-stats">
            <span><i>Damage</i><b>{Math.round(def.attackDamage * mods.damageMult)}</b></span>
            <span><i>Atk / s</i><b>{(mods.attackSpeedMult / def.attackInterval).toFixed(1)}</b></span>
            <span><i>Move</i><b>{Math.round(def.speed * mods.moveSpeedMult)}</b></span>
            <span><i>Crit</i><b>{Math.round(mods.critChance * 100)}%</b></span>
            <span><i>Armor</i><b>{Math.round(mods.armor * 100)}%</b></span>
            <span><i>Cooldowns</i><b>{pct(mods.cooldownMult - 1)}</b></span>
          </div>
          <div className="hcc-run">
            <span>{combat.kills.toLocaleString()} kills · {Math.round(combat.damage).toLocaleString()} dmg this run</span>
            <span>⤵ {game.heroEvoSpent} Biomass invested{totalOwned > 0 ? ` · ~${Math.round(game.heroEvoSpent / totalOwned)}/upgrade` : ''}</span>
          </div>
        </div>

        {/* ── SHOWCASE — the living organism + its ability + active effects ── */}
        <div className="hcc-showcase">
          <div className="hcc-chamber">
            <HeroPortrait def={def} size={168} />
            {floatFx.map((f) => <span className="hcc-float" key={f.id}>{f.text}</span>)}
          </div>
          <div className="hcc-ability" title={ab.blurb}>
            <span className="hcc-ab-k">{ab.name} <i>{hud.hero.abilityReady && def.kind === hud.hero.kind ? 'READY' : `↻ ${abCd.toFixed(1)}s`}</i></span>
            <span className="hcc-ab-v">
              {ab.damage > 0 && <b>{abDmg} dmg</b>}
              {ab.radius > 0 && <b>{abRadius} radius</b>}
              {(ab.heal ?? 0) > 0 && <b>{Math.round((ab.heal ?? 0) * mods.healingMult)} heal</b>}
              {(ab.fracture ?? 0) > 0 && <b>{ab.fracture} fracture</b>}
            </span>
          </div>
          <div className="hcc-effects">
            {HERO_EVO_CATEGORIES.filter((c) => (levels[c.id] ?? 0) > 0).map((c) => (
              <span className="hcc-chip" key={c.id} title={`${c.name} · ${heroEvoEffectLabel(c, levels[c.id] ?? 0)}`}>{c.icon} {levels[c.id]}</span>
            ))}
            {heroGenes.slice(0, 3).map((g) => <span className="hcc-chip is-gene" key={g} title="Hero gene active this run">⌬ {g}</span>)}
            {equipCount > 0 && <span className="hcc-chip is-equip" title="Equipped gear effects (Armory)">⛨ {equipCount} gear</span>}
            {totalOwned === 0 && heroGenes.length === 0 && <span className="hcc-chip is-none">No active mutations yet</span>}
          </div>
        </div>

        {/* ── UPGRADES — all ten axes; expand for the full comparison ── */}
        <div className="hcc-upgrades">
          {HERO_EVO_CATEGORIES.map((cat) => {
            const level = levels[cat.id] ?? 0;
            const maxed = level >= HERO_EVO.maxLevel;
            const cost = maxed ? 0 : heroEvoCost(cat, level, totalOwned);
            return (
              <UpgradeRow
                key={cat.id}
                cat={cat}
                level={level}
                cost={cost}
                affordable={!maxed && hud.biomass >= cost}
                expanded={expanded === cat.id}
                onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
                onBuy={() => buy(cat.id)}
                accent={def.color}
                levels={levels}
                powerDelta={powerDelta}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
