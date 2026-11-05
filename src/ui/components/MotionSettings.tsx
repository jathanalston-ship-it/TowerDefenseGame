// Motion & feedback settings (docs/GAME-FEEL.md §4) — the ONE implementation behind Settings and
// the in-run pause menu: Screen shake (0–100%), Damage numbers, Flashes. When the device asks for
// reduced motion, shake/camera pulses/hit-stop/flashes are off by default; an explicit "Allow
// motion" switch overrides it. Writes device prefs (state/prefs.ts); a live run follows instantly.

import { useEffect, useState } from 'react';
import { motionPrefs, onMotionPrefs, resolveMotion, setMotionPrefs, systemReducedMotion } from '../../state/prefs';
import type { MotionPrefs } from '../../state/prefs';

/** Mirror the resolved motion prefs onto <html data-motion data-flashes> so HUB ceremonies (vault, reveals,
 *  rarity flashes — docs/GAME-FEEL.md §reward-vfx) honour Settings → Motion the way the run's `.game` does.
 *  Returns the unsubscribe; App binds it once. */
export function bindRootMotionAttrs(): () => void {
  const apply = (p: MotionPrefs): void => {
    const r = resolveMotion(p, systemReducedMotion());
    document.documentElement.dataset.motion = r.motion > 0 ? 'full' : 'reduced';
    document.documentElement.dataset.flashes = r.flashes ? 'on' : 'off';
  };
  apply(motionPrefs());
  return onMotionPrefs(apply);
}

export function MotionSettings({ compact = false }: { compact?: boolean }): JSX.Element {
  const [p, setP] = useState<MotionPrefs>(motionPrefs);
  useEffect(() => onMotionPrefs(setP), []);
  const osReduced = systemReducedMotion();
  const live = resolveMotion(p, osReduced);
  const locked = live.motion === 0; // the OS asked, the player hasn't overridden
  const pct = Math.round(p.shake * 100);

  return (
    <div className={`motion-settings${compact ? ' is-compact' : ''}`}>
      {osReduced && (
        <label className="set-toggle">
          <span>Allow motion{!compact && <small>Your device asks for reduced motion — shake, camera pulses and flashes stay off unless you allow them.</small>}</span>
          <button className={`set-switch ${p.allowMotion ? 'on' : ''}`} onClick={() => setMotionPrefs({ allowMotion: !p.allowMotion })} aria-pressed={p.allowMotion}>
            {p.allowMotion ? 'On' : 'Off'}
          </button>
        </label>
      )}
      <label className="set-toggle">
        <span>Screen shake{!compact && <small>How hard big impacts move the camera.</small>}</span>
        <span className="motion-shake">
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={locked ? 0 : pct}
            disabled={locked}
            onChange={(e) => setMotionPrefs({ shake: Number(e.target.value) / 100 })}
            aria-label="Screen shake"
            aria-valuetext={locked ? 'Off (reduced motion)' : `${pct}%`}
          />
          <b>{locked ? 'Off' : `${pct}%`}</b>
        </span>
      </label>
      <label className="set-toggle">
        <span>Damage numbers{!compact && <small>Hit, crit and ultimate totals on the battlefield.</small>}</span>
        <button className={`set-switch ${p.numbers ? 'on' : ''}`} onClick={() => setMotionPrefs({ numbers: !p.numbers })} aria-pressed={p.numbers}>
          {p.numbers ? 'On' : 'Off'}
        </button>
      </label>
      <label className="set-toggle">
        <span>Flashes{!compact && <small>Full-screen flashes on big moments.</small>}</span>
        <button
          className={`set-switch ${live.flashes ? 'on' : ''}`}
          onClick={() => setMotionPrefs({ flashes: !p.flashes })}
          aria-pressed={live.flashes}
          disabled={locked}
        >
          {live.flashes ? 'On' : 'Off'}
        </button>
      </label>
    </div>
  );
}
