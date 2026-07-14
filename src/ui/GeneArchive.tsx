// Gene Archive (docs/GENE-EVOLUTION.md, Task 5) — the player's PERMANENT Gene Card collection.
// A generic grid over the geneArchive read-model (one tile per registered card: art, level/ceiling,
// next cost, campaign gate — always shown — owned state, upgradeable signal) + a detailed inspection
// overlay (large art, effects so far, upgrade history, future levels with costs/gates, permanent
// power contribution, the Upgrade button). Nothing here is hardcoded per card: hundreds of future
// cards render from the same rows. Task 8 layers search/sort on top of this state shape.

import { useMemo, useState } from 'react';
import { meta } from '../state/meta';
import { geneArchiveRows, geneArchiveSummary } from '../state/geneArchive';
import type { GeneArchiveRow } from '../state/geneArchive';
import { CARD_CATEGORY_LABEL, cardRegistry, cardSubject } from '../core/cards';
import type { CardEffect } from '../core/cards';
import { GENE_LOADOUT_SLOTS } from '../core/geneLoadout';
import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { TowerKind } from '../core/types';
import { affectsOf } from './cardAffects';
import { GeneCardArt, geneRarityColor } from './components/GeneCardArt';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';
import { highestCampaignStage } from '../save/derive';
import { Popup } from './components/Popup';
import { BestBuyStrip } from './components/BestBuyStrip';

/** Compact preview phrase for one Transcendence-option effect (§Transcendence). The pools only
 *  author field-bearing mul/add ops, so this covers them fully: mul reads as ±%, a sub-1 add reads
 *  as +% (chances/fractions), an integer add reads as +N. Field names prettify from camelCase. */
function fmtTranscendEffect(e: CardEffect): string {
  if (!('field' in e)) return String(e.op);
  const name = e.field.replace(/Mult$|Frac$|Bonus$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  if (e.op === 'mul') {
    const pct = Math.round((e.value - 1) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}% ${name}`;
  }
  if (e.op === 'add') return Math.abs(e.value) < 1 ? `+${Math.round(e.value * 100)}% ${name}` : `+${e.value} ${name}`;
  return name;
}

function levelPips(level: number, max: number, color: string): JSX.Element {
  return (
    <span className="ga-pips" aria-label={`level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`ga-pip${i < level ? ' on' : ''}`} style={i < level ? { background: color } : undefined} />
      ))}
    </span>
  );
}

/** One collection tile. Click → the inspection screen. */
function GeneTile({ row, onOpen }: { row: GeneArchiveRow; onOpen: () => void }): JSX.Element {
  const { def } = row;
  const aff = affectsOf(row.subject);
  const rc = geneRarityColor(def.rarity);
  return (
    <button
      className={`ga-tile${row.owned ? '' : ' is-unowned'}${row.upgradeable ? ' is-upgradeable' : ''}${row.transcend ? ' is-transcended' : ''}`}
      style={{ ['--rc' as string]: rc, ['--acc' as string]: aff.color }}
      onClick={onOpen}
      title={`${def.name} — inspect`}
    >
      {row.upgradeable && <span className="ga-up" title="Upgrade available">▲</span>}
      {row.transcend && <span className="ga-tr" title={`Transcended — ${row.transcend.label}`}>❂</span>}
      <span className="ga-marks">
        <span
          className={`ga-mark${row.pinned ? ' is-on' : ''}`}
          title={row.pinned ? 'Unpin' : 'Pin (always first)'}
          role="button"
          onClick={(e) => { e.stopPropagation(); meta.toggleGenePin(def.id); }}
        >📌</span>
        <span
          className={`ga-mark${row.favorite ? ' is-on' : ''}`}
          title={row.favorite ? 'Unfavorite' : 'Favorite'}
          role="button"
          onClick={(e) => { e.stopPropagation(); meta.toggleGeneFavorite(def.id); }}
        >★</span>
      </span>
      <GeneCardArt id={def.id} accent={aff.color} rarity={def.rarity} size={64} />
      <span className="ga-tile-body">
        <span className="ga-name" style={{ color: rc }}>{def.name}</span>
        <span className="ga-meta">
          <span className="ga-aff" style={{ color: aff.color }}>{aff.label}</span>
          <span className="ga-cat">{CARD_CATEGORY_LABEL[def.category]}</span>
        </span>
        {levelPips(row.level, row.maxLevel, rc)}
        <span className="ga-line">
          {row.owned ? (
            row.nextCost === null ? (
              row.transcend ? <span className="ga-transcended">❂ TRANSCENDED</span>
              : row.transcendReady ? <span className="ga-tr-ready">❂ TRANSCEND READY</span>
              : <span className="ga-maxed">MAXED</span>
            )
            : !row.gateMet ? <span className="ga-gate">🔒 Stage {row.gateStage}</span>
            : <span className={`ga-cost${row.canAfford ? ' ok' : ''}`}><CurrencyIcon id="geneEssence" size={11} title="" /> {row.nextCost.toLocaleString()}</span>
          ) : (
            <span className="ga-unowned">UNDISCOVERED — draft it in a run</span>
          )}
          {row.powerMult > 1 && <span className="ga-pow" title="Permanent Power contribution">⚙ +{Math.round((row.powerMult - 1) * 100)}%</span>}
        </span>
      </span>
    </button>
  );
}

/** The card inspection screen — everything about ONE gene, incl. the Upgrade action. */
function GeneInspect({ id, onClose }: { id: string; onClose: () => void }): JSX.Element | null {
  const save = meta.use();
  // Transcendence picker: the option awaiting the two-step confirm (null = nothing armed).
  const [pickT, setPickT] = useState<string | null>(null);
  const row = geneArchiveRows(save).find((r) => r.def.id === id);
  if (!row) return null;
  const { def } = row;
  const aff = affectsOf(row.subject);
  const rc = geneRarityColor(def.rarity);
  const buy = (): void => { if (meta.upgradeGene(id)) audio.cue('draft'); };
  const doTranscend = (): void => {
    if (pickT && meta.transcendGene(id, pickT)) { audio.cue('jackpot'); setPickT(null); }
  };
  return (
    <Popup>
    <div className="cmp-overlay" onClick={onClose}>
      <div className="ga-box" onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: rc, ['--acc' as string]: aff.color }}>
        <button className="id-close" onClick={onClose} title="Close">✕</button>

        <div className="ga-head">
          <div className="ga-art"><GeneCardArt id={def.id} accent={aff.color} rarity={def.rarity} size={128} /></div>
          <div className="ga-head-info">
            <div className="ga-title" style={{ color: rc }}>{def.name}</div>
            <div className="ga-sub">
              <span style={{ color: rc }}>{def.rarity.toUpperCase()}</span> · {CARD_CATEGORY_LABEL[def.category]} ·{' '}
              <span style={{ color: aff.color }}>{aff.label}</span>
            </div>
            <div className="ga-lvl">Level <b style={{ color: rc }}>{row.level}</b> / {row.maxLevel} {levelPips(row.level, row.maxLevel, rc)}</div>
            <div className="ga-powline" title="This card's PERMANENT contribution to your Power Score">
              Power contribution: <b>{row.powerMult > 1 ? `+${((row.powerMult - 1) * 100).toFixed(1)}%` : '— (level a card to add permanent Power)'}</b>
            </div>
            {!row.owned && <div className="ga-owned-note">UNDISCOVERED — draft this card in any run to add it to your Archive.</div>}
          </div>
        </div>

        {/* Current effects: the base card + every purchased level (the upgrade history). */}
        <div className="ga-section">
          <div className="ga-sec-title">Current effects</div>
          <div className="ga-effect ga-base"><span className="ga-effect-tag">BASE</span>{def.description}</div>
          {row.historyNotes.length > 0 ? (
            row.historyNotes.map((n, i) => (
              <div className="ga-effect is-owned" key={i}><span className="ga-effect-tag" style={{ color: rc }}>L{i + 1}</span>{n}</div>
            ))
          ) : (
            <div className="ga-hint">No permanent levels yet — upgrades below apply every time this card is drafted.</div>
          )}
          {row.transcend && (
            <div className="ga-effect is-owned is-tr">
              <span className="ga-effect-tag ga-tr-tag">❂</span>
              <span className="ga-effect-body"><b>{row.transcend.label}</b> — {row.transcend.effects.map(fmtTranscendEffect).join(' · ')}</span>
            </div>
          )}
        </div>

        {/* Future upgrades: cost + campaign gate per level (requirements always SHOWN). */}
        {row.futureNotes.length > 0 && (
          <div className="ga-section">
            <div className="ga-sec-title">Future upgrades</div>
            {row.futureNotes.map((f) => (
              <div className={`ga-effect is-future${f.gateMet ? '' : ' is-gated'}`} key={f.level}>
                <span className="ga-effect-tag">L{f.level}</span>
                <span className="ga-effect-body">{f.note}</span>
                <span className="ga-effect-cost">
                  {!f.gateMet && <span className="ga-gate" title={`Unlocks globally at Campaign Stage ${f.gateStage}`}>🔒 Stage {f.gateStage}</span>}
                  <CurrencyIcon id="geneEssence" size={11} title="" /> {f.cost.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* TRANSCENDENCE (docs/GENE-EVOLUTION.md §Transcendence) — the late-game Essence sink.
            Locked (with the requirement SHOWN) until max level; then a curated option picker adds a
            permanent SECOND effect line. Choosing is permanent — re-choosing pays full price again. */}
        {row.owned && row.transcendOptions.length > 0 && (
          <div className={`ga-section ga-transcend${row.transcend ? ' is-done' : ''}`}>
            <div className="ga-sec-title ga-tr-title">❂ Transcendence</div>
            {row.level < row.maxLevel ? (
              <div className="ga-hint ga-tr-locked">
                🔒 Reach <b>Level {row.maxLevel}</b> to unlock — Transcendence grafts a permanent <b>second effect line</b> of
                your choosing onto this card (<CurrencyIcon id="geneEssence" size={11} title="" /> {row.transcendCost.toLocaleString()}).
              </div>
            ) : (
              <>
                {!row.transcend && (
                  <div className="ga-hint">
                    This card has reached its final level. Spend <b><CurrencyIcon id="geneEssence" size={11} title="" /> {row.transcendCost.toLocaleString()}</b> to
                    graft a permanent second effect line — choose wisely: re-choosing later costs the full price again.
                  </div>
                )}
                <div className="ga-tr-options">
                  {row.transcendOptions.map((o) => {
                    const chosen = row.transcend?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        className={`ga-tr-opt${chosen ? ' is-chosen' : ''}${pickT === o.id ? ' is-picked' : ''}`}
                        disabled={chosen}
                        onClick={() => setPickT(pickT === o.id ? null : o.id)}
                        title={chosen ? 'Your chosen line' : `Preview ${o.label}`}
                      >
                        <span className="ga-tr-opt-name">{chosen ? '❂ ' : ''}{o.label}</span>
                        <span className="ga-tr-opt-fx">{o.effects.map(fmtTranscendEffect).join(' · ')}</span>
                        {chosen && <span className="ga-tr-opt-tag">CHOSEN</span>}
                      </button>
                    );
                  })}
                </div>
                {pickT && (() => {
                  const opt = row.transcendOptions.find((o) => o.id === pickT);
                  if (!opt) return null;
                  const afford = save.geneEssence >= row.transcendCost;
                  return (
                    <div className="ga-tr-confirm">
                      <div className="ga-tr-confirm-copy">
                        {row.transcend
                          ? <>Replace <b>{row.transcend.label}</b> with <b>{opt.label}</b>? This costs the <b>full price</b> — the old line is gone for good.</>
                          : <><b>{opt.label}</b> becomes this card's permanent second line. This choice is <b>permanent</b> — picking a different line later costs the full price again.</>}
                      </div>
                      <div className="ga-tr-confirm-row">
                        <button className="ga-tr-cancel" onClick={() => setPickT(null)}>Cancel</button>
                        <button
                          className="primary ga-tr-go"
                          disabled={!afford}
                          onClick={doTranscend}
                          title={afford ? undefined : 'Not enough Gene Essence'}
                        >
                          {row.transcend ? 'Re-Transcend' : 'Transcend'} · <CurrencyIcon id="geneEssence" size={13} title="" /> {row.transcendCost.toLocaleString()}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Upgrade preview: the ACCOUNT Power this level adds — computed with the real Power model. */}
        {row.upgradeable && (() => {
          const cur = meta.power().score;
          const next = meta.previewPower((s) => ({
            ...s, genes: { ...s.genes, [id]: { ...(s.genes[id] ?? { level: 0 }), level: row.level + 1 } },
          })).score;
          return (
            <div className="ga-preview" title="Account Power Score after this upgrade">
              Power <b>{cur.toLocaleString()}</b> → <b className="ga-preview-next">{next.toLocaleString()}</b>
              <span className="ga-preview-delta">+{Math.max(0, next - cur).toLocaleString()}</span>
            </div>
          );
        })()}

        <div className="ga-actions">
          <span className="ga-wallet" title="Gene Essence"><CurrencyIcon id="geneEssence" size={14} title="" /> {save.geneEssence.toLocaleString()}</span>
          {row.nextCost === null ? (
            <span className="ga-maxed big">{row.transcend ? '❂ TRANSCENDED' : 'FULLY EVOLVED'}</span>
          ) : (
            <button
              className={`primary ga-buy${row.upgradeable ? ' is-ready' : ''}`}
              disabled={!row.upgradeable}
              onClick={buy}
              title={!row.owned ? 'Draft this card in a run first' : !row.gateMet ? `Requires Campaign Stage ${row.gateStage}` : !row.canAfford ? 'Not enough Gene Essence' : undefined}
            >
              {!row.owned ? 'Undiscovered' : !row.gateMet ? `🔒 Campaign Stage ${row.gateStage}` : (
                <>Upgrade to L{row.level + 1} · <CurrencyIcon id="geneEssence" size={13} title="" /> {row.nextCost.toLocaleString()}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
    </Popup>
  );
}

/** The Starting Gene Loadout bar (docs/GENE-EVOLUTION.md §Loadouts): five slot chips — equipped
 *  (art + name; click to select for swap, ✕ to clear), empty ("+ Equip" arms pick-a-card-below),
 *  locked (requirements ALWAYS displayed; an Unlock button once both gates are met). Equipped genes
 *  auto-activate when every run begins. */
function LoadoutBar({ equipMode, onArmSlot }: { equipMode: number | null; onArmSlot: (i: number | null) => void }): JSX.Element {
  const save = meta.use();
  const slots = save.geneSlots;
  const stage = highestCampaignStage(save);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const clickFilled = (i: number): void => {
    if (swapFrom === null) { setSwapFrom(i); return; } // select for rearrange
    if (swapFrom !== i) meta.swapGeneSlots(swapFrom, i);
    setSwapFrom(null);
  };
  return (
    <div className="gl-bar" data-guide="gene-loadout">
      <span className="gl-k" title="Equipped genes auto-activate at the start of EVERY run">STARTING GENES</span>
      {GENE_LOADOUT_SLOTS.map((def, i) => {
        const unlocked = i < slots;
        const id = save.geneLoadout[i];
        const card = id ? cardRegistry.get(id) : undefined;
        if (!unlocked) {
          const canBuy = i === slots && stage >= def.campaignStage && save.shards >= def.coreCost;
          return (
            <div className="gl-slot is-locked" key={def.slot} title={`Slot ${def.slot} — requires Campaign Stage ${def.campaignStage} AND ${def.coreCost} Genome Cores`}>
              <span className="gl-lock">🔒</span>
              <span className="gl-req">Stage {def.campaignStage} · <CurrencyIcon id="genomeCores" size={10} title="" /> {def.coreCost.toLocaleString()}</span>
              {canBuy && <button className="gl-buy" onClick={() => { if (meta.buyGeneSlot()) audio.cue('draft'); }}>Unlock</button>}
            </div>
          );
        }
        if (card) {
          const aff = affectsOf(cardSubject(card));
          return (
            <div className={`gl-slot is-filled${swapFrom === i ? ' is-swapping' : ''}`} key={def.slot} style={{ ['--rc' as string]: geneRarityColor(card.rarity) }}>
              <button className="gl-card" onClick={() => clickFilled(i)} title={swapFrom === null ? `${card.name} — click, then click another slot to rearrange` : 'Click a slot to swap into'}>
                <GeneCardArt id={card.id} accent={aff.color} rarity={card.rarity} size={34} />
                <span className="gl-name">{card.name}</span>
              </button>
              <button className="gl-x" title="Unequip" onClick={() => { meta.setGeneSlot(i, null); setSwapFrom(null); }}>✕</button>
            </div>
          );
        }
        return (
          <button
            key={def.slot}
            className={`gl-slot is-empty${equipMode === i ? ' is-arming' : ''}`}
            onClick={() => onArmSlot(equipMode === i ? null : i)}
            title="Equip a gene — click, then pick an owned card below"
          >
            {equipMode === i ? 'pick a card below…' : '+ Equip'}
          </button>
        );
      })}
    </div>
  );
}

// ── Search / filter / sort (Task 8) — pure derivations over the read-model rows, so they scale to
//    hundreds of cards with no UI change. Pinned rows ALWAYS lead; favorites lead the rest. ──
type GeneFilter = 'all' | 'tower' | 'hero' | 'global' | 'owned' | 'unowned' | 'upgradeable' | 'gated' | 'favorites';
const FILTERS: { key: GeneFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'tower', label: 'Towers' }, { key: 'hero', label: 'Hero' },
  { key: 'global', label: 'Global' }, { key: 'owned', label: 'Owned' }, { key: 'unowned', label: 'Unowned' },
  { key: 'upgradeable', label: '▲ Upgradeable now' }, { key: 'gated', label: '🔒 Future unlock' },
  { key: 'favorites', label: '★ Favorites' },
];
type GeneSort = 'default' | 'power' | 'lowLevel' | 'alpha' | 'recentAcquired' | 'recentImproved';
const SORTS: { key: GeneSort; label: string }[] = [
  { key: 'default', label: 'Default' }, { key: 'power', label: 'Highest Power' },
  { key: 'lowLevel', label: 'Lowest Level' }, { key: 'alpha', label: 'Alphabetical' },
  { key: 'recentAcquired', label: 'Recently acquired' }, { key: 'recentImproved', label: 'Recently improved' },
];

// ── Folder view — rows AUTO-FILE by their subject: one folder per tower (registry-driven,
//    so new towers grow folders for free), plus Hero / Global / Economy / Hive. Search,
//    filters and sort still apply INSIDE folders; folders with no matches hide; the
//    'Full list' toggle restores the flat grid.
function folderKey(r: GeneArchiveRow): string {
  return r.subject.kind === 'tower' ? `t:${r.subject.tower}` : r.subject.kind;
}
const FOLDER_META: Record<string, { label: string; color: string }> = {
  hero: { label: 'Hero Genes', color: '#ffb84d' },
  global: { label: 'Global Genes', color: '#9ecbff' },
  economy: { label: 'Economy Genes', color: '#b6e84a' },
  hive: { label: 'Hive Genes', color: '#ff7a90' },
};
function folderMeta(key: string): { label: string; color: string } {
  if (key.startsWith('t:')) {
    const k = key.slice(2) as TowerKind;
    return { label: TOWER_DEFS[k]?.name ?? k, color: TOWER_DEFS[k]?.color ?? 'inherit' };
  }
  return FOLDER_META[key] ?? { label: key, color: 'inherit' };
}
/** Stable folder order: towers in roster order, then the account-wide folders. */
const FOLDER_ORDER: string[] = [...TOWER_ORDER.map((k) => `t:${k}`), 'hero', 'global', 'economy', 'hive'];

function matchesFilter(r: GeneArchiveRow, f: GeneFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'tower': return r.subject.kind === 'tower';
    case 'hero': return r.subject.kind === 'hero';
    case 'global': return r.subject.kind === 'global' || r.subject.kind === 'economy' || r.subject.kind === 'hive';
    case 'owned': return r.owned;
    case 'unowned': return !r.owned;
    case 'upgradeable': return r.upgradeable;
    case 'gated': return r.owned && r.nextCost !== null && !r.gateMet; // next level exists but is campaign-locked
    case 'favorites': return r.favorite;
  }
}

function sortRows(rows: GeneArchiveRow[], sort: GeneSort): GeneArchiveRow[] {
  const cmp = (a: GeneArchiveRow, b: GeneArchiveRow): number => {
    switch (sort) {
      case 'power': return b.powerMult - a.powerMult;
      case 'lowLevel': return a.level - b.level || a.def.name.localeCompare(b.def.name);
      case 'alpha': return a.def.name.localeCompare(b.def.name);
      case 'recentAcquired': return (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0);
      case 'recentImproved': return (b.upgradedAt ?? 0) - (a.upgradedAt ?? 0);
      default: return 0; // registry order (stable)
    }
  };
  return rows.slice().sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || cmp(a, b));
}

export function GeneArchive(): JSX.Element {
  const save = meta.use();
  const rows = geneArchiveRows(save);
  const sum = geneArchiveSummary(save, rows);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [equipSlot, setEquipSlot] = useState<number | null>(null); // armed slot: the next tile click equips
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GeneFilter>('all');
  const [sort, setSort] = useState<GeneSort>('default');
  // Folder view is the default at this catalog size; searching always flattens (a search
  // result split across collapsed folders would hide its own hits).
  const [view, setView] = useState<'folders' | 'all'>('folders');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      matchesFilter(r, filter) &&
      (q === '' || r.def.name.toLowerCase().includes(q) || r.def.description.toLowerCase().includes(q)));
    return sortRows(filtered, sort);
  }, [rows, query, filter, sort]);

  const flat = view === 'all' || query.trim() !== '';
  const grouped = useMemo(() => {
    const m = new Map<string, GeneArchiveRow[]>();
    for (const r of shown) {
      const k = folderKey(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  }, [shown]);

  // Equip mode: an armed empty slot captures the next OWNED tile click (unowned refuse).
  const openTile = (r: GeneArchiveRow): void => {
    if (equipSlot !== null) {
      if (r.owned && meta.setGeneSlot(equipSlot, r.def.id)) { audio.cue('draft'); setEquipSlot(null); }
      return;
    }
    setInspectId(r.def.id);
  };

  // Keyboard (and spatial-nav controller) navigation: arrows move focus across the tile grid,
  // Enter/Space activates (native button behavior), Escape backs out of equip mode.
  const onGridKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { setEquipSlot(null); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    // Tiles resolve from the grid that received the event — works in the flat view AND
    // inside any folder's grid.
    const tiles = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.ga-tile'));
    const idx = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0 || tiles.length === 0) return;
    e.preventDefault();
    // Column count from layout (tiles per visual row) — resilient to any grid width.
    let cols = 1;
    while (cols < tiles.length && tiles[cols].offsetTop === tiles[0].offsetTop) cols++;
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
    tiles[Math.max(0, Math.min(tiles.length - 1, idx + delta))]?.focus();
  };

  return (
    <div className="panel ga-panel">
      <div className="panel-title">
        Gene Archive
        <span className="ga-wallet" title="Gene Essence — earned from duplicate max-Star shards + rare container drops">
          <CurrencyIcon id="geneEssence" size={14} title="" /> {sum.essence.toLocaleString()}
        </span>
      </div>
      <div className="panel-sub">
        Your permanent Gene Card collection — {sum.owned}/{sum.total} discovered · {sum.levels}/{sum.maxLevels} levels evolved{sum.transcended > 0 ? <> · <span className="ga-transcended">❂ {sum.transcended} transcended</span></> : ''}.
        Spend Gene Essence to permanently upgrade a card; it applies every time you draft it.
      </div>
      <BestBuyStrip surface="genes" />

      {/* In-place help (Task 11) — the whole loop in five lines, one tap away. */}
      <details className="ga-help">
        <summary>How the Gene system works</summary>
        <ul>
          <li><b>Collect</b> — draft a Gene Card in any run and it joins this Archive forever.</li>
          <li><b>Gene Essence</b> — earned mainly by duplicate shards once a tower/hero is max Star, plus rare Bio-Container drops.</li>
          <li><b>Upgrade</b> — each card has 3–5 permanent levels; every level adds real new effects and raises your Power Score immediately.</li>
          <li><b>Campaign gates</b> — deeper levels unlock globally: L2 at Stage 15, L3 at 30, L4 at 50, L5 at 75.</li>
          <li><b>Starting Genes</b> — equip up to five cards above; they auto-activate at their level when every run begins. <i>Card Ascension arrives in a future update.</i></li>
          <li><b>❂ Transcendence</b> — a card at max level can spend a large sum of Essence on a permanent <i>second effect line</i>, chosen from its family's pool. Permanent — re-choosing costs full price.</li>
        </ul>
      </details>

      {/* Starting Gene Loadout — equipped genes auto-activate when every run begins. */}
      <LoadoutBar equipMode={equipSlot} onArmSlot={setEquipSlot} />

      {/* The campaign gate ladder — what's unlocked and what to work toward, always visible. */}
      <div className="ga-gates">
        <span className="ga-gates-k">Gene levels unlocked: <b>L{sum.levelCap}</b></span>
        {sum.nextGate && (
          <span className="ga-gates-next">
            NEXT · <b>L{sum.nextGate.level}</b> unlocks at <b>Campaign Stage {sum.nextGate.stage}</b> (you're at {sum.campaignStage})
          </span>
        )}
        {sum.upgradeable > 0 && <span className="ga-gates-up">▲ {sum.upgradeable} upgrade{sum.upgradeable > 1 ? 's' : ''} available</span>}
      </div>

      {/* Search · filter · sort (Task 8) — pinned always lead, favorites next. */}
      <div className="ga-controls">
        <input
          className="ga-search"
          type="search"
          placeholder="Search genes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search gene cards"
        />
        <div className="ga-chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={`ga-chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <label className="ga-sort">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as GeneSort)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <div className="ga-view" role="group" aria-label="Archive view">
          <button className={`ga-chip${!flat ? ' on' : ''}`} onClick={() => setView('folders')} disabled={query.trim() !== ''} title={query.trim() !== '' ? 'Search shows a flat list' : undefined}>▤ Folders</button>
          <button className={`ga-chip${flat ? ' on' : ''}`} onClick={() => setView('all')}>☰ Full list</button>
        </div>
      </div>

      {shown.length === 0 && <div className="ga-hint">No genes match — clear the search or filters.</div>}
      {flat ? (
        <div className={`ga-grid${equipSlot !== null ? ' is-equipping' : ''}`} onKeyDown={onGridKeyDown}>
          {shown.map((r) => <GeneTile key={r.def.id} row={r} onOpen={() => openTile(r)} />)}
        </div>
      ) : (
        <div className="ga-folders">
          {FOLDER_ORDER.map((key) => {
            const list = grouped.get(key);
            if (!list || list.length === 0) return null;
            const fm = folderMeta(key);
            const ups = list.reduce((n, r) => n + (r.upgradeable ? 1 : 0), 0);
            // A folder with an upgrade ready starts open — the ▲ is why the player came.
            const isOpen = openFolders[key] ?? ups > 0;
            const owned = list.reduce((n, r) => n + (r.owned ? 1 : 0), 0);
            return (
              <div className={`ga-folder${isOpen ? ' is-open' : ''}`} key={key}>
                <button
                  className="ga-folder-h"
                  onClick={() => setOpenFolders((o) => ({ ...o, [key]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  <span className="ga-folder-arrow" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                  <span className="ga-folder-name" style={{ color: fm.color }}>{fm.label}</span>
                  <span className="ga-folder-count">{owned}/{list.length}</span>
                  {ups > 0 && <span className="ga-folder-up">▲ {ups}</span>}
                </button>
                {isOpen && (
                  <div className={`ga-grid${equipSlot !== null ? ' is-equipping' : ''}`} onKeyDown={onGridKeyDown}>
                    {list.map((r) => <GeneTile key={r.def.id} row={r} onOpen={() => openTile(r)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inspectId && <GeneInspect id={inspectId} onClose={() => setInspectId(null)} />}
    </div>
  );
}
