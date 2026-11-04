import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from './net/swRegister';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { validateAllContentReport, formatReport } from './core/validate';
import './index.css';

// Fail loud during development if content data is inconsistent. Production content
// is fixed at build time, so this only runs with the dev server. The structured report
// classifies every issue (duplicate ids, missing assets, bad references, invalid stats,
// missing localization, broken upgrade chains, invalid loot tables) so a content mistake
// is obvious the moment it's introduced — without ever affecting gameplay.
if (import.meta.env.DEV) {
  const report = validateAllContentReport();
  if (report.errors.length > 0) console.error(`[content]\n${formatReport(report)}`);
  else if (report.warnings.length > 0) console.warn(`[content]\n${formatReport(report)}`);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Warm the run-path chunks once the hub has painted (code-splitting, docs/DEPLOYMENT.md §code-splitting):
// the first run starts without a spinner, and nothing here competes with boot.
const idle: (cb: () => void) => void =
  'requestIdleCallback' in window ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 }) : (cb) => window.setTimeout(cb, 2000);
if (import.meta.env.PROD) {
  idle(() => {
    void import('./ui/GameView');
    void import('./ui/Results');
    void import('./ui/TutorialRunner');
  });
}

registerServiceWorker(); // PROD-only offline shell + update toast (docs/DEPLOYMENT.md §sw)
