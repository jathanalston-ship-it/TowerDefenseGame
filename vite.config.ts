/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Static build for Cloudflare Pages (docs/WEBSITE.md §architecture).
// - The GAME app builds from play/index.html → served at /play/.
// - The marketing/content SITE is pre-generated static HTML in public/ (scripts/gen-site.ts),
//   copied verbatim into dist — the domain root is the site's Home, not the game shell.
// - appType 'mpa': no dev SPA fallback — real static pages + a real 404.
// No SSR, no server, no env requirements.
export default defineConfig({
  plugins: [react()],
  appType: 'mpa',
  // Telemetry batches stamp the app version so dashboards can compare releases
  // (docs/ANALYTICS.md §client). Single source of truth: package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    target: 'es2020',
    // Public client, no secrets in the bundle: real source maps make production
    // errors debuggable. They're separate files — only fetched by DevTools.
    sourcemap: true,
    rollupOptions: {
      input: { play: 'play/index.html' },
      output: {
        // React never changes between our deploys — a stable vendor chunk stays
        // browser-cached across releases while the app chunk turns over. Hub screens and
        // other non-boot UI are lazy (React.lazy via src/ui/lazyNamed.ts → one chunk each,
        // precached by the service worker); the sim/state core stays in the entry chunk.
        manualChunks: { vendor: ['react', 'react-dom'] },
      },
    },
  },
  // Agent git worktrees live under .claude/worktrees (full repo copies) — never collect their
  // tests, or `npm test` in the main checkout runs every copy of the suite.
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
