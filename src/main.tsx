/**
 * main.tsx — application entry. Applies the persisted theme to <html> before
 * first paint, bootstraps the medieval dataset (Spine 2b), and mounts <App/>.
 *
 * The PMTiles protocol registration and MapLibre import have moved to
 * src/map/useMapLifecycle.ts so that MapLibre is a dynamic chunk (not in the
 * initial bundle). This is the Spine 2c-ii split described in docs/00 §3:
 *   shell-only first-paint target: < 80 KB gzip.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, useSettingsStore } from '@/stores/settingsStore';
import { initDataset } from '@/data/bootstrap';
import { useSelectionStore } from '@/stores/selectionStore';
import { App } from '@/App';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
// fonts.css must load before atlas-tokens.css so @font-face declarations are
// registered before the CSS custom properties that reference the family names.
import '@/styles/fonts.css';
import '@/styles/atlas-tokens.css';

// Apply the theme before React mounts so there is no flash of the wrong chrome.
applyTheme(useSettingsStore.getState().theme);

// Bootstrap the medieval dataset (Spine 2c-i): wires stores synchronously then
// fetches all 4,032 real records from public/data/records/ in parallel.
// Fire-and-forget: the React tree mounts immediately with zero counts in the
// StatusBar ("— loading —"); recordsStore is updated once fetches resolve.
// If the bake artifacts are missing, a console.error is emitted (not a crash).
initDataset().then(() => {
  // Signal the splash screen that records are loaded.
  (window as unknown as { __splashRecordsReady?: () => void }).__splashRecordsReady?.();
}).catch((err: unknown) => {
   
  console.error('[InvaderGIS] Dataset load failed — run `npm run bake` first.', err);
  // Still unblock the splash so it doesn't hang forever on a bake failure.
  (window as unknown as { __splashRecordsReady?: () => void }).__splashRecordsReady?.();
});

// DEV-ONLY QA affordance: expose selectionStore.select on window so automated
// dogfooding can drive the inspector directly (no production effect — guarded
// by import.meta.env.DEV and tree-shaken out of the production bundle).
if (import.meta.env.DEV) {
  (window as unknown as { __msaSelect?: (id: string, kind: string) => void }).__msaSelect = (
    id: string,
    kind: string,
  ): void => useSelectionStore.getState().select(id, kind);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('InvaderGIS: #root mount node not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
