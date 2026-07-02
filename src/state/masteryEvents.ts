// Mastery presentation bus (docs/MASTERY.md §live) — the sibling of powerEvents.ts.
// GameView's run loop PROJECTS live mastery from the sim's accrual (masteryXpRaw ×
// masteryXpMults — the exact banking math) and announces level-ups here; MasteryToaster
// + audio celebrate them. Pure pub/sub: no React, no sim imports, golden-irrelevant.

export interface MasteryLevelUp {
  kind: string; // TowerKind
  name: string; // display name ("Needle Spitter")
  color: string; // the tower's class hue (drives the toast accent)
  level: number; // the level just reached (projected; banks at finishRun)
  rank: string | null; // non-null when this level crossed a RANK boundary ("Veteran")
  bonus: string; // the permanent bonus line ("+0.4% damage / level")
  powerGained: number; // Power Score this level is worth once banked (real model)
  at: number; // epoch ms
}

/** The live per-kind mastery view the HUD/Inspector render each tick. */
export interface LiveMasteryView {
  level: number; // projected level (banked + this run's accrual)
  into: number; // XP into the current level
  need: number; // XP required for the next level
  gained: number; // XP earned THIS RUN (projected with the run's multipliers)
}

type Listener = (ev: MasteryLevelUp) => void;
const listeners = new Set<Listener>();

export function onMasteryLevelUp(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function announceMasteryLevelUp(ev: MasteryLevelUp): void {
  for (const fn of listeners) fn(ev);
}
