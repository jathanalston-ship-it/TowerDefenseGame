// REWARD TOAST BUS (docs/NOTIFICATIONS.md §claim-popups) — the ONE channel every hub claim
// speaks through: quest missions/finales, season-pass levels, weekly directives, wardrobe
// milestones, mastery evolution, market purchases (and any future claim surface) push their
// receipt here and the single RewardToaster (ui/components/RewardToaster.tsx) presents it as
// a bold, itemized popup. Same shape as navBus: emits before the toaster mounts are dropped
// (claims happen on hub screens, where App always mounts it). Deliberately save-free — a
// receipt is presentation; the save is already true before anything is pushed.
//
// The REWARD VOCABULARY (rewardVocab.ts) drives the ceremony: lines that carry a `kind`
// (+ `qty`) derive the receipt's TIER (common → legendary presentation + audio in the
// toaster) and become MERGEABLE — `coalesce` folds rapid identical receipts into one rising
// total (docs/NOTIFICATIONS.md §merge) instead of a near-duplicate queue.

import { receiptTier, rewardKind, vocabLabel } from './rewardVocab';
import type { RewardTier } from './rewardVocab';

export interface RewardToastLine {
  icon: string;
  label: string;
  rarity?: string; // tint for container/equipment lines (canonical --r-<rarity> tokens)
  kind?: string; // reward-vocabulary id (rewardVocab.ts) — makes the line tierable + mergeable
  qty?: number; // quantity — mergeable lines sum this across coalesced receipts
}

/** A "view it" jump — `key` is a Hub NavKey; the toaster routes through navBus. */
export interface RewardToastNav { key: string; label: string }

export interface RewardToast {
  id: number;
  title: string; // eyebrow — "MISSION REWARDS CLAIMED"
  name?: string; // headline — the mission/quest/level the player just cashed in
  icon?: string; // medallion glyph (defaults to the first line's icon)
  accent?: string; // CSS color for the frame glow (defaults to --gold)
  lines: RewardToastLine[];
  big?: boolean; // finale/capstone framing — larger card, longer dwell
  nav?: RewardToastNav | null; // explicit destination; omit to derive one from the lines
  tier?: RewardTier; // ceremony tier; omitted at push ⇒ derived from the lines (receiptTier)
  sound?: boolean; // toaster plays the tier cue — ONLY for claim sites with no cue of their own
}

export type RewardToastInput = Omit<RewardToast, 'id'>;

/** Where a reward LANDS, by its receipt icon — the icons are single-sourced in
 *  meta.applyRewardList / battlePass.rewardLabel, so this map is stable. First match wins:
 *  containers out-rank cosmetics out-rank essence, so a mixed finale points at the Vault
 *  (the bigger "open me" moment) rather than a side stop. */
const DESTINATIONS: readonly { icon: string; key: string; label: string }[] = [
  { icon: '◈', key: 'vault', label: 'Open in the Vault' },
  { icon: '⬢', key: 'vault', label: 'Open in the Vault' },
  { icon: '❖', key: 'phenotypes', label: 'View in the Wardrobe' },
  { icon: '🧬', key: 'phenotypes', label: 'View in the Wardrobe' },
  { icon: '⌬', key: 'genes', label: 'Spend in the Gene Archive' },
];

/** Derive the "view it" jump for a receipt (null = nothing worth routing to). */
export function navHintFor(lines: RewardToastLine[]): RewardToastNav | null {
  for (const d of DESTINATIONS) {
    if (lines.some((l) => l.icon === d.icon)) return { key: d.key, label: d.label };
  }
  return null;
}

// ── Coalescing (docs/NOTIFICATIONS.md §merge) ───────────────────────────────────────────────
// Rapid identical grants ("+100 Cores" · "+250 Cores" · "+75 Cores") must read as ONE receipt
// ("425 Genome Cores"), never a queue of near-duplicates. Two receipts merge when they carry
// the same title+name and the same SET of mergeable line keys (kind + rarity — a rare and an
// epic container never sum). The merged receipt keeps its queue position but takes the NEW
// id, so the toaster re-keys it: the entrance ceremony re-fires and the dwell re-arms on the
// updated total. Pure over arrays — unit-tested without a DOM.

/** A line's merge key, or null when it can't merge (unquantified / non-mergeable kind). */
function lineKey(l: RewardToastLine): string | null {
  const def = rewardKind(l.kind);
  if (!def || !def.mergeable || typeof l.qty !== 'number') return null;
  return `${def.id}:${l.rarity ?? ''}`;
}

/** A receipt's merge key, or null when any line is unmergeable. */
export function mergeKey(t: RewardToastInput): string | null {
  if (t.lines.length === 0) return null;
  const keys: string[] = [];
  for (const l of t.lines) {
    const k = lineKey(l);
    if (k === null) return null;
    keys.push(k);
  }
  return `${t.title}|${t.name ?? ''}|${keys.sort().join(',')}`;
}

/** Sum `into` + `add` per line key, regenerating every label from the vocabulary. */
function mergeToasts(into: RewardToast, add: RewardToast): RewardToast {
  const lines = into.lines.map((l) => {
    const k = lineKey(l);
    const extra = add.lines.filter((a) => lineKey(a) === k).reduce((s, a) => s + (a.qty ?? 0), 0);
    const qty = (l.qty ?? 0) + extra;
    const def = rewardKind(l.kind);
    return { ...l, qty, label: def ? vocabLabel(def, qty, l.rarity) : l.label };
  });
  return {
    ...into,
    id: add.id, // re-key: the toaster re-fires the entrance and re-arms the dwell on the new total
    lines,
    big: into.big === true || add.big === true,
    sound: into.sound === true || add.sound === true,
    tier: receiptTier(lines),
  };
}

/** Append `t` to `queue`, merging into an identical pending receipt when possible. */
export function coalesce(queue: readonly RewardToast[], t: RewardToast): RewardToast[] {
  const key = mergeKey(t);
  if (key !== null) {
    const ix = queue.findIndex((q) => mergeKey(q) === key);
    if (ix >= 0) {
      const next = [...queue];
      next[ix] = mergeToasts(queue[ix], t);
      return next;
    }
  }
  return [...queue, t];
}

type ToastFn = (t: RewardToast) => void;

const subs = new Set<ToastFn>();
let seq = 0;

export const rewardToast = {
  /** Present a claim receipt (queued by the toaster; safe with no toaster mounted). */
  push(input: RewardToastInput): RewardToast {
    const t: RewardToast = {
      ...input,
      id: ++seq,
      nav: input.nav !== undefined ? input.nav : navHintFor(input.lines),
      tier: input.tier ?? receiptTier(input.lines),
    };
    for (const fn of subs) fn(t);
    return t;
  },
  /** Subscribe (returns the unsubscribe — usable directly as a React effect cleanup). */
  onToast(fn: ToastFn): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
};
