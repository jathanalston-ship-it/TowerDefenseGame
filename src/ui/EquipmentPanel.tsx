// The ARMORY — hero equipment as a collectible ARPG inventory, not a text list. Items are
// item CARDS (procedural artwork + rarity frame + traits + set + owner + actions) in a grid,
// with Category / Rarity / Sort / Favorites controls, an active-Sets panel, a Compare overlay,
// and an Equipment (gear) Score. Scales to hundreds (data-driven grid) and is rarity-agnostic
// (mythic/seasonal-ready). Reads the reactive save; equips/crafts/favorites go through meta.

import { useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import type { HeroKind } from '../core/types';
import {
  EQUIP_SLOTS, RARITY_ORDER, SETS, SLOT_LABELS, activeSets, affixDef, emptyLoadout, itemDef, itemScore, loadoutScore, rarityColorOf, rarityLabelOf,
} from '../core/equipment';
import type { EquipSlot, OwnedItem, Rarity } from '../core/equipment';
import { ItemArt, rarityColor } from './components/ItemArt';
import { PowerDelta } from './components/PowerDelta';
import { compareItemPower } from '../state/itemPower';
import { ItemDetails } from './ItemDetails';

type SortKey = 'power' | 'rarity' | 'name' | 'set' | 'newest';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'power', label: 'Power' }, { key: 'rarity', label: 'Rarity' }, { key: 'newest', label: 'Newest' },
  { key: 'name', label: 'Name' }, { key: 'set', label: 'Set' },
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function traitChips(item: OwnedItem): { key: string; label: string; locked: boolean }[] {
  return item.affixes.map((a) => ({ key: a.affixId, label: `${affixDef(a.affixId)?.name ?? a.affixId} T${a.tier}`, locked: !!a.locked }));
}

export function EquipmentPanel(): JSX.Element {
  const save = meta.use();
  const { inventory } = save.equipment;
  const roster = meta.fieldedLoadout(); // the heroes the next run fields (1–3 by slot progression)
  const [focusHero, setFocusHero] = useState<HeroKind>(save.selectedHero);
  const focus = roster.includes(focusHero) ? focusHero : (roster[0] ?? save.selectedHero); // keep valid if roster changed
  const loadout = save.equipment.loadouts[focus] ?? emptyLoadout(); // the FOCUSED hero's own gear (per-hero)
  const [category, setCategory] = useState<EquipSlot | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('power');
  const [favOnly, setFavOnly] = useState(false);
  const [detailsUid, setDetailsUid] = useState<string | null>(null); // opens the Equipment Details screen

  // Which fielded hero (if any) wears each item — items are single-instance, so an item shows
  // its owner and can be moved between heroes. Never overwrites another hero's loadout.
  const ownerOf = new Map<string, HeroKind>();
  for (const k of roster) {
    const lo = save.equipment.loadouts[k];
    if (!lo) continue;
    for (const s of EQUIP_SLOTS) { const u = lo[s]; if (u) ownerOf.set(u, k); }
  }
  const sets = activeSets(inventory, loadout);
  const setActiveMap = new Map(sets.map((s) => [s.id, s] as const));
  const focusName = HERO_DEFS[focus]?.name ?? 'Hero';
  const gearScore = loadoutScore(inventory, loadout);
  const idxOf = new Map(inventory.map((i, n) => [i.uid, n] as const));
  const raritiesPresent = RARITY_ORDER.filter((r) => inventory.some((i) => i.rarity === r));

  const shown = inventory
    .filter((i) => {
      const def = itemDef(i.defId);
      if (!def) return false;
      if (category !== 'all' && def.slot !== category) return false;
      if (rarity !== 'all' && i.rarity !== rarity) return false;
      if (favOnly && !i.favorite) return false;
      return true;
    })
    .sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1; // favorites pinned first
      switch (sort) {
        case 'power': return itemScore(b) - itemScore(a);
        case 'rarity': return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
        case 'name': return (itemDef(a.defId)?.name ?? '').localeCompare(itemDef(b.defId)?.name ?? '');
        case 'set': return (itemDef(a.defId)?.setId ?? 'zzz').localeCompare(itemDef(b.defId)?.setId ?? 'zzz');
        case 'newest': return (idxOf.get(b.uid) ?? 0) - (idxOf.get(a.uid) ?? 0);
      }
    });

  const cardFor = (item: OwnedItem): JSX.Element | null => {
    const def = itemDef(item.defId);
    if (!def) return null;
    const c = rarityColor(item.rarity);
    const owner = ownerOf.get(item.uid); // fielded hero wearing it (any slot), or undefined
    const equipped = owner === focus; // equipped on the FOCUSED hero
    const set = def.setId ? SETS[def.setId] : undefined;
    const setStatus = def.setId ? setActiveMap.get(def.setId) : undefined;
    const sig = def.signature && (item.rarity === 'legendary' || item.rarity === 'exotic') ? def.signature.name : null;
    return (
      <div className={`item-card${equipped ? ' is-equipped' : ''}${item.favorite ? ' is-fav' : ''}`} key={item.uid} style={{ ['--rc' as string]: c }}>
        <div className="ic-frame">
          <ItemArt def={def} rarity={item.rarity} size={66} />
          {!item.seen && <span className="ic-new" title="Not yet inspected">NEW</span>}
          {item.locked && <span className="ic-lock" title="Locked (protected from salvage)">🔒</span>}
          {item.favorite && <span className="ic-star" title="Favorite">★</span>}
          {def.season && <span className="ic-season" title={`Seasonal: ${def.season}`}>{def.season}</span>}
        </div>
        <div className="ic-body">
          <div className="ic-name" style={{ color: c }}>{def.name}</div>
          <div className="ic-meta">
            <span className="ic-rarity" style={{ color: c }}>{rarityLabelOf(item.rarity)}</span>
            <span> · {SLOT_LABELS[def.slot]}{def.weaponType ? ` · ${cap(def.weaponType)}` : def.armorType ? ` · ${cap(def.armorType)}` : ''}</span>
            {item.ilvl !== undefined && <span className="ic-ilvl" title="Item level"> · i{item.ilvl}</span>}
            <span className="ic-power" title="Power Score"> · ⚙ {itemScore(item)}</span>
          </div>
          {!equipped && <div className="ic-compare"><PowerDelta cmp={compareItemPower(save, item, focus)} /></div>}
          <p className="ic-desc">{def.desc}</p>
          {sig && <div className="ic-sig">◆ {sig}</div>}
          {traitChips(item).length > 0 && (
            <div className="ic-traits">
              {traitChips(item).map((t) => (
                <span className={`ic-trait${t.locked ? ' is-locked' : ''}`} key={t.key} title={t.locked ? 'Locked affix (protected from reroll / reforge / randomize)' : undefined}>
                  {t.locked ? '🔒 ' : ''}{t.label}
                </span>
              ))}
            </div>
          )}
          {set && (
            <div className="ic-set" style={setStatus ? { color: c, borderColor: c } : undefined}>
              ◈ {set.name}{setStatus ? ` · ${setStatus.count} pc${setStatus.count > 1 ? 's' : ''}` : ''}
            </div>
          )}
          {owner && <div className="ic-owner">Equipped · {HERO_DEFS[owner]?.name ?? 'Hero'}</div>}
        </div>
        <div className="ic-actions">
          <button className={`ic-equip ${equipped ? 'on' : ''}`} onClick={() => meta.equip(focus, def.slot, equipped ? null : item.uid)}>
            {equipped ? 'Unequip' : owner ? 'Move here' : 'Equip'}
          </button>
          <button className="ic-mini ic-details" title="Details — compare, affixes, upgrade & salvage" onClick={() => setDetailsUid(item.uid)}>⤢ Details</button>
          <button className={`ic-mini ${item.favorite ? 'is-on' : ''}`} title="Favorite (pins first; never auto-salvaged)" onClick={() => meta.toggleFavorite(item.uid)}>★</button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel armory">
      <div className="panel-title">
        Armory
        <span className="armory-score" title={`Equipment Score — power of ${focusName}'s equipped gear`}>⚙ {gearScore}</span>
        <span className="equip-mats">⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst}</span>
      </div>
      <div className="panel-sub">Gearing <b>{focusName}</b> — equip one per slot; gear folds into your next run. Each hero keeps its own loadout.</div>

      {/* Undo-Salvage: the last dismantle is recoverable until the next one overwrites the buffer. */}
      {save.lastSalvage && (
        <div className="armory-undo">
          <span>Salvaged <b>{itemDef(save.lastSalvage.item.defId)?.name ?? 'an item'}</b> — its materials were reclaimed.</span>
          <button className="armory-undo-btn" onClick={() => meta.undoSalvage()}>↺ Undo Salvage</button>
        </div>
      )}

      {/* Current Loadouts — the heroes tab's at-a-glance section, integrated here: EVERY
          fielded hero's equipped-vs-empty slots (1–3 cards as hero slots unlock). Clicking a
          card focuses that hero for gearing — it replaces the old thin focus strip. */}
      <div className="armory-loadouts">
        {roster.map((k, i) => {
          const lo = save.equipment.loadouts[k] ?? emptyLoadout();
          const hs = loadoutScore(inventory, lo);
          const hd = HERO_DEFS[k];
          return (
            <button
              key={k}
              className={`al-card${k === focus ? ' on' : ''}`}
              style={{ ['--hc' as string]: hd?.color }}
              onClick={() => setFocusHero(k)}
              title={k === focus ? `Gearing ${hd?.name ?? 'Hero'}` : `Switch to gearing ${hd?.name ?? 'Hero'}`}
            >
              <span className="al-head">
                <span className="al-slotno">Slot {i + 1}</span>
                <span className="al-name">{hd?.name ?? 'Hero'}</span>
                {k === focus && <span className="al-gearing">GEARING</span>}
                <span className="ah-score" title="Equipment Score">⚙ {hs}</span>
              </span>
              <span className="hero-loadout">
                {EQUIP_SLOTS.map((s) => {
                  const uid = lo[s];
                  const it = uid ? inventory.find((x) => x.uid === uid) : undefined;
                  const def = it ? itemDef(it.defId) : undefined;
                  return (
                    <span className="hl-slot" key={s}>
                      <span className="hl-k">{SLOT_LABELS[s]}</span>
                      {def ? (
                        <span className="hl-item" style={{ color: it ? rarityColorOf(it.rarity) : undefined }}>{def.name}</span>
                      ) : (
                        <span className="hl-empty">— empty —</span>
                      )}
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active set bonuses */}
      {sets.length > 0 && (
        <div className="armory-sets">
          {sets.map((s) => (
            <span className="set-chip" key={s.id}>
              <b>◈ {s.name}</b> {s.count}pc
              <span className={s.bonus2 ? 'on' : ''}>(2)</span>
              <span className={s.bonus4 ? 'on' : ''}>(4)</span>
            </span>
          ))}
        </div>
      )}

      {/* Controls: category · rarity · sort · favorites */}
      <div className="armory-controls">
        <div className="ac-group">
          {(['all', 'weapon', 'armor', 'relic'] as const).map((f) => (
            <button key={f} className={category === f ? 'on' : ''} onClick={() => setCategory(f)}>
              {f === 'all' ? 'All' : SLOT_LABELS[f]}
            </button>
          ))}
        </div>
        {raritiesPresent.length > 1 && (
          <div className="ac-group">
            <button className={rarity === 'all' ? 'on' : ''} onClick={() => setRarity('all')}>Any</button>
            {raritiesPresent.map((r) => (
              <button key={r} className={rarity === r ? 'on' : ''} style={rarity === r ? { color: rarityColor(r), borderColor: rarityColor(r) } : { color: rarityColor(r) }} onClick={() => setRarity(r)}>{rarityLabelOf(r)}</button>
            ))}
          </div>
        )}
        <div className="ac-group ac-right">
          <button className={favOnly ? 'on' : ''} onClick={() => setFavOnly((v) => !v)} title="Show favorites only">★ Favorites</button>
          <label className="ac-sort">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Inventory grid */}
      {shown.length === 0 ? (
        <div className="hint">{inventory.length === 0 ? 'No gear yet — finish a run for a drop, or grant some from the debug panel.' : 'No items match these filters.'}</div>
      ) : (
        <div className="armory-grid">{shown.map(cardFor)}</div>
      )}

      {detailsUid && <ItemDetails uid={detailsUid} hero={focus} onClose={() => setDetailsUid(null)} />}
    </div>
  );
}
