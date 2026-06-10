/**
 * hatchPatterns.ts — per-region 45° diagonal hatch tiles for MapLibre fill-pattern.
 *
 * Generates one 64×64 ImageData per region, registered via map.addImage() BEFORE
 * styleLoaded flips. Each tile has:
 *   - a solid tinted backdrop at 18% alpha (region hue on transparent)
 *   - diagonal hairlines every 6px at 45°, 0.8px lineWidth, 55% alpha
 *
 * The pattern names are "hatch-{region}" and are referenced by the polity
 * fill-pattern data-driven expression built in buildHatchFillExpression().
 *
 * Recipe is faithful to DESIGN.md §4.3 REVIVE item 1 and the quarry reference
 * (medieval-systems/src/map/hatchPatterns.ts). Rebuilt fresh — colors come from
 * our own REGION_COLORS + domainColor() chain, not the quarry's getRegionColor().
 *
 * Per-entity hue jitter is applied at hatch-registration time via entityHueJitter()
 * so individual polities within a region read as subtly distinct shades (REVIVE #3,
 * §4.3: ±18° hue, ±10% lightness). The jitter key is the polity feature id;
 * the base region color shifts slightly but stays clearly in the same region family.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   // At map boot (before styleLoaded):
 *   await registerHatchPatterns(map);
 *
 *   // In layer paint:
 *   'fill-pattern': buildHatchFillExpression()
 *
 * ── Design laws ───────────────────────────────────────────────────────────────
 *   - Parchment only inside .msa-map — these tiles only appear as polity fills.
 *   - No hardcoded hex — all colors flow through REGION_COLORS + domainColor().
 *   - All 4 themes: caller passes the active theme; dark theme lightens via domainColor.
 */

import { REGION_COLORS } from '@/design/tokens';
import { domainColor } from '@/design/tokens';

// ── Tile geometry constants (§4.3: 64×64, 45°) ────────────────────────────────
// Wave 4D density tune: STRIPE_GAP tightened 6px → 4px, stripe alpha 0.55 → 0.70
// so the hatch reads clearly over the solid 18% region-tint backdrop.

const TILE_SIZE   = 64;
const STRIPE_GAP  = 4;   // was 6 — denser lines for better hatch readability
const PIXEL_RATIO = 1;

// ── The 18 regions present in polities.geojson ────────────────────────────────
// Derived from regionExpression.ts. Using a typed const array so TypeScript can
// verify all keys are present in REGION_COLORS without a cast.

export const POLITY_REGIONS = [
  'british_isles',
  'byzantine_world',
  'caucasus',
  'central_asia',
  'central_europe',
  'east_asia',
  'eastern_europe',
  'horn_of_africa',
  'iberia',
  'italy',
  'near_east',
  'north_africa',
  'northern_europe',
  'south_asia',
  'southeast_asia',
  'southeastern_europe',
  'west_africa',
  'western_europe',
] as const;

export type PolityRegion = (typeof POLITY_REGIONS)[number];

// ── Hex color utilities ────────────────────────────────────────────────────────

/** Parse a 6-digit hex string to [r, g, b] in 0-255 range. */
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/** Clamp a value to [0, 255]. */
function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Apply a hue jitter to an RGB triple by rotating in HSL space.
 * Returns a new hex string. Used for per-entity color variation (REVIVE #3).
 *
 * @param r,g,b  Source RGB (0-255)
 * @param hDelta Hue shift in degrees (-18..+18)
 * @param lDelta Lightness delta (-0.1..+0.1)
 */
function applyHslJitter(
  r: number,
  g: number,
  b: number,
  hDelta: number,
  lDelta: number,
): [number, number, number] {
  // RGB → HSL
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }

  // Apply deltas (hDelta is degrees → /360 fraction; clamp L to [0.05, 0.95])
  const h2 = (h + hDelta / 360 + 1) % 1;
  const l2 = Math.max(0.05, Math.min(0.95, l + lDelta));

  // HSL → RGB
  if (s === 0) {
    const v = clamp255(l2 * 255);
    return [v, v, v];
  }
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
  const p = 2 * l2 - q;
  const hue2rgb = (t: number): number => {
    const tt = (t + 1) % 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    clamp255(hue2rgb(h2 + 1 / 3) * 255),
    clamp255(hue2rgb(h2) * 255),
    clamp255(hue2rgb(h2 - 1 / 3) * 255),
  ];
}

/**
 * Derive a stable per-entity hue jitter from a string id.
 * Returns { hDelta: ±18°, lDelta: ±0.10 } deterministically from the id.
 * Same id always produces the same jitter — no randomness at runtime.
 */
function entityJitter(id: string): { hDelta: number; lDelta: number } {
  // Simple stable hash: sum char codes with prime multiplier
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  // Map to [-18, +18] hue and [-0.10, +0.10] lightness
  const hDelta = ((h % 37) - 18);          // 37 steps → -18..+18
  const lDelta = (((h >> 8) % 21) - 10) / 100; // 21 steps → -0.10..+0.10
  return { hDelta, lDelta };
}

// ── Hatch tile builder ─────────────────────────────────────────────────────────

/**
 * Build one 64×64 hatch tile for a region color (resolved hex, already theme-aware).
 * Recipe: 18% fill backdrop + 45° diagonal hairlines every 6px at 55% alpha, 0.8px.
 * Returns null only if the 2D context is unavailable (test environment).
 */
function buildHatchTile(hex: string): ImageData | null {
  const [r, g, b] = hexToRgb(hex);
  const canvas = document.createElement('canvas');
  canvas.width  = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Tinted backdrop at 18% — keeps region hue legible on parchment basemap.
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // 45° diagonal hairlines:
  // Rotate the canvas around its centre, then draw vertical lines across a
  // 2× region to guarantee full coverage when the tile wraps.
  ctx.save();
  ctx.translate(TILE_SIZE / 2, TILE_SIZE / 2);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-TILE_SIZE, -TILE_SIZE);

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.70)`;  // was 0.55 — stronger stripe
  ctx.lineWidth   = 0.8;

  for (let x = 0; x <= TILE_SIZE * 2; x += STRIPE_GAP) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TILE_SIZE * 2);
    ctx.stroke();
  }
  ctx.restore();

  return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

/**
 * Build a hatch tile for a specific polity entity, applying per-entity hue jitter
 * to the region base color. The jitter shifts hue ±18° and lightness ±10% in a
 * stable, deterministic way from the entity id (REVIVE §4.3 #3).
 *
 * Returns null if the 2D context is unavailable.
 */
function buildEntityHatchTile(baseHex: string, entityId: string): ImageData | null {
  const [r, g, b] = hexToRgb(baseHex);
  const { hDelta, lDelta } = entityJitter(entityId);
  const [jr, jg, jb] = applyHslJitter(r, g, b, hDelta, lDelta);
  const jitteredHex = `#${jr.toString(16).padStart(2, '0')}${jg.toString(16).padStart(2, '0')}${jb.toString(16).padStart(2, '0')}`;
  return buildHatchTile(jitteredHex);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Register one 64×64 hatch tile per polity region into the live MapLibre map.
 * Images are named "hatch-{region}" and referenced by the fill-pattern expression.
 *
 * Must be called BEFORE the map 'load' event fires (i.e. before styleLoaded gates
 * are crossed). Idempotent — removes and replaces any pre-existing image.
 *
 * @param map   The live MapLibre Map instance.
 * @param theme The active theme id (e.g. 'atlas', 'dark'). Dark theme lightens colors.
 */
export function registerHatchPatterns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  theme: string,
): void {
  for (const region of POLITY_REGIONS) {
    const name    = `hatch-${region}`;
    const baseHex = REGION_COLORS[region] ?? '#808080';
    const hex     = domainColor(baseHex, theme);

    if (map.hasImage(name)) map.removeImage(name);
    const data = buildHatchTile(hex);
    if (data) map.addImage(name, data, { pixelRatio: PIXEL_RATIO });
  }
}

/**
 * Register per-entity jittered hatch tiles for a set of polity features.
 * Each feature gets a tile named "hatch-entity-{id}" with its region color
 * shifted by a stable ±18° hue and ±10% lightness jitter (REVIVE §4.3 #3).
 *
 * Must be called BEFORE addLayer() for the polity fill.
 *
 * @param map      The live MapLibre Map instance.
 * @param theme    The active theme id.
 * @param features The polity features (must have properties.id + properties.region).
 */
export function registerEntityHatchTiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  theme: string,
  features: ReadonlyArray<{
    properties: { id: string; region: string };
  }>,
): void {
  for (const f of features) {
    const { id, region } = f.properties;
    const name    = `hatch-entity-${id}`;
    const baseHex = REGION_COLORS[region] ?? '#808080';
    const hex     = domainColor(baseHex, theme);

    if (map.hasImage(name)) map.removeImage(name);
    const data = buildEntityHatchTile(hex, id);
    if (data) map.addImage(name, data, { pixelRatio: PIXEL_RATIO });
  }
}

/**
 * Re-register all hatch tiles (region + entity) for a new theme.
 * Call from MapCanvas's theme effect alongside setJourneysKindColors etc.
 *
 * @param map      The live MapLibre Map instance.
 * @param theme    The new theme id.
 * @param features The polity features (needed for entity jitter tiles).
 */
export function updateHatchPatternTheme(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  theme: string,
  features: ReadonlyArray<{
    properties: { id: string; region: string };
  }>,
): void {
  registerHatchPatterns(map, theme);
  registerEntityHatchTiles(map, theme, features);
}

/**
 * Build a MapLibre data-driven 'fill-pattern' expression that maps each polity's
 * `id` property to its per-entity jitter tile name ("hatch-entity-{id}").
 *
 * Requires that registerEntityHatchTiles() has been called first for all features
 * in the source. Falls back to the region-level tile if an entity tile is absent.
 *
 * Usage in layer paint:
 *   'fill-pattern': buildEntityHatchFillExpression(features, fallback)
 */
export function buildEntityHatchFillExpression(
  features: ReadonlyArray<{
    properties: { id: string; region: string };
  }>,
  fallback: string,
): unknown[] {
  // Build a flat [id, tileName, ...] match list. MapLibre match on 'id' property.
  // Deduplicate by id: MapLibre rejects match expressions with duplicate branch
  // labels ("Branch labels must be unique"), so we keep only the first occurrence.
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (const f of features) {
    const { id } = f.properties;
    if (seen.has(id)) continue;
    seen.add(id);
    pairs.push(id, `hatch-entity-${id}`);
  }
  return ['match', ['get', 'id'], ...pairs, fallback];
}

/**
 * Build the fallback region-level hatch fill expression.
 * Used as the outer fallback in the entity match, or as a simpler alternative
 * when entity-level tiles aren't desired.
 *
 *   'fill-pattern': buildRegionHatchFillExpression(fallback)
 */
export function buildRegionHatchFillExpression(fallback: string): unknown[] {
  const pairs: string[] = [];
  for (const region of POLITY_REGIONS) {
    pairs.push(region, `hatch-${region}`);
  }
  return ['match', ['get', 'region'], ...pairs, fallback];
}
