// EVENT EXCHANGE SHOP SIMULATION (docs/LIVE-EVENTS.md §shops) — npm run sim:eventshops.
// Day-resolution greedy buyers walk every event's storefront with persona-scaled challenge
// income (the ONLY token source — event currency is engagement-only, unpurchasable). Laws:
// no persona clears a shop in a single window (the "significant investment" contract is
// window count, not wallet size); casual personas still buy meaningfully; REPEAT windows
// (signatures owned via the lifetime ledger) keep absorbing a veteran's full income (no
// worthless second visit); and the window ends in the wanting state often enough that the
// UI's ≥70%-banked "almost" hook has something to bite on.

import {
  EVENT_HORIZONS, LIVE_EVENTS_V2, liveEventProblems, rowWindowStock, shopWindowClearCost,
} from '../src/core/liveEvents';
import type { EventShopRow, LiveEventDefV2 } from '../src/core/liveEvents';

const fails: string[] = [];
const bar = (ok: boolean, label: string): void => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) fails.push(label);
};

// Challenge-completion rates per archetype (the sim:events persona table).
const PERSONAS: Record<string, number> = { 'new-player': 0.45, 'f2p-regular': 0.7, veteran: 0.85, whale: 1.0 };

interface WalkResult {
  buys: number;         // units bought
  spent: number;        // tokens burned
  income: number;       // tokens earned across the window
  leftover: number;     // bank at window end
  unboughtUnits: number; // window-stock units never purchased
  nextCost: number;     // cheapest row still purchasable at window end (Infinity = cleared)
}

/** Greedy cheapest-first walk of one window: income drips daily, daily/weekly rows restock
 *  on their period, lifetime rows are skipped when `repeat` (owned since the first visit). */
function walk(e: LiveEventDefV2, rate: number, repeat: boolean): WalkResult {
  const period = EVENT_HORIZONS[e.horizon].periodDays;
  const pool = (e.challenges ?? []).reduce((a, c) => a + c.tokens, 0);
  const cap = e.currency?.cap ?? 0;
  const rows = (e.shop ?? []).filter((r) => !(repeat && (r.limit ?? 'window') === 'lifetime'));
  const boughtTotal = new Map<EventShopRow, number>();
  let bank = 0;
  let spent = 0;
  let buys = 0;
  for (let day = 0; day < period; day++) {
    bank = Math.min(cap, bank + (pool * rate) / period);
    const sellableToday = (r: EventShopRow): number => {
      const limit = r.limit ?? 'window';
      const total = boughtTotal.get(r) ?? 0;
      if (limit === 'daily') {
        // restocks each day: today's allowance minus what today already consumed
        const priorDays = Math.floor(total / r.stock) * r.stock; // full days consumed
        return day * r.stock >= priorDays ? Math.min(r.stock, (day + 1) * r.stock - total) : 0;
      }
      if (limit === 'weekly') return Math.min(r.stock, (Math.floor(day / 7) + 1) * r.stock - total);
      return r.stock - total; // window + lifetime: one pool for the whole window
    };
    for (;;) {
      const buyable = rows
        .filter((r) => sellableToday(r) > 0 && r.costTokens <= bank)
        .sort((a, b) => a.costTokens - b.costTokens);
      if (buyable.length === 0) break;
      const r = buyable[0];
      boughtTotal.set(r, (boughtTotal.get(r) ?? 0) + 1);
      bank -= r.costTokens;
      spent += r.costTokens;
      buys++;
    }
  }
  let unboughtUnits = 0;
  let nextCost = Infinity;
  for (const r of rows) {
    const left = rowWindowStock(e, r) - (boughtTotal.get(r) ?? 0);
    if (left > 0) { unboughtUnits += left; nextCost = Math.min(nextCost, r.costTokens); }
  }
  return { buys, spent, income: pool * rate, leftover: bank, unboughtUnits, nextCost };
}

console.log('EVENT EXCHANGE SHOPS — persona window walks (greedy cheapest-first)\n');
const problems = liveEventProblems();
bar(problems.length === 0, `registry laws hold (${problems.join('; ') || 'no problems'})`);

let hookCells = 0;
let cells = 0;
for (const e of LIVE_EVENTS_V2) {
  if (!e.shop || !e.currency) continue;
  const pool = (e.challenges ?? []).reduce((a, c) => a + c.tokens, 0);
  const clear = shopWindowClearCost(e);
  console.log(`\n${e.theme.logo} ${e.name} — ${e.storefront?.name ?? 'shop'} (pool ${pool}, window clear ${clear})`);
  for (const [id, rate] of Object.entries(PERSONAS)) {
    const first = walk(e, rate, false);
    const rep = walk(e, rate, true);
    const gap = first.nextCost === Infinity ? 0 : first.leftover / first.nextCost;
    cells++;
    if (gap >= 0.5) hookCells++;
    console.log(
      `  ${id.padEnd(12)} buys ${String(first.buys).padStart(2)} · spends ${String(first.spent.toFixed(0)).padStart(4)}/${first.income.toFixed(0)}` +
      ` · ends ${first.leftover.toFixed(0)} short of ${first.nextCost === Infinity ? '—' : first.nextCost} (hook ${(gap * 100).toFixed(0)}%)` +
      ` · repeat spends ${(rep.spent / Math.max(1, rep.income) * 100).toFixed(0)}%`,
    );
    // L1 — NO persona clears the storefront in one window (not even 100% completion).
    bar(first.unboughtUnits >= 1, `${e.id}/${id}: window ends with ${first.unboughtUnits} unit(s) unbought`);
  }
  // L2/L3 — casual personas still participate meaningfully.
  bar(walk(e, PERSONAS['new-player'], false).buys >= 1, `${e.id}: new players afford ≥1 purchase`);
  bar(walk(e, PERSONAS['f2p-regular'], false).buys >= 2, `${e.id}: F2P regulars afford ≥2 purchases`);
  // L4 — REPEAT windows stay hungry: with every signature owned, the storefront still
  // absorbs ≥70% of a veteran's full-window income (no worthless return visit), and the
  // non-lifetime inventory alone out-costs a full completion's pool.
  const vetRep = walk(e, PERSONAS.veteran, true);
  bar(vetRep.spent >= vetRep.income * 0.7, `${e.id}: repeat-window veteran spend ${(vetRep.spent / vetRep.income * 100).toFixed(0)}% ≥ 70%`);
  const nonLifetimeClear = (e.shop ?? []).filter((r) => (r.limit ?? 'window') !== 'lifetime')
    .reduce((a, r) => a + r.costTokens * rowWindowStock(e, r), 0);
  bar(nonLifetimeClear >= pool, `${e.id}: repeat inventory (${nonLifetimeClear}) out-costs the full pool (${pool})`);
}

// L5 — the wanting state is common: a healthy share of persona×event windows end with a
// bank ≥50% of the next purchase (the UI's almost-hook band starts at 70%).
console.log(`\nhook coverage: ${hookCells}/${cells} persona-windows end ≥50% banked toward the next buy`);
bar(hookCells >= Math.floor(cells * 0.2), `wanting-state coverage ${hookCells}/${cells} ≥ 20% of windows`);

if (fails.length > 0) {
  console.error(`\nFAILED ${fails.length} shop law(s).`);
  process.exit(1);
}
console.log('\nALL SHOP LAWS HOLD — storefronts stay wanting, casuals participate, repeats absorb.');
