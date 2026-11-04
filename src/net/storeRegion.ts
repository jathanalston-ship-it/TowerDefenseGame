// Paid random-container region flag (docs/PREMIUM-STORE.md §paid-loot-boxes).
// GET /api/config reports `paidRandomContainers` for THIS caller (Cloudflare country, server-side);
// the Premium Store hides SKUs that contain random containers when it is not allowed. The server
// re-checks at checkout, so this is presentation + honesty, never the only gate.
//
// FAIL-SOFT POLICY (decided, not accidental):
//   - real-money checkout ('stripe'): unknown (loading / call failed) => HIDE the random SKUs.
//     A restricted region must never see a purchasable loot box because a request failed; the
//     cost of being wrong the other way is a briefly smaller store (Ichor, season pass and the
//     deterministic packs stay visible).
//   - sandbox checkout (no money moves, also the static no-Functions build): unknown => SHOW —
//     only an explicit "blocked" answer hides, so the offline/static game keeps its whole store.

import { useSyncExternalStore } from 'react';
import { CHECKOUT_PROVIDER } from './checkout';

export type RegionStatus = 'unknown' | 'allowed' | 'blocked';

/** Pure policy: may random-content SKUs be shown given what we know? */
export function randomSkusVisible(status: RegionStatus, provider: 'sandbox' | 'stripe'): boolean {
  if (status === 'allowed') return true;
  if (status === 'blocked') return false;
  return provider === 'sandbox';
}

let status: RegionStatus = 'unknown';
let started = false;
const listeners = new Set<() => void>();
function set(next: RegionStatus): void { if (status !== next) { status = next; listeners.forEach((l) => l()); } }

/** One fetch per session; failures leave the status 'unknown' (the policy above decides). */
export function loadStoreRegion(): void {
  if (started || typeof fetch === 'undefined') return;
  started = true;
  fetch('/api/config')
    .then((r) => (r.ok ? r.json() : null))
    .then((doc: { paidRandomContainers?: unknown } | null) => {
      if (doc && typeof doc.paidRandomContainers === 'boolean') set(doc.paidRandomContainers ? 'allowed' : 'blocked');
    })
    .catch(() => undefined);
}

function subscribe(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }

/** React hook: true when the store may show/sell random-content SKUs to this player. */
export function usePaidRandomVisible(): boolean {
  loadStoreRegion();
  const s = useSyncExternalStore(subscribe, () => status, () => status);
  return randomSkusVisible(s, CHECKOUT_PROVIDER);
}
