// REWARD TOAST BUS (docs/NOTIFICATIONS.md §claim-popups) — the ONE channel every hub claim
// speaks through: quest missions/finales, season-pass levels, weekly directives, wardrobe
// milestones (and any future claim surface) push their receipt here and the single
// RewardToaster (ui/components/RewardToaster.tsx) presents it as a bold, itemized popup.
// Same shape as navBus: emits before the toaster mounts are dropped (claims happen on hub
// screens, where App always mounts it). Deliberately save-free — a receipt is presentation;
// the save is already true before anything is pushed.

export interface RewardToastLine {
  icon: string;
  label: string;
  rarity?: string; // tint for container/equipment lines (canonical --r-<rarity> tokens)
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

type ToastFn = (t: RewardToast) => void;

const subs = new Set<ToastFn>();
let seq = 0;

export const rewardToast = {
  /** Present a claim receipt (queued by the toaster; safe with no toaster mounted). */
  push(input: RewardToastInput): RewardToast {
    const t: RewardToast = { ...input, id: ++seq, nav: input.nav !== undefined ? input.nav : navHintFor(input.lines) };
    for (const fn of subs) fn(t);
    return t;
  },
  /** Subscribe (returns the unsubscribe — usable directly as a React effect cleanup). */
  onToast(fn: ToastFn): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
};
