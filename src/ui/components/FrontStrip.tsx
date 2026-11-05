// FRONT STRIP (docs/INFESTATION.md §front) — the Command Center's one-line view of The Front.
// Its own module so the home screen (boot) doesn't pull ui/FrontScreen.tsx — the full war screen,
// loaded with its hub door — into the boot bundle (docs/DEPLOYMENT.md §boot-budget).

import { meta } from '../../state/meta';
import { navBus } from '../../state/navBus';

/** The Command Center's one-line Front strip — region fractions, today's beats, the deep link.
 *  Replaces the old full-size home board (docs/INFESTATION.md §front — the clutter fix). */
export function FrontStrip(): JSX.Element {
  meta.use();
  const v = meta.frontView();
  const map = meta.infestationView();
  return (
    <button className="front-strip" onClick={() => navBus.go('infestation')} aria-label="Open The Front">
      <span className="front-strip-k">⛬ THE FRONT</span>
      <span className="front-strip-regs" aria-hidden>
        {map.regions.map((r) => (
          <span
            key={r.def.id}
            className={`front-strip-reg${r.entrenched ? ' is-ent' : ''}`}
            title={`${r.def.name} ${(r.fraction * 100).toFixed(0)}%`}
            style={{ ['--fr' as string]: String(Math.max(0.06, r.fraction)), ['--rc' as string]: r.def.accent }}
          />
        ))}
      </span>
      <span className="front-strip-hot">☀ {v.hotspot.name}</span>
      {v.incursion && !v.incursion.defended && <span className="front-strip-inc">⚠ INCURSION</span>}
      {v.claimableCount > 0 && <span className="front-strip-n">{v.claimableCount}</span>}
      <span className="front-strip-go" aria-hidden>›</span>
    </button>
  );
}
