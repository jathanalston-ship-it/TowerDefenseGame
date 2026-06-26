import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
// Self-hosted fonts (no runtime CDN dependency). Inter = UI/body (variable weight
// axis); Chakra Petch = display headers. Only the latin subset is fetched at
// runtime (unicode-range), so the extra subsets never hit the wire.
import '@fontsource-variable/inter/wght.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
