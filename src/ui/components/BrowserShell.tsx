// MOBILE-BROWSER CHROME (docs/RESPONSIVE-DESIGN.md §browser) — the small UI around ui/mobileBrowser.ts:
//   · <FullscreenButton/>   the top bar's ⛶ — back to full screen after leaving it (Android / iPad browsers)
//   · <ImmersiveSetting/>   Settings → "Full screen in mobile browsers" (the first-tap request's switch)
//   · <InstallHint/>        iPhone Safari only: a one-time card — Add to Home Screen to lose the toolbar
// Each renders NOTHING outside a mobile browser (desktop, installed web app, the future store app).

import { useEffect, useState } from 'react';
import { browserShell, enterFullscreen, isFullscreen, onFullscreenChange } from '../mobileBrowser';
import { dismissInstallHint, immersivePref, installHintDismissed, setImmersivePref } from '../../state/prefs';

function useFullscreen(): boolean {
  const [fs, setFs] = useState(() => (typeof document === 'undefined' ? false : isFullscreen()));
  useEffect(() => onFullscreenChange(() => setFs(isFullscreen())), []);
  return fs;
}

export function FullscreenButton(): JSX.Element | null {
  const [shell] = useState(browserShell);
  const fs = useFullscreen();
  if (!shell.mobile || !shell.canFullscreen || fs) return null;
  return (
    <button className="fs-btn" onClick={() => void enterFullscreen()} aria-label="Full screen" title="Full screen — hide the browser's address bar">
      <span aria-hidden>⛶</span>
    </button>
  );
}

export function ImmersiveSetting(): JSX.Element | null {
  const [shell] = useState(browserShell);
  const [on, setOn] = useState(immersivePref);
  if (!shell.mobile || !shell.canFullscreen) return null;
  return (
    <label className="set-toggle">
      <span>Full screen in mobile browsers<small>Your first tap hides the browser's address bar so the game gets the whole screen.</small></span>
      <button
        className={`set-switch ${on ? 'on' : ''}`}
        onClick={() => { setImmersivePref(!on); setOn(!on); }}
        aria-pressed={on}
      >
        {on ? 'On' : 'Off'}
      </button>
    </label>
  );
}

/** iOS's own Share glyph (a tray with an up arrow) — the button the player has to find. */
function ShareGlyph(): JSX.Element {
  return (
    <svg className="ih-share" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M8 1.5v8.2M5.2 4.3 8 1.5l2.8 2.8M4.5 6.5H3.2v7.8h9.6V6.5h-1.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** `ready` — the caller's "a calm hub moment" gate (never over the first-boot film or the tutorial). */
export function InstallHint({ ready }: { ready: boolean }): JSX.Element | null {
  const [shell] = useState(browserShell);
  const [dismissed, setDismissed] = useState(installHintDismissed);
  if (!ready || dismissed || !shell.mobile || !shell.iphone) return null;
  const close = (): void => { dismissInstallHint(); setDismissed(true); };
  return (
    <div className="install-hint" role="status">
      <span className="ih-glyph" aria-hidden>📲</span>
      <span className="ih-text">
        <b>Play full screen.</b> Tap <ShareGlyph /> <b>Share</b>, then <b>Add to Home Screen</b> — the game opens without the address bar.
      </span>
      <button className="ih-close" onClick={close}>Got it</button>
    </div>
  );
}
