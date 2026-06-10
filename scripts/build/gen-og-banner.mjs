/**
 * gen-og-banner.mjs — one-shot generator for the 1200×630 Open Graph banner.
 *
 * Composes a branded link-preview image: a white field, the square "Invader" logo
 * on the left, and the wordmark + subtitle (vertically centered) on the right, in
 * black. Rasterizes an inline SVG to PNG with sharp.
 *
 * This is a BUILD-TIME-ONLY tool — it is NOT part of the app or the npm build.
 * Run it once when the brand/banner changes; the output PNG is committed:
 *
 *     npm i -D sharp && node scripts/build/gen-og-banner.mjs && npm un sharp
 *
 * Output: public/og-banner.png (1200×630), referenced by og:image in index.html.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const W = 1200;
const H = 630;
const BG = '#ffffff'; // inverted: white field
const INK = '#000000'; // black wordmark
const MUTE = '#444444'; // dark-grey subtitle
const FRAME = '#000000'; // hairline frame

// Embed the logo SVG as a data URI so sharp renders it crisply at any size.
// The logo is a black badge — it reads cleanly on the white field as-is.
const logoSvg = readFileSync(resolve(root, 'public/hdv-logo.svg'), 'utf8');
const logoDataUri =
  'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64');

const LOGO = 300; // rendered logo box
const LOGO_X = 110;
const LOGO_Y = (H - LOGO) / 2;
const TEXT_X = LOGO_X + LOGO + 80;

// Two text lines (wordmark + subtitle), vertically centered as a block against the
// logo's middle (H/2). The wordmark baseline sits a bit above center, the subtitle
// below, so the pair is balanced.
const MID = H / 2; // 315
const WORDMARK_Y = MID + 4;   // ~319 — wordmark baseline just below the visual centre
const SUBTITLE_Y = MID + 58;  // ~373 — subtitle one line below

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <!-- subtle hairline frame, matching the app's no-shadow / hairline aesthetic -->
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none"
        stroke="${FRAME}" stroke-opacity="0.18" stroke-width="1.5"/>
  <image href="${logoDataUri}" x="${LOGO_X}" y="${LOGO_Y}" width="${LOGO}" height="${LOGO}"/>
  <g font-family="'Inter','Helvetica Neue',Arial,sans-serif">
    <text x="${TEXT_X}" y="${WORDMARK_Y}" fill="${INK}" font-size="92" font-weight="700"
          letter-spacing="-2">InvaderGIS</text>
    <text x="${TEXT_X}" y="${SUBTITLE_Y}" fill="${MUTE}" font-size="34" font-weight="500"
          letter-spacing="1">Historical Data Visualizer</text>
  </g>
</svg>`;

const out = resolve(root, 'public/og-banner.png');
await sharp(Buffer.from(banner)).png().toFile(out);
console.log(`[og-banner] wrote ${out} (${W}x${H})`);
