// ITEM IDENTITY & PROVENANCE (docs/TRADING-PREP.md) — the Auction House's backend spine.
// Every TRADABLE thing the account owns (equipment instances, cosmetics, gene cards) carries a
// PROVENANCE STAMP: where it came from, when, in which arena season, whether it is soul-BOUND,
// and its ownership history. The ledger is the single trade-eligibility, fraud-audit and
// server-validation source the future Auction House reads — no per-feature identity rewrites.
//
// ARCHITECTURE
//   • The ledger is a flat Record<refKey, ProvenanceStamp> on the save (v47, save.provenance).
//   • Stamping is IDEMPOTENT (first writer wins) — an item's origin can never be rewritten.
//   • The ledger SELF-HEALS on load (reconcileProvenance): anything owned but unstamped gets a
//     `legacy` stamp (at: 0 = "pre-ledger", deterministic), and stamps for equipment uids no
//     longer owned are pruned. Coverage is therefore a load-time invariant, not a discipline —
//     the same guarantee style as sanitizeGenesDiscovered (docs/CARDS.md §discovery).
//   • Uids are device-unique today (equipment.ts newUid). GLOBAL uniqueness for cross-account
//     trading namespaces them with the owner at the trade boundary: globalItemId(playerId, uid)
//     — the server assigns it once when an item first enters the market (docs/TRADING-PREP.md).
//
// Pure data module: no DOM, no state imports, no Math.random. meta owns application.

export const ITEM_IDENTITY = {
  /** Prior owners kept per item (oldest dropped first) — the fraud audit's mule-chain window. */
  historyCap: 8,
  /** Bounded season-history style cap for any per-item event lists a server may attach. */
  eventCap: 32,
} as const;

/** The ONLY categories prepared for trading (docs/TRADING-PREP.md §categories):
 *  cosmetics, equipment, Gene Cards. Nothing else may enter the market. */
export type TradableCategory = 'equipment' | 'cosmetic' | 'geneCard';

export const TRADABLE_CATEGORIES: readonly TradableCategory[] = ['equipment', 'cosmetic', 'geneCard'];

/** A reference to one tradable thing. `id` is the OwnedItem.uid for equipment (instances),
 *  the registry id for cosmetics/gene cards (account-level unlocks). */
export interface TradableRef {
  cat: TradableCategory;
  id: string;
}

/** Stable ledger key — compact, collision-free across categories. */
export function refKey(ref: TradableRef): string {
  const prefix = ref.cat === 'equipment' ? 'eq' : ref.cat === 'cosmetic' ? 'cos' : 'gene';
  return `${prefix}:${ref.id}`;
}

/** Parse a ledger key back to its ref (null on junk — sanitizers drop those rows). */
export function parseRefKey(key: string): TradableRef | null {
  const i = key.indexOf(':');
  if (i <= 0 || i === key.length - 1) return null;
  const prefix = key.slice(0, i);
  const id = key.slice(i + 1);
  const cat: TradableCategory | null = prefix === 'eq' ? 'equipment' : prefix === 'cos' ? 'cosmetic' : prefix === 'gene' ? 'geneCard' : null;
  return cat ? { cat, id } : null;
}

/** One item's permanent provenance record. `at: 0` = acquired before the ledger existed
 *  ("legacy" — honest, deterministic). `season` is the ARENA season index at acquisition
 *  (0 = pre-arena / unknown). `transfers` counts ownership changes (0 = original owner);
 *  `history` holds prior owner player-ids, newest LAST, capped. */
export interface ProvenanceStamp {
  source: string; // acquisition source ('Genetic Vault', 'arena-pass', 'legacy', …)
  at: number; // epoch ms of acquisition (0 = pre-ledger)
  season: number; // arena season index at acquisition (0 = none)
  bound: boolean; // soul-bound: permanently untradable (arena exclusives, tutorial grants)
  transfers: number; // ownership transfers so far (future trading increments)
  history: string[]; // prior owner player-ids (newest last, ITEM_IDENTITY.historyCap)
}

export type ProvenanceLedger = Record<string, ProvenanceStamp>;

/** The acquisition stamp every granting chokepoint writes. Idempotent: an existing stamp is
 *  NEVER overwritten (origin is immutable) — repeat calls are free. Returns the live stamp. */
export function stampAcquisition(
  ledger: ProvenanceLedger,
  ref: TradableRef,
  source: string,
  at: number,
  season: number,
  opts: { bound?: boolean } = {},
): ProvenanceStamp {
  const key = refKey(ref);
  const existing = ledger[key];
  if (existing) return existing;
  const stamp: ProvenanceStamp = {
    source,
    at: Math.max(0, Math.floor(at)),
    season: Math.max(0, Math.floor(season)),
    bound: opts.bound === true,
    transfers: 0,
    history: [],
  };
  ledger[key] = stamp;
  return stamp;
}

/** Permanently soul-bind an item (arena exclusives, one-way). Binding is irreversible by
 *  policy — there is deliberately no unbind function. */
export function bindItem(ledger: ProvenanceLedger, ref: TradableRef): void {
  const stamp = ledger[refKey(ref)];
  if (stamp) stamp.bound = true;
}

/** Record an ownership transfer (the future trade settlement calls this on BOTH sides —
 *  server-authoritative; the client mirror only reflects confirmed transfers). */
export function recordTransfer(ledger: ProvenanceLedger, ref: TradableRef, fromPlayerId: string): void {
  const stamp = ledger[refKey(ref)];
  if (!stamp) return;
  stamp.transfers += 1;
  stamp.history.push(fromPlayerId);
  if (stamp.history.length > ITEM_IDENTITY.historyCap) stamp.history.splice(0, stamp.history.length - ITEM_IDENTITY.historyCap);
}

export function itemProvenance(ledger: ProvenanceLedger, ref: TradableRef): ProvenanceStamp | null {
  return ledger[refKey(ref)] ?? null;
}

/** Everything the reconcile pass needs to know about current ownership. */
export interface OwnedRefs {
  equipmentUids: readonly string[];
  cosmeticIds: readonly string[];
  geneCardIds: readonly string[];
  /** Refs that must be FORCED bound (arena exclusives — self-healing security: even a hand-
   *  edited save re-binds on load). Keys are refKey() strings. */
  forceBoundKeys?: ReadonlySet<string>;
}

/** The load-time self-heal (called from saveStore's withDefaults):
 *    1. every owned-but-unstamped ref gains a `legacy` stamp (at 0 — deterministic);
 *    2. equipment stamps whose uid is no longer owned are PRUNED (instances die; account-level
 *       cosmetic/gene stamps are permanent like their unlocks);
 *    3. force-bound keys are re-bound.
 *  Mutates and returns the ledger. */
export function reconcileProvenance(ledger: ProvenanceLedger, owned: OwnedRefs): ProvenanceLedger {
  for (const uid of owned.equipmentUids) stampAcquisition(ledger, { cat: 'equipment', id: uid }, 'legacy', 0, 0);
  for (const id of owned.cosmeticIds) stampAcquisition(ledger, { cat: 'cosmetic', id }, 'legacy', 0, 0);
  for (const id of owned.geneCardIds) stampAcquisition(ledger, { cat: 'geneCard', id }, 'legacy', 0, 0);
  const live = new Set(owned.equipmentUids);
  for (const key of Object.keys(ledger)) {
    const ref = parseRefKey(key);
    if (!ref) { delete ledger[key]; continue; } // junk keys never survive a load
    if (ref.cat === 'equipment' && !live.has(ref.id)) delete ledger[key];
  }
  if (owned.forceBoundKeys) {
    for (const key of owned.forceBoundKeys) {
      const stamp = ledger[key];
      if (stamp) stamp.bound = true;
    }
  }
  return ledger;
}

/** The future GLOBAL item id — assigned once when an item first enters the market. The server
 *  owns the namespace; the client never invents one (docs/TRADING-PREP.md §identity). */
export function globalItemId(ownerPlayerId: string, ref: TradableRef): string {
  return `${ownerPlayerId}/${refKey(ref)}`;
}

/** Sanitizer for a loaded ledger: shape-checked stamps only, capped history, junk dropped.
 *  (Ownership reconciliation runs separately — reconcileProvenance.) */
export function sanitizeProvenanceLedger(raw: unknown): ProvenanceLedger {
  const out: ProvenanceLedger = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!parseRefKey(key) || !v || typeof v !== 'object') continue;
    const o = v as Partial<ProvenanceStamp>;
    const num = (x: unknown): number => {
      const n = Math.floor(Number(x));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    out[key] = {
      source: typeof o.source === 'string' && o.source.length > 0 ? o.source.slice(0, 40) : 'legacy',
      at: num(o.at),
      season: num(o.season),
      bound: o.bound === true,
      transfers: num(o.transfers),
      history: Array.isArray(o.history)
        ? o.history.filter((x): x is string => typeof x === 'string').slice(-ITEM_IDENTITY.historyCap)
        : [],
    };
  }
  return out;
}
