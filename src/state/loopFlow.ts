// LOOP FLOW TRACKER (docs/REWARD-ARCHITECTURE.md §chaining) — remembers which reward
// loop the player touched LAST this session so the recommendation layer can hand the
// next action to a DIFFERENT loop: claim → open → upgrade → collect → play, never five
// suggestions from the wing they're already standing in.
//
// Deliberately session-scoped module state (like the toast bus): loop momentum is a
// presentation concern — it never touches the save, replays, or sims.

import { loopOfNav } from '../core/rewardLoops';
import type { LoopId } from '../core/rewardLoops';

let lastLoop: LoopId | null = null;

export const loopFlow = {
  /** Hub navigation notes every screen visit; chrome screens (help/settings/home) don't
   *  count as touching a loop, so browsing the menu never derails the rotation. */
  note(nav: string): void {
    const loop = loopOfNav(nav);
    if (loop) lastLoop = loop;
  },
  /** The loop to rotate AWAY from (null until the session touches one). */
  last(): LoopId | null {
    return lastLoop;
  },
  /** Tests only. */
  _reset(): void {
    lastLoop = null;
  },
};
