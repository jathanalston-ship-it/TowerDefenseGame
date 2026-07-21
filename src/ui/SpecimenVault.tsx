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
import { telemetry } from '../net/telemetry';
import {
  cosmeticBonus, cosmeticFamily, sourceLabel, WARDROBE_GROUP_LABEL, WARDROBE_LANE_INFO,
  WARDROBE_RARITY_COLOR, wardrobeKind, wardrobeRegistry,
} from '../core/wardrobe';
import type { CosmeticAvailability, CosmeticEra, CosmeticInstance, WardrobeGroup, WardrobeItemDef } from '../core/wardrobe';
import type { CollectorView, PremiumReceiptLine } from '../state/meta';
import { Detail } from './components/Detail';
import { Popup } from './components/Popup';

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

function RowCard({ row, onClaim, onInspect }: { row: VaultRow; onClaim: (uid: string) => void; onInspect: (id: string) => void }): JSX.Element {
  const { def, instances, claimed } = row;
  const kind = wardrobeKind(def.kind);
  const bonus = bonusLine(def);
  const fav = meta.get().wardrobe.favorites.includes(def.id);
  return (
    <article
      className={`sv-card${claimed ? ' is-claimed' : ''}`}
      style={{ ['--svr' as string]: WARDROBE_RARITY_COLOR[def.rarity] }}
      title={`${def.name} — collector record`}
      onClick={() => { audio.cue('ui'); onInspect(def.id); }}
    >
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
            onClick={(e) => { e.stopPropagation(); audio.cue('ui'); meta.toggleWardrobeFavorite(def.id); }}
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
          <button className="primary act-claim sv-claim" onClick={(e) => { e.stopPropagation(); onClaim(instances[0].uid); }}>
            ✓ Claim
          </button>
        )}
      </footer>
    </article>
  );
}

const AVAILABILITY_LABEL: Record<CosmeticAvailability, string> = {
  available: 'In circulation — still earnable',
  limited: 'Limited distribution window',
  retired: 'Retired from circulation',
  reissued: 'Reissued — back in circulation',
};

/** "July 2026" from the era's version tag (v2026.07); year alone when the tag has no month. */
function introducedLabel(era: CosmeticEra): string {
  const m = /\.(\d{1,2})$/.exec(era.version);
  if (!m) return String(era.year);
  const month = Math.min(12, Math.max(1, parseInt(m[1], 10)));
  return `${new Date(Date.UTC(era.year, month - 1, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' })} ${era.year}`;
}

/** The museum page (docs/COSMETICS.md §provenance) — every row derived from
 *  meta.collectorView; the census/market rows stay HONEST placeholders until the Auction
 *  House feeds the network seams. Finite entrance only (INFO-HIERARCHY: zero ambient
 *  animators — the rarity lighting is static). */
function CollectorPanel({ view, claimUid, onClaim, onClose }: {
  view: CollectorView; claimUid: string | null; onClaim: (uid: string) => void; onClose: () => void;
}): JSX.Element {
  const { def } = view;
  const kind = wardrobeKind(def.kind);
  const bonus = bonusLine(def);
  const censusRows: [string, string][] = view.census
    ? [
        ['Copies claimed (network)', view.census.claimed.toLocaleString()],
        ['Still tradable (network)', view.census.tradable.toLocaleString()],
      ]
    : [['Network census', '— awaiting network census']];
  const marketRow: [string, string] = view.market
    ? ['Auction record', `${view.market.sales.toLocaleString()} sales · last ${view.market.last.toLocaleString()} Ichor`]
    : ['Auction record', '— awaiting market data'];
  const rows: [string, string][] = [
    ['Released during', `${view.era.label} · ${view.era.year}`],
    ['First introduced', introducedLabel(view.era)],
    ['Originally earned by', sourceLabel(def.source)],
    ['Availability', AVAILABILITY_LABEL[view.availability]],
    ['Currently owned by', view.claimed ? 'This account — bound' : 'This account — unclaimed'],
    ...censusRows,
    marketRow,
    ['Collection status', view.claimed ? 'Claimed — counted in your collection' : 'Unclaimed — claim to collect'],
    ['Auction eligible', view.copiesHeld > 0 ? `Yes — ${view.copiesHeld} tradable ${view.copiesHeld === 1 ? 'copy' : 'copies'}` : 'No — bound'],
  ];
  return (
    <div className="sv-cp" role="dialog" aria-label={`${def.name} — collector record`} onClick={onClose}>
      <div className="sv-cp-card" style={{ ['--svr' as string]: WARDROBE_RARITY_COLOR[def.rarity] }} onClick={(e) => e.stopPropagation()}>
        <button className="sv-cp-x" aria-label="Close" onClick={onClose}>✕</button>
        <header className="sv-cp-head">
          <span className="sv-cp-glyph" aria-hidden>{def.payload.glyph ?? kind.icon}</span>
          <b className="sv-cp-name">{def.name}</b>
          <span className="sv-cp-sub">{def.rarity.toUpperCase()} · {kind.name} · {view.family}</span>
          {view.badges.length > 0 && (
            <span className="sv-cp-badges">
              {view.badges.map((b) => <em key={b.id} className="sv-cp-badge" title={b.desc}><i aria-hidden>{b.glyph}</i>{b.label}</em>)}
            </span>
          )}
        </header>
        {view.lore && (
          <blockquote className="sv-cp-lore">
            <span className="sv-cp-lore-k">HIVE ARCHIVES</span>
            <p>{view.lore}</p>
          </blockquote>
        )}
        <dl className="sv-cp-rows">
          {rows.map(([k, v]) => <div key={k} className="sv-cp-row"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {bonus && <p className="sv-cp-bonus">{bonus} — {view.claimed ? 'active' : 'activates on claim'}</p>}
        {view.stamp && (
          <p className="sv-cp-copy">
            Your copy: acquired {view.stamp.at > 0 ? new Date(view.stamp.at).toLocaleDateString() : 'before the ledger'} · {view.stamp.source}
            {view.stamp.season > 0 ? ` · Season ${view.stamp.season}` : ''} · {view.stamp.transfers === 0
              ? 'original owner'
              : `${view.stamp.transfers} prior transfer${view.stamp.transfers === 1 ? '' : 's'}`}
          </p>
        )}
        {!view.claimed && claimUid && (
          <button className="primary act-claim sv-cp-claim" onClick={() => onClaim(claimUid)}>✓ Claim</button>
        )}
        <footer className="sv-cp-fam">
          <span>{view.family}</span>
          <span className="sv-cp-fam-bar" aria-hidden>
            <i style={{ width: `${view.familyTotal > 0 ? Math.round((view.familyClaimed / view.familyTotal) * 100) : 0}%` }} />
          </span>
          <span className="sv-cp-fam-n">{view.familyClaimed}/{view.familyTotal} bound</span>
        </footer>
      </div>
    </div>
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
  const [inspect, setInspect] = useState<string | null>(null);

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
    if (lines && def) {
      audio.cue('chest');
      telemetry.emit('cos_claim', { d: def.id }); // the future network census counts these
      setCere({ def, lines });
    }
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
        <div className="sv-grid" data-guide="sv-grid">
          {shown.slice(0, SHOW_CAP).map((r) => <RowCard key={r.def.id} row={r} onClaim={claim} onInspect={setInspect} />)}
        </div>
      )}
      {shown.length > SHOW_CAP && <p className="sv-more">{shown.length - SHOW_CAP} more — narrow the filters.</p>}

      {(() => {
        // The museum page recomputes live from the store — a claim while it is open flips
        // its ownership/family rows in place (meta.use() re-renders on persist). Rendered
        // through the Popup portal: the screen-transition transform would otherwise make
        // the screen the fixed-position containing block (see components/Popup.tsx).
        const view = inspect ? meta.collectorView(inspect) : null;
        if (!view) return null;
        const claimUid = save.wardrobe.inventory.find((i) => i.item === inspect)?.uid ?? null;
        return <Popup><CollectorPanel view={view} claimUid={claimUid} onClaim={claim} onClose={() => setInspect(null)} /></Popup>;
      })()}
      {cere && <Popup><ClaimCeremony def={cere.def} lines={cere.lines} onDone={() => setCere(null)} /></Popup>}
    </div>
  );
}
