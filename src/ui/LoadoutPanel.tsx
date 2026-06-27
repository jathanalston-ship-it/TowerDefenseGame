// Hero Loadout — equip the gear dropped by loot boxes. Three slots (Weapon / Armor /
// Relic); each equipped item's affixes fold into the hero at run start (meta.runFold).
// Surplus gear dismantles into Genome Shards, so even unused drops feed progression.
// Reuses the meta-shop styles; only appears once the player owns at least one item.

import { meta, gearAffixLines } from '../state/meta';
import { GEAR_SLOTS, LOOT_RARITY } from '../core/config';
import type { GearItem, GearSlot } from '../core/types';

const SLOT_LABEL: Record<GearSlot, string> = { weapon: 'Weapon', armor: 'Armor', relic: 'Relic' };

function rarityColor(item: GearItem): string {
  return LOOT_RARITY[item.rarity].color;
}

/** One equipped-slot card (or an empty placeholder inviting a drop). */
function SlotCard({ slot, item }: { slot: GearSlot; item: GearItem | null }): JSX.Element {
  return (
    <div className={`loadout-slot ${item ? 'is-filled' : ''}`}>
      <div className="ls-slot">{SLOT_LABEL[slot]}</div>
      {item ? (
        <>
          <div className="ls-name" style={{ color: rarityColor(item) }}>{LOOT_RARITY[item.rarity].label}</div>
          <ul className="ls-affixes">
            {gearAffixLines(item).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <button className="ls-unequip" onClick={() => meta.unequipSlot(slot)}>Unequip</button>
        </>
      ) : (
        <div className="ls-empty">— empty —</div>
      )}
    </div>
  );
}

export function LoadoutPanel(): JSX.Element | null {
  const save = meta.use();
  if (save.gear.length === 0) return null; // nothing dropped yet — keep the menu clean

  // Sort the inventory: equipped first, then by rarity (epic→common), stable otherwise.
  const order: Record<GearItem['rarity'], number> = { epic: 0, rare: 1, common: 2 };
  const worn = (it: GearItem): boolean => save.equipped[it.slot] === it.id;
  const inventory = [...save.gear].sort((a, b) => (Number(worn(b)) - Number(worn(a))) || (order[a.rarity] - order[b.rarity]));

  return (
    <div className="panel">
      <div className="panel-title">
        Hero Loadout
        <span className="track-bal">{save.genomeShards} ✦ Genome Shards</span>
      </div>
      <div className="panel-sub">
        Equip one Weapon, Armor and Relic — their affixes fold into your hero every run. Gear drops from loot boxes; dismantle surplus for Genome Shards.
      </div>

      <div className="loadout-slots">
        {GEAR_SLOTS.map((slot) => {
          const id = save.equipped[slot];
          const item = id ? save.gear.find((g) => g.id === id) ?? null : null;
          return <SlotCard key={slot} slot={slot} item={item} />;
        })}
      </div>

      <div className="shop-list">
        {inventory.map((item) => {
          const equipped = worn(item);
          return (
            <div key={item.id} className={`shop-item ${equipped ? 'is-maxed' : ''}`}>
              <div className="info">
                <div className="name">
                  <span style={{ color: rarityColor(item) }}>{LOOT_RARITY[item.rarity].label}</span> {SLOT_LABEL[item.slot]}
                  {equipped && <span className="lvl" style={{ color: 'var(--gold)' }}> ◆ Equipped</span>}
                </div>
                <div className="desc">{gearAffixLines(item).join('  ·  ')}</div>
              </div>
              <div className="loadout-actions">
                <button
                  className={`shop-buy ${equipped ? '' : 'is-afford'}`}
                  disabled={equipped}
                  onClick={() => meta.equipGear(item.id)}
                >
                  {equipped ? 'Worn' : 'Equip'}
                </button>
                <button
                  className="shop-buy btn-ico"
                  title={`Dismantle for ${meta.dismantleValue(item)} Genome Shards`}
                  onClick={() => { if (confirm(`Dismantle this ${LOOT_RARITY[item.rarity].label} ${SLOT_LABEL[item.slot]} for ${meta.dismantleValue(item)} ✦?`)) meta.dismantleGear(item.id); }}
                >
                  ♻ {meta.dismantleValue(item)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
