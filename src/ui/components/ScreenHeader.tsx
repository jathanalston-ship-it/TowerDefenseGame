// SCREEN HEADER — the navigation frame every hub screen inherits (docs/UX-CONSOLIDATION.md
// §wayfinding). One thin registry-driven bar answers the three wayfinding questions at a
// glance: WHERE AM I (breadcrumb: hub group ▸ screen), HOW DO I GO BACK (the ‹ button —
// nav history, wired by the Hub), and WHERE ELSE CAN I GO FROM HERE (sibling chips — every
// revealed screen of the SAME group, one tap away, so moving between related pages never
// requires a hub round-trip). Rendered by the Hub at its one screen chokepoint; screens
// themselves stay header-free. Portrait keeps MobilePageHead; Home is the root (no frame).

import type { SaveData } from '../../save/saveStore';
import type { NavKey } from '../navModel';
import { groupOf } from '../navModel';
import { featureRevealed } from '../../state/unlocks';

export function ScreenHeader({ nav, save, badges, onBack, go, onGroup }: {
  nav: NavKey;
  save: SaveData;
  badges: Record<string, number>;
  onBack: () => void;
  go: (k: NavKey) => void;
  onGroup: () => void; // open this screen's hub landing (the breadcrumb parent)
}): JSX.Element {
  const group = groupOf(nav);
  const current = group.items.find((i) => i.key === nav);
  const siblings = group.items.filter((i) => featureRevealed(save, i.key));
  return (
    <div className="scrh" role="navigation" aria-label="Screen navigation">
      <button type="button" className="scrh-back" onClick={onBack} aria-label="Back" title="Back">‹</button>
      <span className="scrh-crumb">
        <button type="button" className="scrh-parent" onClick={onGroup}>
          <span aria-hidden>{group.hub.glyph}</span> {group.title}
        </button>
        <span className="scrh-sep" aria-hidden>▸</span>
        <span className="scrh-here" aria-current="page">{current?.label ?? nav}</span>
      </span>
      {siblings.length > 1 && (
        <span className="scrh-sibs" aria-label={`Other ${group.title} screens`}>
          {siblings.map((i) => (
            <button
              key={i.key}
              type="button"
              className={`scrh-sib${i.key === nav ? ' is-here' : ''}`}
              onClick={() => { if (i.key !== nav) go(i.key); }}
              aria-pressed={i.key === nav}
              title={i.label}
            >
              <span aria-hidden>{i.mono}</span>
              <em>{i.label}</em>
              {(badges[i.key] ?? 0) > 0 && i.key !== nav && <i className="scrh-b" aria-label={`${badges[i.key]} new`} />}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
