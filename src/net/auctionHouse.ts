// AUCTION HOUSE TRANSPORT (docs/AUCTION-HOUSE.md §client) — thin typed fetch wrappers over
// functions/api/auction/*. No game state here: state/auctionHouse.ts owns custody, money
// mirrors, and ceremonies; this module only speaks the wire shapes and carries the
// credentials (account.credentials() — session when signed in, device sync token otherwise).
// Every call is fail-soft: network trouble returns { ok: false, error } — never throws.

import { account } from '../account/accountStore';
import { turnstileToken } from './turnstile';
import type { MarketQuery } from '../core/auction';
import type { FamilyStats } from '../core/auction';
import type { MarketHistoryPoint } from '../core/trading';

/** One listing as the server renders it (functions/lib/auctionHost.toPublicListing). */
export interface WireListing {
  listingId: string;
  globalItemId: string;
  familyKey: string;
  cat: string;
  rarity: string;
  season: number;
  sellerId: string;
  ask: number;
  buyNow: number | null;
  bid: number | null;
  bidderId: string | null;
  endsAt: number;
  createdAt: number;
  state: string;
  authority: boolean;
}

export interface WirePendingItem {
  global_item_id: string;
  ref_key: string;
  category: string;
  family_key: string;
  rarity: string;
  season: number;
  state: string;
  source: string;
  transfers: number;
  history: string;
  payload: string;
}

export interface WireTrade {
  listing_id: string; global_item_id: string; family_key: string;
  seller_id: string; buyer_id: string; price: number; tax: number; authority: number; at: number;
}

export interface MinePayload {
  ok: boolean;
  serverNow: number;
  eligibility: { campaignStage: number; accountAgeDays: number };
  wallet: { balance: number; escrow: number; depositedLifetime: number; withdrawnLifetime: number };
  listings: WireListing[];
  bids: WireListing[];
  trades: WireTrade[];
  pendingItems: WirePendingItem[];
  ledger: { op_id: string; kind: string; amount: number; at: number }[];
}

export interface SearchPayload {
  ok: boolean;
  listings: WireListing[];
  page: number;
  hasMore: boolean;
  fees: { feeMult: number; taxMult: number };
  serverNow: number;
}

export interface HistoryPayload {
  ok: boolean;
  family: { familyKey: string; name: string; cat: string; rarity: string };
  history: MarketHistoryPoint[];
  stats: FamilyStats;
  recommended: number;
  fees: { feeMult: number; taxMult: number };
}

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, init);
    const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, error: body?.error ?? `http-${res.status}` };
    }
    return { ok: true, ...(body as T) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

function post<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  return call<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...account.credentials(), ...body }),
  });
}

function credQuery(): string {
  const c = account.credentials();
  const auth = c.session ? `session=${encodeURIComponent(c.session)}` : `token=${encodeURIComponent(c.token ?? '')}`;
  return `playerId=${encodeURIComponent(c.playerId)}&${auth}`;
}

export const auctionApi = {
  /** Browse the market. `families` narrows to catalog keys (text search resolves client-side). */
  search(q: Partial<MarketQuery> & { families?: string[] }): Promise<ApiResult<SearchPayload>> {
    const p = new URLSearchParams();
    if (q.cat) p.set('cat', q.cat);
    if (q.rarity) p.set('rarity', q.rarity);
    if (q.families && q.families.length > 0) p.set('families', q.families.slice(0, 12).join(','));
    if (q.minPrice !== undefined) p.set('minPrice', String(q.minPrice));
    if (q.maxPrice !== undefined) p.set('maxPrice', String(q.maxPrice));
    if (q.season !== undefined) p.set('season', String(q.season));
    p.set('sort', q.sort ?? 'endingSoon');
    p.set('page', String(q.page ?? 0));
    return call<SearchPayload>(`/api/auction/search?${p.toString()}`);
  },

  history(familyKey: string): Promise<ApiResult<HistoryPayload>> {
    return call<HistoryPayload>(`/api/auction/history?family=${encodeURIComponent(familyKey)}`);
  },

  mine(): Promise<ApiResult<MinePayload>> {
    return call<MinePayload>(`/api/auction/mine?${credQuery()}`);
  },

  list(item: {
    refKey: string; familyKey: string; rarity: string; season: number; source: string;
    payload: Record<string, unknown>; globalItemId?: string;
  }, ask: number, buyNow: number | null, durationH: number): Promise<ApiResult<{ listing: WireListing; fee: number; feeMult: number }>> {
    return post('/api/auction/list', { item, ask, buyNow, durationH });
  },

  bid(listingId: string, amount: number): Promise<ApiResult<{ listing: WireListing | null }>> {
    return post('/api/auction/bid', { listingId, amount });
  },

  buy(listingId: string): Promise<ApiResult<{ price: number; item: WirePendingItem | null }>> {
    return post('/api/auction/buy', { listingId });
  },

  cancel(listingId: string): Promise<ApiResult<{ listingId: string }>> {
    return post('/api/auction/cancel', { listingId });
  },

  /** Deposit/withdraw between the game wallet and the market wallet. Exactly-once by opId —
   *  the store's outbox retries the SAME opId after a crash and a duplicate is a no-op. */
  async wallet(action: 'deposit' | 'withdraw', amount: number, opId: string): Promise<ApiResult<{ balance: number; escrow: number; duplicate?: boolean }>> {
    const token = await turnstileToken();
    return post('/api/auction/wallet', { action, amount, opId, turnstileToken: token });
  },

  collect(itemIds: string[]): Promise<ApiResult<{ collected: number }>> {
    return post('/api/auction/collect', { itemIds });
  },
};
