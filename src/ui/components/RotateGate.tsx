// ROTATE GATE (docs/RESPONSIVE-DESIGN.md §landscape) — phones play HORIZONTAL ONLY.
// A touch device held portrait gets this full-screen hold instead of the game: the upgrade
// consoles and the war room are widescreen organisms and portrait can't carry them. The
// gate reads the layout profile (never raw width), so rotating the device dismisses it on
// the same frame the profile flips. Desktop/mouse windows are NEVER gated — a narrow
// desktop window keeps the compact layout it always had ("desktop view is fine as it is").
//
// Platform seam: the future iOS/Android APP SHELL locks orientation natively (the gate is
// the mobile-BROWSER half of the split), so shipping this to stores needs no change here.

import { useLayoutProfile } from '../layoutProfile';
import { themeOwner } from '../../core/liveEvents';

export function RotateGate(): JSX.Element | null {
  const { profile, coarse } = useLayoutProfile();
  if (profile !== 'portrait' || !coarse) return null;
  const ev = themeOwner(Date.now()).def; // the live theme owner tints the hold screen too
  return (
    <div className="rotate-gate" role="status" aria-live="polite" style={{ ['--ev' as string]: ev.theme.accent, ['--ev-glow' as string]: ev.theme.glow }}>
      <div className="rotate-gate-device" aria-hidden><i /></div>
      <div className="rotate-gate-title">TURN YOUR DEVICE</div>
      <p className="rotate-gate-body">
        ASSIMILATION is a widescreen organism — rotate to landscape and the Hive unfolds.
      </p>
      <div className="rotate-gate-ev" aria-hidden>{ev.theme.logo} {ev.name} is live</div>
    </div>
  );
}
