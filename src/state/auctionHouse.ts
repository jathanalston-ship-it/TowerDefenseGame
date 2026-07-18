// AUCTION HOUSE CLIENT STORE (docs/AUCTION-HOUSE.md §client) — the single stateful seam
// between the server market and the save. Owns: browse/detail caches, the player's market
// position (/mine), the game↔market Ichor boundary with a CRASH-SAFE OUTBOX (deposit spends
// locally then credits server-side; withdraw debits server-side then credits locally — both
// exactly-once by op id, resumed from localStorage on boot), custody moves (server-first:
// only a 200 mutates the save via meta.auctionEscrowOut / auctionDeliver), and the reward
// placards for deliveries + sale proceeds. React reads it with useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { auctionApi } from '../net/auctionHouse';
import type { HistoryPayload, MinePayload, WireListing } from '../net/auctionHouse';
import { meta } from './meta';
import type { AuctionSellable } from './meta';
import { rewardToast } from './rewardToast';
import { guardOk } from '../security/actionGuard';
import { guestModeActive } from './guestMode';
import { listingFee, tradeEligibility } from '../core/trading';
import type { TradeBlock } from '../core/trading';
import { marketFamilies } from '../core/marketCatalog';
import { account } from '../account/accountStore';
import { highestCampaignStage } from '../save/derive';

export interface BrowseQuery {
  cat?: string;
  rarity?: string;
  text: string;
  maxPrice?: number;
  sort: 'endingSoon' | 'priceAsc' | 'priceDesc' | 'newest';
  page: number;
}

export interface AuctionUiState {
  phase: 'idle' | 'loading' | 'ready' | 'offline';
  browse: WireListing[];
  browseHasMore: boolean;
  query: BrowseQuery;
  detail: HistoryPayload | null;
  detailFor: string | null;
  mine: MinePayload | null;
  fees: { feeMult: number; taxMult: number };
  /** serverNow − Date.now() at last contact (countdowns render in server time). */
  clockSkewMs: number;
  busy: boolean;
  lastError: string | null;
}

const OUTBOX_KEY = 'assimilation.auction.outbox';
const SEEN_KEY = 'assimilation.auction.ledgerSeen';

interface OutboxOp { kind: 'deposit' | 'withdraw'; opId: string; amount: number; phase: 'spending' | 'spent' | 'requested' }

let state: AuctionUiState = {
  phase: 'idle', browse: [], browseHasMore: false,
  query: { text: '', sort: 'endingSoon', page: 0 },
  detail: null, detailFor: null, mine: null,
  fees: { feeMult: 1, taxMult: 1 }, clockSkewMs: 0, busy: false, lastError: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AuctionUiState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

function readOutbox(): OutboxOp[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as OutboxOp[]; } catch { return []; }
}
function writeOutbox(ops: OutboxOp[]): void {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops)); } catch { /* storage full — the server op ids still dedupe */ }
}
function outboxSet(op: OutboxOp): void {
  writeOutbox([...readOutbox().filter((o) => o.opId !== op.opId), op]);
}
function outboxClear(opId: string): void {
  writeOutbox(readOutbox().filter((o) => o.opId !== opId));
}

function toast(events: { type: string; qty?: number; name?: string; rarity?: string }[]): void {
  rewardToast.pushMany('auction', events);
}

/** Deliver pending items into the save (idempotent server-side via /collect ack), then ack. */
async function deliverPending(mine: MinePayload): Promise<void> {
  if (mine.pendingItems.length === 0) return;
  const delivered = meta.auctionDeliver(mine.pendingItems.map((p) => ({
    refKey: p.ref_key, payloadJson: p.payload, season: p.season, transfers: p.transfers,
  })));
  if (delivered.length > 0) {
    toast(delivered.map((d) => ({
      type: d.cat === 'equipment' ? 'equipment'
        : d.cat === 'geneCard' ? 'geneCard'
          : d.cat === 'mulliganPiece' ? 'mulligan'
            : d.cat === 'mulliganTissue' ? 'mulliganTissue' // owned-piece delivery dissolved (the duplicate law)
              : 'cosmetic',
      name: d.name, rarity: d.rarity,
    })));
  }
  await auctionApi.collect(mine.pendingItems.map((p) => p.global_item_id));
}

/** Sale-proceeds placards: ledger rows newer than the persisted watermark. */
function announceProceeds(mine: MinePayload): void {
  let seen = 0;
  try { seen = Number(localStorage.getItem(SEEN_KEY) ?? '0'); } catch { seen = 0; }
  const fresh = mine.ledger.filter((l) => l.kind === 'saleProceeds' && l.at > seen);
  if (fresh.length > 0) {
    toast(fresh.map((l) => ({ type: 'ichor', qty: l.amount, name: 'Auction sale — market wallet' })));
  }
  const top = Math.max(seen, ...mine.ledger.map((l) => l.at));
  try { localStorage.setItem(SEEN_KEY, String(top)); } catch { /* cosmetic only */ }
}

/** Resume interrupted wallet ops (boot + every screen open). Exactly-once by op id. */
async function resumeOutbox(): Promise<void> {
  for (const op of readOutbox()) {
    if (op.phase === 'spending') { outboxClear(op.opId); continue; } // crashed pre-spend: nothing left the save
    const r = await auctionApi.wallet(op.kind, op.amount, op.opId);
    if (!r.ok) {
      if (r.error === 'offline') return; // keep for the next resume
      if (op.kind === 'deposit') meta.grantIchor('Auction wallet refund', op.amount); // server refused — money back
      outboxClear(op.opId);
      continue;
    }
    if (op.kind === 'withdraw') meta.grantIchor('Auction withdrawal', op.amount); // fresh OR duplicate: applied exactly once server-side
    outboxClear(op.opId);
  }
}

async function refreshMine(): Promise<void> {
  const r = await auctionApi.mine();
  if (!r.ok) {
    set({ phase: r.error === 'offline' ? 'offline' : state.phase, lastError: r.error });
    return;
  }
  set({ mine: r, clockSkewMs: r.serverNow - Date.now(), lastError: null, phase: 'ready' });
  // Custody self-heal: anything ACTIVELY listed that still exists locally leaves the save now.
  const activeRefs = r.listings
    .filter((l) => l.state === 'active')
    .map((l) => l.globalItemId.slice(l.globalItemId.indexOf('/') + 1));
  meta.auctionReconcile(activeRefs);
  await deliverPending(r);
  announceProceeds(r);
}

export const auctionHouse = {
  use(): AuctionUiState {
    return useSyncExternalStore(
      (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      () => state,
    );
  },
  get: (): AuctionUiState => state,

  /** Screen mount: resume the outbox, then load the player position + first browse page. */
  async open(): Promise<void> {
    if (state.busy) return;
    set({ phase: state.phase === 'ready' ? 'ready' : 'loading', busy: true });
    await resumeOutbox();
    await refreshMine();
    await this.browseNow(state.query);
    set({ busy: false });
  },

  /** Guest sessions cannot trade — the screen renders the conversion prompt instead. */
  guestBlocked(): boolean {
    return guestModeActive();
  },

  /** Client-side eligibility PREVIEW (the server re-derives its own truth). */
  eligibility(): { ok: boolean; blocks: TradeBlock[] } {
    const save = meta.get();
    const createdAt = account.get().createdAt || Date.now();
    return tradeEligibility({ cat: 'equipment', id: 'preview' }, null, {
      campaignStage: highestCampaignStage(save),
      accountAgeDays: Math.floor((Date.now() - createdAt) / 86_400_000),
      listedToday: (state.mine?.listings ?? []).filter((l) => l.createdAt > Date.now() - 86_400_000 && !l.authority).length,
      guest: guestModeActive(),
    });
  },

  async browseNow(query: BrowseQuery): Promise<void> {
    set({ query });
    const families = query.text.trim().length >= 2 ? familiesMatching(query.text) : undefined;
    if (families && families.length === 0) {
      set({ browse: [], browseHasMore: false });
      return;
    }
    const r = await auctionApi.search({
      cat: query.cat, rarity: query.rarity, maxPrice: query.maxPrice,
      sort: query.sort, page: query.page, families,
    });
    if (!r.ok) {
      set({ lastError: r.error, phase: r.error === 'offline' ? 'offline' : state.phase });
      return;
    }
    set({ browse: r.listings, browseHasMore: r.hasMore, fees: r.fees, clockSkewMs: r.serverNow - Date.now(), phase: 'ready', lastError: null });
  },

  async openDetail(familyKey: string): Promise<void> {
    set({ detailFor: familyKey, detail: state.detailFor === familyKey ? state.detail : null });
    const r = await auctionApi.history(familyKey);
    if (r.ok) set({ detail: r, fees: r.fees });
  },
  closeDetail(): void {
    set({ detail: null, detailFor: null });
  },

  /** The Sell tab's stock: everything listable, block reasons attached. */
  sellables(): AuctionSellable[] {
    return meta.auctionSellables();
  },

  /** Fee preview for the sell dialog (base 5% × the authority's live multiplier). */
  feePreview(price: number): number {
    return Math.ceil(listingFee(price) * Math.max(1, state.fees.feeMult));
  },

  async listItem(s: AuctionSellable, ask: number, buyNowPrice: number | null, durationH: number): Promise<string | null> {
    if (s.blocks.length > 0) return `blocked-${s.blocks[0]}`;
    set({ busy: true });
    const r = await auctionApi.list(
      { refKey: s.refKey, familyKey: s.familyKey, rarity: s.rarity, season: s.season, source: s.source, payload: s.payload },
      ask, buyNowPrice, durationH,
    );
    if (!r.ok) {
      set({ busy: false, lastError: r.error });
      return r.error;
    }
    meta.auctionEscrowOut(s.refKey); // server holds the item now; reconcile self-heals a miss
    await refreshMine();
    set({ busy: false });
    return null;
  },

  async bid(listingId: string, amount: number): Promise<string | null> {
    set({ busy: true });
    const r = await auctionApi.bid(listingId, amount);
    set({ busy: false });
    if (!r.ok) {
      set({ lastError: r.error });
      return r.error;
    }
    if (r.listing) set({ browse: state.browse.map((l) => (l.listingId === listingId ? r.listing! : l)) });
    await refreshMine();
    return null;
  },

  async buy(listingId: string): Promise<string | null> {
    set({ busy: true });
    const r = await auctionApi.buy(listingId);
    set({ busy: false });
    if (!r.ok) {
      set({ lastError: r.error });
      return r.error;
    }
    set({ browse: state.browse.filter((l) => l.listingId !== listingId) });
    await refreshMine(); // delivery + placard ride the pending-items lane
    return null;
  },

  async cancel(listingId: string): Promise<string | null> {
    set({ busy: true });
    const r = await auctionApi.cancel(listingId);
    set({ busy: false });
    if (!r.ok) {
      set({ lastError: r.error });
      return r.error;
    }
    await refreshMine(); // the returned item arrives as a pending delivery
    return null;
  },

  /** Move game Ichor INTO the market wallet. Spend-first with an outbox: a crash between the
   *  local spend and the server credit re-sends the SAME op id on next open (duplicate-safe). */
  async deposit(amount: number): Promise<string | null> {
    if (!Number.isInteger(amount) || amount <= 0) return 'bad-amount';
    if (!guardOk('auction.wallet', `dep:${amount}`)) return 'rate-limited';
    const opId = crypto.randomUUID();
    outboxSet({ kind: 'deposit', opId, amount, phase: 'spending' });
    if (!meta.spendIchor(amount)) {
      outboxClear(opId);
      return 'not-enough-ichor';
    }
    outboxSet({ kind: 'deposit', opId, amount, phase: 'spent' });
    const r = await auctionApi.wallet('deposit', amount, opId);
    if (!r.ok) {
      if (r.error === 'offline') return 'queued'; // outbox resumes it — the Ichor is committed
      meta.grantIchor('Auction wallet refund', amount);
      outboxClear(opId);
      return r.error;
    }
    outboxClear(opId);
    await refreshMine();
    return null;
  },

  /** Move market-wallet Ichor back to the game. Server-debit first; the outbox guarantees the
   *  local credit lands exactly once even across a crash. */
  async withdraw(amount: number): Promise<string | null> {
    if (!Number.isInteger(amount) || amount <= 0) return 'bad-amount';
    if (!guardOk('auction.wallet', `wd:${amount}`)) return 'rate-limited';
    const opId = crypto.randomUUID();
    outboxSet({ kind: 'withdraw', opId, amount, phase: 'requested' });
    const r = await auctionApi.wallet('withdraw', amount, opId);
    if (!r.ok) {
      if (r.error === 'offline') return 'queued';
      outboxClear(opId);
      return r.error;
    }
    meta.grantIchor('Auction withdrawal', amount);
    outboxClear(opId);
    await refreshMine();
    return null;
  },

  async refresh(): Promise<void> {
    await refreshMine();
    await this.browseNow(state.query);
  },
};

/** Free-text → catalog family keys (client-side name resolution — the server never scans names). */
function familiesMatching(text: string): string[] {
  const needle = text.trim().toLowerCase();
  const out: string[] = [];
  for (const f of marketFamilies()) {
    if (f.name.toLowerCase().includes(needle)) {
      out.push(f.familyKey);
      if (out.length >= 12) break;
    }
  }
  return out;
}

/** Countdown copy in SERVER time ("3h 12m" / "ends soon"). */
export function endsIn(endsAt: number, skewMs: number): string {
  const ms = endsAt - (Date.now() + skewMs);
  if (ms <= 0) return 'settling…';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'under 1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}
