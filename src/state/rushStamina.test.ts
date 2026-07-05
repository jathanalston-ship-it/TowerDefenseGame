// Boss Rush stamina (docs/BOSS-RUSH.md §stamina): lazy regen, entry costs, the free daily
// entry, overflow grants, clock-tamper posture, and the Splice Market stamina pack.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { RUSH } from '../core/config';
import { MARKET, rollStock } from '../core/market';

const DAY = 86_400_000;
const REGEN = RUSH.staminaRegenSec * 1000;
// Anchor all clocks to a fixed UTC noon so day-key math never straddles a boundary.
const T0 = Date.UTC(2026, 6, 4, 12, 0, 0);

function freshMeta(): void {
  meta.reset();
  meta.abandonRun();
}

describe('Boss Rush stamina', () => {
  it('starts full, pays the daily FREE entry first, then charges the cost', () => {
    freshMeta();
    expect(meta.rushStamina(T0).value).toBe(RUSH.staminaMax);
    expect(meta.rushStamina(T0).freeAvailable).toBe(true);

    const first = meta.spendRushEntry(T0);
    expect(first).toEqual({ ok: true, free: true });
    expect(meta.rushStamina(T0).value).toBe(RUSH.staminaMax); // free = no stamina consumed
    expect(meta.rushStamina(T0).freeAvailable).toBe(false);

    const second = meta.spendRushEntry(T0 + 1000);
    expect(second).toEqual({ ok: true, free: false });
    expect(meta.rushStamina(T0 + 1000).value).toBe(RUSH.staminaMax - RUSH.staminaCost);
  });

  it('the free entry re-arms on the NEXT day', () => {
    freshMeta();
    meta.spendRushEntry(T0);
    expect(meta.rushStamina(T0 + 60_000).freeAvailable).toBe(false);
    expect(meta.rushStamina(T0 + DAY).freeAvailable).toBe(true);
    expect(meta.spendRushEntry(T0 + DAY).free).toBe(true);
  });

  it('regenerates 1 point per interval, capped at the ceiling', () => {
    freshMeta();
    meta.spendRushEntry(T0); // free
    meta.spendRushEntry(T0); // -20
    const spent = RUSH.staminaMax - RUSH.staminaCost;
    expect(meta.rushStamina(T0 + REGEN - 1).value).toBe(spent);
    expect(meta.rushStamina(T0 + REGEN).value).toBe(spent + 1);
    expect(meta.rushStamina(T0 + 5 * REGEN).value).toBe(spent + 5);
    expect(meta.rushStamina(T0 + 1000 * REGEN).value).toBe(RUSH.staminaMax); // capped
  });

  it('refuses an entry it cannot afford (no mutation)', () => {
    freshMeta();
    meta.spendRushEntry(T0); // free used
    const runs = Math.floor(RUSH.staminaMax / RUSH.staminaCost);
    for (let i = 0; i < runs; i++) expect(meta.spendRushEntry(T0).ok).toBe(true);
    expect(meta.rushStamina(T0).value).toBe(0);
    expect(meta.spendRushEntry(T0)).toEqual({ ok: false, free: false });
    expect(meta.rushStamina(T0).value).toBe(0);
  });

  it('grants overflow past the regen ceiling up to the hard cap, and overflow pauses regen', () => {
    freshMeta();
    meta.grantRushStamina(999, T0);
    expect(meta.rushStamina(T0).value).toBe(RUSH.staminaOverflowMax);
    // Above the ceiling nothing regenerates — spending later starts from the overflow value.
    expect(meta.rushStamina(T0 + 50 * REGEN).value).toBe(RUSH.staminaOverflowMax);
  });

  it('a rewound clock never mints stamina or a second free entry', () => {
    freshMeta();
    meta.spendRushEntry(T0); // free consumed for T0's day
    meta.spendRushEntry(T0); // -20
    const before = meta.rushStamina(T0).value;
    expect(meta.rushStamina(T0 - DAY).value).toBe(before); // negative elapsed clamps to 0 regen
    expect(meta.rushStamina(T0 - DAY).freeAvailable).toBe(false); // yesterday < recorded day
  });

  it('the Splice Market stocks a stamina pack that grants on purchase', () => {
    freshMeta();
    // Find a window whose stock includes the pack (3-of-5 premium rows → dense enough).
    const save = meta.get();
    const seed = (save.createdAt || 0) >>> 0;
    let window = 0;
    let slotId: string | null = null;
    for (let w = 1; w < 60 && !slotId; w++) {
      const stock = rollStock(seed, w, { towers: ['needle'], heroes: ['ravager'] });
      const slot = stock.find((s) => s.item.good === 'stamina');
      if (slot) { window = w; slotId = slot.id; }
    }
    expect(slotId).not.toBeNull();
    meta.grantIchor('test', MARKET.staminaPackPrice);
    // Drain stamina first so the grant is visible under the overflow cap.
    const now = window * MARKET.refreshMs + 1;
    meta.spendRushEntry(now); // free
    meta.spendRushEntry(now); // -20
    const before = meta.rushStamina(now).value;
    expect(meta.buyMarketSlot(slotId!, now)).toBe(true);
    expect(meta.rushStamina(now).value).toBe(Math.min(RUSH.staminaOverflowMax, before + MARKET.staminaPackQty));
    expect(meta.get().ichor).toBe(0); // pack price spent
  });
});
