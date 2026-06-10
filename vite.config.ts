/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for InvaderGIS.
 * - React plugin for JSX/Fast Refresh.
 * - `@` path alias → `src/`, matching tsconfig `paths`.
 * - Static SPA build to `dist/` (per docs/02 §2 — no server runtime).
 *
 * manualChunks rationale (added 2026-06-03):
 *   The main `index` chunk contains both app code and stable vendor libs that
 *   change on different cadences. Splitting them improves cache retention: a
 *   code-only app update leaves the vendor chunk untouched in CDN/browser cache.
 *
 *   react-vendor  — react + react-dom: largest stable dep (~140 KB gz combined).
 *                   Virtually never changes between app deploys.
 *   zustand-vendor — zustand: small but independently versioned; isolating it
 *                   keeps the vendor chunk predictable.
 *
 *   maplibre-gl is already its own 802 KB chunk via the dynamic import() in
 *   useMapLifecycle.ts — do NOT add it here.
 *
 *   All overlay components (Network, Compare, Lineage, Sources, Registers,
 *   Settings, Upload, Filter, Search, Walkthrough) are already split via
 *   React.lazy() in AppShell.tsx — the split points are preserved.
 */
export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project site from /<repo>/. In production the app and all
  // runtime-fetched assets (resolved via assetUrl() against import.meta.env.BASE_URL)
  // live under /InvaderGIS/. In dev the server runs at the root, so base stays '/'.
  base: command === 'build' ? '/InvaderGIS/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React runtime — most stable, largest vendor dep.
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // Zustand — state management runtime; independently versioned.
          if (id.includes('node_modules/zustand/')) {
            return 'zustand-vendor';
          }
          // All other node_modules fall through to Rollup's default chunking
          // (maplibre-gl stays in its own dynamic chunk via import() in
          // useMapLifecycle.ts; pmtiles similarly).
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    // jsdom so component/DOM tests (and @testing-library/react) can run; pure-fn
    // tests are unaffected. globals:true lets specs use describe/it/expect without
    // imports, matching the existing pure-fn specs that already import them.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
}));
