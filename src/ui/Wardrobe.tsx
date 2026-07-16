// THE WARDROBE (docs/COSMETICS.md §wardrobe) — the account cosmetics hub. Tabs: the unit
// Phenotype lab (unchanged, mounted whole), the four Wardrobe groups (Arena / Audio /
// Interface / Identity), the Ichor Boutique, and the Milestone track. Every card previews
// its payload (palette swatch / typography / frame / audible ▶), equips into its kind's
// slot, favorites, and shows its unlock source while locked. Search + filters + Randomize.
// Equipping is pure presentation — the dressing layer re-applies on every save change.

import { useEffect, useMemo, useState } from 'react';
import { meta } from '../state/meta';
import {
  boutiqueItems, sourceLabel, WARDROBE_GROUP_LABEL, WARDROBE_KINDS, WARDROBE_RARITY_COLOR,
  wardrobeItemsOf,
} from '../core/wardrobe';
import type { WardrobeGroup, WardrobeItemDef, WardrobeKindDef } from '../core/wardrobe';
import { PhenotypeLab } from './PhenotypeLab';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';

type Tab = 'skins' | WardrobeGroup | 'boutique' | 'milestones';
type OwnFilter = 'all' | 'owned' | 'locked' | 'new' | 'fav';

/** A representative audition cue per audio kind (the ▶ button's voice). */
const PREVIEW_CUE: Record<string, string> = {
  towerAudio: 'tfire_ting', enemyAudio: 'edie_squelch', heroVoice: 'ability', notifSound: 'achieve', waveTheme: 'wave',
};

function auditionItem(d: WardrobeItemDef): void {
  const tag = PREVIEW_CUE[d.kind];
  if (!tag || !d.payload.cue) return;
  // Ride the tag-variant grammar — the SAME path the equipped pack uses, no state touched.
  audio.cue(d.payload.cue === 'default' ? tag : `${tag}~${d.payload.cue}`);
}

/** The card's visual preview, styled by the kind's preview mode + the item payload. */
function ItemPreview({ d }: { d: WardrobeItemDef }): JSX.Element {
  const p = d.payload;
  const kind = WARDROBE_KINDS.find((k) => k.id === d.kind)!;
  if (kind.preview === 'text') {
    return (
      <div className="wd-prev wd-prev-text" style={{ background: p.bg ?? 'transparent' }}>
        <span style={{ color: p.accent ?? 'var(--ink)' }}>{p.glyph ?? p.text ?? d.name}</span>
      </div>
    );
  }
  if (kind.preview === 'frame') {
    return (
      <div className="wd-prev wd-prev-frame" style={{ borderColor: p.accent, background: p.bg ?? 'transparent' }}>
        <i style={{ background: p.accent }} />
      </div>
    );
  }
  if (kind.preview === 'music' || kind.preview === 'audio') {
    return (
      <div className="wd-prev wd-prev-audio" style={{ ['--wa' as string]: p.accent ?? 'var(--kinetic)' }}>
        <span className="wd-eq" aria-hidden><i /><i /><i /><i /></span>
      </div>
    );
  }
  // swatch / fx — a living gradient chip (fx preset drives the animation class)
  return (
    <div
      className={`wd-prev wd-prev-swatch${p.fx ? ` fx-${p.fx}` : ''}`}
      style={{ background: `radial-gradient(circle at 32% 30%, ${p.glow ?? p.accent}55, transparent 60%), linear-gradient(145deg, ${p.accent}, ${p.bg ?? '#0a0e15'})` }}
    />
  );
}

function ItemCard({ d, owned, equipped, fav, isNew }: {
  d: WardrobeItemDef; owned: boolean; equipped: boolean; fav: boolean; isNew: boolean;
}): JSX.Element {
  const rc = WARDROBE_RARITY_COLOR[d.rarity];
  const audible = PREVIEW_CUE[d.kind] !== undefined && d.payload.cue !== undefined;
  return (
    <div className={`wd-card${owned ? '' : ' is-locked'}${equipped ? ' is-on' : ''}`} style={{ ['--rc' as string]: rc }}>
      {isNew && <span className="wd-new" aria-label="Newly unlocked">NEW</span>}
      <ItemPreview d={d} />
      <div className="wd-card-body">
        <div className="wd-card-name">{d.name}</div>
        <div className="wd-card-desc">{d.desc}</div>
        {!owned && <div className="wd-card-src">{sourceLabel(d.source)}</div>}
      </div>
      <div className="wd-card-actions">
        {audible && (
          <button className="wd-mini" onClick={() => auditionItem(d)} title="Audition" aria-label={`Audition ${d.name}`}>▶</button>
        )}
        {owned && (
          <button
            className={`wd-mini${fav ? ' is-fav' : ''}`}
            onClick={() => { if (meta.toggleWardrobeFavorite(d.id)) audio.cue('ui'); }}
            title={fav ? 'Unfavorite' : 'Favorite'}
            aria-label={`Favorite ${d.name}`}
          >
            {fav ? '★' : '☆'}
          </button>
        )}
        {owned && (
          <button
            className={`wd-equip${equipped ? ' is-on' : ''}`}
            onClick={() => { if (meta.equipWardrobe(d.kind, equipped ? null : d.id)) audio.cue('ui'); }}
          >
            {equipped ? 'EQUIPPED ✓' : 'Equip'}
          </button>
        )}
        {!owned && d.source.kind === 'shop' && <BuyButton d={d} price={d.source.ichor} />}
      </div>
    </div>
  );
}

function BuyButton({ d, price }: { d: WardrobeItemDef; price: number }): JSX.Element {
  const save = meta.use();
  return (
    <button
      className="wd-buy shop-buy"
      disabled={save.ichor < price}
      onClick={() => { if (meta.buyWardrobeItem(d.id)) audio.cue('chest'); }}
    >
      <CurrencyIcon id="ichor" size={12} title="" /> {price}
    </button>
  );
}

function KindSection({ kind, filter, query }: { kind: WardrobeKindDef; filter: OwnFilter; query: string }): JSX.Element | null {
  const save = meta.use();
  const owned = new Set(save.wardrobe.owned);
  const favs = new Set(save.wardrobe.favorites);
  const seen = new Set(save.wardrobe.seen);
  const equipped = save.wardrobe.equipped[kind.id];
  const q = query.trim().toLowerCase();
  const items = wardrobeItemsOf(kind.id).filter((d) => {
    if (q && !d.name.toLowerCase().includes(q) && !kind.name.toLowerCase().includes(q)) return false;
    if (filter === 'owned') return owned.has(d.id);
    if (filter === 'locked') return !owned.has(d.id);
    if (filter === 'new') return owned.has(d.id) && !seen.has(d.id);
    if (filter === 'fav') return favs.has(d.id);
    return true;
  });
  if (items.length === 0) return null;
  const ownCount = wardrobeItemsOf(kind.id).filter((d) => owned.has(d.id)).length;
  return (
    <section className="wd-kind">
      <header className="wd-kind-h">
        <span className="wd-kind-icon" aria-hidden>{kind.icon}</span>
        <span className="wd-kind-name">{kind.name}</span>
        <span className="wd-kind-blurb">{kind.blurb}</span>
        <span className="wd-kind-count">{ownCount}/{wardrobeItemsOf(kind.id).length}</span>
        {equipped && (
          <button className="wd-clear" onClick={() => { if (meta.equipWardrobe(kind.id, null)) audio.cue('ui'); }}>
            Reset to classic
          </button>
        )}
      </header>
      <div className="wd-grid">
        {items.map((d) => (
          <ItemCard key={d.id} d={d} owned={owned.has(d.id)} equipped={equipped === d.id} fav={favs.has(d.id)} isNew={owned.has(d.id) && !seen.has(d.id)} />
        ))}
      </div>
    </section>
  );
}

function BoutiqueTab(): JSX.Element {
  const save = meta.use();
  const owned = new Set(save.wardrobe.owned);
  const items = boutiqueItems();
  return (
    <div className="wd-boutique">
      <p className="panel-sub">The black market's vanity wing — every piece stays in stock forever, priced in Ichor.</p>
      <div className="wd-grid">
        {items.map((d) => (
          <ItemCard key={d.id} d={d} owned={owned.has(d.id)} equipped={save.wardrobe.equipped[d.kind] === d.id} fav={save.wardrobe.favorites.includes(d.id)} isNew={owned.has(d.id) && !save.wardrobe.seen.includes(d.id)} />
        ))}
      </div>
    </div>
  );
}

function MilestonesTab(): JSX.Element {
  meta.use(); // re-render on claims
  const rows = meta.wardrobeMilestones();
  return (
    <div className="wd-miles">
      <p className="panel-sub">Codex ranks pay out here — Ichor, containers, cores, shards, and milestone-exclusive cosmetics. Cosmetic-first by design.</p>
      {rows.map(({ def, state, at }) => (
        <div className={`wd-mile is-${state}`} key={def.id}>
          <div className="wd-mile-body">
            <div className="wd-mile-name">{def.name}</div>
            <div className="wd-mile-desc">{def.desc} <span className="wd-mile-rank">rank {at}/{def.rank}</span></div>
          </div>
          <button
            className="wd-mile-claim"
            disabled={state !== 'claimable'}
            onClick={() => {
              const got = meta.claimWardrobeMilestone(def.id);
              // The receipt presents through the global claim popup (docs/NOTIFICATIONS.md
              // §claim-popups); milestone cosmetics keep their WardrobeReveal ceremony on top.
              if (got) {
                audio.cue('achieve');
              }
            }}
          >
            {state === 'claimed' ? 'CLAIMED ✓' : state === 'claimable' ? 'Claim' : 'Locked'}
          </button>
        </div>
      ))}
    </div>
  );
}

export function Wardrobe(): JSX.Element {
  const save = meta.use();
  const [tab, setTab] = useState<Tab>('skins');
  const [filter, setFilter] = useState<OwnFilter>('all');
  const [query, setQuery] = useState('');

  // Poll auto-unlocks when the Wardrobe opens (achievement-style), clear NEW badges on leave.
  useEffect(() => {
    meta.pollWardrobeUnlocks();
    return () => meta.markWardrobeSeen();
  }, []);

  const codex = meta.collection();
  const pct = (id: string): number => Math.round((codex.categories.find((c) => c.id === id)?.completion ?? 0) * 100);
  const newCount = useMemo(
    () => save.wardrobe.owned.filter((id) => !save.wardrobe.seen.includes(id)).length,
    [save.wardrobe.owned, save.wardrobe.seen],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'skins', label: 'Unit Skins' },
    { id: 'arena', label: 'Arena FX' },
    { id: 'audio', label: 'Audio' },
    { id: 'interface', label: 'Interface' },
    { id: 'identity', label: 'Identity' },
    { id: 'boutique', label: 'Boutique' },
    { id: 'milestones', label: 'Milestones' },
  ];

  return (
    <div className="panel wd-panel">
      <div className="panel-title">
        The Wardrobe
        {newCount > 0 && <span className="wd-title-new">{newCount} new</span>}
        <span className="ga-wallet" title="Ichor"><CurrencyIcon id="ichor" size={14} title="" /> {save.ichor.toLocaleString()}</span>
      </div>
      <div className="panel-sub">
        Every visual, audible and personal dress of the hive — pure expression, zero stats.
        Codices: Arena {pct('wardrobeArena')}% · Audio {pct('wardrobeAudio')}% · Interface {pct('wardrobeInterface')}% · Identity {pct('wardrobeIdentity')}%
      </div>

      <div className="wd-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={`wd-tab${tab === x.id ? ' on' : ''}`} onClick={() => { setTab(x.id); audio.cue('ui'); }}>
            {x.label}
          </button>
        ))}
      </div>

      {tab !== 'skins' && tab !== 'milestones' && (
        <div className="wd-toolbar">
          <input
            className="wd-search"
            type="search"
            placeholder="Search cosmetics…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cosmetics"
          />
          {(['all', 'owned', 'locked', 'new', 'fav'] as OwnFilter[]).map((f) => (
            <button key={f} className={`wd-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'owned' ? 'Owned' : f === 'locked' ? 'Locked' : f === 'new' ? 'New' : '★ Favs'}
            </button>
          ))}
          <button className="wd-chip wd-dice" onClick={() => { meta.randomizeWardrobe(); audio.cue('reveal'); }} title="Equip a random owned item in every slot">
            ⚂ Randomize
          </button>
        </div>
      )}

      {tab === 'skins' && <PhenotypeLab />}
      {(tab === 'arena' || tab === 'audio' || tab === 'interface' || tab === 'identity') && (
        <div className="wd-group">
          <div className="wd-group-h">{WARDROBE_GROUP_LABEL[tab]}</div>
          {WARDROBE_KINDS.filter((k) => k.group === tab).map((k) => (
            <KindSection key={k.id} kind={k} filter={filter} query={query} />
          ))}
        </div>
      )}
      {tab === 'boutique' && <BoutiqueTab />}
      {tab === 'milestones' && <MilestonesTab />}
    </div>
  );
}
