// Achievement unlock announcer — HEADLESS since the reward-toast overhaul
// (docs/NOTIFICATIONS.md §reward-toasts). Watches the reactive save and, when a new
// achievement id appears, pushes a placard event into the unified RewardToaster instead of
// rendering its own toast. Mounted once at the app root so unlocks are detected from any
// screen; the bus HOLDS events while the toaster is unmounted (runs/results), so run-end
// milestones surface as the claim trail the moment the player returns to the hub — the
// Results screen still presents them inline (RunOutcome.achievements), never double-covered.

import { useEffect, useRef } from 'react';
import { meta } from '../state/meta';
import { achievementById } from '../state/achievements';
import { coalesceHeld, rewardToast } from '../state/rewardToast';
import type { RewardEvent } from '../state/rewardToast';
import { ACCOUNT_CURRENCY } from '../core/currencies';

export function AchievementToaster(): null {
  const save = meta.use();
  const seen = useRef<Set<string> | null>(null);

  // Seed "seen" with the current unlocks so pre-existing ones don't re-announce on load.
  if (seen.current === null) seen.current = new Set(save.achievements);

  useEffect(() => {
    // One save change can unlock several at once (a hub claim, a catch-up evaluation): announce
    // them as ONE batch so a burst collapses into the summary placard live, exactly as a held
    // burst does on flush (coalesceHeld, ACHIEVEMENT_COLLAPSE_AT).
    const batch: RewardEvent[] = [];
    for (const id of save.achievements) {
      if (seen.current!.has(id)) continue;
      seen.current!.add(id);
      const def = achievementById(id);
      if (!def) continue;
      batch.push({
        type: 'achievement',
        qty: def.reward ?? 0, // the Core reward — a collapsed burst sums it ("5 achievements · +180 Cores")
        name: def.name,
        source: 'Achievement Unlocked',
        rarity: (def.reward ?? 0) >= 100 ? 'epic' : undefined,
        collection: def.reward ? `+${def.reward} ${ACCOUNT_CURRENCY.name}` : def.desc,
      });
    }
    for (const e of coalesceHeld(batch)) rewardToast.push(e);
  }, [save.achievements]);

  return null;
}
