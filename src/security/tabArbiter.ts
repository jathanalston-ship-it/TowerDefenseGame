// CROSS-TAB WRITE ARBITRATION (docs/SECURITY.md §tabs) — one browser profile, ONE writer.
// Two tabs open on the same save are a duplicate-reward machine: each boots from the same
// blob, then both persist independently — last-writer-wins silently clobbers the other's
// progress, and replaying a claim in the stale tab pays it twice. The arbiter makes the
// NEWEST writing tab the owner: every disk write stamps a writer mark (a separate key, never
// inside the checksummed blob); other tabs observe the stamp through the `storage` event
// (which only fires for OTHER documents, never the writer itself) and latch STALE — their
// in-memory session keeps working, but their disk writes stop and the UI shows a persistent
// "another tab took over — reload" notice. No merge machinery, no clobber, no double-claim.
//
// Node-safe: everything window-touching is gated, so the sim/test suite never sees this.

const WRITER_KEY = 'assimilate.saveWriter';
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

let stale = false;
let takeoverListener: (() => void) | null = null;

/** Pure: does this writer mark belong to ANOTHER tab? (null/absent = nobody has written) */
export function foreignWriter(mark: string | null, selfId: string = TAB_ID): boolean {
  return !!mark && !mark.startsWith(`${selfId}:`);
}

/** This tab's writer identity (diagnostics/tests). */
export function tabId(): string {
  return TAB_ID;
}

/** True once another tab has taken over the save — disk writes must stop. */
export function tabIsStale(): boolean {
  return stale;
}

/** Stamp this tab as the save's current writer. Call with every disk write. */
export function stampWriter(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WRITER_KEY, `${TAB_ID}:${Date.now()}`);
  } catch {
    /* storage unavailable — nothing to arbitrate */
  }
}

/** Fold an observed writer mark (the storage event delegates here; exported pure for tests).
 *  A foreign mark latches STALE and fires the takeover notice exactly once. */
export function onWriterMark(mark: string | null): void {
  if (stale || !foreignWriter(mark)) return;
  stale = true;
  takeoverListener?.();
}

/** Arm the arbiter: observe writer marks from other tabs. Call once at store boot. */
export function initTabArbiter(onTakeover: (() => void) | null): void {
  takeoverListener = onTakeover;
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key === WRITER_KEY) onWriterMark(e.newValue);
  });
}

/** Tests only: release the stale latch. */
export function resetTabArbiter(): void {
  stale = false;
}
