// Shared SFX + Music toggles — the ONE implementation behind Settings and the in-run pause
// menu (docs/GAME-FEEL.md). Independent switches: killing the music keeps combat cues, and
// vice versa. Writes the device prefs and drives the live engines immediately.
// Each engine also has a VOLUME (docs/AUDIO.md §settings): 0–100 % of its designed, measured level;
// the effects slider previews itself with a UI click so the player hears the level they pick.

import { useState } from 'react';
import { audio } from '../../audio/sound';
import { music } from '../../audio/music';
import { musicPref, musicVolumePref, setMusicPref, setMusicVolumePref, setSfxPref, setSfxVolumePref, sfxPref, sfxVolumePref } from '../../state/prefs';

export function AudioToggles({ compact = false }: { compact?: boolean }): JSX.Element {
  const [sfx, setSfx] = useState(sfxPref());
  const [mus, setMus] = useState(musicPref());
  const [sfxVol, setSfxVol] = useState(sfxVolumePref);
  const [musVol, setMusVol] = useState(musicVolumePref);

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
  const changeSfxVol = (v: number): void => {
    setSfxVol(v);
    setSfxVolumePref(v);
    audio.setVolume(v);
    audio.resume();
    audio.cue('ui'); // hear the level being picked
  };
  const changeMusVol = (v: number): void => {
    setMusVol(v);
    setMusicVolumePref(v);
    music.setVolume(v);
  };

  return (
    <div className={`audio-toggles${compact ? ' is-compact' : ''}`}>
      <label className="set-toggle">
        <span>Sound effects{!compact && <small>Combat cues, UI, rewards.</small>}</span>
        <button className={`set-switch ${sfx ? 'on' : ''}`} onClick={toggleSfx} aria-pressed={sfx}>
          {sfx ? 'On' : 'Off'}
        </button>
      </label>
      <VolumeRow label="Effects volume" value={sfxVol} enabled={sfx} onChange={changeSfxVol} />
      <label className="set-toggle">
        <span>Music{!compact && <small>The composed soundtrack (menu, combat, bosses).</small>}</span>
        <button className={`set-switch ${mus ? 'on' : ''}`} onClick={toggleMusic} aria-pressed={mus}>
          {mus ? 'On' : 'Off'}
        </button>
      </label>
      <VolumeRow label="Music volume" value={musVol} enabled={mus} onChange={changeMusVol} />
    </div>
  );
}

/** One volume slider row — the same range control (and style) as Settings → Motion's screen shake. */
function VolumeRow({ label, value, enabled, onChange }: { label: string; value: number; enabled: boolean; onChange: (v: number) => void }): JSX.Element {
  const pct = Math.round(value * 100);
  return (
    <label className="set-toggle">
      <span>{label}</span>
      <span className="motion-shake">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          disabled={!enabled}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-label={label}
          aria-valuetext={enabled ? `${pct}%` : 'Off'}
        />
        <b>{enabled ? `${pct}%` : 'Off'}</b>
      </span>
    </label>
  );
}
