/**
 * eventIcons.ts — rasterize the 9 event-category glyphs from our own
 * src/design/glyphs.tsx into MapLibre-registered images.
 *
 * Each category gets a GOOGLE-PIN style icon: the entire teardrop body
 * (head + tapering tail) is FILLED with the category color, with a small
 * white inner disc on the head carrying the white category glyph. The pin's
 * POINT is the geographic anchor — MapLibre renders with icon-anchor:'bottom'
 * so the point sits exactly on the event's coordinates (Google-Maps-pin behavior).
 *
 * Color-flooded body is the key legibility change: even a 9×12 CSS px pin at
 * low zoom reads its category color clearly — the previous cream body with a
 * hairline ring was invisible against the parchment map at zoom ≤ 4.
 *
 * ── Registration contract ─────────────────────────────────────────────────────
 *
 *   Image names:       "evt-stud-{categoryId}"  (e.g. "evt-stud-violence")
 *   Fallback name:     "evt-stud-fallback"
 *   Canvas size:       32×42 logical px at pixelRatio 2 → 16×21 CSS px
 *   Pixel ratio:       2 (retina-quality at common map zoom levels)
 *
 * ALL images are registered via map.addImage() BEFORE the events layer is added
 * so there are zero missing-image console warnings.
 *
 * ── Rasterization pipeline ────────────────────────────────────────────────────
 *
 *   GlyphPath React element
 *     → renderToStaticMarkup()
 *     → SVG string (24-unit viewBox, WHITE stroke for legibility on colored body)
 *     → Blob URL → HTMLImageElement.onload → offscreen Canvas
 *     → ImageData → map.addImage()
 *
 * The pin body is drawn first in Canvas, then the SVG glyph is composited
 * into the head. renderToStaticMarkup is used server-side style — no DOM,
 * no React render tree.
 *
 * ── Pin geometry ──────────────────────────────────────────────────────────────
 *
 *   CANVAS_W = 32, CANVAS_H = 42
 *   Head center: (CANVAS_W/2, HEAD_CY)  where HEAD_CY = HEAD_R + 2 (top margin)
 *   Head radius: HEAD_R = (CANVAS_W / 2) * HEAD_R_FRAC (≈ 13px at scale 1)
 *   Point: (CANVAS_W/2, CANVAS_H)
 *   The tail is two straight lines from the head's lower tangent points to the
 *   bottom-center point. The whole teardrop is filled with category color.
 *   A white inner disc (radius HEAD_R * WHITE_DISC_FRAC) sits on the head center
 *   to provide contrast for the white glyph mark.
 *
 * ── Design laws ───────────────────────────────────────────────────────────────
 *   - The teardrop body color = category domain color (from domainColor token).
 *   - White (#ffffff) is the glyph/inner-disc color — the ONE sanctioned use of
 *     bare white inside a pin: the mark must be legible on ANY category color.
 *   - Colors come from EVENT_CATEGORIES tokens, never hardcoded at call sites.
 *   - No any outside the map parameter (MapLibre types are dynamically loaded).
 *   - renderToStaticMarkup is the React-DOM server renderer; it is already a
 *     dependency via react-dom — no new dep added.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EVENT_CATEGORIES, SUBTYPE_TO_CATEGORY } from '@/design/tokens';
import { domainColor } from '@/design/tokens';

import { Glyph } from '@/design/glyphs';

// ── Canvas dimensions ──────────────────────────────────────────────────────────

/** Logical canvas width in px. Physical = CANVAS_W * PIXEL_RATIO. */
const CANVAS_W = 32;
/** Logical canvas height in px. Taller than wide to accommodate the pin tail. */
const CANVAS_H = 42;
/** Pixel ratio for crisp rendering. 3 keeps pins sharp at the larger icon-size
 *  steps (up to 1.3× at street zoom) without upscaling blur. */
const PIXEL_RATIO = 3;

/**
 * White inner disc color — the glyph mark and inner disc are white so the
 * mark is legible on any category-colored pin body. This is the ONE sanctioned
 * bare-white inside the pin (see module doc). Do not use this color anywhere
 * else in the codebase — all other chrome uses atlas-tokens.css variables.
 */
const WHITE = '#ffffff';

/** Head radius as fraction of half-canvas-width. */
const HEAD_R_FRAC = 0.80;

/** Head center Y offset from top of canvas (small top margin). */
const HEAD_TOP_MARGIN = 2;

// ── Pin geometry helpers ───────────────────────────────────────────────────────

/** Compute the pin geometry constants for a given canvas width/height. */
function pinGeometry(w: number, h: number) {
  const cx  = w / 2;
  const headR = (w / 2) * HEAD_R_FRAC;
  const cy  = HEAD_TOP_MARGIN + headR;          // head center Y
  const pointX = cx;
  const pointY = h;                              // bottom of canvas
  return { cx, cy, headR, pointX, pointY };
}

// ── Teardrop path drawing ──────────────────────────────────────────────────────

/**
 * Draw the Google-pin style teardrop onto a 2D canvas context.
 *
 * Shape: teardrop (full circle head + tapering tail to bottom-center point),
 * entirely filled with the category color so the pin reads its color even at
 * tiny rendered sizes (9 CSS px at zoom 3). A white inner disc on the head
 * provides the contrast surface for the white glyph mark drawn on top.
 *
 * ── Layer order (painter's algorithm) ────────────────────────────────────────
 *   1. Teardrop silhouette filled with categoryHex (solid)
 *   2. Subtle dark drop shadow via a second slightly-offset fill at low alpha
 *      (gives the pin lift without using box-shadow — DESIGN.md law)
 *   3. White inner disc on the head center (glyph contrast surface)
 *   4. Teardrop outline stroked in a darker-alpha version of categoryHex
 */
function drawPin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  categoryHex: string,
): void {
  const { cx, cy, headR, pointX, pointY } = pinGeometry(w, h);

  // ── Teardrop geometry ────────────────────────────────────────────────────────
  // A map pin = a near-full circle head with a tail tapering to the bottom point.
  // The head circle is drawn as the MAJOR arc (most of the circle); the only gap
  // is a small wedge at the BOTTOM where the two tail lines meet the point.
  //
  // The tail lines leave the head at the lower-left and lower-right tangent-ish
  // contact points, ±tailHalfAngle measured from straight-DOWN (canvas angle π/2,
  // since +y is downward). We trace: start at the lower-right contact, sweep
  // CLOCKWISE the long way around the top back to the lower-left contact, then
  // two straight lines down to the point and closePath.
  const tailHalfAngle = (38 * Math.PI) / 180; // wider base → fuller, rounder head
  const rightContact = Math.PI / 2 - tailHalfAngle; // lower-right (just right of straight down)
  const leftContact  = Math.PI / 2 + tailHalfAngle; // lower-left  (just left of straight down)

  // Reusable teardrop path tracer — caller must call ctx.beginPath() first.
  const traceTeardrop = (): void => {
    // Major arc from right contact, clockwise THROUGH THE TOP, to left contact.
    // anticlockwise=false with start>... — we go the long way by sweeping from
    // rightContact up and over to leftContact (the major arc, ~284°).
    ctx.moveTo(pointX, pointY);                              // start at the point
    ctx.lineTo(cx + headR * Math.cos(rightContact), cy + headR * Math.sin(rightContact)); // up-right to head
    ctx.arc(cx, cy, headR, rightContact, leftContact, true); // major arc CCW through the top
    ctx.lineTo(pointX, pointY);                              // back down to the point
    ctx.closePath();
  };

  // ── 1. Drop shadow (subtle lift off parchment) ───────────────────────────
  // A small downward offset + dark fill at very low alpha. No real shadow API —
  // we fake it as a second fill pass slightly shifted down and right.
  ctx.save();
  ctx.translate(0.5, 1.0); // shift shadow slightly down-right
  ctx.beginPath();
  traceTeardrop();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
  ctx.restore();

  // ── 2. Category-color teardrop body (the colored pin) ────────────────────
  ctx.beginPath();
  traceTeardrop();
  ctx.fillStyle = categoryHex;
  ctx.fill();

  // ── 3. White rim for lift off the parchment (Google-pin edge) ─────────────
  // A crisp white stroke just outside the colored body separates the pin from
  // any map color it sits on (parchment, polity fills, sea) — this is what makes
  // the reference pins "pop". No inner disc: the white GLYPH sits directly on the
  // colored body (drawn later), so the mark can fill the head and read boldly.
  ctx.beginPath();
  traceTeardrop();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth   = 1.6;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Inner hairline in a darkened category edge for definition under the white rim.
  ctx.beginPath();
  traceTeardrop();
  ctx.strokeStyle = 'rgba(0,0,0,0.20)';
  ctx.lineWidth   = 0.6;
  ctx.stroke();
}

// ── Stud rasterizer ───────────────────────────────────────────────────────────

/**
 * Rasterize one category pin to ImageData.
 *
 * The pin is (painter's order):
 *   1. Drop shadow (subtle dark offset fill for map lift)
 *   2. Category-color teardrop body (the Google-pin body color)
 *   3. Thin outline at categoryHex + 60% alpha
 *   4. White inner disc on the head center (glyph contrast surface)
 *   5. White glyph mark at ~54% of the white disc diameter, centered on the head
 *
 * The glyph is drawn in WHITE (#ffffff) — legible against any category color.
 * Returns a Promise because the SVG→Image pipeline is async (Image.onload).
 * Falls back to a category-colored pin with a white center dot if SVG fails.
 */
function rasterizeStudIcon(
  categoryHex: string,
  glyphName: string,
): Promise<ImageData> {
  return new Promise((resolve) => {
    const { cx, cy, headR } = pinGeometry(CANVAS_W, CANVAS_H);
    // White glyph sits DIRECTLY on the colored head (no inner disc), so it can
    // fill the head like the reference pins. Size ≈ 82% of the head DIAMETER —
    // bold and legible even at the small rendered sizes used at low zoom.
    const glyphSize = Math.round(headR * 2 * 0.82);

    // ── Step 1: Render glyph to SVG string — WHITE stroke on colored pin ─────
    let svgString: string;
    try {
      const svgEl = createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: glyphSize,
          height: glyphSize,
          viewBox: '0 0 24 24',
          shapeRendering: 'geometricPrecision',
          color: WHITE,
        },
        createElement(
          'g',
          {
            stroke: WHITE,
            strokeWidth: 2.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            fill: 'none',
          },
          createElement(Glyph, { name: glyphName, size: 24 }),
        ),
      );
      svgString = renderToStaticMarkup(svgEl);
    } catch {
      resolve(fallbackStudDot(categoryHex));
      return;
    }

    // ── Step 2: Blob URL → HTMLImageElement ───────────────────────────────────
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      // ── Step 3: Draw pin + glyph onto offscreen canvas at full physical res ──
      // Canvas is PIXEL_RATIO× the logical size and the context is scaled, so all
      // geometry below uses logical units while the output stays crisp at the
      // larger icon-size steps. addImage() is told the same pixelRatio so MapLibre
      // maps physical→CSS px 1:1.
      const canvas = document.createElement('canvas');
      canvas.width  = CANVAS_W * PIXEL_RATIO;
      canvas.height = CANVAS_H * PIXEL_RATIO;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(fallbackStudDot(categoryHex));
        return;
      }
      ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw: shadow + colored teardrop body + white rim (logical units)
      drawPin(ctx, CANVAS_W, CANVAS_H, categoryHex);

      // White glyph — centered on the HEAD center (cx, cy), drawn directly on body
      const glyphX = Math.round(cx - glyphSize / 2);
      const glyphY = Math.round(cy - glyphSize / 2);
      ctx.drawImage(img, glyphX, glyphY, glyphSize, glyphSize);

      resolve(ctx.getImageData(0, 0, CANVAS_W * PIXEL_RATIO, CANVAS_H * PIXEL_RATIO));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(fallbackStudDot(categoryHex));
    };

    img.src = url;
  });
}

/**
 * Fallback pin: category-color teardrop body + white inner disc + white center
 * dot (no glyph). Used when SVG rasterization fails (very rare — CSP blob block).
 * Shape matches the full rasterizeStudIcon pin so fallbacks are visually consistent.
 * Even without a glyph, the colored body clearly conveys the category at any zoom.
 */
function fallbackStudDot(categoryHex: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  // Non-null assertion safe: always called in browser context.
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw: shadow + category-color teardrop body + outline + white inner disc
  drawPin(ctx, CANVAS_W, CANVAS_H, categoryHex);

  // Centre dot on the white disc — a small white filled circle + darker center
  // ring to give the "no glyph" variant a visible placeholder mark.
  const { cx, cy } = pinGeometry(CANVAS_W, CANVAS_H);
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = categoryHex;
  ctx.fill();

  return ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Image name prefix for stud icons. */
export const EVT_STUD_PREFIX = 'evt-stud-';

/** Fallback image name for uncategorised events. */
export const EVT_STUD_FALLBACK = 'evt-stud-fallback';

/**
 * Register all 9 category pin icons + a fallback into the live MapLibre map.
 *
 * MUST be called and awaited BEFORE addEventsLayer() — MapLibre needs the images
 * registered before the symbol layer renders to avoid missing-image warnings.
 *
 * @param map   The live MapLibre Map instance.
 * @param theme The active theme id; category colors are lightened for dark theme.
 */
export async function registerEventIcons(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  theme: string,
): Promise<void> {
  await Promise.all(
    EVENT_CATEGORIES.map(async (cat) => {
      const name     = `${EVT_STUD_PREFIX}${cat.id}`;
      const colorHex = domainColor(cat.color, theme);

      if (map.hasImage(name)) map.removeImage(name);

      const data = await rasterizeStudIcon(colorHex, cat.glyph);
      map.addImage(name, data, { pixelRatio: PIXEL_RATIO });
    }),
  );

  // Fallback pin: neutral ink, no glyph.
  const fbName = EVT_STUD_FALLBACK;
  if (map.hasImage(fbName)) map.removeImage(fbName);
  map.addImage(fbName, fallbackStudDot('#4a4a52'), { pixelRatio: PIXEL_RATIO });
}

/**
 * Re-register all pin icons for a new theme (call from MapCanvas theme effect).
 * Mirrors registerEventIcons but does not await — the map will swap icons
 * asynchronously. The existing icons remain visible until the new ones land.
 *
 * @param map   The live MapLibre Map instance.
 * @param theme The new active theme id.
 */
export function updateEventIconTheme(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  theme: string,
): void {
  registerEventIcons(map, theme).catch((err: unknown) => {
    console.warn('[eventIcons] Theme update failed:', err instanceof Error ? err.message : String(err));
  });
}

/**
 * Build a MapLibre 'match' expression mapping raw event type strings to pin icon names.
 *
 * The mapping goes: raw event type → category id (via SUBTYPE_TO_CATEGORY) → icon name.
 * Covers all 33 known event types; falls back to EVT_STUD_FALLBACK for unknowns.
 *
 * @returns A MapLibre expression array usable as 'icon-image' in a symbol layer.
 */
export function buildEventStudIconExpression(): unknown[] {
  const pairs: string[] = [];
  for (const [subtype, categoryId] of Object.entries(SUBTYPE_TO_CATEGORY)) {
    pairs.push(subtype, `${EVT_STUD_PREFIX}${categoryId}`);
  }
  return ['match', ['get', 'type'], ...pairs, EVT_STUD_FALLBACK];
}

/**
 * Build a MapLibre 'match' expression mapping category id directly to pin icon name.
 * Useful for the events layer that has a 'category' property instead of 'type'.
 *
 * @returns A MapLibre expression array usable as 'icon-image' in a symbol layer.
 */
export function buildCategoryStudIconExpression(): unknown[] {
  const pairs: string[] = [];
  for (const cat of EVENT_CATEGORIES) {
    pairs.push(cat.id, `${EVT_STUD_PREFIX}${cat.id}`);
  }
  return ['match', ['get', 'category'], ...pairs, EVT_STUD_FALLBACK];
}
