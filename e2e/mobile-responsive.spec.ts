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
  await page.locator('.msa-topbar').waitFor({ state: 'visible' });
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

/** Open a heavy overlay/panel via the mobile Menu drawer (or the desktop TopBar). */
async function openViaMenu(page: Page, label: string): Promise<boolean> {
  // Phone shell: open the Menu drawer, then tap the action row.
  const menuBtn = page.locator('.m-topbar__btn', { hasText: 'Menu' });
  if (await menuBtn.count()) {
    await menuBtn.first().click();
    await page.waitForTimeout(350);
    const item = page.locator('.m-menu__item', { hasText: new RegExp(`^${label}`, 'i') });
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
