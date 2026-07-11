// PREMIUM STORE (docs/PREMIUM-STORE.md) — the monetization layer as PURE DATA. Every offer is a
// PremiumOfferDef on a registry: Ichor bundles, two permanent packs, three rotating daily packs,
// and time-windowed EVENT offers (holidays / anniversaries / collaborations) — a future offer is
// one data row, never engine code.
//
// PHILOSOPHY (enforced here + state/premiumSafeguards.test.ts): purchases save time and add
// variety; they never skip systems. Grants flow through the game's EXISTING pipelines (containers
// crack in the Vault, equipment rolls the normal generator, shards still buy stars at normal
// prices). The type system caps direct equipment grants at EPIC — legendary/exotic gear stays a
// drop-luck moment; containers may still ROLL them at their normal odds. No offer can grant
// Ascendant Cells, campaign clears, evolution caps, or hero-slot unlocks: those aren't grants.
//
// PAYMENTS: no payment processor exists in this static SPA. `PREMIUM.checkout = 'sandbox'` — the
// purchase pipeline runs end-to-end (availability → charge seam → grant → receipt) with the charge
// step stubbed; a real provider (Stripe/Steam/App Store) implements ONE function (state/meta.ts
// `purchaseOffer`'s checkout call) without touching offers, grants, or UI.

import { Registry } from './registry';
import { hashStr } from './hash'; // lean import — functions/ shares this catalog (docs/DEPLOYMENT.md)
import { MARKET } from './market';

// ── Grant descriptors — the data language of every offer ─────────────────────
/** Rarities a premium offer may grant DIRECTLY. Deliberately excludes legendary/exotic gear
 *  (drop-luck stays sacred) and exotic containers (the market's Ichor showpiece). */
export type PremiumEquipRarity = 'rare' | 'epic';
export type PremiumContainerRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type PremiumGrant =
  | { grant: 'ichor'; qty: number }
  | { grant: 'cores'; qty: number } // Genome Cores (save.shards)
  | { grant: 'geneEssence'; qty: number }
  | { grant: 'mats'; mutagen?: number; scrap?: number; catalyst?: number }
  | { grant: 'towerShardsAll'; qtyEach: number } // every tower kind (unlock/star progress)
  | { grant: 'heroShardsAll'; qtyEach: number } // every hero (guaranteed hero unlock progress)
  | { grant: 'container'; rarity: PremiumContainerRarity; count: number } // cracks in the Vault
  | { grant: 'runCache'; count: number } // a standard Run Cache container
  | { grant: 'equipment'; rarity: PremiumEquipRarity; count: number } // rolled by the normal generator
  | { grant: 'rushStamina'; qty: number }
  | { grant: 'battlePassPremium' }; // unlock the CURRENT season's premium track (docs/BATTLEPASS.md)

// ── The offer definition ──────────────────────────────────────────────────────
export type PremiumOfferKind = 'ichor' | 'permanent' | 'rotating' | 'event' | 'season' | 'flash';

/** What arms a FLASH offer (state/flashOffers.ts evaluates these against the save — the
 *  data stays here so functions/ prices the SKUs; the popup/status machine is client-only). */
export type FlashTrigger =
  | { kind: 'stage'; stage: number } // clear campaign stage N
  | { kind: 'megas'; count: number } // distinct Mega Bosses slain
  | { kind: 'passLevel'; level: number } // reach Season Pass level N (any season)
  | { kind: 'molts'; count: number }; // lifetime prestige Molts

export interface PremiumOfferDef {
  id: string;
  kind: PremiumOfferKind;
  name: string;
  tagline: string; // one-line pitch under the name
  audience?: string; // who it's designed for ("New players", "Mid-game", …)
  priceUsd: number; // display price — the charge itself happens at the provider seam
  /** Struck-through "was" price for SALE SKUs (first-season pass, flash bundles). HONESTY RULE
   *  (premium.test.ts): never above the goods' real à-la-carte worth (offerValueIchor at the
   *  base rate) — a sale compares against what the contents actually cost, not a made-up anchor. */
  listUsd?: number;
  grants: PremiumGrant[];
  baseIchor?: number; // ichor bundles: the base amount (bonus on top, in `grants`)
  bonusPct?: number; // ichor bundles: the displayed bonus percentage
  limit?: number; // lifetime purchase cap (permanent packs: 1); undefined = unlimited
  oncePerDay?: boolean; // rotating packs: one purchase per UTC day it appears
  rotationIndex?: number; // rotating packs: slot in the daily rotation ring (0..n-1)
  window?: { from: string; to: string }; // event offers: inclusive ISO-date window (UTC)
  /** Flash offers: the milestone that arms it + how long it stays live once first SEEN
   *  (the countdown anchors at first sight, never at the trigger — stepping away between
   *  sessions can't silently burn the window). Timing/cadence rules: state/flashOffers.ts. */
  flash?: { trigger: FlashTrigger; hours: number };
  accent: string; // card accent (CSS color)
  art: string; // procedural card glyph
}

// ── The registry (open for events/collabs — registry.ts conventions) ─────────
export const premiumRegistry = new Registry<PremiumOfferDef>('premiumOffer', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (d.priceUsd <= 0) out.push('priceUsd must be > 0');
    if (d.grants.length === 0) out.push('an offer must grant something');
    if (d.kind === 'permanent' && d.limit !== 1) out.push('permanent packs must be limit: 1');
    if (d.kind === 'rotating' && d.rotationIndex === undefined) out.push('rotating packs need rotationIndex');
    if (d.kind === 'event' && !d.window) out.push('event offers need a date window');
    if (d.kind === 'season' && !d.grants.some((g) => g.grant === 'battlePassPremium')) out.push('season offers must grant battlePassPremium');
    if (d.kind === 'flash') {
      if (!d.flash) out.push('flash offers need a trigger + window (flash config)');
      if (d.limit !== 1) out.push('flash offers must be limit: 1 (one-time by contract)');
      if (d.priceUsd > 5) out.push('flash offers must stay cheap (≤ $5 by contract)');
      if (d.listUsd === undefined || d.listUsd <= d.priceUsd) out.push('flash offers must carry a real listUsd above the sale price');
    }
    if (d.listUsd !== undefined && d.listUsd <= d.priceUsd) out.push('listUsd must exceed priceUsd (a sale must be a sale)');
    return out;
  },
});

export function registerPremiumOffer(def: PremiumOfferDef): PremiumOfferDef {
  return premiumRegistry.register(def);
}
export function premiumOfferById(id: string): PremiumOfferDef | undefined {
  return premiumRegistry.get(id);
}

// ── Store config ──────────────────────────────────────────────────────────────
export const PREMIUM = {
  /** 'sandbox' — the charge step is stubbed (grants flow, receipts say sandbox). A production
   *  build swaps this to its provider id once real checkout is wired at the meta seam. */
  checkout: 'sandbox' as 'sandbox' | 'provider',
  /** $1 ≈ this much base Ichor — the anchor every bundle/pack price derives from. Chosen against the
   *  live sinks: the cheapest container is 30 Ichor (~$1.20), an exotic container 170 (~$5.50 at
   *  the base rate, less with bundle bonuses) — real money buys ACCELERATION through the same
   *  market F2P uses, never unique power. */
  ichorPerUsd: 25,
} as const;

// ── Ichor bundles — six tiers, growing bonus (displayed) ──────────────────────
// Value ladder: base = priceUsd × ichorPerUsd; bonus rises 0% → 60% so bigger commitment reads as
// clearly better $/Ichor without making small buys feel dumb (starter is the trial handshake).
function ichorBundle(id: string, name: string, tagline: string, priceUsd: number, bonusPct: number, accent: string, art: string): PremiumOfferDef {
  const base = Math.round(priceUsd * PREMIUM.ichorPerUsd);
  const total = Math.round(base * (1 + bonusPct / 100));
  return {
    id, kind: 'ichor', name, tagline, priceUsd, accent, art,
    baseIchor: base, bonusPct,
    grants: [{ grant: 'ichor', qty: total }],
  };
}

export const ICHOR_BUNDLES: PremiumOfferDef[] = [
  ichorBundle('ichor_starter', 'Starter Vial', 'A first taste of the black market.', 1.99, 0, 'var(--kinetic)', '◉'),
  ichorBundle('ichor_small', 'Small Phial', 'Enough for a container and change.', 4.99, 8, 'var(--kinetic)', '◎'),
  ichorBundle('ichor_medium', 'Ichor Flask', 'The everyday collector’s draw.', 9.99, 15, 'var(--caustic)', '⬢'),
  ichorBundle('ichor_large', 'Ichor Cask', 'Stock the vault for a deep season.', 19.99, 25, 'var(--gold)', '⬣'),
  ichorBundle('ichor_mega', 'Ichor Reservoir', 'A reservoir of possibilities.', 49.99, 40, 'var(--vital)', '⬟'),
  ichorBundle('ichor_whale', 'The Wellspring', 'The market bows when you arrive.', 99.99, 60, 'var(--viral)', '❖'),
];

// ── Permanent packs — two, once per account ───────────────────────────────────
export const PERMANENT_PACKS: PremiumOfferDef[] = [
  {
    id: 'pack_starter_mutation', kind: 'permanent', limit: 1,
    name: 'Starter Mutation Pack', tagline: 'Everything a young hive needs to take root.',
    audience: 'New players', priceUsd: 4.99, accent: 'var(--caustic)', art: '🧬',
    // ~2.4× the $4.99 ichor bundle's value in mixed goods (see docs) — the classic starter deal.
    // Shards buy stars at NORMAL prices; equipment rolls the normal generator at RARE.
    grants: [
      { grant: 'ichor', qty: 120 },
      { grant: 'towerShardsAll', qtyEach: 15 },
      { grant: 'heroShardsAll', qtyEach: 20 }, // guaranteed hero unlock progress (stars ladder)
      { grant: 'runCache', count: 1 },
      { grant: 'equipment', rarity: 'rare', count: 2 },
    ],
  },
  {
    id: 'pack_growth_accelerator', kind: 'permanent', limit: 1,
    name: 'Growth Accelerator Pack', tagline: 'For the hive that has found its rhythm.',
    audience: 'Mid-game players', priceUsd: 19.99, accent: 'var(--gold)', art: '⚗',
    // Higher-rarity CONTAINERS (they still roll normal odds — the legendary stays a moment),
    // epic-capped gear, crafting mats, gene essence, cores. ~2.2× the $19.99 bundle's value.
    grants: [
      { grant: 'ichor', qty: 320 },
      { grant: 'container', rarity: 'epic', count: 2 },
      { grant: 'container', rarity: 'legendary', count: 1 },
      { grant: 'equipment', rarity: 'epic', count: 2 },
      { grant: 'mats', mutagen: 12, scrap: 30, catalyst: 8 },
      { grant: 'geneEssence', qty: 150 },
      { grant: 'cores', qty: 400 },
    ],
  },
];

// ── Rotating packs — three, ONE visible per UTC day ───────────────────────────
export const ROTATING_PACKS: PremiumOfferDef[] = [
  // Each rotating pack targets ~×1.65 à-la-carte value at $9.99 (par 250 Ichor): clearly better
  // than a bundle, clearly themed, and time-limited (one day, once) so it never becomes a faucet.
  {
    id: 'rot_tower_research', kind: 'rotating', rotationIndex: 0, oncePerDay: true,
    name: 'Tower Research Bundle', tagline: 'A day of strain samples and study.',
    priceUsd: 9.99, accent: 'var(--kinetic)', art: 'T',
    grants: [
      { grant: 'towerShardsAll', qtyEach: 40 }, // 200 shards of star progress — the headline
      { grant: 'cores', qty: 200 },
      { grant: 'container', rarity: 'rare', count: 3 },
      { grant: 'container', rarity: 'epic', count: 1 },
      { grant: 'geneEssence', qty: 100 },
      { grant: 'ichor', qty: 130 },
    ],
  },
  {
    id: 'rot_hero_enhancement', kind: 'rotating', rotationIndex: 1, oncePerDay: true,
    name: 'Hero Enhancement Bundle', tagline: 'Champions grow on what you feed them.',
    priceUsd: 9.99, accent: 'var(--vital)', art: 'H',
    grants: [
      { grant: 'heroShardsAll', qtyEach: 45 }, // 135 shards across the roster — hero stars move
      { grant: 'equipment', rarity: 'rare', count: 2 },
      { grant: 'ichor', qty: 180 },
      { grant: 'container', rarity: 'epic', count: 1 },
      { grant: 'runCache', count: 1 },
      { grant: 'rushStamina', qty: 20 },
    ],
  },
  {
    id: 'rot_equipment_forge', kind: 'rotating', rotationIndex: 2, oncePerDay: true,
    name: 'Equipment Forge Bundle', tagline: 'Feed the reforge — the perfect roll awaits.',
    priceUsd: 9.99, accent: 'var(--gold)', art: '⚒',
    grants: [
      { grant: 'mats', mutagen: 15, scrap: 40, catalyst: 12 }, // catalyst is the reforge chokepoint
      { grant: 'equipment', rarity: 'epic', count: 3 },
      { grant: 'container', rarity: 'epic', count: 2 },
      { grant: 'ichor', qty: 150 },
    ],
  },
];

// ── Season Pass — the Battle Pass premium track, once per rotation ────────────
// Repurchasable each season (meta gates on the live record: unavailable while premium is
// already owned this window). The in-game Ichor path (BP.premiumIchor) prices at the same
// $9.99 anchor — two doors, one flag.
export const SEASON_PASS_OFFER: PremiumOfferDef = {
  id: 'bp_premium', kind: 'season',
  name: 'Season Pass — Premium', tagline: 'Unlock the current season’s premium reward track.',
  audience: 'Every commander', priceUsd: 9.99, accent: 'var(--gold)', art: '❁',
  grants: [{ grant: 'battlePassPremium' }],
};

/** The FIRST-EVER season purchase is half price (limit 1, lifetime). While unclaimed it REPLACES
 *  the full-price SKU in every surface (meta.seasonOfferFor) — a new spender always gets the deal;
 *  accounts that already bought `bp_premium` at full price aren't first-timers and never see it.
 *  Separate SKU on purpose: functions/ prices checkout by id from this shared catalog, so the
 *  sale needs zero server changes and the fulfillment ledger enforces limit-1 server-side. */
export const SEASON_PASS_FIRST_OFFER: PremiumOfferDef = {
  id: 'bp_premium_first', kind: 'season', limit: 1,
  name: 'Season Pass — First Season', tagline: 'Your first premium season, half price. Once ever.',
  audience: 'First-time buyers', priceUsd: 4.99, listUsd: 9.99, accent: 'var(--gold)', art: '❁',
  grants: [{ grant: 'battlePassPremium' }],
};

// ── Flash sales — one-time pop-up bundles armed by MILESTONES (docs/PREMIUM-STORE.md §flash) ──
// Each fires at an achievement HIGH and sells goods matched to what the player is doing next.
// Contract (validator + premium.test.ts): limit 1, ≤ $5, a real listUsd (never above the goods'
// à-la-carte worth), value inside the same ≥×1.4/≤×3.0 pack bounds. Timing/cadence rules —
// eligibility floor, one-popup-at-a-time, 72h cooldown, 48h first-sight window — live in
// state/flashOffers.ts (client-only); the rows stay HERE so functions/ prices the SKUs.
export const FLASH_OFFERS: PremiumOfferDef[] = [
  {
    id: 'flash_first_hunt', kind: 'flash', limit: 1,
    name: 'First Hunt Cache', tagline: 'The first Mega falls — the market takes notice.',
    audience: 'One-time offer', priceUsd: 1.99, listUsd: 3.99, accent: 'var(--caustic)', art: '☄',
    flash: { trigger: { kind: 'megas', count: 1 }, hours: 48 },
    grants: [{ grant: 'ichor', qty: 40 }, { grant: 'container', rarity: 'rare', count: 1 }, { grant: 'geneEssence', qty: 50 }],
  },
  {
    id: 'flash_season_spark', kind: 'flash', limit: 1,
    name: 'Season Spark', tagline: 'Five levels deep — fuel for the climb ahead.',
    audience: 'One-time offer', priceUsd: 2.99, listUsd: 6.99, accent: 'var(--gold)', art: '❁',
    flash: { trigger: { kind: 'passLevel', level: 5 }, hours: 48 },
    grants: [{ grant: 'ichor', qty: 70 }, { grant: 'container', rarity: 'epic', count: 1 }, { grant: 'runCache', count: 1 }],
  },
  {
    id: 'flash_deep_roots', kind: 'flash', limit: 1,
    name: 'Deep Roots Bundle', tagline: 'Stage 12 cleared — grow the arsenal that got you here.',
    audience: 'One-time offer', priceUsd: 3.99, listUsd: 8.99, accent: 'var(--kinetic)', art: '⟁',
    flash: { trigger: { kind: 'stage', stage: 12 }, hours: 48 },
    grants: [{ grant: 'towerShardsAll', qtyEach: 20 }, { grant: 'cores', qty: 200 }, { grant: 'container', rarity: 'epic', count: 2 }, { grant: 'ichor', qty: 60 }],
  },
  {
    id: 'flash_molt_gift', kind: 'flash', limit: 1,
    name: 'Molt Celebration', tagline: 'The organism sheds its skin — a gift for the new form.',
    audience: 'One-time offer', priceUsd: 4.99, listUsd: 10.99, accent: 'var(--viral)', art: '♻',
    flash: { trigger: { kind: 'molts', count: 1 }, hours: 48 },
    grants: [{ grant: 'ichor', qty: 120 }, { grant: 'container', rarity: 'legendary', count: 1 }, { grant: 'mats', mutagen: 8, scrap: 20, catalyst: 6 }, { grant: 'geneEssence', qty: 100 }],
  },
];

export const PREMIUM_OFFERS: PremiumOfferDef[] = [
  ...ICHOR_BUNDLES, ...PERMANENT_PACKS, ...ROTATING_PACKS, SEASON_PASS_OFFER, SEASON_PASS_FIRST_OFFER, ...FLASH_OFFERS,
];
premiumRegistry.registerAll(PREMIUM_OFFERS);

/** The season SKU an account should SEE and buy: the half-price first-timer SKU while it's
 *  unclaimed (and no full-price purchase exists), the standard SKU after. One source of truth
 *  for the store card, the pass-screen door, and meta availability. */
export function seasonOfferFor(purchases: Record<string, number>): PremiumOfferDef {
  const first = (purchases[SEASON_PASS_FIRST_OFFER.id] ?? 0) === 0 && (purchases[SEASON_PASS_OFFER.id] ?? 0) === 0;
  return first ? SEASON_PASS_FIRST_OFFER : SEASON_PASS_OFFER;
}

// ── Availability ──────────────────────────────────────────────────────────────
/** The rotating pack visible on a given UTC day key — ONE of the ring, rotating every 24h.
 *  Seeded off the key hash so the sequence isn't a trivially predictable modulo of the date. */
export function todaysRotatingOffer(key: string): PremiumOfferDef {
  const ring = premiumRegistry.all().filter((o) => o.kind === 'rotating')
    .sort((a, b) => (a.rotationIndex ?? 0) - (b.rotationIndex ?? 0));
  return ring[hashStr('rot:' + key) % ring.length];
}

/** Event offers live on `key` (inclusive window) — holidays/anniversaries/collabs plug in here. */
export function activeEventOffers(key: string): PremiumOfferDef[] {
  return premiumRegistry.all().filter((o) => o.kind === 'event' && o.window && o.window.from <= key && key <= o.window.to);
}

/** Whether `offer` is purchasable on `key` given the account's purchase ledger.
 *  PURE layer only — season SKUs additionally gate on premium-owned-this-window and flash
 *  SKUs on their trigger/first-sight window (both need the save: meta.offerPurchasable). */
export function offerAvailable(offer: PremiumOfferDef, key: string, purchases: Record<string, number>, lastDayBought?: string): boolean {
  if (offer.limit !== undefined && (purchases[offer.id] ?? 0) >= offer.limit) return false;
  if (offer.kind === 'rotating') {
    if (todaysRotatingOffer(key).id !== offer.id) return false;
    if (offer.oncePerDay && lastDayBought === key) return false;
  }
  if (offer.kind === 'event') return activeEventOffers(key).some((o) => o.id === offer.id);
  // The season pair shows exactly ONE door: the half-price first-timer SKU until it's spent,
  // the standard SKU after — the full price is never charged to a first-time buyer.
  if (offer.kind === 'season' && seasonOfferFor(purchases).id !== offer.id) return false;
  return true;
}

// ── Perceived value (docs/PREMIUM-STORE.md §value) ────────────────────────────
// Ichor-equivalents per grant, derived from the LIVE market sinks (MARKET prices) + the market's
// own cores↔ichor exchange ratios. Drives the "worth ~N Ichor" display, the pack bonus badges,
// and the economy simulation — one table, one truth.
const VALUE = {
  corePerIchor: 40, // market premium-pool ratio (~6 tower shards/ichor at ~8 cores/shard), conservative
  towerShardIchor: 1 / 6,
  heroShardIchor: 1 / 1.5,
  essenceIchor: 0.3, // essence sells ~12 cores each in core slots
  matIchor: { mutagen: 1.2, scrap: 0.45, catalyst: 1.5 }, // scrap 18c; catalyst is the reforge chokepoint
  runCacheIchor: 35,
  staminaIchor: MARKET.staminaPackPrice / MARKET.staminaPackQty,
} as const;

/** The offer's total worth in Ichor-equivalents (à-la-carte market prices). */
export function offerValueIchor(offer: PremiumOfferDef): number {
  let v = 0;
  for (const g of offer.grants) {
    switch (g.grant) {
      case 'ichor': v += g.qty; break;
      case 'cores': v += g.qty / VALUE.corePerIchor; break;
      case 'geneEssence': v += g.qty * VALUE.essenceIchor; break;
      case 'mats': v += (g.mutagen ?? 0) * VALUE.matIchor.mutagen + (g.scrap ?? 0) * VALUE.matIchor.scrap + (g.catalyst ?? 0) * VALUE.matIchor.catalyst; break;
      case 'towerShardsAll': v += g.qtyEach * 5 * VALUE.towerShardIchor; break; // 5 tower kinds
      case 'heroShardsAll': v += g.qtyEach * 3 * VALUE.heroShardIchor; break; // 3 heroes
      case 'container': v += (MARKET.containerPrice[g.rarity] ?? 30) * g.count; break;
      case 'runCache': v += VALUE.runCacheIchor * g.count; break;
      case 'equipment': v += (MARKET.equipPrice[g.rarity] ?? 12) * g.count; break;
      case 'rushStamina': v += g.qty * VALUE.staminaIchor; break;
      // The in-game Ichor door for the same unlock (BP.premiumIchor — battlePass.test.ts pins
      // this constant against core/battlePass.ts; hardcoded to keep the functions/ bundle lean).
      case 'battlePassPremium': v += 250; break;
    }
  }
  return Math.round(v);
}

/** Value multiple vs buying the same Ichor at the offer's price (1.0 = par with the base rate).
 *  The store shows this as "×N value" on packs; bundles show their explicit bonusPct instead. */
export function offerValueMultiple(offer: PremiumOfferDef): number {
  const parIchor = offer.priceUsd * PREMIUM.ichorPerUsd;
  return parIchor > 0 ? offerValueIchor(offer) / parIchor : 1;
}
