// Power gain events (docs/POWER-SCORE.md §feel) — the presentation bus that makes Power exciting.
// Every strength API announces "before → after + SOURCE"; positive deltas reach subscribers (the
// PowerToaster + audio), so every gain shows its amount AND its cause:  ▲ +18 Power — Tower Star.
// Doubles as the meta-side validator twin of game.powerAuditWarnings: a strength source that
// announces a NON-positive delta is recorded + warned (POWER-AUDIT.md contract).
//
// Pure pub/sub over numbers — no DOM; UI subscribes, sim never imports this.

export interface PowerGain {
  delta: number; // rounded score gain (> 0)
  source: string; // player-readable cause ("Tower Evolution ◈4", "Equipped Marrow Claws")
  at: number; // Date.now() — lets the toaster de-dupe bursts
}

type Listener = (gain: PowerGain) => void;
const listeners = new Set<Listener>();

/** Strength sources that announced but did NOT raise Power — the meta-side tripwire record. */
export const powerAnnounceWarnings: string[] = [];

/** Subscribe to power gains (returns unsubscribe). UI-side (toaster/audio). */
export function onPowerGain(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Announce a strength action's Power movement. Positive deltas notify; zero/negative from a
 *  declared strength source records a validator warning (a bypass — see POWER-AUDIT.md). Pass
 *  `expectGain: false` for actions that legitimately may not move Power (unequip, sidegrades). */
export function announcePower(source: string, before: number, after: number, expectGain = true): void {
  const delta = Math.round(after - before);
  if (delta > 0) {
    const gain: PowerGain = { delta, source, at: Date.now() };
    for (const fn of listeners) fn(gain);
    return;
  }
  if (expectGain) {
    const msg = `[power-audit] ${source} did not raise Power (${before.toFixed(1)} → ${after.toFixed(1)})`;
    powerAnnounceWarnings.push(msg);
    console.warn(msg);
  }
}
