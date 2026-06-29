// The ARMORY — hero equipment as a collectible ARPG inventory, not a text list. Items are
// item CARDS (procedural artwork + rarity frame + traits + set + owner + actions) in a grid,
// with Category / Rarity / Sort / Favorites controls, an active-Sets panel, a Compare overlay,
// and an Equipment (gear) Score. Scales to hundreds (data-driven grid) and is rarity-agnostic
// (mythic/seasonal-ready). Reads the reactive save; equips/crafts/favorites go through meta.

import { useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import {
  RARITY_ORDER, SETS, SLOT_LABELS, activeSets, affixDef, itemDef, itemScore, loadoutScore,
} from '../core/equipment';
import type { EquipSlot, OwnedItem, Rarity } from '../core/equipment';
import { ItemArt, rarityColor } from './components/ItemArt';

type SortKey = 'power' | 'rarity' | 'name' | 'set' | 'newest';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'power', label: 'Power' }, { key: 'rarity', label: 'Rarity' }, { key: 'newest', label: 'Newest' },
  { key: 'name', label: 'Name' }, { key: 'set', label: 'Set' },
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function traitChips(item: OwnedItem): { key: string; label: string }[] {
  return item.affixes.map((a) => ({ key: a.affixId, label: `${affixDef(a.affixId)?.name ?? a.affixId} T${a.tier}` }));
}

export function EquipmentPanel(): JSX.Element {
  const save = meta.use();
  const { inventory, loadout } = save.equipment;
  const [category, setCategory] = useState<EquipSlot | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('power');
  const [favOnly, setFavOnly] = useState(false);
  const [compareUid, setCompareUid] = useState<string | null>(null);

  const byUid = new Map(inventory.map((i) => [i.uid, i] as const));
  const equippedUids = new Set([loadout.weapon, loadout.armor, loadout.relic].filter(Boolean) as string[]);
  const sets = activeSets(inventory, loadout);
  const setActiveMap = new Map(sets.map((s) => [s.id, s] as const));
  const fieldedName = HERO_DEFS[save.selectedHero]?.name ?? 'Hero';
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
    const equipped = equippedUids.has(item.uid);
    const set = def.setId ? SETS[def.setId] : undefined;
    const setStatus = def.setId ? setActiveMap.get(def.setId) : undefined;
    const sig = def.signature && (item.rarity === 'legendary' || item.rarity === 'exotic') ? def.signature.name : null;
    return (
      <div className={`item-card${equipped ? ' is-equipped' : ''}${item.favorite ? ' is-fav' : ''}`} key={item.uid} style={{ ['--rc' as string]: c }}>
        <div className="ic-frame">
          <ItemArt def={def} rarity={item.rarity} size={66} />
          {item.locked && <span className="ic-lock" title="Locked (protected from salvage)">🔒</span>}
          {item.favorite && <span className="ic-star" title="Favorite">★</span>}
          {def.season && <span className="ic-season" title={`Seasonal: ${def.season}`}>{def.season}</span>}
        </div>
        <div className="ic-body">
          <div className="ic-name" style={{ color: c }}>{def.name}</div>
          <div className="ic-meta">
            <span className="ic-rarity" style={{ color: c }}>{cap(item.rarity)}</span>
            <span> · {SLOT_LABELS[def.slot]}{def.weaponType ? ` · ${cap(def.weaponType)}` : def.armorType ? ` · ${cap(def.armorType)}` : ''}</span>
          </div>
          <p className="ic-desc">{def.desc}</p>
          {sig && <div className="ic-sig">◆ {sig}</div>}
          {traitChips(item).length > 0 && (
            <div className="ic-traits">
              {traitChips(item).map((t) => <span className="ic-trait" key={t.key}>{t.label}</span>)}
            </div>
          )}
          {set && (
            <div className="ic-set" style={setStatus ? { color: c, borderColor: c } : undefined}>
              ◈ {set.name}{setStatus ? ` · ${setStatus.count} pc${setStatus.count > 1 ? 's' : ''}` : ''}
            </div>
          )}
          {equipped && <div className="ic-owner">Equipped · {fieldedName}</div>}
        </div>
        <div className="ic-actions">
          <button className={`ic-equip ${equipped ? 'on' : ''}`} onClick={() => meta.equip(def.slot, equipped ? null : item.uid)}>
            {equipped ? 'Unequip' : 'Equip'}
          </button>
          <button className="ic-mini" title="Compare with equipped" onClick={() => setCompareUid(item.uid)}>⇄</button>
          <button className={`ic-mini ${item.favorite ? 'is-on' : ''}`} title="Favorite" onClick={() => meta.toggleFavorite(item.uid)}>★</button>
          <button className={`ic-mini ${item.locked ? 'is-on' : ''}`} title="Lock (protect from salvage)" onClick={() => meta.toggleLock(item.uid)}>{item.locked ? '🔒' : '🔓'}</button>
          <button className="ic-mini" title="Reroll affixes (1 Mutagen)" onClick={() => meta.rerollItem(item.uid)}>⟳</button>
          <button className="ic-mini" title="Transmute up a rarity (2 Catalyst)" onClick={() => meta.transmuteItem(item.uid)}>▲</button>
          <button className="ic-mini danger" title={item.locked ? 'Unlock to salvage' : 'Salvage for materials'} disabled={item.locked} onClick={() => meta.salvageItem(item.uid)}>✕</button>
        </div>
      </div>
    );
  };

  return (
    <div className="panel armory">
      <div className="panel-title">
        Armory
        <span className="armory-score" title="Equipment Score — power of your equipped gear">⚙ {gearScore}</span>
        <span className="equip-mats">⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst}</span>
      </div>
      <div className="panel-sub">Your collection — equip one per slot; gear folds into your next run.</div>

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
              <button key={r} className={rarity === r ? 'on' : ''} style={rarity === r ? { color: rarityColor(r), borderColor: rarityColor(r) } : { color: rarityColor(r) }} onClick={() => setRarity(r)}>{cap(r)}</button>
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

      {compareUid && <CompareOverlay uid={compareUid} byUid={byUid} loadout={loadout} onClose={() => setCompareUid(null)} />}
    </div>
  );
}

// ── Compare overlay: the selected item vs the item equipped in its slot ──────────
function CompareCol({ item, tag }: { item: OwnedItem | null; tag: string }): JSX.Element {
  const def = item ? itemDef(item.defId) : undefined;
  const c = item ? rarityColor(item.rarity) : 'var(--muted)';
  return (
    <div className="cmp-col" style={{ ['--rc' as string]: c }}>
      <div className="cmp-tag">{tag}</div>
      {item && def ? (
        <>
          <ItemArt def={def} rarity={item.rarity} size={84} />
          <div className="cmp-name" style={{ color: c }}>{def.name}</div>
          <div className="ic-meta"><span style={{ color: c }}>{cap(item.rarity)}</span> · {SLOT_LABELS[def.slot]}</div>
          <p className="ic-desc">{def.desc}</p>
          {traitChips(item).length > 0 && (
            <div className="ic-traits">{traitChips(item).map((t) => <span className="ic-trait" key={t.key}>{t.label}</span>)}</div>
          )}
        </>
      ) : (
        <div className="cmp-empty">— nothing equipped —</div>
      )}
    </div>
  );
}

function CompareOverlay({
  uid, byUid, loadout, onClose,
}: {
  uid: string;
  byUid: Map<string, OwnedItem>;
  loadout: { weapon: string | null; armor: string | null; relic: string | null };
  onClose: () => void;
}): JSX.Element {
  const sel = byUid.get(uid);
  const def = sel ? itemDef(sel.defId) : undefined;
  const slot = def?.slot;
  const equippedUid = slot ? loadout[slot] : null;
  const equipped = equippedUid && equippedUid !== uid ? byUid.get(equippedUid) ?? null : null;
  return (
    <div className="cmp-overlay" onClick={onClose}>
      <div className="cmp-box" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-h">Compare {slot ? SLOT_LABELS[slot] : ''}</div>
        <div className="cmp-cols">
          <CompareCol item={sel ?? null} tag="Selected" />
          <CompareCol item={equipped} tag="Equipped" />
        </div>
        <div className="cmp-btns">
          {sel && def && equippedUid !== uid && (
            <button className="primary" onClick={() => { meta.equip(def.slot, uid); onClose(); }}>Equip Selected</button>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
