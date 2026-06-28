// Achievement unlock toasts. Watches the reactive save and, when a new id appears,
// pops a celebratory toast (slide-in + glow) with an "unlock" chime. Pure feedback:
// it reads the save and plays sound, never changing gameplay. Mounted once at the
// app root so unlocks surface from any screen (menu, run, results).
//
// `suppressed` (true off the main menu) silences the floating toast: run-end milestones
// are presented inline on the Results screen instead, so nothing ever covers the summary.
// Fresh ids are still consumed as "seen" while suppressed, so they don't pop later on the hub.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { achievementById } from '../state/achievements';
import type { AchievementDef } from '../state/achievements';
import { audio } from '../audio/sound';

export function AchievementToaster({ suppressed = false }: { suppressed?: boolean }): JSX.Element | null {
  const save = meta.use();
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<AchievementDef[]>([]);

  // Seed "seen" with the current unlocks so pre-existing ones don't re-toast on load.
  if (seen.current === null) seen.current = new Set(save.achievements);

  useEffect(() => {
    const fresh: AchievementDef[] = [];
    for (const id of save.achievements) {
      if (!seen.current!.has(id)) {
        seen.current!.add(id);
        const def = achievementById(id);
        if (def) fresh.push(def);
      }
    }
    // Off-menu: mark fresh ids seen (above) so they never re-toast, but don't enqueue or chime
    // over the Results summary — the inline "Achievements Unlocked" panel presents them there.
    if (suppressed) return;
    if (fresh.length) {
      audio.cue('achieve');
      setQueue((q) => [...q, ...fresh]);
    }
  }, [save.achievements, suppressed]);

  // When suppression engages mid-toast (e.g. a run ends while one is on screen), drop the
  // stack immediately so the summary opens clean.
  useEffect(() => {
    if (suppressed) setQueue([]);
  }, [suppressed]);

  // Auto-dismiss the oldest toast on a timer.
  useEffect(() => {
    if (queue.length === 0) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 4200);
    return () => clearTimeout(t);
  }, [queue]);

  if (suppressed || queue.length === 0) return null;
  return (
    <div className="achv-stack">
      {queue.slice(0, 3).map((a, i) => (
        <div className="achv-toast" key={`${a.id}-${i}`} onClick={() => setQueue((q) => q.slice(1))}>
          <span className="achv-icon" aria-hidden>{a.name.charAt(0).toUpperCase()}</span>
          <span className="achv-body">
            <span className="achv-eyebrow">Achievement Unlocked{a.reward ? ` · +${a.reward} Shards` : ''}</span>
            <span className="achv-name">{a.name}</span>
            <span className="achv-desc">{a.desc}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
