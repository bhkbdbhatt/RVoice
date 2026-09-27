// Astro configuration for the RVoice VoC frontend.
// Built output lands in ./dist — the backend serves it directly.
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Output folder the Express backend will statically serve.
  outDir: './dist',
  // Static single-page dashboard (no SSR/adapter needed).
  output: 'static',
  server: {
    port: 4321,
    // During `astro dev`, forward API calls to the Express backend.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});