// AUCTION HOUSE (docs/AUCTION-HOUSE.md §client) — the player-driven market screen in the
// MARKET hub. Three tabs over one store (state/auctionHouse.ts): BROWSE (index-backed
// search + the family detail sheet with price history, stats and bid/buy), SELL (the
// save-derived sellable stock → listing dialog with recommended pricing + fee preview),
// and MY MARKET (wallet, active listings, standing bids, trades, ledger). The server is
// the trade truth — every action here is a request; the store reconciles the save.

import { useEffect, useMemo, useState } from 'react';
import { meta } from '../state/meta';
import type { AuctionSellable } from '../state/meta';
import { auctionHouse, endsIn } from '../state/auctionHouse';
import type { BrowseQuery } from '../state/auctionHouse';
import type { WireListing } from '../net/auctionHouse';
import { ListControls } from './components/ListControls';
import { Popup } from './components/Popup';
import { TRADE, minNextBid, tradeBlockLabel } from '../core/trading';
import { marketFamily } from '../core/marketCatalog';
import { rarityColorOf } from '../core/equipment';
import { account } from '../account/accountStore';
import { connectivity } from '../net/connectivity';

// Rarity tint: the ONE canonical map (docs/UI-STANDARDS.md §rarity) — plus the Mulligan apex tier.
const RARITY_TINT: Record<string, string> = {
  common: rarityColorOf('common'), uncommon: rarityColorOf('uncommon'), rare: rarityColorOf('rare'),
  epic: rarityColorOf('epic'), legendary: rarityColorOf('legendary'), exotic: rarityColorOf('exotic'),
  ascendant: 'var(--r-mythic)',
};
const CAT_GLYPH: Record<string, string> = {
  geneCard: '⌬', equipment: '⛨', cosmetic: '❖', mulliganPiece: '⊛',
};

function famName(key: string): string {
  return marketFamily(key)?.name ?? key;
}

export function AuctionHouse(): JSX.Element {
  const st = auctionHouse.use();
  const save = meta.use();
  const [tab, setTab] = useState<'browse' | 'sell' | 'mine'>('browse');
  const [detailId, setDetailId] = useState<string | null>(null); // listingId under the sheet
  const [selling, setSelling] = useState<AuctionSellable | null>(null);
  const myId = account.get().accountId;

  useEffect(() => { void auctionHouse.open(); }, []);

  if (auctionHouse.guestBlocked()) {
    return (
      <div className="ah-gate">
        <h2>⚖ Auction House</h2>
        <p>{tradeBlockLabel('guest')}</p>
        <p className="ah-dim">Create an account in Settings — your save converts in place, nothing is lost.</p>
      </div>
    );
  }

  const detail = detailId ? st.browse.find((l) => l.listingId === detailId) ?? st.mine?.bids.find((l) => l.listingId === detailId) ?? null : null;
  return (
    <div className="ah-root">
      <header className="ah-head">
        <div className="ah-mast">
          <span className="ah-kicker">Market · Player Exchange</span>
          <h2>⚖ Auction House</h2>
          <p className="ah-dim ah-sub">Gene cards, bio-gear, cosmetics, mulligan organs — traded organism to organism, priced in Ichor.</p>
        </div>
        <WalletCard ichor={save.ichor} />
      </header>

      {!connectivity.isOnline() || st.phase === 'offline' ? (
        <div className="ah-banner">Offline — the market needs a connection. Everything else in the game keeps working.</div>
      ) : null}
      {st.fees.feeMult > 1.05 && (
        <div className="ah-banner ah-hot" title="The market authority raises fees while prices run hot — they relax as the market cools.">
          Market running hot: listing fee ×{st.fees.feeMult.toFixed(2)} · sale tax ×{st.fees.taxMult.toFixed(2)}
        </div>
      )}

      <nav className="ah-tabs" role="tablist">
        {(['browse', 'sell', 'mine'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ah-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            {k === 'browse' ? 'Browse' : k === 'sell' ? 'Sell' : 'My Market'}
            {k === 'mine' && (st.mine?.pendingItems.length ?? 0) > 0 ? <span className="ah-dot" /> : null}
          </button>
        ))}
      </nav>

      {tab === 'browse' && <BrowseTab onOpen={(id) => { setDetailId(id); const l = st.browse.find((x) => x.listingId === id); if (l) void auctionHouse.openDetail(l.familyKey); }} />}
      {tab === 'sell' && <SellTab onPick={(s) => { setSelling(s); void auctionHouse.openDetail(s.familyKey); }} />}
      {tab === 'mine' && <MineTab myId={myId} onOpen={(id) => setDetailId(id)} />}

      {detail && <ListingSheet listing={detail} myId={myId} onClose={() => { setDetailId(null); auctionHouse.closeDetail(); }} />}
      {selling && <SellSheet s={selling} onClose={() => { setSelling(null); auctionHouse.closeDetail(); }} />}
    </div>
  );
}

// ── Wallet ────────────────────────────────────────────────────────────────────
function WalletCard({ ichor }: { ichor: number }): JSX.Element {
  const st = auctionHouse.use();
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const w = st.mine?.wallet;
  const move = async (dir: 'deposit' | 'withdraw'): Promise<void> => {
    const n = Math.floor(Number(amt));
    if (!Number.isInteger(n) || n <= 0) { setNote('Enter an amount.'); return; }
    setNote('…');
    const err = dir === 'deposit' ? await auctionHouse.deposit(n) : await auctionHouse.withdraw(n);
    setNote(err === null ? null : err === 'queued' ? 'Queued — retries automatically.' : errCopy(err));
    if (err === null) setAmt('');
  };
  return (
    <div className="ah-wallet">
      <div className="ah-wtop">
        <div className="ah-wcol">
          <span className="ah-wlabel">Market wallet</span>
          <b className="ah-whero">◆ {(w?.balance ?? 0).toLocaleString()}</b>
          {w && w.escrow > 0 && <span className="ah-wesc">◆ {w.escrow.toLocaleString()} escrowed in bids</span>}
        </div>
        <div className="ah-wcol ah-wside">
          <span className="ah-wlabel">Game Ichor</span>
          <b>◆ {ichor.toLocaleString()}</b>
        </div>
      </div>
      <div className="ah-wmove">
        <input inputMode="numeric" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Wallet amount" />
        <button type="button" onClick={() => void move('deposit')} disabled={st.busy}>Deposit</button>
        <button type="button" onClick={() => void move('withdraw')} disabled={st.busy}>Withdraw</button>
      </div>
      {note && <div className="ah-note">{note}</div>}
    </div>
  );
}

// ── Browse ────────────────────────────────────────────────────────────────────
function BrowseTab({ onOpen }: { onOpen: (listingId: string) => void }): JSX.Element {
  const st = auctionHouse.use();
  const q = st.query;
  const run = (patch: Partial<BrowseQuery>): void => { void auctionHouse.browseNow({ ...q, page: 0, ...patch }); };
  return (
    <section>
      <ListControls
        search={{ value: q.text, onChange: (v) => run({ text: v }), placeholder: 'Search the catalog…', label: 'Search listings' }}
        chips={[
          { id: 'geneCard', label: '⌬ Genes', on: q.cat === 'geneCard', onToggle: () => run({ cat: q.cat === 'geneCard' ? undefined : 'geneCard' }) },
          { id: 'equipment', label: '⛨ Gear', on: q.cat === 'equipment', onToggle: () => run({ cat: q.cat === 'equipment' ? undefined : 'equipment' }) },
          { id: 'cosmetic', label: '❖ Cosmetics', on: q.cat === 'cosmetic', onToggle: () => run({ cat: q.cat === 'cosmetic' ? undefined : 'cosmetic' }) },
          { id: 'mulliganPiece', label: '⊛ Mulligans', on: q.cat === 'mulliganPiece', onToggle: () => run({ cat: q.cat === 'mulliganPiece' ? undefined : 'mulliganPiece' }) },
        ]}
        sort={{
          value: q.sort,
          options: [
            { id: 'endingSoon', label: 'Ending soon' }, { id: 'priceAsc', label: 'Price ↑' },
            { id: 'priceDesc', label: 'Price ↓' }, { id: 'newest', label: 'Newest' },
          ],
          onChange: (id) => run({ sort: id as BrowseQuery['sort'] }),
        }}
        right={<button type="button" className="ah-refresh" onClick={() => void auctionHouse.refresh()} title="Refresh">⟳</button>}
      />
      {st.browse.length === 0 && <p className="ah-dim ah-empty">{st.phase === 'loading' ? 'Reading the market…' : 'No listings match — widen the filters or check back soon.'}</p>}
      <div className="ah-grid" data-guide="ah-market">
        {st.browse.map((l) => <ListingCard key={l.listingId} l={l} skew={st.clockSkewMs} onOpen={() => onOpen(l.listingId)} />)}
      </div>
      {(q.page > 0 || st.browseHasMore) && (
        <div className="ah-pager">
          <button type="button" disabled={q.page === 0} onClick={() => run({ page: q.page - 1 })}>← Prev</button>
          <span className="ah-dim">Page {q.page + 1}</span>
          <button type="button" disabled={!st.browseHasMore} onClick={() => run({ page: q.page + 1 })}>Next →</button>
        </div>
      )}
    </section>
  );
}

function ListingCard({ l, skew, onOpen }: { l: WireListing; skew: number; onOpen: () => void }): JSX.Element {
  return (
    <button type="button" className="ah-card" onClick={onOpen} style={{ ['--rc' as string]: RARITY_TINT[l.rarity] ?? 'var(--muted)' }}>
      <span className="ah-card-glyph" aria-hidden>{CAT_GLYPH[l.cat] ?? '◈'}</span>
      <div className="ah-card-name">{famName(l.familyKey)}</div>
      <div className="ah-card-sub">
        <span className="ah-card-rar">{l.rarity}</span>
        {l.authority ? <span className="ah-stockchip" title="Baseline stock — always common essentials, never exclusives.">⚕ stock</span> : null}
      </div>
      <div className="ah-card-price">
        {l.buyNow !== null && <b>◆ {l.buyNow.toLocaleString()}</b>}
        {l.buyNow === null && <b>◆ {(l.bid ?? l.ask).toLocaleString()}</b>}
        {l.buyNow === null && <span className="ah-dim">bid</span>}
      </div>
      <div className="ah-card-ends ah-dim">{l.authority ? 'restocked' : endsIn(l.endsAt, skew)}{l.bid !== null && !l.authority && l.bidderId ? ' · bid war' : ''}</div>
    </button>
  );
}

// ── The family detail + bid/buy sheet ─────────────────────────────────────────
function ListingSheet({ listing, myId, onClose }: { listing: WireListing; myId: string; onClose: () => void }): JSX.Element {
  const st = auctionHouse.use();
  const d = st.detailFor === listing.familyKey ? st.detail : null;
  const [bidAmt, setBidAmt] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const floor = listing.bid === null ? listing.ask : minNextBid(listing.bid);
  const mineLeads = listing.bidderId === myId;
  const doBid = async (): Promise<void> => {
    const n = Math.floor(Number(bidAmt || floor));
    setNote('…');
    const err = await auctionHouse.bid(listing.listingId, n);
    setNote(err ? errCopy(err) : 'Bid placed — the full amount is escrowed until you are outbid.');
  };
  const doBuy = async (): Promise<void> => {
    setNote('…');
    const err = await auctionHouse.buy(listing.listingId);
    if (err) { setNote(errCopy(err)); return; }
    setNote(null);
    onClose();
  };
  return (
    <Popup>
      <div className="ah-scrim" onClick={onClose}>
        <div className="ah-sheet" role="dialog" aria-label={famName(listing.familyKey)} onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: RARITY_TINT[listing.rarity] ?? 'var(--caustic)' }}>
          <header className="ah-sheet-head">
            <div>
              <span className="ah-sheet-glyph" aria-hidden>{CAT_GLYPH[listing.cat] ?? '◈'}</span>
              <h3>{famName(listing.familyKey)}</h3>
              <span className="ah-card-rar">{listing.rarity}</span>
              {listing.authority && <span className="ah-stockchip">⚕ stock</span>}
            </div>
            <button type="button" className="ah-x" onClick={onClose} aria-label="Close">✕</button>
          </header>
          {d ? <PriceBlock d={d} /> : <p className="ah-dim">Reading price history…</p>}
          <div className="ah-buyrow">
            {listing.buyNow !== null && (
              <button type="button" className="ah-primary" disabled={st.busy} onClick={() => void doBuy()}>
                Buy now — ◆ {listing.buyNow.toLocaleString()}
              </button>
            )}
            {!listing.authority && (
              <div className="ah-bid">
                <input inputMode="numeric" value={bidAmt} placeholder={String(floor)} onChange={(e) => setBidAmt(e.target.value)} aria-label="Bid amount" />
                <button type="button" disabled={st.busy || mineLeads} onClick={() => void doBid()}>
                  {mineLeads ? 'Leading bid' : `Bid (min ◆ ${floor.toLocaleString()})`}
                </button>
              </div>
            )}
          </div>
          <p className="ah-dim ah-fine">
            {listing.authority
              ? 'Baseline stock keeps essentials available — bought units leave circulation entirely.'
              : `Bids escrow in full from your market wallet; anti-snipe extends the clock by ${TRADE.antiSnipeSec}s on late bids.`}
          </p>
          {note && <div className="ah-note">{note}</div>}
        </div>
      </div>
    </Popup>
  );
}

function PriceBlock({ d }: { d: NonNullable<ReturnType<typeof auctionHouse.get>['detail']> }): JSX.Element {
  const s = d.stats;
  return (
    <div className="ah-prices">
      <Sparkline points={d.history.map((h) => h.medianPrice)} />
      <div className="ah-stats">
        <Stat label="Lowest listing" v={s.lowestListing} />
        <Stat label="Estimated value" v={s.estimatedValue} />
        <Stat label="Recent average" v={s.recentAvg} />
        <Stat label="Highest sale" v={s.highestSale} />
        <div className="ah-stat"><span className="ah-dim">Sales / day</span><b>{s.salesPerDay.toFixed(1)}</b></div>
        <div className="ah-stat"><span className="ah-dim">Volatility</span><b>{Math.round(s.volatility * 100)}%</b></div>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number | null }): JSX.Element {
  return <div className="ah-stat"><span className="ah-dim">{label}</span><b>{v === null ? '—' : `◆ ${Math.round(v).toLocaleString()}`}</b></div>;
}

/** 30-day median-price line, pure SVG — no chart library for one polyline. */
function Sparkline({ points }: { points: number[] }): JSX.Element {
  if (points.length < 2) return <div className="ah-spark ah-dim">No sales history yet — this family sets its first price.</div>;
  const w = 280; const h = 56;
  const lo = Math.min(...points); const hi = Math.max(...points);
  const span = Math.max(1, hi - lo);
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 6 - ((p - lo) / span) * (h - 12)}`).join(' ');
  return (
    <svg className="ah-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Price history">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="var(--caustic)" opacity="0.12" />
      <polyline points={pts} fill="none" stroke="var(--caustic)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Sell ──────────────────────────────────────────────────────────────────────
function SellTab({ onPick }: { onPick: (s: AuctionSellable) => void }): JSX.Element {
  const st = auctionHouse.use();
  const [text, setText] = useState('');
  const [cat, setCat] = useState<string | undefined>(undefined);
  const save = meta.use();
  const elig = auctionHouse.eligibility();
  const stock = useMemo(() => auctionHouse.sellables(), [save, st.mine]); // custody changes re-derive the stock
  const needle = text.trim().toLowerCase();
  const rows = stock.filter((s) =>
    (cat === undefined || s.cat === cat) && (needle.length < 2 || s.name.toLowerCase().includes(needle)));
  const listedToday = (st.mine?.listings ?? []).filter((l) => l.createdAt > Date.now() - 86_400_000 && !l.authority).length;
  return (
    <section>
      {!elig.ok && (
        <div className="ah-banner">{elig.blocks.map((b) => tradeBlockLabel(b)).join(' ')}</div>
      )}
      <ListControls
        search={{ value: text, onChange: setText, placeholder: 'Search your stock…', label: 'Search sellable items' }}
        chips={[
          { id: 'geneCard', label: '⌬ Genes', on: cat === 'geneCard', onToggle: () => setCat(cat === 'geneCard' ? undefined : 'geneCard') },
          { id: 'equipment', label: '⛨ Gear', on: cat === 'equipment', onToggle: () => setCat(cat === 'equipment' ? undefined : 'equipment') },
          { id: 'cosmetic', label: '❖ Cosmetics', on: cat === 'cosmetic', onToggle: () => setCat(cat === 'cosmetic' ? undefined : 'cosmetic') },
          { id: 'mulliganPiece', label: '⊛ Mulligans', on: cat === 'mulliganPiece', onToggle: () => setCat(cat === 'mulliganPiece' ? undefined : 'mulliganPiece') },
        ]}
        shown={{ shown: rows.length, total: stock.length }}
        right={<span className="ah-dim">{listedToday}/{TRADE.maxListingsPerDay} listings today</span>}
      />
      <div className="ah-grid">
        {rows.slice(0, 120).map((s) => {
          const blocked = s.blocks.length > 0 || !elig.ok;
          return (
            <button
              key={s.refKey} type="button" className={`ah-card${blocked ? ' ah-blocked' : ''}`}
              style={{ ['--rc' as string]: RARITY_TINT[s.rarity] ?? 'var(--muted)' }}
              onClick={() => { if (!blocked) onPick(s); }}
              title={s.blocks.length > 0 ? blockCopy(s.blocks[0]) : undefined}
            >
              <span className="ah-card-glyph" aria-hidden>{CAT_GLYPH[s.cat] ?? '◈'}</span>
              <div className="ah-card-name">{s.name}</div>
              <div className="ah-card-sub"><span className="ah-card-rar">{s.rarity}</span><span className="ah-dim"> · {catLabel(s.cat)}</span></div>
              <div className="ah-card-ends ah-dim">{s.blocks.length > 0 ? blockCopy(s.blocks[0]) : 'Tap to list'}</div>
            </button>
          );
        })}
      </div>
      {rows.length === 0 && <p className="ah-dim ah-empty">Nothing sellable here — protected (locked/favorite/equipped) gear and starter unlocks never list.</p>}
    </section>
  );
}

function SellSheet({ s, onClose }: { s: AuctionSellable; onClose: () => void }): JSX.Element {
  const st = auctionHouse.use();
  const d = st.detailFor === s.familyKey ? st.detail : null;
  const [ask, setAsk] = useState('');
  const [buyNow, setBuyNow] = useState('');
  const [durationH, setDurationH] = useState<number>(24);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (d && ask === '') {
      setAsk(String(d.recommended));
      setBuyNow(String(Math.max(d.recommended, Math.round(d.recommended * 1.25))));
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const askN = Math.floor(Number(ask || 0));
  const buyN = buyNow.trim() === '' ? null : Math.floor(Number(buyNow));
  const fee = auctionHouse.feePreview(buyN ?? askN);
  const onlyCopy = s.cat !== 'equipment';
  const submit = async (): Promise<void> => {
    setNote('…');
    const err = await auctionHouse.listItem(s, askN, buyN, durationH);
    if (err) { setNote(errCopy(err)); return; }
    setNote(null);
    onClose();
  };
  return (
    <Popup>
      <div className="ah-scrim" onClick={onClose}>
        <div className="ah-sheet" role="dialog" aria-label={`List ${s.name}`} onClick={(e) => e.stopPropagation()} style={{ ['--rc' as string]: RARITY_TINT[s.rarity] ?? 'var(--caustic)' }}>
          <header className="ah-sheet-head">
            <div>
              <span className="ah-sheet-glyph" aria-hidden>{CAT_GLYPH[s.cat] ?? '◈'}</span>
              <h3>List {s.name}</h3>
              <span className="ah-card-rar">{s.rarity}</span><span className="ah-dim"> · {catLabel(s.cat)}</span>
            </div>
            <button type="button" className="ah-x" onClick={onClose} aria-label="Close">✕</button>
          </header>
          {d ? <PriceBlock d={d} /> : <p className="ah-dim">Reading price history…</p>}
          {d && <p className="ah-dim ah-fine">Recommended ask: ◆ {d.recommended.toLocaleString()} (undercuts the live floor a hair when one exists).</p>}
          <div className="ah-form">
            <label>Starting bid <input inputMode="numeric" value={ask} onChange={(e) => setAsk(e.target.value)} /></label>
            <label>Buy now <input inputMode="numeric" value={buyNow} placeholder="optional" onChange={(e) => setBuyNow(e.target.value)} /></label>
            <div className="ah-durs" role="radiogroup" aria-label="Listing duration">
              {TRADE.durationsH.map((h) => (
                <button key={h} type="button" role="radio" aria-checked={durationH === h} className={`ah-chip${durationH === h ? ' on' : ''}`} onClick={() => setDurationH(h)}>{h}h</button>
              ))}
            </div>
          </div>
          <p className="ah-dim ah-fine">
            Listing fee ◆ {Number.isFinite(fee) ? fee : 0} (non-refundable, paid from the market wallet) · sale tax {Math.round(TRADE.saleTaxFrac * 100 * st.fees.taxMult)}% at settlement.
          </p>
          {onlyCopy && (
            <p className="ah-warn">This sells your ONLY copy — the unlock leaves your account until you buy one back.</p>
          )}
          <div className="ah-buyrow">
            <button type="button" className="ah-primary" disabled={st.busy || askN < TRADE.minPrice} onClick={() => void submit()}>
              List for {durationH}h
            </button>
          </div>
          {note && <div className="ah-note">{note}</div>}
        </div>
      </div>
    </Popup>
  );
}

// ── My Market ─────────────────────────────────────────────────────────────────
function MineTab({ myId, onOpen }: { myId: string; onOpen: (listingId: string) => void }): JSX.Element {
  const st = auctionHouse.use();
  const m = st.mine;
  const [note, setNote] = useState<string | null>(null);
  if (!m) return <p className="ah-dim ah-empty">Reading your market position…</p>;
  const active = m.listings.filter((l) => l.state === 'active');
  const closed = m.listings.filter((l) => l.state !== 'active').slice(0, 10);
  const doCancel = async (id: string): Promise<void> => {
    setNote('…');
    const err = await auctionHouse.cancel(id);
    setNote(err ? errCopy(err) : 'Listing withdrawn — the item returns to your inventory.');
  };
  return (
    <section className="ah-mine">
      {note && <div className="ah-note">{note}</div>}
      <div className="ah-sec">
        <h3>Active listings ({active.length})</h3>
        {active.length === 0 && <p className="ah-dim">Nothing on the block. The Sell tab lists in two taps.</p>}
        {active.map((l) => (
          <div key={l.listingId} className="ah-row">
            <span className="ah-row-name">{famName(l.familyKey)}</span>
            <span className="ah-dim">{l.bid !== null ? `bid ◆ ${l.bid.toLocaleString()}` : `ask ◆ ${l.ask.toLocaleString()}`}{l.buyNow !== null ? ` · now ◆ ${l.buyNow.toLocaleString()}` : ''}</span>
            <span className="ah-dim">{endsIn(l.endsAt, st.clockSkewMs)}</span>
            <button type="button" disabled={l.bid !== null || st.busy} title={l.bid !== null ? 'Bids lock a listing in.' : undefined} onClick={() => void doCancel(l.listingId)}>Cancel</button>
          </div>
        ))}
      </div>
      <div className="ah-sec">
        <h3>My bids ({m.bids.length})</h3>
        {m.bids.length === 0 && <p className="ah-dim">No standing bids.</p>}
        {m.bids.map((l) => (
          <div key={l.listingId} className="ah-row">
            <span className="ah-row-name">{famName(l.familyKey)}</span>
            <span className={l.bidderId === myId ? 'ah-lead' : 'ah-outbid'}>{l.bidderId === myId ? `leading ◆ ${(l.bid ?? 0).toLocaleString()}` : 'outbid'}</span>
            <span className="ah-dim">{endsIn(l.endsAt, st.clockSkewMs)}</span>
            <button type="button" onClick={() => onOpen(l.listingId)}>View</button>
          </div>
        ))}
      </div>
      <div className="ah-sec">
        <h3>Recent trades</h3>
        {m.trades.length === 0 && <p className="ah-dim">No settlements yet.</p>}
        {m.trades.map((t) => (
          <div key={t.listing_id} className="ah-row">
            <span className="ah-row-name">{famName(t.family_key)}</span>
            <span className={t.seller_id === myId ? 'ah-lead' : ''}>{t.seller_id === myId ? `sold +◆ ${(t.price - t.tax).toLocaleString()}` : `bought −◆ ${t.price.toLocaleString()}`}</span>
            <span className="ah-dim">{new Date(t.at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
      {closed.length > 0 && <div className="ah-sec">
        <h3>Closed listings</h3>
        {closed.map((l) => (
          <div key={l.listingId} className="ah-row ah-dim">
            <span className="ah-row-name">{famName(l.familyKey)}</span>
            <span>{l.state}</span>
            <span>{l.buyNow !== null ? `◆ ${l.buyNow.toLocaleString()}` : `◆ ${l.ask.toLocaleString()}`}</span>
          </div>
        ))}
      </div>}
    </section>
  );
}

// ── Copy helpers ─────────────────────────────────────────────────────────────
function catLabel(cat: string): string {
  return cat === 'geneCard' ? 'Gene Card' : cat === 'equipment' ? 'Bio-Gear' : cat === 'mulliganPiece' ? 'Mulligan Modifier' : 'Cosmetic';
}
function blockCopy(b: 'bound' | 'equipped' | 'neverTrade' | 'slotted'): string {
  if (b === 'neverTrade') return 'Starter kit — never tradable';
  return tradeBlockLabel(b);
}
/** Server machine codes → human copy (the codes are the contract; this is presentation). */
function errCopy(code: string): string {
  switch (code) {
    case 'insufficient-funds': return 'Not enough in your market wallet — deposit Ichor first.';
    case 'not-enough-ichor': return 'Not enough Ichor.';
    case 'bid-too-low': return 'Bid below the minimum step.';
    case 'outbid-race': return 'Someone bid a moment before you — refreshed, try again.';
    case 'unavailable': case 'not-active': case 'ended': return 'That listing just closed.';
    case 'already-listed': return 'This item is already on the block.';
    case 'self-bid': case 'self-buy': return 'That listing is yours.';
    case 'listing-cap': case 'blocked-listingCap': return `Daily listing limit reached (${TRADE.maxListingsPerDay}).`;
    case 'blocked-campaign': return tradeBlockLabel('campaign');
    case 'blocked-accountAge': return tradeBlockLabel('accountAge');
    case 'no-cloud-save': return 'Trading needs a synced account — enable cloud save first.';
    case 'rate-limited': return 'Easy — try again in a moment.';
    case 'offline': return 'Offline — try again when connected.';
    default: return `The market refused: ${code}.`;
  }
}
