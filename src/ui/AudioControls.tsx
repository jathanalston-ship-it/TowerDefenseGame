// Compact audio settings: mute, master volume, and a music toggle. Reads/writes the
// AudioManager (which persists to localStorage); local state just mirrors it for render.
// Each interaction also unlocks the AudioContext, so toggling here is a valid gesture.

import { useState } from 'react';
import { audio } from '../audio/audio';

export function AudioControls(): JSX.Element {
  const [prefs, setPrefs] = useState(() => audio.getPrefs());
  const sync = (): void => setPrefs(audio.getPrefs());

  return (
    <div className="audio-controls">
      <button
        className="audio-btn"
        title={prefs.muted ? 'Unmute' : 'Mute all audio'}
        aria-label={prefs.muted ? 'Unmute' : 'Mute'}
        onClick={() => { audio.unlock(); audio.setMuted(!prefs.muted); sync(); }}
      >
        {prefs.muted ? '🔇' : '🔊'}
      </button>
      <input
        className="audio-vol"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={prefs.volume}
        disabled={prefs.muted}
        aria-label="Master volume"
        onChange={(e) => { audio.unlock(); audio.setVolume(Number(e.currentTarget.value)); sync(); }}
      />
      <button
        className={`audio-btn ${prefs.music ? 'is-on' : ''}`}
        title={prefs.music ? 'Music on' : 'Music off'}
        aria-label={prefs.music ? 'Music on' : 'Music off'}
        aria-pressed={prefs.music}
        onClick={() => { audio.unlock(); audio.setMusic(!prefs.music); sync(); }}
      >
        ♪
      </button>
    </div>
  );
}
