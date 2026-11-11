// EQUIPMENT CODEX (docs/EQUIPMENT.md §visuals) — the collection gallery. Every equipment item shown
// as its procedural art card with rarity, discovery status, flavor, and — grouped by SET — the set's
// 2-piece / 4-piece bonuses previewed with their member items. Reuses the shared ItemArt generator,
// so a new item appears here automatically. Menu-only, read-only ⇒ golden-safe.

import { useMemo, useRef, useState } from 'react';
import { defaultListState, organizeList, type ListOrgSpec } from '../state/listOrg';
import { gearDiscovered, meta } from '../state/meta';
import {
  ALL_ITEMS, EQUIP_SLOTS, SETS, SLOT_LABELS, RARITY_ORDER, rarityColorOf, rarityLabelOf,
} from '../core/equipment';
import { describeEffects } from '../core/effectLanguage';
import type { EquipDef, Rarity } from '../core/equipment';
import { ItemArt } from './components/ItemArt';
import { MobileSection } from './components/MobileSection';
import { useLayoutProfile } from './layoutProfile';
import { RarityFx, rfxClass } from './components/RarityFx';
import { ListControls } from './components/ListControls';

const CODEX_LIST: ListOrgSpec<EquipDef> = {
  searchText: (def) => `${def.name} ${def.desc} ${SLOT_LABELS[def.slot]} ${def.setId ? SETS[def.setId]?.name ?? '' : ''}`,
  sorts: [{ id: 'authored', label: 'Codex order', by: () => 0 }],
};

export function EquipmentCollection(): JSX.Element {
  const save = meta.use();
  const portrait = useLayoutProfile().profile === 'portrait';
  const [query, setQuery] = useState('');
  const controlsRef = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0;
  const results = useMemo(() => organizeList(ALL_ITEMS, CODEX_LIST, { ...defaultListState(CODEX_LIST), query }), [query]);
  const visibleSets = Object.values(SETS).filter((set) => !searching || results.rows.some((def) => def.setId === set.id));
  // Best owned rarity per def (undiscovered ⇒ absent).
  const owned = useMemo(() => {
    const best: Record<string, Rarity> = {};
    for (const it of save.equipment.inventory) {
      const cur = best[it.defId];
      if (!cur || RARITY_ORDER.indexOf(it.rarity) > RARITY_ORDER.indexOf(cur)) best[it.defId] = it.rarity;
    }
    return best;
  }, [save.equipment.inventory]);
  // v56 (docs/EQUIPMENT.md §codex): discovery is PERMANENT — an entry stays revealed after its
  // last copy is salvaged; "held" (the best rarity you own right now) is the separate fact.
  const found = useMemo(() => gearDiscovered(save), [save.equipment]);
  const discovered = ALL_ITEMS.filter((d) => found.has(d.id)).length;

  const card = (def: EquipDef): JSX.Element => {
    const rar = owned[def.id];
    const isOwned = found.has(def.id);
    const showRar = rar ?? 'common';
    const col = rarityColorOf(showRar);
    return (
      <div key={def.id} title={isOwned ? (rar ? def.desc : `${def.desc} — discovered (none held right now)`) : 'Undiscovered — find it in a Bio-Container'}
        style={{ width: 116, opacity: isOwned ? 1 : 0.4, filter: isOwned ? 'none' : 'grayscale(0.7)', textAlign: 'center' }}>
        <div className={rar ? rfxClass(rar, true) : undefined} style={{ position: 'relative', width: 100, borderRadius: 8 }}>
          {rar && <RarityFx rarity={rar} lite />}
          <ItemArt def={def} rarity={showRar} size={100} />
          {!isOwned && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 24 }}>🔒</span>}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: isOwned ? col : '#8890a8', marginTop: 3, lineHeight: 1.1 }}>{def.name}</div>
        <div style={{ fontSize: 10, opacity: 0.6 }}>{isOwned ? (rar ? rarityLabelOf(showRar) : 'Discovered') : '— · '}{isOwned ? ' · ' : ''}{SLOT_LABELS[def.slot]}</div>
      </div>
    );
  };

  return (
    <div className="screen equip-codex" data-guide="gearcodex-root" style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Equipment Codex</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 13, maxWidth: 640 }}>
            Every relic the hive has spliced. Discover items in Bio-Containers to reveal their art and complete the archive.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div><b style={{ color: '#5fe08a' }}>{discovered}</b> / {ALL_ITEMS.length} discovered</div>
          <div style={{ opacity: 0.7 }}>{Math.round((discovered / ALL_ITEMS.length) * 100)}% complete</div>
        </div>
      </div>

      <div ref={controlsRef} style={{ marginTop: 16 }}>
        <ListControls search={{ value: query, onChange: setQuery, placeholder: 'Item, set, slot or description…', label: 'Search Equipment Codex' }}
          right={query.length > 0 && <button type="button" onClick={() => {
            setQuery('');
            controlsRef.current?.querySelector('input')?.focus();
          }}>Clear search</button>} />
        <div role="status" style={{ fontSize: 12, opacity: 0.8 }}>
          {searching ? `${results.shown} of ${results.total} items match.` : ''}
        </div>
        {searching && results.shown === 0 && <p>No relics match this search. Try an item name, set, slot or description.</p>}
      </div>

      {/* ── Set bonuses ── */}
      {visibleSets.length > 0 && (() => {
        const grid = (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
            {visibleSets.map((set) => {
              const members = ALL_ITEMS.filter((d) => d.setId === set.id);
              const ownedCount = members.filter((d) => found.has(d.id)).length;
              return (
                <div key={set.id} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 13 }}>
                    <span>{set.name}</span>
                    <span style={{ opacity: 0.6, fontSize: 11 }}>{ownedCount}/{members.length} discovered</span>
                  </div>
                  <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>
                    <b>(2)</b> {describeEffects(set.bonus2).map((line) => line.exact).join(', ')}
                  </div>
                  <div style={{ fontSize: 11.5, opacity: 0.85 }}>
                    <b>(4)</b> {describeEffects(set.bonus4).map((line) => line.exact).join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        );
        if (portrait && !searching) {
          return (
            <MobileSection title="Set bonuses" hint="Wear 2 or 4 pieces of a set for extra effects." count={`${Object.keys(SETS).length} sets`}>
              {grid}
            </MobileSection>
          );
        }
        return (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Set Bonuses</div>
            {grid}
          </div>
        );
      })()}

      {/* ── All items, grouped by slot (portrait: each slot folds — the codex was a 17-screen
            scroll; folded, it reads as an index with live discovery counts) ── */}
      {EQUIP_SLOTS.map((slot) => {
        const items = results.rows.filter((d) => d.slot === slot);
        if (items.length === 0) return null;
        const foundN = items.filter((d) => found.has(d.id)).length;
        const grid = (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {items.map(card)}
          </div>
        );
        if (portrait && !searching) {
          return (
            <MobileSection key={slot} title={`${SLOT_LABELS[slot]}s`} hint="Tap to browse this slot's relics." count={`${foundN}/${items.length}`}>
              {grid}
            </MobileSection>
          );
        }
        return (
          <div key={slot} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{SLOT_LABELS[slot]}s</div>
            {grid}
          </div>
        );
      })}
    </div>
  );
}
