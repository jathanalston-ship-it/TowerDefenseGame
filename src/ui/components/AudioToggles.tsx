// Shared SFX + Music toggles — the ONE implementation behind Settings and the in-run pause
// menu (docs/GAME-FEEL.md). Independent switches: killing the music keeps combat cues, and
// vice versa. Writes the device prefs and drives the live engines immediately.

import { useState } from 'react';
import { audio } from '../../audio/sound';
import { music } from '../../audio/music';
import { musicPref, setMusicPref, setSfxPref, sfxPref } from '../../state/prefs';

export function AudioToggles({ compact = false }: { compact?: boolean }): JSX.Element {
  const [sfx, setSfx] = useState(sfxPref());
  const [mus, setMus] = useState(musicPref());

  const toggleSfx = (): void => {
    const next = !sfx;
    setSfx(next);
    setSfxPref(next);
    audio.setEnabled(next);
  };
  const toggleMusic = (): void => {
    const next = !mus;
    setMus(next);
    setMusicPref(next);
    music.setEnabled(next);
  };

  return (
    <div className={`audio-toggles${compact ? ' is-compact' : ''}`}>
      <label className="set-toggle">
        <span>Sound effects{!compact && <small>Combat cues, UI, rewards.</small>}</span>
        <button className={`set-switch ${sfx ? 'on' : ''}`} onClick={toggleSfx} aria-pressed={sfx}>
          {sfx ? 'On' : 'Off'}
        </button>
      </label>
      <label className="set-toggle">
        <span>Music{!compact && <small>The composed soundtrack (menu, combat, bosses).</small>}</span>
        <button className={`set-switch ${mus ? 'on' : ''}`} onClick={toggleMusic} aria-pressed={mus}>
          {mus ? 'On' : 'Off'}
        </button>
      </label>
    </div>
  );
}
