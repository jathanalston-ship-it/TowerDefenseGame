// THE MOBILE-BROWSER SHELL (docs/RESPONSIVE-DESIGN.md §browser) — the game in a phone's web browser,
// where the toolbar (address bar) takes part of the screen. The layout already sizes to what's visible
// (--app-h, layoutProfile.ts); this module handles the rest:
//   · Android / iPad: the browser can go FULL SCREEN — the first tap of a session asks for it
//     (Settings → "Full screen in mobile browsers", default on), and the top bar offers ⛶ to return.
//   · iPhone Safari has no full-screen API for pages: the way to lose the toolbar is Add to Home Screen
//     (the installed web app runs standalone) — BrowserShell.tsx shows a one-time hint.
//   · Installed / standalone (or the future store app): nothing to do — there is no toolbar.
// Presentation only; nothing here touches the sim or the save.

export interface BrowserShell {
  /** A touch phone/tablet in a web browser (not installed, not desktop). */
  mobile: boolean;
  standalone: boolean;
  /** iPhone/iPod (Safari can't full-screen a page there). iPad counts as able if the API exists. */
  iphone: boolean;
  /** The page can request full screen (Android Chrome, iPad Safari, …). */
  canFullscreen: boolean;
}

type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function browserShell(): BrowserShell {
  if (typeof window === 'undefined') return { mobile: false, standalone: false, iphone: false, canFullscreen: false };
  const ua = navigator.userAgent || '';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const standalone = (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
    || (window.matchMedia?.('(display-mode: fullscreen)').matches ?? false)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const iphone = /iPhone|iPod/.test(ua);
  const handheld = /Android|iPhone|iPod|iPad|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS reports a Mac UA
  const d = document as FsDoc;
  const canFullscreen = !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
  return { mobile: coarse && handheld && !standalone, standalone, iphone, canFullscreen };
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Ask the browser for full screen (must run inside a user gesture). Resolves false when refused. */
export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

let armed = false;
/** Once per page load: the first tap in a mobile browser asks for full screen (when the player's pref
 *  allows). Exiting later is respected — it is not re-requested until the next load or the ⛶ button. */
export function armFullscreenOnFirstTap(allowed: () => boolean): void {
  if (armed || typeof window === 'undefined') return;
  const shell = browserShell();
  if (!shell.mobile || !shell.canFullscreen) return;
  armed = true;
  const onTap = (): void => {
    window.removeEventListener('pointerup', onTap, true);
    if (allowed() && !isFullscreen()) void enterFullscreen();
  };
  window.addEventListener('pointerup', onTap, true);
}

/** Subscribe to full-screen changes (the ⛶ button hides while full screen). */
export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
}
