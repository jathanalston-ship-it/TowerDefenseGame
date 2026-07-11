// FLASH OFFERS (docs/PREMIUM-STORE.md §flash) — the client-side status machine and popup
// TIMING for the one-time flash-sale SKUs authored in core/premium.ts. The split is deliberate:
// the SKU rows live in the shared catalog so functions/ prices checkout, while everything about
// WHEN a sale appears (trigger evaluation, the first-sight countdown, popup cadence) is pure
// client presentation and lives here — in the STATE layer (it reads the save; core/ may not).
//
// TIMING PHILOSOPHY (the retention design, kept inside the store's ethics contract):
//   • Triggers fire at achievement HIGHS (first Mega kill, stage clears, pass levels, the first
//     Molt) — the moment a player is proudest, with goods matched to what they're doing next.
//   • The game proves itself first: no popup before ELIGIBILITY (stage 3 + 5 runs), mirroring
//     the store's own "acceleration, never obligation" stance.
//   • Never two at once, never twice: ONE popup per POPUP_COOLDOWN, a dismissed popup never
//     re-pops (it collapses to the store's Flash section for the rest of its window).
//   • The 48h countdown anchors at FIRST SIGHT (popup or store visit), never at the trigger —
//     stepping away between sessions can't silently burn a window the player never saw.

import type { PremiumOfferDef, FlashTrigger } from '../core/premium';
import { FLASH_OFFERS } from '../core/premium';
import { levelOf } from '../core/battlePass';
import { highestCampaignStage } from '../save/derive';
import type { SaveData } from '../save/saveStore';

// ── Cadence config ─────────────────────────────────────────────────────────────
export const FLASH = {
  /** No popups before this floor — the loop must be fluent before the market speaks up. */
  minStage: 3,
  minRuns: 5,
  /** Minimum gap between popups — armed offers QUEUE behind it, they don't stack. */
  popupCooldownMs: 72 * 3_600_000,
} as const;

/** The persisted per-offer flash ledger (save.premium.flash). */
export interface FlashSlot {
  shownAt?: number; // first-sight timestamp — anchors the expiry countdown
  dismissed?: boolean; // popup closed — never modal again, store chip remains
}
export type FlashLedger = Record<string, FlashSlot>;

export type FlashStatus =
  | 'locked' // trigger not yet met
  | 'ready' // armed — waiting for its popup / first store sighting
  | 'live' // seen and inside the window — purchasable
  | 'expired' // window burned
  | 'owned'; // purchased

// ── Trigger evaluation (pure, save-derived) ───────────────────────────────────
export function flashTriggerMet(save: SaveData, t: FlashTrigger): boolean {
  switch (t.kind) {
    case 'stage': return highestCampaignStage(save) >= t.stage;
    case 'megas': return save.megaProgress.slain.length >= t.count;
    case 'passLevel': return levelOf(save.battlePass.xp).level >= t.level;
    case 'molts': return (save.prestige.molts ?? 0) >= t.count;
  }
}

/** Player-facing line for a trigger (the store chip explains WHY this offer exists). */
export function flashTriggerLabel(t: FlashTrigger): string {
  switch (t.kind) {
    case 'stage': return `Cleared Campaign Stage ${t.stage}`;
    case 'megas': return t.count === 1 ? 'First Mega Boss slain' : `${t.count} Mega Bosses slain`;
    case 'passLevel': return `Reached Season Pass level ${t.level}`;
    case 'molts': return t.count === 1 ? 'First Molt completed' : `${t.count} Molts completed`;
  }
}

// ── Status machine ─────────────────────────────────────────────────────────────
export function flashExpiresAt(offer: PremiumOfferDef, slot: FlashSlot | undefined): number | null {
  if (!offer.flash || slot?.shownAt === undefined) return null;
  return slot.shownAt + offer.flash.hours * 3_600_000;
}

export function flashStatus(offer: PremiumOfferDef, save: SaveData, now: number): FlashStatus {
  if ((save.premium.purchases[offer.id] ?? 0) > 0) return 'owned';
  if (!offer.flash || !flashTriggerMet(save, offer.flash.trigger)) return 'locked';
  const slot = save.premium.flash[offer.id];
  if (slot?.shownAt === undefined) return 'ready';
  return now <= (flashExpiresAt(offer, slot) ?? 0) ? 'live' : 'expired';
}

/** Every flash offer with its live status — the store section + tests read this. */
export function flashOverview(save: SaveData, now: number): { offer: PremiumOfferDef; status: FlashStatus; expiresAt: number | null }[] {
  return FLASH_OFFERS.map((offer) => ({
    offer,
    status: flashStatus(offer, save, now),
    expiresAt: flashExpiresAt(offer, save.premium.flash[offer.id]),
  }));
}

/** The ONE offer allowed to pop a modal right now (null = stay quiet): eligibility floor met,
 *  cooldown elapsed since the last popup, nothing else currently live, and the offer itself is
 *  'ready'. Deterministic: catalog order breaks ties, so a backlog drains one per cooldown. */
export function flashPopupCandidate(save: SaveData, now: number): PremiumOfferDef | null {
  if (highestCampaignStage(save) < FLASH.minStage || save.totalRuns < FLASH.minRuns) return null;
  if (now - (save.premium.lastFlashShownAt ?? 0) < FLASH.popupCooldownMs) return null;
  const all = flashOverview(save, now);
  if (all.some((f) => f.status === 'live' && !save.premium.flash[f.offer.id]?.dismissed)) return null;
  return all.find((f) => f.status === 'ready')?.offer ?? null;
}

/** Sale badge percentage off the (honesty-tested) list price. */
export function flashSalePct(offer: PremiumOfferDef): number {
  if (offer.listUsd === undefined || offer.listUsd <= 0) return 0;
  return Math.round((1 - offer.priceUsd / offer.listUsd) * 100);
}
