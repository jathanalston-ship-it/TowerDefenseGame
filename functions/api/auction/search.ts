// GET /api/auction/search — the market browser (docs/AUCTION-HOUSE.md §search). Fast,
// index-backed filtering (idx_market_listings_browse) over ACTIVE listings: category,
// rarity, family set (free text resolves to family keys CLIENT-side against the shared
// catalog — the server never scans names), price band, season, four sort orders,
// pagination. Affix/collection-status refinements are client-side over the page
// (documented; an indexed affix column is the scale-up hook).

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { HOST, maintainMarket, toPublicListing } from '../../lib/auctionHost';
import type { ListingRow } from '../../lib/auctionHost';
import { MARKET_PAGE_SIZE } from '../../../src/core/auction';

const SORT_SQL: Record<string, string> = {
  endingSoon: 'ends_at ASC',
  priceAsc: 'COALESCE(buy_now, bid, ask) ASC',
  priceDesc: 'COALESCE(buy_now, bid, ask) DESC',
  newest: 'created_at DESC',
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-search', ip, { limit: 90, windowSec: 300 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const q = url.searchParams;

  const cat = q.get('cat');
  if (cat !== null && !['equipment', 'cosmetic', 'geneCard'].includes(cat)) return err(400, 'bad-cat');
  const rarity = q.get('rarity');
  if (rarity !== null && (rarity.length > 16 || !/^[a-z]+$/.test(rarity))) return err(400, 'bad-rarity');
  const familiesCsv = q.get('families');
  let familiesJson: string | null = null;
  if (familiesCsv !== null) {
    const keys = familiesCsv.split(',').map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 80).slice(0, 12);
    if (keys.length === 0) return err(400, 'bad-families');
    familiesJson = JSON.stringify(keys);
  }
  const numParam = (name: string, min: number, max: number): number | null | 'bad' => {
    const raw = q.get(name);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : 'bad';
  };
  const minPrice = numParam('minPrice', 0, 1_000_000);
  const maxPrice = numParam('maxPrice', 0, 1_000_000);
  const season = numParam('season', 0, 10_000);
  if (minPrice === 'bad' || maxPrice === 'bad' || season === 'bad') return err(400, 'bad-price');
  const sort = q.get('sort') ?? 'endingSoon';
  if (!(sort in SORT_SQL)) return err(400, 'bad-sort');
  const pageRaw = numParam('page', 0, HOST.pageCap);
  const page = pageRaw === null || pageRaw === 'bad' ? 0 : pageRaw;

  const now = Date.now();
  const state = await maintainMarket(env, now);
  const rows = await env.DB.prepare(
    `SELECT listing_id, global_item_id, family_key, category, rarity, seller_id, season, ask, buy_now, bid, bidder_id, ends_at, created_at, closed_at, state, fee_paid, authority
     FROM market_listings
     WHERE state = 'active' AND ends_at > ?1
       AND (?2 IS NULL OR category = ?2)
       AND (?3 IS NULL OR rarity = ?3)
       AND (?4 IS NULL OR family_key IN (SELECT value FROM json_each(?4)))
       AND (?5 IS NULL OR season = ?5)
       AND (?6 IS NULL OR COALESCE(buy_now, bid, ask) >= ?6)
       AND (?7 IS NULL OR COALESCE(buy_now, bid, ask) <= ?7)
     ORDER BY ${SORT_SQL[sort]}
     LIMIT ?8 OFFSET ?9`,
  ).bind(now, cat, rarity, familiesJson, season, minPrice, maxPrice, MARKET_PAGE_SIZE + 1, page * MARKET_PAGE_SIZE)
    .all<ListingRow>();
  const pageRows = rows.results.slice(0, MARKET_PAGE_SIZE);
  return json({
    ok: true,
    listings: pageRows.map(toPublicListing),
    page,
    hasMore: rows.results.length > MARKET_PAGE_SIZE,
    pageSize: MARKET_PAGE_SIZE,
    fees: { feeMult: state.feeMult, taxMult: state.taxMult },
    serverNow: now,
  });
};
