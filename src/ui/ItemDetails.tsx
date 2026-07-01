// Equipment Details screen (docs/EQUIPMENT.md) — the ONE place a player manages a piece of gear.
// Item cards expose only Equip / Details / Favorite; everything else lives here so the card stays
// scannable and this screen is understandable within seconds: large art + Power, a side-by-side
// vs. the equipped item, affixes with plain-language explanations, the full upgrade bar
// (Enhance / Reroll / Reforge / Upgrade Rarity / Salvage) with live costs, and the item's story
// (upgrade potential, power contribution, source, mod history). Reads the reactive save via meta.

import { useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import type { HeroKind } from '../core/types';
import {
  SLOT_LABELS, affixDef, affixEffectText, itemDef, itemScore, loadoutScore, maxTierForIlvl, rarityLabelOf,
} from '../core/equipment';
import type { Loadout, OwnedItem, RolledAffix } from '../core/equipment';
import {
  REFORGE_OPS, canAfford, itemAffixView, opAvailable, reforgeCost, salvageValue,
} from '../core/reforge';
import type { Mats } from '../core/reforge';
import { ItemArt, rarityColor } from './components/ItemArt';
import { PowerDelta } from './components/PowerDelta';
import { compareItemPower } from '../state/itemPower';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function costLabel(cost: Mats): string {
  const parts: string[] = [];
  if (cost.mutagen) parts.push(`⊕${cost.mutagen}`);
  if (cost.scrap) parts.push(`◳${cost.scrap}`);
  if (cost.catalyst) parts.push(`✷${cost.catalyst}`);
  return parts.length ? parts.join(' ') : 'Free';
}

/** One affix row: name · tier · plain-language explanation · lock/randomize (the targeted swaps). */
function AffixRow({ item, affix, mats, tag, color }: { item: OwnedItem; affix: RolledAffix; mats: Mats; tag: string; color: string }): JSX.Element {
  const index = item.affixes.indexOf(affix);
  const def = affixDef(affix.affixId);
  const randCost = reforgeCost('randomize', item);
  const canRand = !affix.locked && canAfford(mats, randCost);
  return (
    <div className={`id-affix${affix.locked ? ' is-locked' : ''}`}>
      <span className="id-affix-tag" style={{ color }}>{tag}</span>
      <span className="id-affix-main">
        <span className="id-affix-name">{def?.name ?? affix.affixId} <span className="id-affix-tier">T{affix.tier}</span></span>
        <span className="id-affix-explain">{affixEffectText(affix)}</span>
      </span>
      <span className="id-affix-actions">
        <button className={`id-mini${affix.locked ? ' is-on' : ''}`} title={affix.locked ? 'Unlock this affix' : 'Lock this affix (protect from reroll / reforge / randomize)'} onClick={() => meta.lockItemAffix(item.uid, index)}>{affix.locked ? '🔒' : '🔓'}</button>
        <button className="id-mini" title={`Randomize this affix — a new type (${costLabel(randCost)})`} disabled={!canRand} onClick={() => meta.randomizeItemAffix(item.uid, index)}>⤨</button>
      </span>
    </div>
  );
}

export function ItemDetails({
  uid, hero, onClose,
}: {
  uid: string;
  hero: HeroKind;
  onClose: () => void;
}): JSX.Element | null {
  const save = meta.use(); // reactive: equips / reforges / salvage reflect immediately
  const [armed, setArmed] = useState(false); // two-step Salvage guard (tiered safeguards land in #88)
  const item = save.equipment.inventory.find((i) => i.uid === uid);
  const def = item ? itemDef(item.defId) : undefined;
  if (!item || !def) return null; // salvaged / missing → the screen closes itself
  const c = rarityColor(item.rarity);
  const mats = save.mats;
  const loadout: Loadout = save.equipment.loadouts[hero] ?? { weapon: null, armor: null, relic: null };
  const equippedUid = loadout[def.slot];
  const equipped = equippedUid === uid;
  const rival = equippedUid && equippedUid !== uid ? save.equipment.inventory.find((i) => i.uid === equippedUid) : undefined;
  const rivalDef = rival ? itemDef(rival.defId) : undefined;
  const view = itemAffixView(item);
  const heroName = HERO_DEFS[hero]?.name ?? 'Hero';
  const power = itemScore(item);
  const gear = loadoutScore(save.equipment.inventory, loadout);
  const share = equipped && gear > 0 ? Math.round((power / gear) * 100) : 0;
  const ceiling = maxTierForIlvl(item.ilvl);
  const headroom = item.affixes.filter((a) => a.tier < ceiling).length;

  const salvage = (): void => { if (meta.salvageItem(uid)) onClose(); };

  return (
    <div className="cmp-overlay" onClick={onClose}>
      <div className="id-box" onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: c }}>
        <button className="id-close" onClick={onClose} title="Close">✕</button>

        {/* ── Identity: large art + name + Power + management ── */}
        <div className="id-head">
          <div className="id-art"><ItemArt def={def} rarity={item.rarity} size={120} /></div>
          <div className="id-head-info">
            <div className="id-name" style={{ color: c }}>{def.name}</div>
            <div className="id-sub">
              <span style={{ color: c }}>{rarityLabelOf(item.rarity)}</span> · {SLOT_LABELS[def.slot]}
              {def.weaponType ? ` · ${cap(def.weaponType)}` : def.armorType ? ` · ${cap(def.armorType)}` : ''}
              {item.ilvl !== undefined && <span title="Item level"> · i{item.ilvl}</span>}
            </div>
            <div className="id-power" title="Power Score — this item's contribution to your strength">⚙ {power} <span>Power</span></div>
            <p className="id-desc">{def.desc}</p>
            <div className="id-manage">
              <button className={`id-equip${equipped ? ' on' : ''}`} onClick={() => meta.equip(hero, def.slot, equipped ? null : uid)}>
                {equipped ? 'Unequip' : rival ? `Equip to ${heroName}` : 'Equip'}
              </button>
              <button className={`id-mini${item.favorite ? ' is-on' : ''}`} title="Favorite (pins the item; never auto-salvaged)" onClick={() => meta.toggleFavorite(uid)}>★</button>
              <button className={`id-mini${item.locked ? ' is-on' : ''}`} title="Lock (protect from salvage)" onClick={() => meta.toggleLock(uid)}>{item.locked ? '🔒' : '🔓'}</button>
            </div>
          </div>
        </div>

        {/* ── Power vs. what the hero wears now ── */}
        {!equipped && (
          <div className="id-compare">
            <div className="id-compare-verdict"><PowerDelta cmp={compareItemPower(save, item, hero)} /></div>
            <div className="id-compare-cols">
              <div className="id-cmp-col" style={{ ['--rc' as string]: c }}>
                <ItemArt def={def} rarity={item.rarity} size={54} />
                <span className="id-cmp-tag">This item</span>
                <span className="id-cmp-pow" style={{ color: c }}>⚙ {power}</span>
              </div>
              <div className="id-cmp-arrow">vs</div>
              <div className="id-cmp-col" style={{ ['--rc' as string]: rival ? rarityColor(rival.rarity) : 'var(--muted)' }}>
                {rival && rivalDef ? (<><ItemArt def={rivalDef} rarity={rival.rarity} size={54} /><span className="id-cmp-tag">{heroName} wears</span><span className="id-cmp-pow" style={{ color: rarityColor(rival.rarity) }}>⚙ {itemScore(rival)}</span></>)
                  : (<span className="id-cmp-empty">— {heroName}'s {SLOT_LABELS[def.slot]} slot is empty —</span>)}
              </div>
            </div>
          </div>
        )}

        {/* ── Affixes with plain-language explanations ── */}
        <div className="id-section">
          <div className="id-sec-title">Affixes <span className="id-sec-hint">what this gear does</span></div>
          <div className="id-affixes">
            {view.primary ? <AffixRow item={item} affix={view.primary} mats={mats} tag="Primary" color={c} />
              : <div className="hint">No affixes yet — Upgrade Rarity to add an affix slot.</div>}
            {view.prefixes.map((a) => <AffixRow key={a.affixId} item={item} affix={a} mats={mats} tag="Prefix" color="var(--kinetic)" />)}
            {view.suffixes.map((a) => <AffixRow key={a.affixId} item={item} affix={a} mats={mats} tag="Suffix" color="var(--vital)" />)}
          </div>
        </div>

        {/* ── Upgrade bar: the full craft toolkit, live costs ── */}
        <div className="id-section">
          <div className="id-sec-title">Upgrade <span className="id-mats">⊕ {mats.mutagen} · ◳ {mats.scrap} · ✷ {mats.catalyst}</span></div>
          <div className="id-ops">
            {REFORGE_OPS.map((op) => {
              const isSalvage = op.id === 'salvage';
              const cost = reforgeCost(op.id, item);
              const disabled = !opAvailable(op.id, item) || (!isSalvage && !canAfford(mats, cost));
              if (isSalvage) {
                return (
                  <button key={op.id} className={`id-op danger${armed ? ' is-armed' : ''}`} disabled={item.locked} onClick={() => (armed ? salvage() : setArmed(true))} onMouseLeave={() => setArmed(false)}>
                    <span className="id-op-h"><b>{op.icon} {armed ? 'Confirm salvage?' : 'Salvage'}</b><span className="id-op-cost">+{costLabel(salvageValue(item))}</span></span>
                    <span className="id-op-blurb">{item.locked ? 'Locked — unlock to salvage.' : op.blurb}</span>
                  </button>
                );
              }
              return (
                <button key={op.id} className="id-op" disabled={disabled} onClick={() => meta.reforgeOp(uid, op.id)}>
                  <span className="id-op-h"><b>{op.icon} {op.label}</b><span className="id-op-cost">{costLabel(cost)}</span></span>
                  <span className="id-op-blurb">{op.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── The item's story: potential, contribution, source, history ── */}
        <div className="id-facts">
          <div className="id-fact"><span className="id-fact-k">Upgrade potential</span><span className="id-fact-v">{headroom > 0 ? `${headroom} affix${headroom > 1 ? 'es' : ''} can climb to T${ceiling}` : `Maxed for i${item.ilvl ?? '?'} (T${ceiling})`}</span></div>
          <div className="id-fact"><span className="id-fact-k">Power contribution</span><span className="id-fact-v">⚙ {power}{equipped ? ` · ${share}% of ${heroName}'s gear` : ' · not equipped'}</span></div>
          <div className="id-fact"><span className="id-fact-k">Source</span><span className="id-fact-v">{item.source ?? 'Unknown'}</span></div>
          <div className="id-fact"><span className="id-fact-k">Mod history</span><span className="id-fact-v">{item.history && item.history.length ? item.history.join(' → ') : 'Unmodified'}</span></div>
        </div>
      </div>
    </div>
  );
}
