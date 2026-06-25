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
    sourcemap: false,
  },
});
