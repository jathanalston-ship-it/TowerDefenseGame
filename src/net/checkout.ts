// Stripe Checkout client flow (docs/DEPLOYMENT.md §purchases).
//
//   buy → POST /api/store/checkout → redirect to Stripe → return with
//   ?checkout=success&session_id=… → claim → meta.applyVerifiedPurchase (once).
//
// Crash-safety: the pending checkout is persisted in the save BEFORE the
// redirect, and resumePendingClaims() runs on every boot — a refresh, closed
// tab, power loss, or network drop after payment still delivers exactly once
// (the server's fulfillments PK + the client's claimedReceipts ledger both
// guarantee it independently).

import { meta } from '../state/meta';
import { telemetry } from './telemetry';
import { guestModeActive } from '../state/guestMode';
import type { PremiumReceipt } from '../state/meta';
import type { PremiumOfferDef } from '../core/premium';
import { guard } from '../security/actionGuard';
import { playerId } from './identity';
import { turnstileToken } from './turnstile';

/** 'sandbox' (dev stub — instant local grant) or 'stripe' (real Checkout). */
export const CHECKOUT_PROVIDER: 'sandbox' | 'stripe' = import.meta.env.VITE_CHECKOUT_PROVIDER === 'stripe' ? 'stripe' : 'sandbox';

export type CheckoutStart = { ok: true } | { ok: false; error: string };

/** Begin a real-money checkout: create the session, persist the pending marker,
 *  redirect. Only returns on failure (success navigates away). */
export async function beginCheckout(offer: PremiumOfferDef): Promise<CheckoutStart> {
  if (guestModeActive()) return { ok: false, error: 'guest-mode' }; // tryout sessions cannot purchase — create an account first
  // Security layer (docs/SECURITY.md): real-money checkouts are the most heavily spaced
  // action in the game — double-clicks and second-tab races collapse before any network.
  if (!guard('purchase.checkout', offer.id).ok) return { ok: false, error: 'Please wait a moment before trying again.' };
  try {
    const token = await turnstileToken();
    const res = await fetch('/api/store/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: offer.id, playerId: playerId(), turnstileToken: token }),
    });
    const body = (await res.json().catch(() => null)) as { sessionId?: string; url?: string; error?: string } | null;
    if (!res.ok || !body?.url || !body.sessionId) {
      return { ok: false, error: body?.error ?? `checkout failed (${res.status})` };
    }
    meta.beginPendingCheckout(offer.id, body.sessionId);
    window.location.assign(body.url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// ── Return/boot claim ─────────────────────────────────────────────────────────

/** A receipt delivered outside the store UI (boot claim) — the Premium Store
 *  plays its reveal for it the next time it opens. */
let pendingReveal: PremiumReceipt | null = null;

export function takePendingReveal(): PremiumReceipt | null {
  const r = pendingReveal;
  pendingReveal = null;
  return r;
}

export type ClaimOutcome =
  | { kind: 'delivered'; receipt: PremiumReceipt }
  | { kind: 'already' }
  | { kind: 'cancelled' }
  | { kind: 'pending' } // payment still processing / network down — kept for next boot
  | { kind: 'none' };

/**
 * Boot-time purchase recovery. Handles the Stripe return URL AND any persisted
 * pending checkout from a previous session. Fail-soft: network errors keep the
 * pending marker for the next boot; nothing is ever granted without the server
 * confirming the session is PAID and this client winning/holding the fulfillment.
 */
export async function resumePendingClaims(): Promise<ClaimOutcome> {
  const url = new URL(window.location.href);
  const returnedSession = url.searchParams.get('session_id');
  const checkoutParam = url.searchParams.get('checkout');
  if (checkoutParam) {
    // Clean the URL immediately — a bookmarked/refreshed return must not re-trigger UI.
    url.searchParams.delete('checkout');
    url.searchParams.delete('session_id');
    window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  }
  if (checkoutParam === 'cancel') {
    meta.clearPendingCheckout();
    return { kind: 'cancelled' };
  }

  const pending = meta.get().premium.pendingCheckout;
  const sessionId = returnedSession ?? pending?.sessionId;
  if (!sessionId) return { kind: 'none' };

  try {
    const res = await fetch('/api/store/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, playerId: playerId() }),
    });
    const body = (await res.json().catch(() => null)) as
      | { status?: string; offerId?: string; receiptId?: string; error?: string }
      | null;
    if (!res.ok || !body) {
      // Unknown/invalid sessions are dead ends — drop the marker. Transient
      // server errors keep it for the next boot.
      if (res.status === 404 || res.status === 409 || res.status === 403) meta.clearPendingCheckout();
      return { kind: 'pending' };
    }
    if (body.status === 'paid' && body.offerId && body.receiptId) {
      const receipt = meta.applyVerifiedPurchase(body.offerId, body.receiptId);
      if (receipt) {
        // Revenue telemetry (docs/ANALYTICS.md §money): the ONE spot every verified
        // purchase passes through, stamped with the server-priced SKU in cents.
        telemetry.emit('buy', { d: body.offerId, v: Math.max(0, Math.round(receipt.offer.priceUsd * 100)) });
        void telemetry.flush(); // money events don't wait for the cadence
        pendingReveal = receipt;
        return { kind: 'delivered', receipt };
      }
      meta.clearPendingCheckout(); // already applied earlier (other tab / prior boot)
      return { kind: 'already' };
    }
    if (body.status === 'expired' || body.status === 'refunded') {
      meta.clearPendingCheckout();
      return { kind: 'cancelled' };
    }
    return { kind: 'pending' }; // 'pending' — payment processing; retry next boot
  } catch {
    return { kind: 'pending' }; // offline — marker survives for the next boot
  }
}
