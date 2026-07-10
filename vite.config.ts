import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build for Cloudflare Pages (docs/WEBSITE.md §architecture).
// - The GAME app builds from play/index.html → served at /play/.
// - The marketing/content SITE is pre-generated static HTML in public/ (scripts/gen-site.ts),
//   copied verbatim into dist — the domain root is the site's Home, not the game shell.
// - appType 'mpa': no dev SPA fallback — real static pages + a real 404.
// No SSR, no server, no env requirements.
export default defineConfig({
  plugins: [react()],
  appType: 'mpa',
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
        // browser-cached across releases while the app chunk turns over. The game
        // itself ships as ONE app chunk on purpose: the sim/content/UI are all
        // needed at boot, and slicing them only adds request waterfalls.
        manualChunks: { vendor: ['react', 'react-dom'] },
      },
    },
  },
});
