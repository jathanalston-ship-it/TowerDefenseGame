// Suspense fallback for lazy-loaded hub screens / overlays (docs/DEPLOYMENT.md §code-splitting).
// Tiny on purpose: design tokens only, no imports beyond React types, no layout shift — it fills
// the content area for the few ms a chunk takes (cached chunks resolve before first paint).
import type { CSSProperties } from 'react';

const box: CSSProperties = {
  minHeight: 160,
  display: 'grid',
  placeItems: 'center',
  color: 'var(--dim)',
  font: '600 12px var(--font-display, inherit)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};

export function ScreenFallback(): JSX.Element {
  return (
    <div style={box} role="status" aria-live="polite" data-testid="screen-fallback">
      Loading…
    </div>
  );
}
