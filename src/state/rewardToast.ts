// REWARD TOAST FRAMEWORK (docs/NOTIFICATIONS.md §reward-toasts) — every reward in the game
// announces itself through ONE config-driven placard system: a miniature reward reveal
// (large art · big quantity · source subtitle · rarity · Power/collection lines), not a text
// notification. The dopamine contract:
//
//   • WHAT / HOW MUCH / WHERE — readable in under a second.
//   • A future reward type is ONE registry row (art, unit, merge rule, tier, nav) — no
//     hardcoded reward displays anywhere.
//   • Identical rewards landing in rapid succession MERGE (+100 +250 +75 → one +425 card
//     that pulses and re-arms its lifetime) — bursts never spam the stack.
//   • Rarity scales the presentation tier (t0 subtle → t3 legendary takeover + stinger).
//
// Pure rules + a tiny bus: the queue math (merge windows, lifetimes, caps, dismissal) is
// exported for tests; ui/components/RewardToaster.tsx renders it. Events pushed while no
// toaster is mounted (run end, early boot) HOLD in a bounded buffer and flush on mount —
// a reward announcement is never silently dropped.

import { ACCOUNT_CURRENCY } from '../core/currencies';
import type { CurrencyId } from '../core/currencies';

// ── The reward-type registry (docs/NOTIFICATIONS.md §reward-registry) ────────────────────

/** How a placard draws its LARGE art panel — resolved by the toaster, declared as data. */
export type RewardArt =
  | { kind: 'currency'; id: CurrencyId } // the animated SVG currency medallion (pickup burst)
  | { kind: 'glyph'; glyph: string; color: string } // a large tinted glyph
  | { kind: 'gene' } // 🧬 strand emblem (gene cards; card art rides the name line)
  | { kind: 'container' }; // ◈ container core in the event's rarity color

export interface RewardTypeDef {
  id: string;
  /** The name line under the quantity — "Genome Cores", "Gene Essence", "Bio-Container". */
  unit: string;
  art: RewardArt;
  /** Grouping rule: 'sum' merges by adding qty (+425 pattern), 'count' merges as ×N stacks
   *  (containers), 'never' keeps every card distinct (equipment, achievements). */
  merge: 'sum' | 'count' | 'never';
  /** Base presentation tier 0..3 (subtle / glow / particles / legendary takeover). An event
   *  rarity ('rare'/'epic'/'legendary'/'exotic') overrides upward, never downward. */
  tier?: 0 | 1 | 2 | 3;
  /** "View it" jump (Hub NavKey) shown on the card. */
  nav?: { key: string; label: string };
}

/** THE registry — a future reward type is one row here (spec: foundational design). */
export const REWARD_TYPES: readonly RewardTypeDef[] = [
  { id: 'genomeCores', unit: 'Genome Cores', art: { kind: 'currency', id: 'genomeCores' }, merge: 'sum' },
  { id: 'ichor', unit: 'Ichor', art: { kind: 'currency', id: 'ichor' }, merge: 'sum', tier: 1 },
  { id: 'cells', unit: 'Ascendant Cells', art: { kind: 'currency', id: 'ascendantCells' }, merge: 'sum', tier: 2 },
  { id: 'geneEssence', unit: 'Gene Essence', art: { kind: 'currency', id: 'geneEssence' }, merge: 'sum', nav: { key: 'genes', label: 'Spend in the Gene Archive' } },
  { id: 'hiveMaterials', unit: 'Chitin', art: { kind: 'currency', id: 'hiveMaterials' }, merge: 'sum', nav: { key: 'harvest', label: 'Grow the Hive' } },
  { id: 'mulliganTissue', unit: 'Mulligan Tissue', art: { kind: 'currency', id: 'mulliganTissue' }, merge: 'sum', nav: { key: 'towers', label: 'Upgrade Mulligan grafts' } },
  { id: 'towerShards', unit: 'Strain Samples', art: { kind: 'currency', id: 'towerShards' }, merge: 'sum', nav: { key: 'towers', label: 'Spend in the Tower Lab' } },
  { id: 'heroShards', unit: 'Apex Genome', art: { kind: 'currency', id: 'heroShards' }, merge: 'sum', nav: { key: 'heroes', label: 'Spend in the Hero Lab' } },
  { id: 'mutagen', unit: 'Mutagen', art: { kind: 'glyph', glyph: '⊕', color: 'var(--viral)' }, merge: 'sum' },
  { id: 'scrap', unit: 'Scrap', art: { kind: 'glyph', glyph: '◳', color: 'var(--muted)' }, merge: 'sum' },
  { id: 'catalyst', unit: 'Catalyst', art: { kind: 'glyph', glyph: '✷', color: '#ff9d3c' }, merge: 'sum', tier: 2 },
  { id: 'stamina', unit: 'Rush Stamina', art: { kind: 'glyph', glyph: '☠', color: 'var(--r-epic)' }, merge: 'sum' },
  { id: 'eventTokens', unit: 'Event Tokens', art: { kind: 'glyph', glyph: '\u2726', color: 'var(--gold)' }, merge: 'sum', tier: 1, nav: { key: 'home', label: 'View the Live Event' } },
  { id: 'bioSpores', unit: 'Bio-Spores', art: { kind: 'glyph', glyph: '✺', color: 'var(--viral)' }, merge: 'sum', tier: 1, nav: { key: 'vault', label: 'Spin the Bio-Roulette' } },
  { id: 'container', unit: 'Bio-Container', art: { kind: 'container' }, merge: 'count', tier: 1, nav: { key: 'vault', label: 'Open in the Vault' } },
  { id: 'runCache', unit: 'Run Cache', art: { kind: 'glyph', glyph: '⬢', color: 'var(--cache)' }, merge: 'count', nav: { key: 'vault', label: 'Open in the Vault' } },
  { id: 'geneCard', unit: 'Gene Card', art: { kind: 'gene' }, merge: 'never', tier: 1, nav: { key: 'genes', label: 'View in the Archive' } },
  { id: 'equipment', unit: 'Equipment', art: { kind: 'glyph', glyph: '⛨', color: 'var(--r-rare)' }, merge: 'never', tier: 1, nav: { key: 'equipment', label: 'Equip in the Armory' } },
  { id: 'mulligan', unit: 'Mulligan Modifier', art: { kind: 'glyph', glyph: '⊛', color: 'var(--r-epic)' }, merge: 'never', tier: 2 },
  { id: 'bpXp', unit: 'Season XP', art: { kind: 'glyph', glyph: '❁', color: 'var(--gold)' }, merge: 'sum' },
  { id: 'passStack', unit: 'Perennial Bloom', art: { kind: 'glyph', glyph: '❁', color: 'var(--gold)' }, merge: 'never', tier: 3 },
  { id: 'passive', unit: 'Permanent Passive', art: { kind: 'glyph', glyph: '♾', color: 'var(--gold)' }, merge: 'never', tier: 2 },
  { id: 'cosmetic', unit: 'Wardrobe Item', art: { kind: 'glyph', glyph: '❖', color: 'var(--r-epic)' }, merge: 'never', tier: 2, nav: { key: 'phenotypes', label: 'View in the Wardrobe' } },
  { id: 'phenotype', unit: 'Phenotype', art: { kind: 'glyph', glyph: '🧬', color: 'var(--r-epic)' }, merge: 'never', tier: 2, nav: { key: 'phenotypes', label: 'View in the Wardrobe' } },
  { id: 'masteryXp', unit: 'Mastery XP', art: { kind: 'glyph', glyph: '⟡', color: 'var(--caustic)' }, merge: 'sum' },
  { id: 'evolutionNode', unit: 'Evolution Rewards', art: { kind: 'glyph', glyph: '⧉', color: 'var(--viral)' }, merge: 'sum', tier: 1 },
  { id: 'achievement', unit: 'Achievement', art: { kind: 'glyph', glyph: '🏆', color: 'var(--gold)' }, merge: 'never', tier: 2 },
  // The collapsed burst (coalesceHeld): N achievements flushed together → ONE expandable placard.
  { id: 'achievements', unit: 'Achievements', art: { kind: 'glyph', glyph: '🏆', color: 'var(--gold)' }, merge: 'never', tier: 2, nav: { key: 'profile', label: 'View on your Profile' } },
  { id: 'collection', unit: 'Collection Reward', art: { kind: 'glyph', glyph: '❈', color: 'var(--gold)' }, merge: 'never', tier: 2 },
  { id: 'idleLoot', unit: 'Hive Yield', art: { kind: 'glyph', glyph: '⌛', color: 'var(--caustic)' }, merge: 'sum' },
  { id: 'organ', unit: 'Hive Organ Grown', art: { kind: 'glyph', glyph: '⬡', color: 'var(--viral)' }, merge: 'never', tier: 1, nav: { key: 'hive', label: 'View the Hive' } },
  { id: 'boost', unit: 'Research Boost', art: { kind: 'glyph', glyph: '⚗', color: 'var(--caustic)' }, merge: 'never', tier: 1 },
];

const TYPE_BY_ID = new Map(REWARD_TYPES.map((t) => [t.id, t]));
export function rewardTypeOf(id: string): RewardTypeDef | undefined { return TYPE_BY_ID.get(id); }

// ── Events → cards (the pure queue rules, unit-tested) ──────────────────────────────────

/** One structured reward fact. `source` is WHERE it came from ("Idle Harvest",
 *  "Campaign Stage 12", "Battle Pass") — the placard's subtitle. */
export interface RewardEvent {
  type: string; // REWARD_TYPES id (unknown ids render as a generic glyph card — never dropped)
  qty?: number; // amount (default 1)
  name?: string; // the specific item (equipment piece, gene card, cosmetic, achievement)
  rarity?: string; // presentation rarity (loot/card ladder) — raises the tier + tints the card
  source: string;
  power?: number; // Power gained by this grant (optional line)
  collection?: string; // optional collection/progress line ("Archive 43/106 · 41%")
  nav?: { key: string; label: string } | null; // override the registry jump (null = none)
  items?: string[]; // a SUMMARY placard's itemized lines (expandable) — set by coalesceHeld
}

export interface ToastCard {
  uid: number;
  type: string;
  qty: number;
  count: number; // merged event count (×N badge for 'count' merges)
  name?: string;
  rarity?: string;
  tier: 0 | 1 | 2 | 3;
  source: string;
  power?: number;
  collection?: string;
  nav: { key: string; label: string } | null;
  items?: string[]; // summary placard lines (the card expands to list them)
  bornAt: number;
  bumpedAt: number; // last merge — lifetime re-arms from here (the card pulses)
}

export const TOAST_LIFE_MS = 5000; // spec: 5 seconds minimum
export const TOAST_LIFE_BIG_MS = 7000; // t3 legendary moments linger
export const TOAST_MERGE_WINDOW_MS = 4000; // identical rewards inside this window combine
export const TOAST_MAX_VISIBLE = 4; // stacked cards on screen; the rest queue behind "+N"

const RARITY_TIER: Record<string, 0 | 1 | 2 | 3> = {
  common: 0, uncommon: 1, rare: 1, epic: 2, legendary: 3, exotic: 3, mythic: 3,
};

export function tierOf(e: RewardEvent): 0 | 1 | 2 | 3 {
  const base = rewardTypeOf(e.type)?.tier ?? 0;
  const fromRarity = e.rarity ? RARITY_TIER[e.rarity] ?? 0 : 0;
  return Math.max(base, fromRarity) as 0 | 1 | 2 | 3;
}

/** Merge identity: same type + same specific item. Sources may differ — the merged card
 *  reads "Multiple sources" (never a lie). */
export function cardKey(e: Pick<RewardEvent, 'type' | 'name'>): string {
  return `${e.type}:${e.name ?? ''}`;
}

export function lifeOf(card: Pick<ToastCard, 'tier' | 'items'>): number {
  return card.tier >= 3 || card.items ? TOAST_LIFE_BIG_MS : TOAST_LIFE_MS; // a summary has more to read
}

/** More than this many achievements flushing together collapse into ONE summary placard
 *  ("5 achievements · +180 Genome Cores", expandable) — docs/NOTIFICATIONS.md §reward-toasts. */
export const ACHIEVEMENT_COLLAPSE_AT = 3;

/** Coalesce a flushed burst (the held buffer replaying on toaster mount, e.g. after a run):
 *  more than ACHIEVEMENT_COLLAPSE_AT achievement placards become one summary event, placed where
 *  the first one stood. An achievement event's `qty` is its Genome Core reward. Pure. */
export function coalesceHeld(events: readonly RewardEvent[]): RewardEvent[] {
  const achv = events.filter((e) => e.type === 'achievement');
  if (achv.length <= ACHIEVEMENT_COLLAPSE_AT) return events.slice();
  const cores = achv.reduce((a, e) => a + (e.qty ?? 0), 0);
  const summary: RewardEvent = {
    type: 'achievements',
    qty: achv.length,
    name: `${achv.length} achievements`,
    source: 'Achievements Unlocked',
    collection: cores > 0 ? `+${cores.toLocaleString()} ${ACCOUNT_CURRENCY.name}` : undefined,
    items: achv.map((e) => e.name ?? 'Achievement'),
  };
  const out: RewardEvent[] = [];
  let placed = false;
  for (const e of events) {
    if (e.type !== 'achievement') out.push(e);
    else if (!placed) { out.push(summary); placed = true; }
  }
  return out;
}

let uidSeq = 0;

/** Fold one event into the card stack (newest first). Pure given `now`. */
export function applyEvent(cards: readonly ToastCard[], e: RewardEvent, now: number): ToastCard[] {
  const def = rewardTypeOf(e.type);
  const qty = e.qty ?? 1;
  const tier = tierOf(e);
  const nav = e.nav !== undefined ? e.nav : def?.nav ?? null;
  if (def && def.merge !== 'never') {
    const key = cardKey(e);
    const i = cards.findIndex((c) => cardKey(c) === key && now - c.bumpedAt < TOAST_MERGE_WINDOW_MS);
    if (i >= 0) {
      const c = cards[i];
      const merged: ToastCard = {
        ...c,
        qty: c.qty + qty,
        count: c.count + 1,
        tier: Math.max(c.tier, tier) as 0 | 1 | 2 | 3,
        rarity: (RARITY_TIER[e.rarity ?? ''] ?? -1) > (RARITY_TIER[c.rarity ?? ''] ?? -1) ? e.rarity : c.rarity,
        source: c.source === e.source ? c.source : 'Multiple sources',
        power: (c.power ?? 0) + (e.power ?? 0) > 0 ? (c.power ?? 0) + (e.power ?? 0) : undefined,
        collection: e.collection ?? c.collection,
        bumpedAt: now,
      };
      const next = cards.slice();
      next.splice(i, 1);
      return [merged, ...next]; // a merge bumps the card back to the front
    }
  }
  const card: ToastCard = {
    uid: ++uidSeq, type: e.type, qty, count: 1, name: e.name, rarity: e.rarity, tier,
    source: e.source, power: e.power, collection: e.collection, nav, bornAt: now, bumpedAt: now,
    ...(e.items ? { items: e.items } : {}),
  };
  return [card, ...cards];
}

/** Drop cards past their lifetime (lifetime re-arms on every merge bump). */
export function pruneCards(cards: readonly ToastCard[], now: number): ToastCard[] {
  const alive = cards.filter((c) => now - c.bumpedAt < lifeOf(c));
  return alive.length === cards.length ? (cards as ToastCard[]) : alive;
}

// ── The bus (module-level, save-free) ────────────────────────────────────────────────────

type EventFn = (e: RewardEvent) => void;
const subs = new Set<EventFn>();
/** Observe-only listeners (telemetry): see every push, never consume the hold buffer. */
const taps = new Set<EventFn>();
/** Events pushed with no toaster mounted (run end, boot) hold here and flush on mount. */
const held: RewardEvent[] = [];
const HELD_MAX = 40;

export const rewardToast = {
  /** Announce one reward. Safe with no toaster mounted (bounded hold buffer). */
  push(e: RewardEvent): void {
    for (const fn of taps) fn(e);
    if (subs.size === 0) {
      held.push(e);
      if (held.length > HELD_MAX) held.splice(0, held.length - HELD_MAX);
      return;
    }
    for (const fn of subs) fn(e);
  },
  /** Announce a multi-reward grant — every event stamped with the same source. */
  pushMany(source: string, events: readonly Omit<RewardEvent, 'source'>[]): void {
    for (const e of events) this.push({ ...e, source });
  },
  /** Subscribe (returns the unsubscribe). Flushes anything held while unmounted — a burst
   *  of achievements collapses into one summary placard on the way out (coalesceHeld). */
  onReward(fn: EventFn): () => void {
    subs.add(fn);
    if (held.length > 0) {
      const flush = coalesceHeld(held.splice(0, held.length));
      for (const e of flush) fn(e);
    }
    return () => { subs.delete(fn); };
  },
  /** Observe rewards without rendering them (analytics). Held events are NOT replayed —
   *  the hold buffer belongs to the toaster; a tap only sees pushes from now on. */
  tap(fn: EventFn): () => void {
    taps.add(fn);
    return () => { taps.delete(fn); };
  },
};

// ── PassReward → events (the applyRewardList companion) ─────────────────────────────────
// meta.applyRewardList stays THE grant interpreter; this maps its reward language into
// toast events so every claim surface (quests, Battle Pass, login, missions, mail) gets
// placards for free. Kinds that pay "× every tower/hero" fold into one summed card.

export interface PassRewardLike {
  kind: string;
  qty?: number;
  qtyEach?: number;
  count?: number;
  rarity?: string;
  mutagen?: number;
  scrap?: number;
  catalyst?: number;
  id?: string;
  family?: string;
}

export function eventsForPassRewards(rewards: readonly PassRewardLike[], names?: { cosmetic?: (id: string) => string | undefined; passive?: (id: string) => string | undefined }): Omit<RewardEvent, 'source'>[] {
  const out: Omit<RewardEvent, 'source'>[] = [];
  for (const r of rewards) {
    switch (r.kind) {
      case 'ichor': out.push({ type: 'ichor', qty: r.qty }); break;
      case 'cores': out.push({ type: 'genomeCores', qty: r.qty }); break;
      case 'geneEssence': out.push({ type: 'geneEssence', qty: r.qty }); break;
      case 'hiveMats': out.push({ type: 'hiveMaterials', qty: r.qty }); break;
      case 'mats':
        if (r.mutagen) out.push({ type: 'mutagen', qty: r.mutagen });
        if (r.scrap) out.push({ type: 'scrap', qty: r.scrap });
        if (r.catalyst) out.push({ type: 'catalyst', qty: r.catalyst });
        break;
      case 'towerShardsAll': out.push({ type: 'towerShards', qty: r.qtyEach, name: 'every tower' }); break;
      case 'heroShardsAll': out.push({ type: 'heroShards', qty: r.qtyEach, name: 'every hero' }); break;
      case 'container': out.push({ type: 'container', qty: r.count ?? 1, rarity: r.rarity }); break;
      case 'runCache': out.push({ type: 'runCache', qty: r.count ?? 1 }); break;
      case 'rushStamina': out.push({ type: 'stamina', qty: r.qty }); break;
      case 'bioSpores': out.push({ type: 'bioSpores', qty: r.qty }); break;
      case 'cosmetic': out.push({ type: 'cosmetic', name: names?.cosmetic?.(r.id ?? '') ?? r.id }); break;
      case 'phenotype': out.push({ type: 'phenotype', name: r.family }); break;
      case 'passive': out.push({ type: 'passive', name: names?.passive?.(r.id ?? '') ?? r.id }); break;
      case 'stack': out.push({ type: 'passStack', name: 'Season fully cleared' }); break;
      default: out.push({ type: r.kind, qty: r.qty ?? r.count ?? 1 }); break; // future kinds still placard
    }
  }
  return out;
}
