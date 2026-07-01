// Hero Selection Panel (docs/HERO-SELECTION.md) — the non-modal readout for the player-SELECTED
// hero. Live health (+ shield), cooldown gauges, movement state, current target, equipped gear, and
// buffs/debuffs. Purely a display: the sim keeps running while it's open (selection never pauses).
// Reads the live SelectedHeroView from the snapshot; equipment comes from the run's locked loadout.

import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import { itemDef, SLOT_LABELS } from '../core/equipment';
import type { EquipSlot } from '../core/equipment';
import { rarityColor } from './components/ItemArt';
import type { SelectedHeroView } from '../core/types';

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'relic'];
const STATE_LABEL: Record<string, string> = {
  idle: 'Holding', moving: 'Moving', attacking: 'Attacking', retreating: 'Retreating', downed: 'Downed',
};

export function HeroSelectPanel({ hero, onClose }: { hero: SelectedHeroView; onClose: () => void }): JSX.Element {
  const color = HERO_DEFS[hero.kind]?.color ?? 'var(--gold)';
  const hpPct = hero.maxHp > 0 ? Math.max(0, Math.min(1, hero.hp / hero.maxHp)) : 0;
  const shieldPct = hero.maxHp > 0 ? Math.min(1, hero.shield / hero.maxHp) : 0;

  // Equipment from the run's LOCKED loadout — meta reflects it (gear can't change mid-run).
  const loadout = meta.loadoutOf(hero.kind);
  const inv = meta.get().equipment.inventory;
  const gear = SLOTS.map((slot) => {
    const uid = loadout[slot];
    const it = uid ? inv.find((i) => i.uid === uid) : undefined;
    const def = it ? itemDef(it.defId) : undefined;
    return { slot, name: def?.name ?? null, rarity: it?.rarity };
  });

  return (
    <div className="hero-panel" style={{ ['--hero' as string]: color }} role="dialog" aria-label={`${hero.name} status`}>
      <div className="hp-head">
        <span className="hp-name" style={{ color }}>{hero.name}</span>
        <span className="hp-class">{hero.combatClass}</span>
        <span className={`hp-state st-${hero.state}`}>{STATE_LABEL[hero.state] ?? hero.state}</span>
        <button className="hp-close" onClick={onClose} aria-label="Deselect hero">✕</button>
      </div>

      {/* Health (with a shield overlay) */}
      <div className="hp-bar" title={`${hero.hp} / ${hero.maxHp}${hero.shield ? ` (+${hero.shield} shield)` : ''}`}>
        <div className="hp-bar-fill" style={{ width: `${hpPct * 100}%` }} />
        {hero.shield > 0 && <div className="hp-bar-shield" style={{ width: `${shieldPct * 100}%` }} />}
        <span className="hp-bar-num">
          {hero.down ? `Down · respawn ${Math.ceil(hero.respawn)}s` : `${hero.hp} / ${hero.maxHp}`}
          {hero.shield > 0 && !hero.down ? ` +${hero.shield}` : ''}
        </span>
      </div>

      <div className="hp-target">Target <b>{hero.target ?? '—'}</b></div>

      {/* Cooldown gauges */}
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

      {/* Buffs / debuffs — the section is wired even when empty (future hero statuses slot in) */}
      {(hero.buffs.length > 0 || hero.debuffs.length > 0) && (
        <div className="hp-status">
          {hero.buffs.map((b) => <span key={b.id} className="hp-chip buff" title={b.detail}>{b.label}</span>)}
          {hero.debuffs.map((d) => <span key={d.id} className="hp-chip debuff" title={d.detail}>{d.label}</span>)}
        </div>
      )}

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
    </div>
  );
}
