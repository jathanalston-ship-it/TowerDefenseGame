// SPECIMEN VAULT — the cosmetic ownership surface (v53, docs/COSMETICS.md §claiming).
// Every cosmetic the account receives lands HERE first as an UNCLAIMED instance: tradable,
// auction-eligible stock that grants nothing. The screen's one decision is CLAIM — the
// irreversible account-bind that unlocks equipping, counts the collection codex, and
// activates the piece's small permanent bonus (meta.claimCosmetic → assimilation ceremony).
//
// Cognitive-load contract (docs/INFO-HIERARCHY.md): ZERO ambient animators — the ceremony
// overlay's finite entrance is the only motion. Filters/search/sort are the Archive pattern;
// the grid renders a bounded window (thousands-scale safe: narrow, don't virtualize).

import { useMemo, useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import {
  cosmeticBonus, cosmeticFamily, WARDROBE_GROUP_LABEL, WARDROBE_LANE_INFO,
  WARDROBE_RARITY_COLOR, wardrobeKind, wardrobeRegistry,
} from '../core/wardrobe';
import type { CosmeticInstance, WardrobeGroup, WardrobeItemDef } from '../core/wardrobe';
import type { PremiumReceiptLine } from '../state/meta';
import { Detail } from './components/Detail';

interface VaultRow {
  def: WardrobeItemDef;
  instances: CosmeticInstance[]; // unclaimed copies (dupes included), newest first
  claimed: boolean;
  newest: number; // newest acquisition ms (sort: recent)
}

type StateFilter = 'unclaimed' | 'claimed' | 'all';
type SortKey = 'recent' | 'rarity' | 'name' | 'dupes';
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;
const SHOW_CAP = 240; // render window — beyond this, ask for a narrower filter

function bonusLine(def: WardrobeItemDef): string | null {
  const b = cosmeticBonus(def);
  if (!b) return null;
  const info = WARDROBE_LANE_INFO[b.lane];
  return `+${parseFloat((b.value * 100).toFixed(2))}% ${info.label}`;
}

function RowCard({ row, onClaim }: { row: VaultRow; onClaim: (uid: string) => void }): JSX.Element {
  const { def, instances, claimed } = row;
  const kind = wardrobeKind(def.kind);
  const bonus = bonusLine(def);
  const fav = meta.get().wardrobe.favorites.includes(def.id);
  return (
    <article className={`sv-card${claimed ? ' is-claimed' : ''}`} style={{ ['--svr' as string]: WARDROBE_RARITY_COLOR[def.rarity] }}>
      <header className="sv-top">
        <span className="sv-glyph" aria-hidden>{def.payload.glyph ?? kind.icon}</span>
        <span className="sv-title">
          <b className="sv-name">{def.name}</b>
          <span className="sv-kind">{kind.name} · {cosmeticFamily(def)}</span>
        </span>
        {claimed && (
          <button
            className={`sv-fav${fav ? ' is-on' : ''}`}
            title={fav ? 'Unfavorite' : 'Favorite'}
            aria-label={fav ? 'Unfavorite' : 'Favorite'}
            onClick={() => { audio.cue('ui'); meta.toggleWardrobeFavorite(def.id); }}
          >
            {fav ? '★' : '☆'}
          </button>
        )}
      </header>
      <p className="sv-desc">{def.desc}</p>
      <footer className="sv-foot">
        <span className="sv-state">
          {claimed
            ? <em className="sv-bound">BOUND ✓</em>
            : <em className="sv-trade">{instances.length > 1 ? `×${instances.length} · ` : ''}TRADABLE</em>}
          {claimed && instances.length > 0 && <em className="sv-trade">+{instances.length} spare</em>}
        </span>
        {bonus && <span className="sv-bonus" title="Permanent account bonus, activated by claiming">{bonus}{claimed ? ' — active' : ''}</span>}
        {!claimed && instances.length > 0 && (
          <button className="primary act-claim sv-claim" onClick={() => onClaim(instances[0].uid)}>
            ✓ Claim
          </button>
        )}
      </footer>
    </article>
  );
}

/** The assimilation ceremony — a finite overlay played once per claim. */
function ClaimCeremony({ def, lines, onDone }: { def: WardrobeItemDef; lines: PremiumReceiptLine[]; onDone: () => void }): JSX.Element {
  return (
    <div className="sv-cere" role="dialog" aria-label="Assimilation" onClick={onDone}>
      <div className="sv-cere-card" style={{ ['--svr' as string]: WARDROBE_RARITY_COLOR[def.rarity] }} onClick={(e) => e.stopPropagation()}>
        <span className="sv-cere-k">◈ ASSIMILATED ◈</span>
        <span className="sv-cere-glyph" aria-hidden>{def.payload.glyph ?? wardrobeKind(def.kind).icon}</span>
        <b className="sv-cere-name">{def.name}</b>
        <span className="sv-cere-rarity">{def.rarity.toUpperCase()} · {cosmeticFamily(def)}</span>
        <div className="sv-cere-lines">
          {lines.map((l, i) => <span key={i} className="sv-cere-line"><em aria-hidden>{l.icon}</em> {l.label}</span>)}
        </div>
        <button className="primary sv-cere-go" onClick={onDone}>Woven in</button>
      </div>
    </div>
  );
}

export function SpecimenVault(): JSX.Element {
  const save = meta.use();
  const [state, setState] = useState<StateFilter>('unclaimed');
  const [group, setGroup] = useState<WardrobeGroup | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [q, setQ] = useState('');
  const [cere, setCere] = useState<{ def: WardrobeItemDef; lines: PremiumReceiptLine[] } | null>(null);

  const rows = useMemo<VaultRow[]>(() => {
    const byItem = new Map<string, CosmeticInstance[]>();
    for (const inst of save.wardrobe.inventory) {
      (byItem.get(inst.item) ?? byItem.set(inst.item, []).get(inst.item)!).push(inst);
    }
    const owned = new Set(save.wardrobe.owned);
    const out: VaultRow[] = [];
    for (const def of wardrobeRegistry.all()) {
      const instances = (byItem.get(def.id) ?? []).slice().sort((a, b) => b.at - a.at);
      const claimed = owned.has(def.id);
      if (instances.length === 0 && !claimed) continue; // never delivered — the Wardrobe teases those
      out.push({ def, instances, claimed, newest: instances[0]?.at ?? 0 });
    }
    return out;
  }, [save.wardrobe.inventory, save.wardrobe.owned]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (state === 'unclaimed' && r.instances.length === 0) return false;
      if (state === 'claimed' && !r.claimed) return false;
      if (group !== 'all' && wardrobeKind(r.def.kind).group !== group) return false;
      if (needle && !`${r.def.name} ${cosmeticFamily(r.def)} ${wardrobeKind(r.def.kind).name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sort === 'recent') return b.newest - a.newest;
      if (sort === 'rarity') return RARITY_RANK[b.def.rarity] - RARITY_RANK[a.def.rarity];
      if (sort === 'dupes') return b.instances.length - a.instances.length;
      return a.def.name.localeCompare(b.def.name);
    });
    return filtered;
  }, [rows, state, group, sort, q]);

  const unclaimedItems = rows.filter((r) => r.instances.length > 0).length;
  const dupes = rows.reduce((a, r) => a + Math.max(0, r.instances.length - (r.claimed ? 0 : 1)), 0);

  const claim = (uid: string): void => {
    const inst = save.wardrobe.inventory.find((i) => i.uid === uid);
    const def = inst ? wardrobeRegistry.get(inst.item) : undefined;
    const lines = meta.claimCosmetic(uid);
    if (lines && def) { audio.cue('chest'); setCere({ def, lines }); }
  };

  return (
    <div className="screen sv-screen">
      <header className="screen-h">
        <h2>Specimen Vault</h2>
        <p className="screen-sub">
          Cosmetics arrive here unclaimed — tradable specimens. Claim one to bind it forever:
          equippable, collected, and paying its small permanent bonus. Or keep it liquid for
          the coming Auction House.
        </p>
      </header>

      <div className="sv-mast">
        <span className="sv-stat"><b>{unclaimedItems}</b> awaiting</span>
        <span className="sv-stat"><b>{save.wardrobe.owned.length}</b> bound</span>
        <span className="sv-stat"><b>{dupes}</b> spare{dupes === 1 ? '' : 's'}</span>
        <Detail summary="How claiming works">
          <p>
            UNCLAIMED specimens are auction-eligible stock: no bonus, no equipping, no codex.
            CLAIMING is irreversible — the piece binds to your account, joins Collections and
            the Wardrobe, and its bonus lane pays forever. Lanes saturate: early claims pay
            full value, a complete collection approaches each lane's cap. Duplicates of a
            bound piece stay tradable — claiming one is refused, never wasted.
          </p>
        </Detail>
      </div>

      <div className="sv-controls">
        <input
          className="sv-search" type="search" placeholder="Search specimens…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search specimens"
        />
        <div className="sv-chips" role="tablist" aria-label="Ownership filter">
          {(['unclaimed', 'claimed', 'all'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={state === s} className={`sv-chip${state === s ? ' is-on' : ''}`}
              onClick={() => { audio.cue('ui'); setState(s); }}>
              {s === 'unclaimed' ? 'Awaiting' : s === 'claimed' ? 'Bound' : 'All'}
            </button>
          ))}
        </div>
        <select className="sv-sel" value={group} onChange={(e) => setGroup(e.target.value as WardrobeGroup | 'all')} aria-label="Filter by group">
          <option value="all">Every surface</option>
          {(Object.keys(WARDROBE_GROUP_LABEL) as WardrobeGroup[]).map((g) => (
            <option key={g} value={g}>{WARDROBE_GROUP_LABEL[g]}</option>
          ))}
        </select>
        <select className="sv-sel" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="recent">Recently acquired</option>
          <option value="rarity">Rarity</option>
          <option value="name">Name</option>
          <option value="dupes">Duplicates</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="sv-empty">
          {state === 'unclaimed'
            ? 'No specimens waiting — everything you hold is bound. New drops land here first.'
            : 'Nothing matches this filter.'}
        </p>
      ) : (
        <div className="sv-grid">
          {shown.slice(0, SHOW_CAP).map((r) => <RowCard key={r.def.id} row={r} onClaim={claim} />)}
        </div>
      )}
      {shown.length > SHOW_CAP && <p className="sv-more">{shown.length - SHOW_CAP} more — narrow the filters.</p>}

      {cere && <ClaimCeremony def={cere.def} lines={cere.lines} onDone={() => setCere(null)} />}
    </div>
  );
}
