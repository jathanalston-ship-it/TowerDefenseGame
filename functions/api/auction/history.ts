// GET /api/auction/history?family= — one family's price intelligence (docs/AUCTION-HOUSE.md
// §pricing): the retained per-day history rows (the client's graph), the folded stats card
// (lowest listing / highest sale / recent average / estimated value / velocity /
// volatility), and the smart ask suggestion with the authority's live recBias applied.

import type { Env } from '../../lib/env';
import { clientIp, err, json } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { daysAgoKey, familyFloor, familyHistory, maintainMarket } from '../../lib/auctionHost';
import { familyStats, recommendedPrice } from '../../../src/core/auction';
import { TRADE } from '../../../src/core/trading';
import { marketFamily } from '../../../src/core/marketCatalog';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ip = clientIp(request);
  if (!(await rateLimit(env.DB, 'auction-history', ip, { limit: 90, windowSec: 300 }))) return err(429, 'rate-limited');
  const url = new URL(request.url);
  const familyKey = url.searchParams.get('family');
  if (!familyKey || familyKey.length > 80) return err(400, 'bad-family');
  const family = marketFamily(familyKey);
  if (!family) return err(404, 'unknown-family');

  const now = Date.now();
  const state = await maintainMarket(env, now);
  const [history, floor] = await Promise.all([
    familyHistory(env, familyKey, daysAgoKey(now, TRADE.historyDays)),
    familyFloor(env, familyKey),
  ]);
  const stats = familyStats(history, floor);
  return json({
    ok: true,
    family: { familyKey, name: family.name, cat: family.cat, rarity: family.rarity },
    history,
    stats,
    recommended: recommendedPrice(stats, state.recBias),
    fees: { feeMult: state.feeMult, taxMult: state.taxMult },
  });
};
