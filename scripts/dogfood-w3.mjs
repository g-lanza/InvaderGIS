/**
 * Wave 3 dogfood script — headless chromium screenshot + console error check.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('C:/Users/Peopl/OneDrive/Desktop/medieval-systems/medieval-systems/node_modules/playwright');

const SCREENSHOT_PATH = 'C:/Users/Peopl/OneDrive/Desktop/medieval-systems/medieval-systems/InvaderGIS/InvaderGIS/showcase/wave3-verify.png';
const CHROMIUM_EXEC = 'C:/Users/Peopl/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';

async function run() {
  const browser = await pw.chromium.launch({
    executablePath: CHROMIUM_EXEC,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message));

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Screenshot: initial map view
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log('Screenshot 1: map render');

  // Open Registers overlay
  const registersBtn = page.locator('button').filter({ hasText: /register/i }).first();
  const btnCount = await registersBtn.count();
  console.log(`Registers button found: ${btnCount > 0}`);
  if (btnCount > 0) {
    await registersBtn.click();
    await page.waitForTimeout(2000);
  }

  // Collect tab info from the registers overlay specifically
  const registerOverlay = page.locator('.registers-overlay, [aria-label="Attribute table registers"]').first();
  const tabs = await registerOverlay.locator('[role="tab"], .tab-btn, button').all();
  const tabTexts = await Promise.all(tabs.map(t => t.textContent().catch(() => '')));
  console.log('Register tabs:', tabTexts.filter(t => t.trim()).map(t => t.trim()));

  // Find and click Settlements tab specifically within the overlay
  const settlementTabInOverlay = registerOverlay.locator('button, [role="tab"]').filter({ hasText: /settlement/i }).first();
  const stCount = await settlementTabInOverlay.count();
  console.log(`Settlement tab in overlay: ${stCount}`);
  if (stCount > 0) {
    await settlementTabInOverlay.click();
    await page.waitForTimeout(1500);
    const rows = await page.locator('tbody tr').count();
    console.log(`Settlement rows (first page): ${rows}`);
  }

  // Screenshot: settlements register
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log('Screenshot 2: settlements register view (saved to wave3-verify.png)');

  // Toggle off settlements layer on map, toggle back on
  console.log('\nMap layer toggles: checking layer panel exists...');
  const layerPanel = page.locator('.layer-item, [class*="layer"]').first();
  const lCount = await layerPanel.count();
  console.log(`Layer panel items visible: ${lCount > 0}`);

  console.log('\n=== Console errors ===');
  if (consoleErrors.length === 0) {
    console.log('NONE');
  } else {
    consoleErrors.forEach((e, i) => console.log(`[error ${i+1}] ${e}`));
  }
  console.log(`Total [error]s: ${consoleErrors.length}`);

  await browser.close();
}

run().catch(err => {
  console.error('Dogfood script failed:', err.message);
  process.exit(1);
});
