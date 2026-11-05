// The opening film's BOOT-SIDE state (docs/GAME-FEEL.md §intro) — the one-time "seen" flag and the
// film's on-screen store. Kept apart from the film itself (ui/InitCutscene.tsx + render/introScenes.ts)
// so the boot bundle carries these few lines while the film loads as its own chunk: only a first boot
// or a Settings → Help replay ever fetches it.

import { useSyncExternalStore } from 'react';

export const INTRO_SEEN_KEY = 'assimilate.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* storage unavailable — it simply plays again next boot */
  }
}

// The film's ON-SCREEN flag (docs/TUTORIAL.md §cinematic): first boot mounts the tutorial
// BENEATH the film, so its cold-open banner holds its clock until the film has landed.
let playing = false;
const playingListeners = new Set<() => void>();
export function setIntroPlaying(on: boolean): void {
  if (playing === on) return;
  playing = on;
  for (const fn of playingListeners) fn();
}
const subscribePlaying = (fn: () => void): (() => void) => {
  playingListeners.add(fn);
  return () => { playingListeners.delete(fn); };
};
/** React hook — true while the opening film is mounted (loading, gate, film or descent). */
export function useIntroPlaying(): boolean {
  return useSyncExternalStore(subscribePlaying, () => playing);
}
