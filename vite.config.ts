import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA build for Cloudflare Pages.
// - base '/' : Pages serves from the domain root.
// - outDir 'dist' : Cloudflare Pages' default output directory (zero extra config).
// No SSR, no server, no env requirements.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    // Public client, no secrets in the bundle: real source maps make production
    // errors debuggable. They're separate files — only fetched by DevTools.
    sourcemap: true,
    rollupOptions: {
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
