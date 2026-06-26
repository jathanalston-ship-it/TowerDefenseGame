import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
