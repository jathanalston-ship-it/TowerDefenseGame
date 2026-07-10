// Tiny hub-navigation bus (docs/PROGRESSION-GATING.md §presentation) — lets components mounted
// OUTSIDE the Hub (the What's New unlock card, future toasts) route the player to a hub screen.
// The Hub subscribes on mount; emits before a subscriber exists are dropped (the caller renders
// on the menu only, so in practice the Hub is always listening).

type GoFn = (navKey: string) => void;

const subs = new Set<GoFn>();

export const navBus = {
  /** Ask the Hub to open a screen (no-op until the Hub mounts). */
  go(navKey: string): void {
    for (const fn of subs) fn(navKey);
  },
  /** Subscribe (returns the unsubscribe — usable directly as a React effect cleanup). */
  onGo(fn: GoFn): () => void {
    subs.add(fn);
    return () => { subs.delete(fn); };
  },
};
