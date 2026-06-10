/**
 * capitalTowerIcon.ts — register the parchment tower-silhouette capital marker
 * as a MapLibre raster image.
 *
 * Draws an offscreen-canvas ~11px (CSS) tower marker using the "fortress" mark
 * geometry (three crenellations + doorway arch) from our src/design/glyphs.tsx.
 * The tile is a cream/parchment square with a hairline ink border + the dark
 * tower silhouette inside. Registered with map.addImage() before the capitals
 * layer is added so the symbol layer has no missing-image warning.
 *
 * ── Image spec ────────────────────────────────────────────────────────────────
 *
 *   Canvas:        32×32 px at pixelRatio 2 → 16 CSS px × 16 CSS px
 *   icon-size:     0.7 → ~11 CSS px on-screen (legible at zoom ≥5)
 *   Name:          CAPITAL_TOWER_IMAGE_ID = "capital-tower"
 *
 * ── Design laws ───────────────────────────────────────────────────────────────
 *   - Square frame (--radius:0 law): the tile is a plain rectangle with a
 *     0.5px hairline border, no rounded corners, no shadow.
 *   - Cream fill (#fff7d6) — the one sanctioned parchment inside map context.
 *   - Tower stroke: ink (#0d0907) at 1.6 px canvas-space (= 0.8 CSS px).
 *   - No hardcoded colors beyond these two sanctioned values.
 *   - No italics. No drop-shadow.
 *   - Replaces the existing plain circle used by capitalsLayer.ts for the
 *     capitals-symbol layer that is added alongside it.
 *
 * ── Caller contract ───────────────────────────────────────────────────────────
 *
 *   registerCapitalTowerIcon(map);  // synchronous — no async needed
 *
 *   Then reference in a symbol layer:
 *     'icon-image': CAPITAL_TOWER_IMAGE_ID
 *     'icon-size':  0.7
 *     'icon-allow-overlap': true
 */

/** Canvas stride in pixels (logical). At pixelRatio 2 → 64×64 physical. */
const SIZE = 32;

/** Rendering scale factor (retina). */
const PIXEL_RATIO = 2;

/** Ink color for tower outlines + frame border. */
const INK = '#0d0907';

/** Cream fill for the tile background — the ONE sanctioned parchment in-map. */
const CREAM = '#fff7d6';

/** The MapLibre image id referenced by the capitals symbol layer. */
export const CAPITAL_TOWER_IMAGE_ID = 'capital-tower';

/**
 * Draw the tower silhouette into ctx.
 *
 * Uses the same 24-unit path as MarkFortress in glyphs.tsx (three crenellations
 * + doorway arch), scaled into the inner drawing area via a canvas transform.
 * Drawn fresh — not ported verbatim — so it stays in our write scope and respects
 * the square-edge law (no rounded fill).
 *
 * @param ctx    The 2D rendering context (canvas is SIZE×SIZE).
 * @param margin Pixel inset from canvas edge for the frame border.
 */
function drawTower(ctx: CanvasRenderingContext2D, margin: number): void {
  // Scale the 24-unit glyph coordinate space into the inner canvas area.
  const inner   = SIZE - margin * 2;
  const scale   = inner / 24;

  ctx.save();
  ctx.translate(margin, margin);
  ctx.scale(scale, scale);

  ctx.strokeStyle = INK;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // ── Tower body rectangle (x=5,y=10 → w=14,h=11 in 24-unit space) ──────────
  ctx.lineWidth = 1.6;
  ctx.fillStyle = 'rgba(13, 9, 7, 0.08)';
  ctx.beginPath();
  ctx.rect(5, 10, 14, 11);
  ctx.fill();
  ctx.stroke();

  // ── Left merlon (crenellation) ────────────────────────────────────────────
  ctx.beginPath();
  ctx.rect(5, 5, 3.5, 5);
  ctx.fill();
  ctx.stroke();

  // ── Centre merlon ─────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.rect(10.25, 5, 3.5, 5);
  ctx.fill();
  ctx.stroke();

  // ── Right merlon ──────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.rect(15.5, 5, 3.5, 5);
  ctx.fill();
  ctx.stroke();

  // ── Doorway arch ──────────────────────────────────────────────────────────
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(10, 21);
  ctx.lineTo(10, 16);
  ctx.quadraticCurveTo(12, 14, 14, 16);
  ctx.lineTo(14, 21);
  ctx.stroke();

  ctx.restore();
}

/**
 * Register the tower-silhouette capital marker as a MapLibre raster image.
 *
 * Synchronous — canvas drawing is synchronous in browser context.
 * Safe to call before the map 'load' event fires.
 * Idempotent — removes any pre-existing image with the same id.
 *
 * @param map The live MapLibre Map instance.
 */
export function registerCapitalTowerIcon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
): void {
  if (map.hasImage(CAPITAL_TOWER_IMAGE_ID)) {
    map.removeImage(CAPITAL_TOWER_IMAGE_ID);
  }

  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
     
    console.warn('[capitalTowerIcon] 2D canvas context unavailable — tower icon skipped.');
    return;
  }

  ctx.clearRect(0, 0, SIZE, SIZE);

  // ── Cream tile background ─────────────────────────────────────────────────
  const margin = 2;
  ctx.fillStyle = CREAM;
  ctx.fillRect(margin, margin, SIZE - margin * 2, SIZE - margin * 2);

  // ── Hairline frame border (square-edge law: no borderRadius) ─────────────
  ctx.strokeStyle = INK;
  ctx.lineWidth   = 0.5;  // 0.5px → hairline at pixelRatio 2
  ctx.strokeRect(margin + 0.25, margin + 0.25, SIZE - margin * 2 - 0.5, SIZE - margin * 2 - 0.5);

  // ── Tower silhouette ──────────────────────────────────────────────────────
  drawTower(ctx, margin + 2);

  const data = ctx.getImageData(0, 0, SIZE, SIZE);
  map.addImage(CAPITAL_TOWER_IMAGE_ID, data, { pixelRatio: PIXEL_RATIO });
}
