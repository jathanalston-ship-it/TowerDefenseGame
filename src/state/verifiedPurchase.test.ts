// Client half of the exactly-once purchase guarantee (docs/DEPLOYMENT.md
// §purchases): applyVerifiedPurchase applies a server-verified receipt ONCE per
// receipt id (refresh / second tab / repeated boot claims replay the same id),
// grants identically to the sandbox pipeline, and the pending-checkout marker
// survives until claimed or cleared.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta } from './meta';
import { ICHOR_BUNDLES, PERMANENT_PACKS } from '../core/premium';

const RECEIPT = 'cs_test_receipt_0001';

describe('applyVerifiedPurchase — exactly once', () => {
  beforeEach(() => meta.reset());

  it('applies a receipt once; every replay of the same receipt is a no-op', () => {
    const offer = ICHOR_BUNDLES[0];
    const before = meta.get().ichor;
    const first = meta.applyVerifiedPurchase(offer.id, RECEIPT);
    expect(first).not.toBeNull();
    expect(first!.sandbox).toBe(false);
    const afterOnce = meta.get().ichor;
    expect(afterOnce).toBeGreaterThan(before);
    // Double click / second tab / next boot: same receipt id → nothing changes.
    expect(meta.applyVerifiedPurchase(offer.id, RECEIPT)).toBeNull();
    expect(meta.applyVerifiedPurchase(offer.id, RECEIPT)).toBeNull();
    expect(meta.get().ichor).toBe(afterOnce);
    expect(meta.get().premium.claimedReceipts).toContain(RECEIPT);
    expect(meta.get().premium.purchases[offer.id]).toBe(1);
  });

  it('grants EXACTLY what the sandbox pipeline grants (shared interpreter)', () => {
    const offer = PERMANENT_PACKS[0];
    meta.applyVerifiedPurchase(offer.id, RECEIPT);
    const verified = meta.get();
    meta.reset();
    meta.purchaseOffer(offer.id);
    const sandbox = meta.get();
    expect(verified.ichor).toBe(sandbox.ichor);
    expect(verified.shards).toBe(sandbox.shards);
    expect(verified.pendingContainers.length).toBe(sandbox.pendingContainers.length);
    expect(verified.premium.purchases[offer.id]).toBe(sandbox.premium.purchases[offer.id]);
  });

  it('a paid receipt always delivers — even when the local ledger says owned (server is truth)', () => {
    const pack = PERMANENT_PACKS[0];
    meta.applyVerifiedPurchase(pack.id, 'cs_first');
    // A second DISTINCT paid receipt for a limit-1 pack can only exist if the
    // SERVER allowed it (it wouldn't) — but money that moved must never vanish
    // client-side. Distinct receipt ⇒ distinct application.
    const again = meta.applyVerifiedPurchase(pack.id, 'cs_second');
    expect(again).not.toBeNull();
  });

  it('pending-checkout marker: set on begin, cleared by the matching claim, survives others', () => {
    const offer = ICHOR_BUNDLES[2];
    meta.beginPendingCheckout(offer.id, 'cs_pending_1');
    expect(meta.get().premium.pendingCheckout?.sessionId).toBe('cs_pending_1');
    // A claim for a DIFFERENT session (old receipt replay) leaves the marker.
    meta.applyVerifiedPurchase(offer.id, 'cs_other');
    expect(meta.get().premium.pendingCheckout?.sessionId).toBe('cs_pending_1');
    // The matching claim clears it.
    meta.applyVerifiedPurchase(offer.id, 'cs_pending_1');
    expect(meta.get().premium.pendingCheckout).toBeNull();
    meta.beginPendingCheckout(offer.id, 'cs_pending_2');
    meta.clearPendingCheckout();
    expect(meta.get().premium.pendingCheckout).toBeNull();
  });

  it('the ledger survives a save round-trip (sanitizer keeps receipts + marker)', () => {
    const offer = ICHOR_BUNDLES[0];
    meta.applyVerifiedPurchase(offer.id, RECEIPT);
    meta.beginPendingCheckout(offer.id, 'cs_rt');
    const r = meta.importText(JSON.stringify({ schemaVersion: 23, data: meta.get() }));
    expect(r.ok).toBe(true);
    expect(meta.get().premium.claimedReceipts).toContain(RECEIPT);
    expect(meta.get().premium.pendingCheckout?.sessionId).toBe('cs_rt');
    // Replay after the round-trip: still refused.
    expect(meta.applyVerifiedPurchase(offer.id, RECEIPT)).toBeNull();
  });
});
