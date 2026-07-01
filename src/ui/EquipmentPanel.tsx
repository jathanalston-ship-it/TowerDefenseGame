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
  EQUIP_SLOTS, RARITY_ORDER, SETS, SLOT_LABELS, activeSets, affixDef, emptyLoadout, itemDef, itemScore, loadoutScore,
} from '../core/equipment';
import type { EquipSlot, Loadout, OwnedItem, Rarity, RolledAffix } from '../core/equipment';
import {
  REFORGE_OPS, canAfford, itemAffixView, opAvailable, reforgeCost, salvageValue,
} from '../core/reforge';
import type { Mats, ReforgeOp } from '../core/reforge';
import { ItemArt, rarityColor } from './components/ItemArt';
import { PowerDelta } from './components/PowerDelta';
import { compareItemPower } from '../state/itemPower';
import type { SaveData } from '../save/saveStore';

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
  const [compareUid, setCompareUid] = useState<string | null>(null);
  const [reforgeUid, setReforgeUid] = useState<string | null>(null);

  const byUid = new Map(inventory.map((i) => [i.uid, i] as const));
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
          {item.locked && <span className="ic-lock" title="Locked (protected from salvage)">🔒</span>}
          {item.favorite && <span className="ic-star" title="Favorite">★</span>}
          {def.season && <span className="ic-season" title={`Seasonal: ${def.season}`}>{def.season}</span>}
        </div>
        <div className="ic-body">
          <div className="ic-name" style={{ color: c }}>{def.name}</div>
          <div className="ic-meta">
            <span className="ic-rarity" style={{ color: c }}>{cap(item.rarity)}</span>
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
          <button className="ic-mini" title="Compare with equipped" onClick={() => setCompareUid(item.uid)}>⇄</button>
          <button className={`ic-mini ${item.favorite ? 'is-on' : ''}`} title="Favorite" onClick={() => meta.toggleFavorite(item.uid)}>★</button>
          <button className={`ic-mini ${item.locked ? 'is-on' : ''}`} title="Lock (protect from salvage)" onClick={() => meta.toggleLock(item.uid)}>{item.locked ? '🔒' : '🔓'}</button>
          <button className="ic-mini" title="Reforge — improve this item" onClick={() => setReforgeUid(item.uid)}>⚒</button>
          <button className="ic-mini danger" title={item.locked ? 'Unlock to salvage' : 'Salvage for materials'} disabled={item.locked} onClick={() => meta.salvageItem(item.uid)}>✕</button>
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

      {/* Hero focus — pick which fielded hero you're gearing (per-hero loadouts). */}
      {roster.length > 1 && (
        <div className="armory-heroes">
          {roster.map((k, i) => {
            const hs = loadoutScore(inventory, save.equipment.loadouts[k] ?? emptyLoadout());
            return (
              <button key={k} className={`armory-hero${k === focus ? ' on' : ''}`} onClick={() => setFocusHero(k)}>
                <span className="ah-slot">Slot {i + 1}</span>
                <span className="ah-name">{HERO_DEFS[k]?.name ?? 'Hero'}</span>
                <span className="ah-score" title="Equipment Score">⚙ {hs}</span>
              </button>
            );
          })}
        </div>
      )}

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

      {compareUid && <CompareOverlay uid={compareUid} save={save} byUid={byUid} loadout={loadout} hero={focus} heroName={focusName} onClose={() => setCompareUid(null)} />}
      {reforgeUid && <ReforgeOverlay uid={reforgeUid} byUid={byUid} mats={save.mats} onClose={() => setReforgeUid(null)} />}
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
            <div className="ic-traits">{traitChips(item).map((t) => <span className={`ic-trait${t.locked ? ' is-locked' : ''}`} key={t.key}>{t.locked ? '🔒 ' : ''}{t.label}</span>)}</div>
          )}
        </>
      ) : (
        <div className="cmp-empty">— nothing equipped —</div>
      )}
    </div>
  );
}

function CompareOverlay({
  uid, save, byUid, loadout, hero, heroName, onClose,
}: {
  uid: string;
  save: SaveData;
  byUid: Map<string, OwnedItem>;
  loadout: Loadout;
  hero: HeroKind;
  heroName: string;
  onClose: () => void;
}): JSX.Element {
  const sel = byUid.get(uid);
  const def = sel ? itemDef(sel.defId) : undefined;
  const slot = def?.slot;
  const equippedUid = slot ? loadout[slot] : null;
  const equipped = equippedUid && equippedUid !== uid ? byUid.get(equippedUid) ?? null : null;
  const cmp = sel ? compareItemPower(save, sel, hero) : null;
  return (
    <div className="cmp-overlay" onClick={onClose}>
      <div className="cmp-box" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-h">Compare {slot ? SLOT_LABELS[slot] : ''} · {heroName}</div>
        {cmp && <div className="cmp-verdict"><PowerDelta cmp={cmp} /></div>}
        <div className="cmp-cols">
          <CompareCol item={sel ?? null} tag="Selected" />
          <CompareCol item={equipped} tag={`${heroName} wears`} />
        </div>
        <div className="cmp-btns">
          {sel && def && equippedUid !== uid && (
            <button className="primary" onClick={() => { meta.equip(hero, def.slot, uid); onClose(); }}>Equip to {heroName}</button>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Reforge overlay: improve an existing item (Diablo-style — no recipes) ────────
function costLabel(cost: Mats): string {
  const parts: string[] = [];
  if (cost.mutagen) parts.push(`⊕${cost.mutagen}`);
  if (cost.scrap) parts.push(`◳${cost.scrap}`);
  if (cost.catalyst) parts.push(`✷${cost.catalyst}`);
  return parts.length ? parts.join(' ') : 'Free';
}

/** One affix row in the Reforge overlay — name · tier · lock · randomize (targeted swap). */
function ReforgeAffixRow({ item, affix, mats, tag }: { item: OwnedItem; affix: RolledAffix; mats: Mats; tag: string }): JSX.Element {
  const index = item.affixes.indexOf(affix);
  const def = affixDef(affix.affixId);
  const randCost = reforgeCost('randomize', item);
  const canRand = !affix.locked && canAfford(mats, randCost);
  return (
    <div className={`rf-affix rf-${tag.toLowerCase()}${affix.locked ? ' is-locked' : ''}`}>
      <span className="rf-affix-tag">{tag}</span>
      <span className="rf-affix-name">{def?.name ?? affix.affixId}</span>
      <span className="rf-affix-tier">T{affix.tier}</span>
      <span className="rf-affix-actions">
        <button
          className={`rf-mini${affix.locked ? ' is-on' : ''}`}
          title={affix.locked ? 'Unlock this affix' : 'Lock this affix (protect from reroll / reforge / randomize)'}
          onClick={() => meta.lockItemAffix(item.uid, index)}
        >{affix.locked ? '🔒' : '🔓'}</button>
        <button
          className="rf-mini"
          title={`Randomize this affix — new type (${costLabel(randCost)})`}
          disabled={!canRand}
          onClick={() => meta.randomizeItemAffix(item.uid, index)}
        >⤨</button>
      </span>
    </div>
  );
}

function ReforgeOverlay({
  uid, byUid, mats, onClose,
}: {
  uid: string;
  byUid: Map<string, OwnedItem>;
  mats: Mats;
  onClose: () => void;
}): JSX.Element | null {
  const item = byUid.get(uid);
  const def = item ? itemDef(item.defId) : undefined;
  if (!item || !def) return null; // salvaged / missing → overlay collapses
  const c = rarityColor(item.rarity);
  const view = itemAffixView(item);
  const runOp = (op: ReforgeOp): void => {
    if (op === 'salvage') { meta.salvageItem(uid); onClose(); return; }
    meta.reforgeOp(uid, op);
  };
  return (
    <div className="cmp-overlay" onClick={onClose}>
      <div className="rf-box" onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: c }}>
        <div className="rf-head">
          <ItemArt def={def} rarity={item.rarity} size={64} />
          <div className="rf-head-info">
            <div className="rf-name" style={{ color: c }}>{def.name}</div>
            <div className="ic-meta">
              <span style={{ color: c }}>{cap(item.rarity)}</span> · {SLOT_LABELS[def.slot]}
              {item.ilvl !== undefined && <span title="Item level"> · i{item.ilvl}</span>}
              <span title="Power Score"> · ⚙ {itemScore(item)}</span>
            </div>
          </div>
        </div>

        <div className="rf-affixes">
          {view.primary
            ? <ReforgeAffixRow item={item} affix={view.primary} mats={mats} tag="Primary" />
            : <div className="hint">No affixes yet — Upgrade to add an affix slot.</div>}
          {view.prefixes.map((a) => <ReforgeAffixRow key={a.affixId} item={item} affix={a} mats={mats} tag="Prefix" />)}
          {view.suffixes.map((a) => <ReforgeAffixRow key={a.affixId} item={item} affix={a} mats={mats} tag="Suffix" />)}
        </div>

        <div className="rf-ops">
          {REFORGE_OPS.map((op) => {
            const cost = reforgeCost(op.id, item);
            const disabled = !opAvailable(op.id, item) || (op.id !== 'salvage' && !canAfford(mats, cost));
            return (
              <button key={op.id} className={`rf-op${op.id === 'salvage' ? ' danger' : ''}`} disabled={disabled} onClick={() => runOp(op.id)}>
                <span className="rf-op-h"><b>{op.icon} {op.label}</b>
                  <span className="rf-op-cost">{op.id === 'salvage' ? `+${costLabel(salvageValue(item))}` : costLabel(cost)}</span>
                </span>
                <span className="rf-op-blurb">{op.blurb}</span>
              </button>
            );
          })}
        </div>
        <div className="rf-mats">Materials · ⊕ {mats.mutagen} Mutagen · ◳ {mats.scrap} Scrap · ✷ {mats.catalyst} Catalyst</div>
        <div className="cmp-btns"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
