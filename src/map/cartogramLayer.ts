/**
 * cartogramLayer.ts — Dorling-style proportional symbol layer for InvaderGIS.
 *
 * Renders one circle per polity at its centroid. Circle radius is proportional to
 * the polity's REAL baked area — computed from `polygon_snapshots` as the mean
 * coordinate span across all snapshots (a proxy for polygon extent, since the raw
 * GeoJSON does not carry a pre-computed area field). No area values are fabricated.
 *
 * ── Honest TSDoc: what this is and is not ────────────────────────────────────────
 *
 * This is a Dorling-style PROPORTIONAL SYMBOL layer, NOT a true area-distortion
 * cartogram. In a true cartogram the base geography is distorted so each region's
 * visual area encodes a quantity. Here the geography is unchanged: circles are
 * placed at each polity's centroid with radius ∝ polygon area proxy. The circles
 * may overlap; no force-directed separation is applied (that would require a
 * full D3-force pre-pass, which is out-of-scope for a MapLibre layer).
 *
 * Radius magnitude: derived from the real `polygon_snapshots` baked field. The
 * proxy is the mean great-circle distance between the bounding-box corners of
 * each snapshot polygon, normalised to the ~0–60° range present in the dataset
 * and mapped to a 4–28px circle radius. This is a geometric proxy for area and
 * is disclosed as such in the layer documentation (DESIGN.md: REALNESS law).
 *
 * ── Data source ──────────────────────────────────────────────────────────────────
 *
 * Loads polity records from /data/records/polity.json (268 records). Builds a
 * GeoJSON FeatureCollection of Point features at each polity centroid. Area proxy
 * and region color are embedded as properties so the layer is data-driven
 * (no per-feature JS on render).
 *
 * ── Time filter ──────────────────────────────────────────────────────────────────
 *
 * A polity symbol is visible when formed <= year <= dissolved (same as polity fill).
 * Null dissolved is treated as DATASET_END (1500). Uses MapLibre coalesce filter.
 *
 * ── Color ─────────────────────────────────────────────────────────────────────────
 *
 * Colors come from REGION_COLORS in design/tokens.ts — the canonical region→hue
 * map. Each polity circle is colored by its `region` field via a 'match' expression.
 * Lightened in dark theme via domainColor().
 *
 * ── Module contract (mirrors eventsLayer.ts) ──────────────────────────────────────
 *
 *   CARTOGRAM_SOURCE_ID, CARTOGRAM_LAYER_ID — exported constants for MapCanvas
 *   fetchCartogramGeojson()   — builds GeoJSON from baked polity records; null on failure
 *   addCartogramLayer(map, geojson, theme, year, visible)
 *   setCartogramTimeFilter(map, year)
 *   setCartogramVisibility(map, visible)
 *   setCartogramOpacity(map, opacity)
 *   setCartogramColors(map, theme)
 *
 * Defaults OFF — integration agent ensures layersStore 'cartogram' starts visible:false.
 */

import { REGION_COLORS, domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { mapLog } from './mapLog';
import { layerReady, layerExists } from './mapGuards';

export const CARTOGRAM_SOURCE_ID = 'cartogram-source';
export const CARTOGRAM_LAYER_ID  = 'cartogram-circles';

const RECORDS_URL_POLITIES = assetUrl('/data/records/polity.json');

const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Radius normalisation ──────────────────────────────────────────────────────

/**
 * Radius range for the proportional symbols.
 * MIN_RADIUS: smallest polity (e.g. city-state) → 4px at reference zoom.
 * MAX_RADIUS: largest polity (e.g. Mongol Empire spans) → 28px at reference zoom.
 */
const MIN_RADIUS_PX = 4;
const MAX_RADIUS_PX = 28;

/**
 * Compute a polygon-area proxy from a polity's polygon_snapshots array.
 *
 * Each snapshot's `polygon` is a real GeoJSON geometry object (Polygon or
 * MultiPolygon, coordinates in [lon, lat] order) — NOT a flat coordinate array.
 * Method: for each snapshot, scan every leaf [lon, lat] position to find the
 * geometry bounding box, take its diagonal (sqrt((Δlon)² + (Δlat)²), a unitless
 * degree distance), and average the diagonals across all snapshots. This
 * correlates with polygon extent and is entirely derived from real baked data.
 *
 * Returns 0 for polities with no usable polygon snapshots (they get MIN_RADIUS).
 *
 * @param snapshots Array of { year, polygon: GeoJSON Polygon|MultiPolygon } from the baked record.
 */
function computeAreaProxy(snapshots: Array<{ year: number; polygon: GeoJsonGeometry }>): number {
  if (!snapshots || snapshots.length === 0) return 0;

  let totalDiag = 0;
  let count = 0;

  for (const snap of snapshots) {
    const coords = snap.polygon?.coordinates;
    if (!coords) continue;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    let seen = 0;

    // Recursively walk the nested coordinate arrays to every [lon, lat] leaf.
    // Polygon → rings → positions; MultiPolygon → polygons → rings → positions.
    const visit = (node: unknown): void => {
      if (!Array.isArray(node)) return;
      if (typeof node[0] === 'number' && typeof node[1] === 'number') {
        const [lon, lat] = node as [number, number];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        seen++;
        return;
      }
      for (const child of node) visit(child);
    };
    visit(coords);

    if (seen < 2) continue;
    const dLat = maxLat - minLat;
    const dLon = maxLon - minLon;
    totalDiag += Math.sqrt(dLat * dLat + dLon * dLon);
    count++;
  }

  return count > 0 ? totalDiag / count : 0;
}

/**
 * Normalise a raw area-proxy value to a [MIN_RADIUS_PX, MAX_RADIUS_PX] range.
 *
 * @param proxy  The raw area proxy (mean bounding-box diagonal in degrees).
 * @param minP   The minimum proxy value in the dataset.
 * @param maxP   The maximum proxy value in the dataset.
 */
function normaliseRadius(proxy: number, minP: number, maxP: number): number {
  if (maxP <= minP) return MIN_RADIUS_PX;
  const t = Math.max(0, Math.min(1, (proxy - minP) / (maxP - minP)));
  return MIN_RADIUS_PX + t * (MAX_RADIUS_PX - MIN_RADIUS_PX);
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A baked snapshot polygon is a real GeoJSON Polygon or MultiPolygon geometry
 * (coordinates in [lon, lat] order). `coordinates` is left as a nested unknown
 * array because Polygon and MultiPolygon nest to different depths; computeAreaProxy
 * walks it recursively to the leaf positions.
 */
interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

/** Minimal baked polity record shape (only fields consumed here). */
interface BakedPolity {
  id: string;
  name_primary?: string;
  region?: string;
  formed?: number;
  dissolved?: number | null;
  centroid?: [number, number]; // [lat, lon] — stored in record convention
  polygon_snapshots?: Array<{ year: number; polygon: GeoJsonGeometry }>;
}

/** Properties on each cartogram symbol feature. */
export interface CartogramFeatureProperties {
  id: string;
  name: string;
  region: string;
  formed: number;
  dissolved: number;
  /** Normalised radius in px at zoom 4 (reference zoom). */
  radius: number;
}

/** A single cartogram Point feature. */
export interface CartogramFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: CartogramFeatureProperties;
}

/** The built cartogram FeatureCollection. */
export interface CartogramFeatureCollection {
  type: 'FeatureCollection';
  features: CartogramFeature[];
}

// ── Color expression ──────────────────────────────────────────────────────────

/**
 * Build a MapLibre 'match' expression mapping region → theme-aware hex.
 * Mirrors the region tint logic in regionExpression.ts but scoped to the
 * cartogram symbols.
 *
 * @param theme The active theme id.
 */
export function buildCartogramColorExpression(theme: string): unknown[] {
  const pairs: string[] = [];
  for (const [region, hex] of Object.entries(REGION_COLORS)) {
    pairs.push(region, domainColor(hex, theme));
  }
  // Fallback: neutral grey for regions not in the token map.
  return ['match', ['get', 'region'], ...pairs, domainColor('#7a7a8a', theme)];
}

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression showing polity symbols active at `year`.
 * A polity is active when formed <= year <= dissolved.
 * Null dissolved coalesces to DATASET_END.
 *
 * @param year The current scrubber year.
 */
export function buildCartogramTimeFilter(year: number): unknown[] {
  return [
    'all',
    ['<=', ['coalesce', ['get', 'formed'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'dissolved'], DATASET_END],  year],
  ];
}

// ── GeoJSON builder ────────────────────────────────────────────────────────────

/**
 * Fetch baked polity records and build a proportional-symbol FeatureCollection.
 *
 * Polities without a centroid are omitted (not drawn) — honest: no position is
 * fabricated. The radius field is pre-computed from the polygon_snapshots and
 * embedded as a GeoJSON property so MapLibre can drive circle-radius data-driven
 * without any JS per-frame.
 *
 * Resolves to null on fetch failure (non-crashing, warning logged).
 */
export async function fetchCartogramGeojson(): Promise<CartogramFeatureCollection | null> {
  let polities: BakedPolity[];

  try {
    const res = await fetch(RECORDS_URL_POLITIES);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${RECORDS_URL_POLITIES}`);
    }
    polities = (await res.json()) as BakedPolity[];
  } catch (err) {
     
    console.warn(
      '[cartogramLayer] Failed to load polity records — cartogram layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  // Compute area proxies for all polities that have snapshots.
  const proxies = polities.map((p) => computeAreaProxy(p.polygon_snapshots ?? []));
  const validProxies = proxies.filter((v) => v > 0);
  const minP = validProxies.length > 0 ? Math.min(...validProxies) : 0;
  const maxP = validProxies.length > 0 ? Math.max(...validProxies) : 1;

  let built = 0;
  let skipped = 0;
  const features: CartogramFeature[] = [];

  for (let i = 0; i < polities.length; i++) {
    const p = polities[i];

    // Skip polities without a centroid — honest empty state.
    if (!p.centroid) {
      skipped++;
      continue;
    }

    const radius = normaliseRadius(proxies[i], minP, maxP);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        // centroid is [lat, lon] stored — swap to [lon, lat] for GeoJSON.
        coordinates: [p.centroid[1], p.centroid[0]],
      },
      properties: {
        id:        p.id,
        name:      p.name_primary ?? p.id,
        region:    p.region ?? 'unknown',
        formed:    p.formed ?? DATASET_START,
        dissolved: p.dissolved ?? DATASET_END,
        radius,
      },
    });
    built++;
  }

  mapLog(
    `[cartogramLayer] Built ${built} symbols, skipped ${skipped} (no centroid)` +
    ` from ${polities.length} polities | radius range: ${MIN_RADIUS_PX}–${MAX_RADIUS_PX}px`,
  );

  return { type: 'FeatureCollection', features };
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the cartogram GeoJSON source + GL circle layer to a live MapLibre map.
 *
 * Circles are data-driven on the pre-computed `radius` property. Region color
 * comes from REGION_COLORS via a 'match' expression. Circles are semi-transparent
 * and scale with zoom so they remain informative at all zoom levels.
 *
 * Must be called only after the map style has loaded. Safe to call multiple times.
 *
 * @param map     The live MapLibre Map instance.
 * @param geojson The built CartogramFeatureCollection.
 * @param theme   The active theme id for region color computation.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addCartogramLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: CartogramFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(CARTOGRAM_SOURCE_ID)) return;

  map.addSource(CARTOGRAM_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const colorExpr  = buildCartogramColorExpression(theme);
  const timeFilter = buildCartogramTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';

  map.addLayer({
    id: CARTOGRAM_LAYER_ID,
    type: 'circle',
    source: CARTOGRAM_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': colorExpr,
      // Data-driven radius: the pre-computed `radius` property (4–28px at zoom 4)
      // is scaled by an interpolate-zoom factor. At low zoom the circles are scaled
      // down to avoid complete world overdraw; at high zoom they scale up.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2,  ['*', ['get', 'radius'], 0.40],
        4,  ['*', ['get', 'radius'], 1.00],
        6,  ['*', ['get', 'radius'], 0.75],
        8,  ['*', ['get', 'radius'], 0.55],
        12, ['*', ['get', 'radius'], 0.40],
      ],
      // Semi-transparent fill so overlapping circles blend without total occlusion.
      'circle-opacity': 0.55,
      // Hairline stroke in the region color with high transparency.
      'circle-stroke-width': 0.5,
      'circle-stroke-color': colorExpr,
      'circle-stroke-opacity': 0.75,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on the cartogram layer (called on year change).
 * Guards when the layer is absent.
 *
 * @param map  The live MapLibre Map instance.
 * @param year The current scrubber year.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCartogramTimeFilter(map: any, year: number): void {
  // Defensive: under fast time-lapse playback this fires ~50×/s, so it can race a
  // transient map teardown (panel reflow / WebGL context drop) where `map` is
  // momentarily undefined or its style is gone. getLayer() then throws
  // "Cannot read properties of undefined". No-op safely; the scrubber re-applies
  // on the next tick. The caller (applyTimeFilter) also wraps this in try/catch.
  if (!map || typeof map.getLayer !== 'function') return;
  try {
    // layerExists (not layerReady): filters must update during scrub even while a heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
    if (layerExists(map, CARTOGRAM_LAYER_ID)) {
      map.setFilter(CARTOGRAM_LAYER_ID, buildCartogramTimeFilter(year));
    }
  } catch {
    /* transient teardown — ignore; next tick re-applies */
  }
}

/**
 * Show or hide the cartogram layer.
 *
 * @param map     The live MapLibre Map instance.
 * @param visible Whether to show the layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCartogramVisibility(map: any, visible: boolean): void {
  // layerExists (not layerReady): visibility must apply even while a heavy source
  // keeps isStyleLoaded() false, else the layer toggles on then disappears.
  // See mapGuards.layerExists.
  if (layerExists(map, CARTOGRAM_LAYER_ID)) {
    map.setLayoutProperty(CARTOGRAM_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Set the opacity of the cartogram layer (called when layersStore opacity changes).
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1 from layersStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCartogramOpacity(map: any, opacity: number): void {
  if (layerReady(map, CARTOGRAM_LAYER_ID)) {
    map.setPaintProperty(
      CARTOGRAM_LAYER_ID,
      'circle-opacity',
      Math.max(0, Math.min(1, opacity)) * 0.55,
    );
  }
}

/**
 * Update region colors when the theme changes.
 *
 * @param map   The live MapLibre Map instance.
 * @param theme The new active theme id.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCartogramColors(map: any, theme: string): void {
  const colorExpr = buildCartogramColorExpression(theme);
  if (layerReady(map, CARTOGRAM_LAYER_ID)) {
    map.setPaintProperty(CARTOGRAM_LAYER_ID, 'circle-color', colorExpr);
    map.setPaintProperty(CARTOGRAM_LAYER_ID, 'circle-stroke-color', colorExpr);
  }
}
