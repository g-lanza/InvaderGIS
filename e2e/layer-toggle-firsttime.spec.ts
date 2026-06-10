/**
 * Regression: a heavy optional layer must render its features the FIRST time it is
 * toggled on — even after the year has been scrubbed away from the boot year.
 *
 * The bug (introduced by the "only re-filter VISIBLE layers per tick" perf change):
 * applyTimeFilter skipped hidden layers, so a layer toggled on at a later year kept
 * its stale boot-year filter. The toggle-on re-apply that was meant to fix this was
 * gated behind isStyleLoaded(), which a heavy GeoJSON source holds FALSE while it
 * reprocesses on toggle — so the first toggle was a no-op and the layer only
 * appeared after a second off→on. The fix loosens the toggle-on path to the
 * existence guard (the per-layer setters are individually teardown-safe).
 *
 * This test scrubs the year, toggles Events ON exactly once, and asserts the layer
 * is visible AND rendering features for the current year. Requires the dev-only
 * window.__map hook (present in dev mode, which the Playwright webServer uses).
 */
import { test, expect } from '@playwright/test';

test('heavy layer renders on the first toggle-on after scrubbing the year', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30_000 });
  await page.waitForTimeout(3000);

  // Scrub the year off the boot year so any hidden layer's boot-year filter is stale.
  const slider = page.locator('input[type="range"]').first();
  await slider.focus().catch(() => {});
  await slider.press('End').catch(() => {});
  await page.waitForTimeout(300);
  for (let i = 0; i < 20; i++) await slider.press('ArrowLeft').catch(() => {});
  await page.waitForTimeout(500);

  // Toggle Events ON exactly once via the real UI control.
  const eventsToggle = page.locator('button[title="Show Events layer"]').first();
  await expect(eventsToggle).toHaveCount(1);
  await eventsToggle.evaluate((el: HTMLElement) => el.click());
  // Store flip confirmation: the toggle's title flips Show→Hide when visible.
  await expect(page.locator('button[title="Hide Events layer"]')).toHaveCount(1, { timeout: 5000 });

  // The events layer must now be visible AND rendering features for the current
  // year — not frozen empty at the stale boot-year filter.
  const rendered = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__map;
    if (!map) return { count: -1, vis: 'no-map-hook' };
    const layers = ['events-symbol', 'events-circle'].filter((l: string) => map.getLayer(l));
    for (let i = 0; i < 25; i++) {
      const feats = map.queryRenderedFeatures({ layers });
      if (feats.length > 0) {
        return { count: feats.length, vis: map.getLayoutProperty('events-symbol', 'visibility') };
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    return { count: 0, vis: map.getLayer('events-symbol') ? map.getLayoutProperty('events-symbol', 'visibility') : 'absent' };
  });

  expect(rendered.vis).toBe('visible');
  expect(rendered.count).toBeGreaterThan(0);
});
