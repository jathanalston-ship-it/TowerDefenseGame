// Compact mute toggle for the in-game HUD (the full mute/volume/music strip lives on
// the menu via AudioControls). Reads/writes the AudioManager and mirrors muted state
// locally; clicking also counts as the gesture that unlocks the AudioContext.

import { useState } from 'react';
import { audio } from '../audio/audio';

export function MuteButton({ className = '' }: { className?: string }): JSX.Element {
  const [muted, setMuted] = useState(() => audio.getPrefs().muted);
  return (
    <button
      className={`audio-btn ${className}`}
      title={muted ? 'Unmute' : 'Mute audio'}
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      onClick={() => {
        audio.unlock();
        const next = !muted;
        audio.setMuted(next);
        setMuted(next);
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
