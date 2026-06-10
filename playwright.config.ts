import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — mobile-responsiveness verification.
 *
 * Scope: this suite lives entirely under `e2e/` and runs in a real browser. It
 * does NOT overlap with the Vitest unit suite (which owns `*.test.ts(x)` under
 * jsdom). Keep `npm run test` (Vitest) and `npm run test:e2e` (this) separate.
 *
 * The webServer boots Vite on a FIXED port (strictPort) so the baseURL is
 * deterministic; `reuseExistingServer` lets a dev server already running on that
 * port be reused locally.
 */

// Port + server command are env-overridable so a run can dodge a port another
// process is holding (E2E_PORT) or test the static production build via preview
// (E2E_PREVIEW=1) instead of the dev server. Defaults are unchanged.
const PORT = Number(process.env.E2E_PORT ?? 5180);
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_CMD = process.env.E2E_PREVIEW
  ? `npm run preview -- --port ${PORT} --strictPort`
  : `npm run dev -- --port ${PORT} --strictPort`;

/** Phone + tablet widths the overhaul targets (320–414 phones, 768 tablet),
 *  plus a desktop width (1280) as a regression sentinel for the unchanged
 *  desktop layout. */
const VIEWPORTS = [
  { name: 'w320', width: 320, height: 568 },
  { name: 'w375', width: 375, height: 667 },
  { name: 'w390', width: 390, height: 844 },
  { name: 'w414', width: 414, height: 896 },
  { name: 'w768', width: 768, height: 1024 },
  { name: 'w1280', width: 1280, height: 800 },
] as const;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Touch is the whole point — emulate a touch-capable device everywhere.
    hasTouch: true,
    isMobile: true,
  },

  projects: VIEWPORTS.map((vp) => ({
    name: vp.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: true,
    },
  })),

  webServer: {
    command: SERVER_CMD,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
