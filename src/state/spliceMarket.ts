// Splice Market read-model (docs/MARKET.md) — turns the deterministic stock (core/market)
// plus the save's purchase record into renderable slot views. Pure over SaveData + a clock,
// following the evolutionHQ.ts pattern: the component stays presentation-only.

import { msToNextWindow } from '../core/market';
import type { MarketGood, MarketSlot } from '../core/market';
import type { CurrencyId } from '../core/currencies';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import { rarityRegistry } from '../core/loot';
import { meta } from './meta';
import type { SaveData } from '../save/saveStore';

export interface MarketSlotView extends MarketSlot {
  name: string; // display name ("12× Needle Spitter Samples", "Rare Bio-Container", …)
  qtyLabel: string; // "×12" ('' for single items)
  currencyId: CurrencyId | null; // the GOODS' currency icon (null for equipment/containers)
  color: string; // accent (tower/hero hue, rarity color, currency color)
  glyph: string; // fallback glyph when there is no currency icon
  bought: boolean;
  affordable: boolean;
  isContainer: boolean;
}

export interface MarketView {
  window: number;
  msToRefresh: number;
  slots: MarketSlotView[];
  cores: number;
  ichor: number;
}

function describeGood(item: MarketGood): { name: string; qtyLabel: string; currencyId: CurrencyId | null; color: string; glyph: string } {
  switch (item.good) {
    case 'towerShards': {
      const def = TOWER_DEFS[item.kind];
      return { name: `${def?.name ?? item.kind} Samples`, qtyLabel: `×${item.qty}`, currencyId: 'towerShards', color: def?.color ?? 'var(--kinetic)', glyph: '◈' };
    }
    case 'heroShards': {
      const def = HERO_DEFS[item.hero as keyof typeof HERO_DEFS];
      return { name: `${def?.name ?? item.hero} Genome`, qtyLabel: `×${item.qty}`, currencyId: 'heroShards', color: def?.color ?? 'var(--vital)', glyph: '✶' };
    }
    case 'scrap':
      return { name: 'Scrap', qtyLabel: `×${item.qty}`, currencyId: null, color: 'var(--muted)', glyph: '◳' };
    case 'geneEssence':
      return { name: 'Gene Essence', qtyLabel: `×${item.qty}`, currencyId: 'geneEssence', color: 'var(--caustic, #6ad1b0)', glyph: '⌬' };
    case 'equipment': {
      const r = rarityRegistry.get(item.equipRarity);
      return { name: `${r?.name ?? item.equipRarity} Bio-Gear`, qtyLabel: '', currencyId: null, color: r?.color ?? 'var(--r-rare)', glyph: '⛨' };
    }
    case 'container': {
      const r = rarityRegistry.get(item.rarity);
      return { name: `${r?.name ?? item.rarity} Bio-Container`, qtyLabel: '', currencyId: null, color: r?.color ?? 'var(--r-common)', glyph: '◈' };
    }
    case 'stamina':
      return { name: 'Gauntlet Stamina', qtyLabel: `+${item.qty}`, currencyId: null, color: 'var(--danger, #ff5d73)', glyph: '☠' };
  }
}

/** The market screen's whole state for `now` — stock, purchases, budgets, countdown. */
export function marketView(save: SaveData, now = Date.now()): MarketView {
  const { window, stock, bought } = meta.marketState(now);
  return {
    window,
    msToRefresh: msToNextWindow(now),
    cores: save.shards,
    ichor: save.ichor,
    slots: stock.map((s) => ({
      ...s,
      ...describeGood(s.item),
      bought: bought.includes(s.id),
      affordable: (s.pay === 'cores' ? save.shards : save.ichor) >= s.price,
      isContainer: s.item.good === 'container',
    })),
  };
}
