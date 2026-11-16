import type { CutsceneBeat } from '../core/cutscenes';

interface SceneClock {
  startedAt: number;
  beatsFired: number;
}

/** Schedule authored sound cues against visible film time. The player pauses the clock on hide
 *  and cancels the pending timeout on scene change, hide or exit. */
export function scheduleCinematicBeats(
  beats: readonly CutsceneBeat[],
  clock: SceneClock,
  play: (cue: string) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (document.hidden) return;
    const elapsed = performance.now() - clock.startedAt;
    while (clock.beatsFired < beats.length && beats[clock.beatsFired].at * 1000 <= elapsed) {
      play(beats[clock.beatsFired++].cue);
    }
    const next = beats[clock.beatsFired];
    if (next) timer = setTimeout(schedule, Math.max(0, next.at * 1000 - elapsed));
  };
  schedule();
  return () => clearTimeout(timer);
}
