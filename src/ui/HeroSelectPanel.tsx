// Hero Selection Panel (docs/HERO-SELECTION.md) — the non-modal readout for the player-SELECTED
// hero. Purely a display: the sim keeps running while it's open (selection never pauses).
//   • LIVE state (from the SelectedHeroView snapshot): health (+ shield), effective combat stats,
//     cooldown gauges, movement state, current target, and temporary buff/debuff chips.
//   • PERMANENT profile (from meta.heroDetail — stars/mastery/gear are locked mid-run): portrait,
//     level, permanent bonuses, Power Score contribution, equipped gear, and the ability readout.
// Future abilities plug straight in: add to the sim's cooldowns/buffs arrays (live) or extend the
// ability block below — no structural change needed.

import { useMemo } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import { itemDef, SLOT_LABELS } from '../core/equipment';
import type { EquipSlot } from '../core/equipment';
import { heroDetail } from '../state/heroView';
import { rarityColor } from './components/ItemArt';
import { HeroPortrait } from './components/HeroPortrait';
import type { SelectedHeroView } from '../core/types';

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'relic'];
const STATE_LABEL: Record<string, string> = {
  idle: 'Holding', moving: 'Moving', attacking: 'Attacking', retreating: 'Retreating', downed: 'Downed',
};

export function HeroSelectPanel({ hero, onClose }: { hero: SelectedHeroView; onClose: () => void }): JSX.Element {
  const def = HERO_DEFS[hero.kind];
  const color = def?.color ?? 'var(--gold)';
  const hpPct = hero.maxHp > 0 ? Math.max(0, Math.min(1, hero.hp / hero.maxHp)) : 0;
  const shieldPct = hero.maxHp > 0 ? Math.min(1, hero.shield / hero.maxHp) : 0;

  // Permanent (meta) profile — level, stars, gear, Power. Locked during a run, so memoize by kind;
  // the live combat state comes from the snapshot `hero` view instead.
  const detail = useMemo(() => heroDetail(meta.get(), hero.kind), [hero.kind]);
  const ability = def.ability;

  // Equipment from the run's LOCKED loadout — meta reflects it (gear can't change mid-run).
  const loadout = meta.loadoutOf(hero.kind);
  const inv = meta.get().equipment.inventory;
  const gear = SLOTS.map((slot) => {
    const uid = loadout[slot];
    const it = uid ? inv.find((i) => i.uid === uid) : undefined;
    const idef = it ? itemDef(it.defId) : undefined;
    return { slot, name: idef?.name ?? null, rarity: it?.rarity };
  });

  // Permanent buffs = stars + mastery multiplier folds + earned mastery perks. Empty ⇒ a clear note.
  const perm: { key: string; label: string; detail?: string }[] = [];
  if (detail.stars > 0) perm.push({ key: 'stars', label: `◈ ${detail.stars}/${detail.maxStars}`, detail: 'Evolution stars' });
  if (detail.dmgPct > 0) perm.push({ key: 'dmg', label: `+${detail.dmgPct}% DMG` });
  if (detail.cdPct > 0) perm.push({ key: 'cd', label: `−${detail.cdPct}% Ability CD` });
  for (const p of detail.perks) perm.push({ key: `perk-${p.at}-${p.name}`, label: p.name, detail: p.desc });

  return (
    <div className="hero-panel" style={{ ['--hero' as string]: color }} role="dialog" aria-label={`${hero.name} status`}>
      <div className="hp-head">
        <span className="hp-portrait-sm"><HeroPortrait def={def} size={44} rank={detail.mastery.rank} /></span>
        <span className="hp-id">
          <span className="hp-name" style={{ color }}>{hero.name}</span>
          <span className="hp-sub"><span className="hp-class">{hero.combatClass}</span> · Lv {detail.mastery.level}</span>
        </span>
        <span className={`hp-state st-${hero.state}`}>{STATE_LABEL[hero.state] ?? hero.state}</span>
        <button className="hp-close" onClick={onClose} aria-label="Deselect hero">✕</button>
      </div>

      {/* Health (with a shield overlay) */}
      <div className="hp-bar" title={`${Math.round(hero.hp)} / ${Math.round(hero.maxHp)}${hero.shield ? ` (+${hero.shield} shield)` : ''}`}>
        <div className="hp-bar-fill" style={{ width: `${hpPct * 100}%` }} />
        {hero.shield > 0 && <div className="hp-bar-shield" style={{ width: `${shieldPct * 100}%` }} />}
        <span className="hp-bar-num">
          {hero.down ? `Down · respawn ${Math.ceil(hero.respawn)}s` : `${Math.round(hero.hp)} / ${Math.round(hero.maxHp)}`}
          {hero.shield > 0 && !hero.down ? ` +${hero.shield}` : ''}
        </span>
      </div>

      {/* Effective combat stats (live) */}
      <div className="hp-stats">
        <div className="hp-stat"><span className="hp-stat-k">Damage</span><span className="hp-stat-v">{hero.damage > 0 ? hero.damage : '—'}</span></div>
        <div className="hp-stat"><span className="hp-stat-k">Atk Spd</span><span className="hp-stat-v">{hero.attackSpeed > 0 ? `${hero.attackSpeed.toFixed(2)}/s` : '—'}</span></div>
        <div className="hp-stat"><span className="hp-stat-k">Move</span><span className="hp-stat-v">{hero.moveSpeed}</span></div>
        <div className="hp-stat"><span className="hp-stat-k">Ability CD</span><span className="hp-stat-v">{ability.cooldown}s</span></div>
      </div>

      <div className="hp-target">Target <b>{hero.target ?? '—'}</b></div>

      {/* Cooldown gauges (live) */}
      <div className="hp-cds">
        {hero.cooldowns.map((cd) => {
          const ready = cd.remaining <= 0.001;
          const frac = cd.total > 0 ? Math.max(0, Math.min(1, 1 - cd.remaining / cd.total)) : 1;
          return (
            <div key={cd.id} className={`hp-cd ${ready ? 'ready' : ''}`}>
              <div className="hp-cd-track"><div className="hp-cd-fill" style={{ width: `${frac * 100}%` }} /></div>
              <span className="hp-cd-l">{cd.label}</span>
              <span className="hp-cd-v">{ready ? 'Ready' : `${cd.remaining.toFixed(1)}s`}</span>
            </div>
          );
        })}
      </div>

      {/* Temporary buffs / debuffs (the section is wired even when empty — future hero statuses slot in) */}
      <div className="hp-section-k">Temporary</div>
      {hero.buffs.length > 0 || hero.debuffs.length > 0 ? (
        <div className="hp-status">
          {hero.buffs.map((b) => <span key={b.id} className="hp-chip buff" title={b.detail}>{b.label}</span>)}
          {hero.debuffs.map((d) => <span key={d.id} className="hp-chip debuff" title={d.detail}>{d.label}</span>)}
        </div>
      ) : (
        <div className="hp-none">None active</div>
      )}

      {/* Permanent buffs (stars / mastery / perks) */}
      <div className="hp-section-k">Permanent</div>
      {perm.length > 0 ? (
        <div className="hp-status">
          {perm.map((p) => <span key={p.key} className="hp-chip perm" title={p.detail}>{p.label}</span>)}
        </div>
      ) : (
        <div className="hp-none">No permanent bonuses yet</div>
      )}

      {/* Power Score contribution */}
      <div className="hp-power">
        <span className="hp-power-k">Power Score</span>
        <span className="hp-power-v">{detail.powerRating}</span>
      </div>

      {/* Equipped gear */}
      <div className="hp-gear">
        {gear.map((g) => (
          <div key={g.slot} className="hp-gear-row">
            <span className="hp-gear-slot">{SLOT_LABELS[g.slot]}</span>
            {g.name
              ? <span className="hp-gear-item" style={{ color: g.rarity ? rarityColor(g.rarity) : undefined }}>{g.name}</span>
              : <span className="hp-gear-empty">— empty —</span>}
          </div>
        ))}
      </div>

      {/* Ability readout — the description + cooldown. Future abilities extend this block. */}
      <div className="hp-ability">
        <div className="hp-ability-head">
          <span className="hp-ability-name" style={{ color }}>{ability.name}</span>
          <span className="hp-ability-cd">{ability.cooldown}s CD</span>
        </div>
        <p className="hp-ability-desc">{ability.blurb}</p>
      </div>
    </div>
  );
}
