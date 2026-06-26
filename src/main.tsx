import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { validateContent } from './core/validate';
import './index.css';

// Fail loud during development if content data is inconsistent. Production content
// is fixed at build time, so this only runs with the dev server.
if (import.meta.env.DEV) {
  const problems = validateContent();
  if (problems.length > 0) {
    console.error(`[content] ${problems.length} validation problem(s):\n - ${problems.join('\n - ')}`);
  }
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
