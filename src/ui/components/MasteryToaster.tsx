// Mastery level-up toasts — the gains rail's third band (docs/UI_STYLE_GUIDE.md §8).
// Premium but non-blocking: the run NEVER pauses; the toast names the tower, the level,
// the permanent bonus, and the Power the level banks — with the craft chime. Queued,
// max three visible, self-dismissing. Sibling of PowerToaster (same bus pattern).

import { useEffect, useRef, useState } from 'react';
import { onMasteryLevelUp } from '../../state/masteryEvents';
import type { MasteryLevelUp } from '../../state/masteryEvents';
import { audio } from '../../audio/sound';

const MAX_VISIBLE = 3;
const DISMISS_MS = 3200;

interface Toast extends MasteryLevelUp {
  id: number;
}

export function MasteryToaster(): JSX.Element | null {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    return onMasteryLevelUp((ev) => {
      audio.cue(ev.rank ? 'rankup' : 'mastery'); // rank boundaries earn the bigger fanfare
      const id = ++seq.current;
      setToasts((t) => [{ ...ev, id }, ...t].slice(0, MAX_VISIBLE));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DISMISS_MS);
    });
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="mtoasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="mtoast" key={t.id} style={{ ['--mc' as string]: t.color }}>
          <span className="mtoast-glyph">◈</span>
          <span className="mtoast-body">
            <span className="mtoast-eyebrow">{t.rank ? `Rank up · ${t.rank}` : 'Mastery level up'}</span>
            <span className="mtoast-name">{t.name} · <b>Lv {t.level}</b></span>
            <span className="mtoast-sub">{t.bonus}{t.powerGained > 0 ? <i> · ▲ +{t.powerGained} Power</i> : null}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
