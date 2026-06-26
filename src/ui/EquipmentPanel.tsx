// Hero loadout & inventory (EQUIPMENT.md). Equip one Weapon/Armor/Relic; gear folds
// into the next run's modifiers. Items are behavior-first — the desc says what each
// changes. Placeholder art = rarity-colored chips. Reads the reactive save.

import { useState } from 'react';
import { meta } from '../state/meta';
import {
  SLOT_LABELS,
  affixDef,
  itemDef,
} from '../core/equipment';
import type { EquipSlot, OwnedItem, Rarity } from '../core/equipment';

const RARITY_VAR: Record<Rarity, string> = {
  common: 'var(--r-common)',
  rare: 'var(--r-rare)',
  epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)',
  exotic: 'var(--viral)',
};

function affixText(item: OwnedItem): string {
  return item.affixes
    .map((ra) => {
      const a = affixDef(ra.affixId);
      return a ? `${a.name} T${ra.tier}` : ra.affixId;
    })
    .join(' · ');
}

function ItemRow({
  item,
  equipped,
  onEquip,
}: {
  item: OwnedItem;
  equipped: boolean;
  onEquip: () => void;
}): JSX.Element {
  const def = itemDef(item.defId);
  if (!def) return <></>;
  const color = RARITY_VAR[item.rarity];
  return (
    <div className={`equip-row ${equipped ? 'is-equipped' : ''}`}>
      <span className="equip-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="equip-info">
        <span className="equip-name" style={{ color }}>
          {def.name} {def.signature ? <span className="equip-sig">◆ {def.signature.name}</span> : null}
        </span>
        <span className="equip-desc">{def.desc}</span>
        {item.affixes.length > 0 && <span className="equip-affix">{affixText(item)}</span>}
      </span>
      <span className="equip-actions">
        <button className={equipped ? 'on' : ''} onClick={onEquip}>
          {equipped ? 'Equipped' : 'Equip'}
        </button>
        <button onClick={() => meta.rerollItem(item.uid)} title="Reroll affixes (1 Mutagen)">⟳</button>
        <button onClick={() => meta.transmuteItem(item.uid)} title="Transmute up a rarity (2 Catalyst)">▲</button>
        <button onClick={() => meta.salvageItem(item.uid)} title="Dismantle for materials">✕</button>
      </span>
    </div>
  );
}

export function EquipmentPanel(): JSX.Element {
  const save = meta.use();
  const { inventory, loadout } = save.equipment;
  const [slotFilter, setSlotFilter] = useState<EquipSlot | 'all'>('all');

  const slots: EquipSlot[] = ['weapon', 'armor', 'relic'];
  const byUid = new Map(inventory.map((i) => [i.uid, i] as const));
  const shown = inventory.filter((i) => slotFilter === 'all' || itemDef(i.defId)?.slot === slotFilter);

  return (
    <div className="panel">
      <div className="panel-title">
        Hero Equipment <span className="equip-mats">⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✦ {save.mats.catalyst}</span>
      </div>
      <div className="panel-sub">
        Behavior over stats — each piece changes how you play. Equip one per slot; it folds into your next run.
      </div>

      <div className="loadout">
        {slots.map((slot) => {
          const uid = loadout[slot];
          const it = uid ? byUid.get(uid) : undefined;
          const def = it ? itemDef(it.defId) : undefined;
          return (
            <div className="loadout-slot" key={slot}>
              <span className="loadout-k">{SLOT_LABELS[slot]}</span>
              {def && it ? (
                <button className="loadout-eq" style={{ color: RARITY_VAR[it.rarity] }} onClick={() => meta.equip(slot, null)}>
                  {def.name}
                  <span className="loadout-clear">unequip</span>
                </button>
              ) : (
                <span className="loadout-empty">— empty —</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="equip-filters">
        {(['all', 'weapon', 'armor', 'relic'] as const).map((f) => (
          <button key={f} className={slotFilter === f ? 'on' : ''} onClick={() => setSlotFilter(f)}>
            {f === 'all' ? 'All' : SLOT_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="equip-list">
        {shown.length === 0 ? (
          <div className="hint">No gear yet — finish a run for a drop, or grant some from the debug panel.</div>
        ) : (
          shown.map((item) => {
            const def = itemDef(item.defId);
            const equipped = !!def && loadout[def.slot] === item.uid;
            return (
              <ItemRow
                key={item.uid}
                item={item}
                equipped={equipped}
                onEquip={() => def && meta.equip(def.slot, equipped ? null : item.uid)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
