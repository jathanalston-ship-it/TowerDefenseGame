// Equipment Details screen (docs/EQUIPMENT.md) — the ONE place a player manages a piece of gear.
// Item cards expose only Equip / Details / Favorite; everything else lives here so the card stays
// scannable and this screen is understandable within seconds: large art + Power, a side-by-side
// vs. the equipped item, affixes with plain-language explanations, the full upgrade bar
// (Enhance / Reroll / Reforge / Upgrade Rarity / Salvage) with live costs, and the item's story
// (upgrade potential, power contribution, source, mod history). Reads the reactive save via meta.

import { useEffect, useId, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import type { HeroKind } from '../core/types';
import {
  RARITY_ORDER, SLOT_LABELS, affixDef, affixEffectText, itemDef, itemScore, loadoutScore, maxTierForIlvl, rarityLabelOf,
} from '../core/equipment';
import type { Loadout, OwnedItem, RolledAffix } from '../core/equipment';
import {
  REFORGE_OPS, canAfford, itemAffixView, opAvailable, reforgeCost, salvageValue,
} from '../core/reforge';
import type { Mats } from '../core/reforge';
import { ItemArt, rarityColor } from './components/ItemArt';
import { HeroGearPreview } from './components/HeroGearPreview';
import { PowerDelta } from './components/PowerDelta';
import { compareItemPower } from '../state/itemPower';
import { Popup } from './components/Popup';

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
        <button className={`id-mini${affix.locked ? ' is-on' : ''}`} aria-label={`${def?.name ?? affix.affixId} affix lock`} aria-pressed={!!affix.locked} title={affix.locked ? 'Unlock this affix' : 'Lock this affix (protect from reroll / reforge / randomize)'} onClick={() => meta.lockItemAffix(item.uid, index)}>{affix.locked ? '🔒' : '🔓'}</button>
        <button className="id-mini" aria-label={`Randomize ${def?.name ?? affix.affixId} affix`} title={`Randomize this affix — a new type (${costLabel(randCost)})`} disabled={!canRand} onClick={() => meta.randomizeItemAffix(item.uid, index)}>⤨</button>
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
  const [confirming, setConfirming] = useState(false); // salvage confirm dialog (tiered by rarity / power)
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const salvageDescriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    boxRef.current?.querySelector<HTMLButtonElement>('.id-close')?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled')) previous.focus();
    };
  }, [uid]);
  useEffect(() => {
    if (!confirming) return;
    const previous = document.activeElement;
    const box = boxRef.current;
    if (box) box.inert = true;
    cancelRef.current?.focus();
    return () => {
      if (box) box.inert = false;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [confirming]);
  useEffect(() => { meta.markItemSeen(uid); }, [uid]); // opening Details clears the "NEW" badge
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

  // Salvage safeguards (docs/EQUIPMENT.md §safeguards): favorites + equipped items can never be
  // salvaged from here; the confirm ceremony scales with rarity, and salvaging gear STRONGER than
  // what the hero wears throws a hard warning regardless of rarity.
  const slotWord = SLOT_LABELS[def.slot].toLowerCase();
  const rivalPower = rival ? itemScore(rival) : 0;
  const powerDiff = rival ? power - rivalPower : 0;
  const higherPower = !!rival && powerDiff > 0;
  const salvageBlock = equipped ? `Unequip from ${heroName} first` : item.favorite ? 'Unfavorite to salvage' : item.locked ? 'Unlock to salvage' : null;
  const requestSalvage = (): void => {
    if (salvageBlock) return; // guarded (the button is disabled in these states)
    if (item.rarity === 'common' && !higherPower) { doSalvage(); return; } // common = one-click, no ceremony
    setConfirming(true);
  };
  const doSalvage = (): void => { if (meta.salvageItem(uid)) onClose(); };

  return (
    <Popup onClose={onClose}>
    <div className="cmp-overlay">
      <div ref={boxRef} className="id-box" role="dialog" aria-modal="true" aria-label={`${def.name} details`}
        onKeyDown={(e) => {
          if (confirming || e.key !== 'Tab') return;
          const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}
        onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: c }}>
        <button className="id-close" onClick={onClose} aria-label="Close item details" title="Close item details">✕</button>

        {/* ── Identity: large art + a LIVE preview of the hero wearing it + name + Power + management ── */}
        <div className="id-head">
          <div className="id-art"><ItemArt def={def} rarity={item.rarity} size={120} /></div>
          <div className="id-hero-preview" title={`${heroName} wearing ${def.name}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'radial-gradient(circle,rgba(20,16,32,0.8),transparent)', borderRadius: 12 }}>
            <HeroGearPreview heroKind={hero} item={item} size={116} />
            <span style={{ fontSize: 10, opacity: 0.6, marginTop: -6 }}>{equipped ? `${heroName} equipped` : `${heroName} preview`}</span>
          </div>
          <div className="id-head-info">
            <div className="id-name" style={{ color: c }}>{def.name}</div>
            <div className="id-sub">
              <span style={{ color: c }}>{rarityLabelOf(item.rarity)}</span> · {SLOT_LABELS[def.slot]}
              {def.weaponType ? ` · ${cap(def.weaponType)}` : def.armorType ? ` · ${cap(def.armorType)}` : ''}
              {item.ilvl !== undefined && <span title={`Item level ${item.ilvl} — affixes roll up to T${ceiling}. Deeper Campaign stages drop higher item levels.`}> · i{item.ilvl}</span>}
            </div>
            <div className="id-power" title="Power Score — this item's contribution to your strength">⚙ {power} <span>Power</span></div>
            <p className="id-desc">{def.desc}</p>
            <div className="id-manage">
              <button className={`id-equip${equipped ? ' on' : ''}`} onClick={() => meta.equip(hero, def.slot, equipped ? null : uid)}>
                {equipped ? 'Unequip' : rival ? `Equip to ${heroName}` : 'Equip'}
              </button>
              <button className={`id-mini${item.favorite ? ' is-on' : ''}`} aria-label="Favorite item" aria-pressed={!!item.favorite} title={item.favorite ? 'Remove favorite' : 'Favorite (pins the item; never auto-salvaged)'} onClick={() => meta.toggleFavorite(uid)}>★</button>
              <button className={`id-mini${item.locked ? ' is-on' : ''}`} aria-label="Item salvage lock" aria-pressed={!!item.locked} title={item.locked ? 'Unlock item for salvage' : 'Lock (protect from salvage)'} onClick={() => meta.toggleLock(uid)}>{item.locked ? '🔒' : '🔓'}</button>
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
              const available = opAvailable(op.id, item);
              const disabled = !available || (!isSalvage && !canAfford(mats, cost));
              if (isSalvage) {
                return (
                  <button key={op.id} className="id-op danger" disabled={!!salvageBlock} onClick={requestSalvage}>
                    <span className="id-op-h"><b>{op.icon} Salvage</b><span className="id-op-cost">+{costLabel(salvageValue(item))}</span></span>
                    <span className="id-op-blurb">{salvageBlock ?? op.blurb}</span>
                  </button>
                );
              }
              let reason: string | null = null;
              if (!available) {
                if (op.id === 'upgrade') reason = `Rarity upgrades stop at ${rarityLabelOf('legendary')}.`;
                else if (item.affixes.length === 0) reason = 'This item has no affixes to modify.';
                else if (op.id === 'enhance' && !item.affixes.some((a) => a.tier < ceiling)) reason = `Affixes have reached this item's T${ceiling} limit.`;
                else reason = op.id === 'enhance' ? `Unlock an affix below T${ceiling} to enhance.` : 'Unlock an affix first.';
              } else if (disabled) {
                const missing = ([['mutagen', 'Mutagen'], ['scrap', 'Scrap'], ['catalyst', 'Catalyst']] as const)
                  .filter(([key]) => cost[key] > mats[key])
                  .map(([key, name]) => `${cost[key] - mats[key]} more ${name}`);
                reason = `Need ${missing.join(', ')}.`;
              }
              return (
                <button key={op.id} className="id-op" disabled={disabled} title={reason ?? op.blurb} onClick={() => meta.reforgeOp(uid, op.id)}>
                  <span className="id-op-h"><b>{op.icon} {op.label}</b><span className="id-op-cost">{costLabel(cost)}</span></span>
                  <span className="id-op-blurb">{op.blurb}</span>
                  {reason && <span className="id-op-reason">{reason}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Visual UPGRADE preview: how this item's art evolves at the next rarity ── */}
        {(() => {
          const idx = RARITY_ORDER.indexOf(item.rarity);
          const next = idx >= 0 && idx < RARITY_ORDER.length - 1 ? RARITY_ORDER[idx + 1] : null;
          if (!next) return null;
          return (
            <div className="id-section">
              <div className="id-sec-title">Rarity Preview <span className="id-mats">Upgrade Rarity to evolve the art</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', padding: '4px 0' }}>
                <div style={{ textAlign: 'center' }}><ItemArt def={def} rarity={item.rarity} size={70} /><div style={{ fontSize: 11, color: c, marginTop: 2 }}>{rarityLabelOf(item.rarity)}</div></div>
                <span style={{ fontSize: 22, opacity: 0.5 }}>→</span>
                <div style={{ textAlign: 'center' }}><ItemArt def={def} rarity={next} size={82} /><div style={{ fontSize: 11, color: rarityColor(next), marginTop: 2 }}>{rarityLabelOf(next)}</div></div>
              </div>
            </div>
          );
        })()}

        {/* ── The item's story: potential, contribution, source, history ── */}
        <div className="id-facts">
          <div className="id-fact"><span className="id-fact-k">Upgrade potential</span><span className="id-fact-v">{headroom > 0 ? `${headroom} affix${headroom > 1 ? 'es' : ''} can climb to T${ceiling}` : `Maxed for i${item.ilvl ?? '?'} (T${ceiling})`}</span></div>
          <div className="id-fact"><span className="id-fact-k">Power contribution</span><span className="id-fact-v">⚙ {power}{equipped ? ` · ${share}% of ${heroName}'s gear` : ' · not equipped'}</span></div>
          <div className="id-fact"><span className="id-fact-k">Source</span><span className="id-fact-v">{item.source ?? 'Unknown'}</span></div>
        </div>

        {/* ── Equipment History — the item's full timeline: the drop, then every mod applied ── */}
        {item.history && item.history.length > 0 && (
          <div className="id-section">
            <div className="id-sec-title">Equipment History</div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.history.map((ev, i) => {
                const last = i === item.history!.length - 1;
                return (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, opacity: last ? 1 : 0.7 }}>
                    <span style={{ color: c, fontSize: 10 }}>{i === 0 ? '◆' : '▸'}</span>
                    <span>{ev}</span>
                    {last && i > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>latest</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* ── Tiered salvage confirm: rarity scales the ceremony; a higher-Power dismantle hard-warns ── */}
        {confirming && (() => {
          const rIdx = RARITY_ORDER.indexOf(item.rarity);
          const level = higherPower ? 'warning' : rIdx >= 3 ? 'legendary' : rIdx === 2 ? 'epic' : 'rare';
          return (
            <Popup onClose={() => setConfirming(false)}>
            <div className="id-salvage-scrim">
              <div className={`id-salvage is-${level}`} role="alertdialog" aria-modal="true" aria-label={`Salvage ${def.name}?`} aria-describedby={salvageDescriptionId}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return;
                  const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                  const first = buttons[0], last = buttons[buttons.length - 1];
                  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
                }}
                onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: c }}>
                <div id={salvageDescriptionId}>{higherPower ? (
                  <>
                    <div className="id-salvage-warn">⚠ WARNING</div>
                    <p className="id-salvage-copy">This item has <b>+{powerDiff}</b> higher Power than your equipped {slotWord}.</p>
                    <p className="id-salvage-copy">Are you absolutely sure you want to salvage it?</p>
                  </>
                ) : (
                  <>
                    <div className="id-salvage-h" style={{ color: c }}>Salvage this {rarityLabelOf(item.rarity)} {slotWord}?</div>
                    {level === 'legendary' && <p className="id-salvage-copy">A <b style={{ color: c }}>{rarityLabelOf(item.rarity)}</b> piece — this is permanent (Undo keeps only your most recent salvage).</p>}
                    {level === 'epic' && <p className="id-salvage-copy">Power {power}{rival ? ` vs ${rivalPower} equipped (${powerDiff >= 0 ? '+' : ''}${powerDiff})` : ''} · yields +{costLabel(salvageValue(item))}.</p>}
                    {level === 'rare' && <p className="id-salvage-copy">Yields +{costLabel(salvageValue(item))} materials.</p>}
                  </>
                )}</div>
                <div className="id-salvage-btns">
                  <button ref={cancelRef} onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="danger" onClick={doSalvage}>Salvage</button>
                </div>
              </div>
            </div>
            </Popup>
          );
        })()}
      </div>
    </div>
    </Popup>
  );
}
