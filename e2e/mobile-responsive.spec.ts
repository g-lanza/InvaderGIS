import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile-responsiveness verification.
 *
 * For every surface (base shell, the three bottom sheets, and each heavy overlay)
 * we assert the three things that break the InvaderGIS mobile experience:
 *   1. No horizontal page overflow (scrollWidth must not exceed clientWidth).
 *   2. Every interactive control is a ≥44px touch target (with a small tolerance
 *      and a documented allow-list for purely-decorative / inline-text hits).
 *   3. Every visible text input is ≥16px so iOS Safari doesn't zoom on focus.
 * Screenshots are captured per surface × viewport for visual review.
 *
 * The project name (w320/w375/…) is used to label screenshots so a single run
 * across all five viewports yields one image set per surface.
 */

/** Tap-target floor. 44 is the iOS/Android guideline; allow 2px AA tolerance. */
const TAP_MIN = 42;
/** iOS no-zoom input floor. */
const INPUT_MIN_FONT = 16;

/** Selectors whose elements are decorative or text-inline and exempt from TAP_MIN. */
const TAP_ALLOWLIST = [
  '.tr-thumb-indicator', // visual needle, not a hit target
  '.claim-cite',         // inline footnote superscripts inside prose
  '.msa-sheet-handle',   // full-width drag bar; height is intentionally < 44
  '.m-drawer__grip',     // full-width (375px) drag bar; you drag it, not tap a 44² target
  // Data-visualization marks are not discrete UI controls — they are zoomable
  // data points. The 44px guideline targets chrome buttons, not graph nodes /
  // Gantt bars, which the user enlarges via pinch-zoom (usePanZoom) or scroll.
  '.network-graph__node',
  '.lineage-gantt__bar',
  '.relationship-matrix__cell',
  'svg [role="button"]', // any role=button living inside an SVG visualization
];

async function waitForShell(page: Page): Promise<void> {
  // Suppress the first-visit walkthrough tour (its modal backdrop intercepts
  // clicks) by pre-setting the "seen" flag before any app script runs.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hdv-walkthrough-seen', '1');
    } catch {
      /* storage blocked — tour falls back to not auto-popping */
    }
  });
  await page.goto('/');
  await page.locator('.msa-app').waitFor({ state: 'visible' });
  // Wait for whichever top bar this viewport renders: the desktop grid uses
  // `.msa-topbar`; the phone shell (≤600px) uses `.m-topbar`.
  await page.locator('.msa-topbar, .m-topbar').first().waitFor({ state: 'visible' });
  // The boot splash (#app-splash) intercepts pointer events until both ready
  // signals fire; wait for it to detach (splash.js removes it after .is-hiding).
  await page
    .locator('#app-splash')
    .waitFor({ state: 'detached', timeout: 30_000 })
    .catch(() => { /* already gone or never present */ });
  // Settle first paint / sheet-chrome injection.
  await page.waitForTimeout(400);
}

async function expectNoHorizontalOverflow(page: Page, surface: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflow: de.scrollWidth > de.clientWidth + 1, // 1px rounding tolerance
    };
  });
  expect(
    overflow.overflow,
    `[${surface}] horizontal overflow: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
  ).toBe(false);
}

async function auditTapTargets(page: Page, surface: string): Promise<void> {
  const offenders = await page.evaluate(
    ({ tapMin, allowlist }) => {
      const sel = 'button, a[href], [role="button"], input[type="range"]';
      const out: { tag: string; cls: string; w: number; h: number }[] = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        // Skip hidden / zero-area elements (not currently interactive).
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return;
        if (style.pointerEvents === 'none') return; // inside a closed sheet, etc.
        // Only audit controls actually on-screen on THIS surface. Elements parked
        // off-viewport (e.g. inside a closed bottom sheet at translateY(100%)) are
        // not reachable here and are checked on their own surface test.
        const onScreen =
          rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
        if (!onScreen) return;
        if (allowlist.some((a) => el.matches(a))) return;
        const min = Math.min(rect.width, rect.height);
        if (min < tapMin) {
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className?.toString().slice(0, 60) ?? '',
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      });
      return out;
    },
    { tapMin: TAP_MIN, allowlist: TAP_ALLOWLIST },
  );
  expect(
    offenders,
    `[${surface}] ${offenders.length} sub-${TAP_MIN}px tap target(s): ` +
      JSON.stringify(offenders, null, 2),
  ).toEqual([]);
}

async function auditInputFontSize(page: Page, surface: string): Promise<void> {
  const offenders = await page.evaluate(
    ({ minFont }) => {
      const out: { type: string; fontSize: number }[] = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('input, select, textarea').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return;
        if (style.pointerEvents === 'none') return;
        const onScreen =
          rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
        if (!onScreen) return;
        // Range inputs don't trigger zoom; only text-entry fields do.
        if (el instanceof HTMLInputElement && el.type === 'range') return;
        const fs = parseFloat(style.fontSize);
        if (fs < minFont) {
          out.push({ type: (el as HTMLInputElement).type ?? el.tagName, fontSize: fs });
        }
      });
      return out;
    },
    { minFont: INPUT_MIN_FONT },
  );
  expect(
    offenders,
    `[${surface}] inputs below ${INPUT_MIN_FONT}px (iOS will zoom): ` + JSON.stringify(offenders),
  ).toEqual([]);
}

async function verifySurface(page: Page, surface: string, projectName: string): Promise<void> {
  await expectNoHorizontalOverflow(page, surface);
  // The strict 44px touch-target floor is tied to the MOBILE LAYOUT, which the
  // app switches on at ≤600px (single column + bottom sheets + token overrides).
  // Above that the desktop chrome is shown intentionally — its dense controls keep
  // their desktop sizing even on a touch tablet, so we don't demand 44px there.
  const width = page.viewportSize()?.width ?? 0;
  if (width <= 600) {
    // Touch-target floor and input-zoom guard both belong to the mobile layout
    // (≤600px). Above that the desktop chrome is shown intentionally with its
    // denser controls, so neither strict floor applies.
    await auditTapTargets(page, surface);
    await auditInputFontSize(page, surface);
  }
  await page.screenshot({
    path: `e2e/__screens__/${surface}-${projectName}.png`,
    fullPage: false,
  });
}

/** Loop label → the text shown on the mobile Menu row (some differ). */
const MENU_ROW_TEXT: Record<string, string> = {
  Views: 'Saved Views',
  Upload: 'My Data',
};

/** Open a heavy overlay/panel via the mobile Menu drawer (or the desktop TopBar). */
async function openViaMenu(page: Page, label: string): Promise<boolean> {
  // Phone shell: open the Menu drawer, then tap the action row.
  const menuBtn = page.locator('.m-topbar__btn', { hasText: 'Menu' });
  if (await menuBtn.count()) {
    await menuBtn.first().click();
    await page.waitForTimeout(350);
    const rowText = MENU_ROW_TEXT[label] ?? label;
    const item = page.locator('.m-menu__item', { hasText: new RegExp(`^${rowText}`, 'i') });
    if (await item.count()) {
      await item.first().click();
      await page.waitForTimeout(450);
      return true;
    }
    await menuBtn.first().click(); // close menu
    return false;
  }
  // Desktop/tablet: click the TopBar button directly.
  const btn = page.locator(`.msa-topbar [data-mobile-menu="${label}"]`);
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

test.describe('mobile responsiveness', () => {
  test('base shell', async ({ page }, testInfo) => {
    await waitForShell(page);
    await verifySurface(page, 'shell', testInfo.project.name);
  });

  test('layers drawer', async ({ page }, testInfo) => {
    await waitForShell(page);
    const btn = page.locator('.m-topbar__btn', { hasText: 'Layers' });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(450);
      await verifySurface(page, 'layers-drawer', testInfo.project.name);
    } else {
      test.skip(true, 'No phone shell at this viewport');
    }
  });

  test('menu drawer', async ({ page }, testInfo) => {
    await waitForShell(page);
    const btn = page.locator('.m-topbar__btn', { hasText: 'Menu' });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(450);
      await verifySurface(page, 'menu-drawer', testInfo.project.name);
    } else {
      test.skip(true, 'No phone shell at this viewport');
    }
  });

  test('entity drawer (select a polity)', async ({ page }, testInfo) => {
    await waitForShell(page);
    if (!(await page.locator('.m-shell').count())) {
      test.skip(true, 'No phone shell at this viewport');
      return;
    }
    await page.evaluate(() => {
      const w = window as unknown as { __msaSelect?: (id: string, kind: string) => void };
      w.__msaSelect?.('abbasid_caliphate', 'polity');
    });
    await page.waitForTimeout(600);
    // The drawer auto-opens at peek with the record title.
    await page.locator('.m-drawer__title').waitFor({ state: 'visible', timeout: 5000 });
    await verifySurface(page, 'entity-drawer', testInfo.project.name);
  });

  // ── Real-device fix regressions (Issues A–D) ────────────────────────────────
  test('layer toggle is tappable inside the drawer (Issue A)', async ({ page }) => {
    await waitForShell(page);
    const layersBtn = page.locator('.m-topbar__btn', { hasText: 'Layers' });
    test.skip(!(await layersBtn.count()), 'No phone shell at this viewport');
    await layersBtn.first().click();
    await page.waitForTimeout(450);
    const toggle = page.locator('.m-drawer__body .layer-item__toggle').first();
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    await page.waitForTimeout(150);
    const after = await toggle.getAttribute('aria-pressed');
    expect(after, 'layer toggle aria-pressed should flip on tap').not.toBe(before);
  });

  test('map chrome clears the top bar and the slider (Issues B + C)', async ({ page }) => {
    await waitForShell(page);
    test.skip(!(await page.locator('.m-shell').count()), 'No phone shell at this viewport');
    const topbar = await page.locator('.m-topbar').boundingBox();
    const zoom = await page.locator('.gis-zoom').boundingBox();
    expect(zoom!.y, 'zoom cluster below the top bar').toBeGreaterThanOrEqual(topbar!.y + topbar!.height - 2);

    const timerail = await page.locator('.m-shell__timerail').boundingBox();
    const bl = await page.locator('.gis-bottom-left').boundingBox();
    expect(bl!.y + bl!.height, 'scale cluster above the TimeRail').toBeLessThanOrEqual(timerail!.y + 2);

    await expect(page.locator('.gis-coords'), 'cursor coords hidden on touch').toBeHidden();
    await expect(page.locator('.gis-rf-scale'), 'RF scale kept').toBeVisible();
  });

  test('TimeRail is simplified, scrubber spans the strip (Issue D)', async ({ page }) => {
    await waitForShell(page);
    test.skip(!(await page.locator('.m-shell').count()), 'No phone shell at this viewport');
    await expect(page.locator('.tr-era-strip')).toBeHidden();
    await expect(page.locator('.tr-century-strip')).toBeHidden();
    await expect(page.locator('.tr-play__speed')).toBeHidden();
    await expect(page.locator('.tr-play__loop')).toBeHidden();
    await expect(page.locator('.tr-readout__year')).toBeVisible();
    await expect(page.locator('.tr-scrubber')).toBeVisible();
    const rail = await page.locator('.m-shell__timerail').boundingBox();
    const scr = await page.locator('.tr-scrubber').boundingBox();
    expect(scr!.width, 'scrubber spans most of the strip').toBeGreaterThan(rail!.width * 0.4);

    // The readout (year + period name) must not bleed past its cell into the track:
    // every readout child's right edge stays within the .tr-readout box.
    const overflow = await page.evaluate(() => {
      const readout = document.querySelector('.tr-readout');
      if (!readout) return false;
      const box = readout.getBoundingClientRect();
      return Array.from(readout.children).some(
        (c) => c.getBoundingClientRect().right > box.right + 1,
      );
    });
    expect(overflow, 'readout year/period must not overflow into the slider').toBe(false);
  });

  test('map render resolution is capped (≤2× CSS) for mobile playback', async ({ page }) => {
    await waitForShell(page);
    test.skip(!(await page.locator('.m-shell').count()), 'No phone shell at this viewport');
    // Wait for the MapLibre canvas to exist.
    await page.locator('.m-shell__map canvas').first().waitFor({ state: 'attached', timeout: 15000 });
    const ratio = await page.evaluate(() => {
      const c = document.querySelector('.m-shell__map canvas') as HTMLCanvasElement | null;
      if (!c) return null;
      const cssW = c.getBoundingClientRect().width;
      if (cssW === 0) return null;
      return c.width / cssW; // backing-store px per CSS px
    });
    // pixelRatio is capped at 2 in useMapLifecycle, so even on a DPR-3 device the
    // canvas backing store is ≤2× its CSS size (small tolerance for rounding).
    expect(ratio, `canvas backing ratio ${ratio}`).not.toBeNull();
    expect(ratio!).toBeLessThanOrEqual(2.1);
  });

  for (const label of ['Network', 'Lineage', 'Registers', 'Compare', 'Sources', 'Filter', 'Search', 'Settings', 'Views']) {
    test(`overlay: ${label}`, async ({ page }, testInfo) => {
      await waitForShell(page);
      const opened = await openViaMenu(page, label);
      if (!opened) {
        test.skip(true, `${label} control not available`);
        return;
      }
      await verifySurface(page, `overlay-${label.toLowerCase()}`, testInfo.project.name);
    });
  }
});

test.describe('mobile tour (Issue E)', () => {
  test('first-visit tour uses the 5 mobile steps', async ({ page }) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width > 600, 'mobile-only tour check');
    // Do NOT pre-seed hdv-walkthrough-seen — let the tour auto-open.
    await page.goto('/');
    await page.locator('.walkthrough__card').waitFor({ state: 'visible', timeout: 15000 });
    await expect(page.locator('.walkthrough__count')).toContainText('/ 5');
    // No horizontal overflow with the card up.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, 'tour card must not cause horizontal overflow').toBe(false);
    await page.screenshot({ path: `e2e/__screens__/mobile-tour-${width}.png` });
  });
});

test.describe('desktop regression', () => {
  test('desktop layout intact (no overflow, desktop chrome present)', async ({ page }, testInfo) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width <= 600, 'desktop-only regression check');
    await waitForShell(page);
    // No horizontal overflow on the desktop grid.
    await expectNoHorizontalOverflow(page, 'desktop-shell');
    // The desktop chrome that is HIDDEN on mobile must be present here: the grid
    // shows the layer rail / dock as columns (not bottom sheets), and the TopBar
    // clusters are inline (no injected mobile sheet bar).
    await expect(page.locator('.msa-sheet-bar')).toHaveCount(0);
    await expect(page.locator('.msa-layerrail')).toBeVisible();
    await expect(page.locator('.msa-dock')).toBeVisible();
    await page.screenshot({
      path: `e2e/__screens__/desktop-shell-${testInfo.project.name}.png`,
      fullPage: false,
    });
  });
});
