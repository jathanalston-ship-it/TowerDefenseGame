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

// Same shape, different cargo: meta asks the App shell to PREMIERE story cutscenes (quest
// finales unlock films from the hub, where there is no Results outcome to ride —
// docs/QUESTS.md §finale). Emits before the App subscribes are dropped; the Memory Archive
// still lists every unlocked film, so a missed premiere is never lost content.
type PremiereFn = (cutsceneIds: string[]) => void;

const premiereSubs = new Set<PremiereFn>();

export const cutsceneBus = {
  premiere(cutsceneIds: string[]): void {
    if (cutsceneIds.length === 0) return;
    for (const fn of premiereSubs) fn(cutsceneIds);
  },
  onPremiere(fn: PremiereFn): () => void {
    premiereSubs.add(fn);
    return () => { premiereSubs.delete(fn); };
  },
};
