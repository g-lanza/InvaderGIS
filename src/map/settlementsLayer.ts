/**
 * settlementsLayer.ts — historical settlements layer for InvaderGIS.
 *
 * Loads /data/layers/settlements.geojson (4,077 Point features baked from real
 * donor data). Renders each settlement as a small dot, size/opacity scaled by
 * the real `importance` field (megacity > city > town) via a data-driven
 * MapLibre match expression. Kept visually cheap (small radii, moderate opacity)
 * so 4,077 simultaneous dots do not overwhelm the polity fill or capitals layer.
 * Time-scoped by start_year / end_year.
 *
 * ── Module contract (mirrors journeysLayer.ts / eventsLayer.ts) ─────────────
 *
 *   SETTLEMENTS_SOURCE_ID, SETTLEMENTS_LAYER_ID — exported constants
 *   fetchSettlementsGeojson()             — non-crashing fetch, null on failure
 *   addSettlementsLayer(map, geojson, theme, year, visible)
 *   setSettlementsTimeFilter(map, year)
 *   setSettlementsColors(map, theme)
 *   setSettlementsVisibility(map, visible)
 *   setSettlementsOpacity(map, opacity)
 *
 * ── Importance-driven sizing ─────────────────────────────────────────────────
 *
 * The `importance` field is a real property from the baked GeoJSON (values:
 * 'megacity' | 'city' | 'town' | null/other). A MapLibre 'match' expression
 * drives circle-radius and circle-opacity per tier — no fabricated data.
 * Unknown / null importance values fall through to the smallest tier so no
 * feature is silently excluded.
 *
 * ── Color ────────────────────────────────────────────────────────────────────
 *
 * Settlements are rendered in a neutral warm-grey (#7a6a5a) — distinct from
 * capitals (amber-gold) and military sites (dark red) without introducing a
 * fabricated or non-vocabulary hue. Lightened in dark theme via domainColor().
 *
 * ── Z-order ──────────────────────────────────────────────────────────────────
 *
 * Settlements are added BEFORE capitals so the dot mass sits beneath the more
 * significant capital markers. useMapLifecycle wires them in this order.
 *
 * ── Time-scoping ─────────────────────────────────────────────────────────────
 *
 * A settlement is visible while start_year <= year <= end_year. Null start_year
 * coalesces to 500; null end_year coalesces to 1500 (open-ended = always shown).
 *
 * ── Wave 4A — Zoom-stepped declutter ─────────────────────────────────────────
 *
 * Real importance distribution in settlements.geojson:
 *   megacity: 16   capital: 43   city: 4002   town: 16
 *
 * The gate tiers on actual field values (no fabricated tiers):
 *   zoom ≤ 3  → megacity + capital only        (~59 features, ~1.4% of total)
 *   zoom 4    → + city tier                    (~4,061 features, ~99.6%)
 *   zoom ≥ 5  → all tiers (town ~16 unlocks)   (4,077, full set)
 *
 * Implementation: a MapLibre composite 'all' filter merges the time condition
 * with a zoom-stepped importance gate via the ['step', ['zoom'], ...] expression.
 * No data is dropped; the filter is purely display-deferred. Settlements at every
 * tier reappear as the user zooms in, preserving the "honest empty state" law.
 *
 * Rendered-feature estimates (at peak year ~1000 CE, all settlements on):
 *   zoom ≤ 3  : ~59 (megacity + capital only) — major saving vs 4,077 baseline
 *   zoom 4    : ~4,061 (megacity + capital + city; town deferred)
 *   zoom ≥ 5  : all 4,077 time-alive settlements
 */

import { domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';
import { POP_RADIUS_DELTA, popStrokeWidth } from './featureStatePop';

export const SETTLEMENTS_SOURCE_ID = 'settlements-source';
export const SETTLEMENTS_LAYER_ID  = 'settlements-circle';

const SETTLEMENTS_URL = assetUrl('/data/layers/settlements.geojson');

/**
 * Neutral warm-grey for settlements. Distinguishable from capitals (amber),
 * military (red), and trade routes (orange-brown) without inventing a hue.
 */
const SETTLEMENTS_BASE_COLOR = '#7a6a5a';

// ── Dataset year bounds ───────────────────────────────────────────────────────
const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Importance tiers present in the baked settlements data. */
export type SettlementImportance = 'megacity' | 'city' | 'town';

/** Properties stamped on every baked settlement feature. */
export interface SettlementFeatureProperties {
  /** Unique feature id. */
  id: string;
  /** Human-readable settlement name. */
  name: string;
  /** Always 'settlement' for this layer. */
  kind: 'settlement';
  /** First year this settlement existed in the record, or null. */
  start_year: number | null;
  /** Last year, or null if open-ended. */
  end_year: number | null;
  /** Settlement tier: megacity | city | town (or null for unknown). */
  importance: SettlementImportance | null;
}

/** A single baked settlement Point feature. */
export interface SettlementFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SettlementFeatureProperties;
}

/** The baked settlements FeatureCollection. */
export interface SettlementFeatureCollection {
  type: 'FeatureCollection';
  features: SettlementFeature[];
}

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Zoom-stepped importance gate used in the composite filter.
 *
 * The real importance distribution in settlements.geojson is:
 *   megacity: 16   capital: 43   city: 4002   town: 16
 *
 * Gate tiers (using real field values — no fabricated tiers):
 *   zoom ≤ 3  → megacity + capital only         (~59 features, ~1.4%)
 *   zoom 4    → + city tier                    (~4,061 features, ~99.6%)
 *   zoom ≥ 5  → all tiers (town unlocks)        (4,077, full set)
 *
 * Uses a 'step' expression on ['zoom'] so evaluation is entirely in the GL
 * paint thread — no JS per-feature cost.
 *
 * @returns A MapLibre expression that is truthy only for features that pass the
 *          zoom-appropriate importance gate.
 */
function buildSettlementsImportanceGate(): unknown[] {
  return [
    'step', ['zoom'],
    // zoom < 4: only megacity and capital tiers (~59 features)
    ['match', ['get', 'importance'], ['megacity', 'capital'], true, false],
    // zoom 4: city tier unlocks (adds ~4002 city settlements)
    4, ['match', ['get', 'importance'], ['megacity', 'capital', 'city'], true, false],
    // zoom 5+: all features pass (town tier ~16 features unlocks)
    5, true,
  ];
}

/**
 * Build a MapLibre filter expression that shows settlements active at `year`,
 * combined with the zoom-stepped importance declutter gate.
 *
 * A settlement is active when start_year <= year <= end_year.
 * At zoom ≤ 4 only megacity/city importance tiers are shown; at zoom ≥ 5 all
 * tiers render (honest deferred draw — no data dropped).
 *
 * @param year The current scrubber year.
 * @returns A MapLibre filter expression array.
 */
export function buildSettlementsTimeFilter(year: number): unknown[] {
  return [
    'all',
    ['<=', ['coalesce', ['get', 'start_year'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'end_year'],   DATASET_END],   year],
    buildSettlementsImportanceGate(),
  ];
}

// ── Importance expressions ────────────────────────────────────────────────────

/**
 * Data-driven circle-radius expression keyed on the real `importance` field.
 * Megacities are largest, towns smallest; unknown importance uses town size.
 * Each tier's base is scaled by an interpolate-zoom expression so radii stay
 * readable across the full zoom range.
 *
 * Implemented as a flat match expression — cheap GPU paint, no JS per-feature.
 *
 * @returns A MapLibre expression array.
 */
export function buildSettlementsRadiusExpression(): unknown[] {
  // match: importance → radius at this zoom.
  // The outer interpolate-zoom wraps the whole match so the radius scales cleanly.
  // Each stop output adds POP_RADIUS_DELTA (0 at rest) so the marker grows on
  // hover/select — the zoom interpolate stays top-level (MapLibre requirement).
  const stop = (m: unknown): unknown => ['+', m, POP_RADIUS_DELTA];
  return [
    'interpolate', ['linear'], ['zoom'],
    2,  stop(['match', ['get', 'importance'], 'megacity', 5.0, 'city', 3.5, 'town', 2.5, 2.5]),
    5,  stop(['match', ['get', 'importance'], 'megacity', 7.5, 'city', 5.5, 'town', 3.5, 3.5]),
    8,  stop(['match', ['get', 'importance'], 'megacity', 11,  'city', 7.5, 'town', 5.0, 5.0]),
    12, stop(['match', ['get', 'importance'], 'megacity', 15,  'city', 10,  'town', 7.0, 7.0]),
  ];
}

/**
 * Data-driven circle-opacity expression keyed on the real `importance` field.
 * Megacities are fully opaque; towns are more transparent to reduce visual mass.
 *
 * @returns A MapLibre expression array.
 */
export function buildSettlementsOpacityExpression(): unknown[] {
  return ['match', ['get', 'importance'], 'megacity', 0.92, 'city', 0.80, 'town', 0.65, 0.65];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the settlements GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning so the developer knows the layer is absent — no silent swallow.
 */
export async function fetchSettlementsGeojson(): Promise<SettlementFeatureCollection | null> {
  try {
    const res = await fetch(SETTLEMENTS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${SETTLEMENTS_URL}`);
    }
    return (await res.json()) as SettlementFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[settlementsLayer] Failed to load settlements.geojson — settlements layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the settlements GeoJSON source + GL circle layer to a live MapLibre map.
 *
 * Uses a single cheap circle layer (no symbol / stroke — 4,077 points keep
 * paint cost low). Radius and opacity are data-driven on the real `importance`
 * field so the dot density communicates settlement hierarchy without clutter.
 *
 * Must be called only after the map style has loaded. Safe to call multiple times.
 *
 * @param map     The live MapLibre Map instance.
 * @param geojson The loaded SettlementFeatureCollection.
 * @param theme   The active theme id for color computation.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addSettlementsLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: SettlementFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(SETTLEMENTS_SOURCE_ID)) return;

  map.addSource(SETTLEMENTS_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
    // cluster: false is the default — each feature renders individually so the
    // importance-driven expression can size them correctly.
  });

  const color          = domainColor(SETTLEMENTS_BASE_COLOR, theme);
  const timeFilter     = buildSettlementsTimeFilter(year);
  const radiusExpr     = buildSettlementsRadiusExpression();
  const opacityExpr    = buildSettlementsOpacityExpression();
  const visibility     = visible ? 'visible' : 'none';

  map.addLayer({
    id: SETTLEMENTS_LAYER_ID,
    type: 'circle',
    source: SETTLEMENTS_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': color,
      // radiusExpr already bakes the hover/select pop into each zoom stop.
      'circle-radius': radiusExpr,
      'circle-opacity': opacityExpr,
      'circle-stroke-width': popStrokeWidth(1),
      'circle-stroke-color': 'rgba(255, 255, 255, 0.5)',
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on the settlements layer (called on year change).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSettlementsTimeFilter(map: any, year: number): void {
  // layerExists (not layerReady): filters must update during scrub even while a heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, SETTLEMENTS_LAYER_ID)) {
    map.setFilter(SETTLEMENTS_LAYER_ID, buildSettlementsTimeFilter(year));
  }
}

/**
 * Update the settlements circle color when the theme changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSettlementsColors(map: any, theme: string): void {
  if (layerReady(map, SETTLEMENTS_LAYER_ID)) {
    map.setPaintProperty(SETTLEMENTS_LAYER_ID, 'circle-color', domainColor(SETTLEMENTS_BASE_COLOR, theme));
  }
}

/**
 * Show or hide the settlements layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSettlementsVisibility(map: any, visible: boolean): void {
  // layerExists (not layerReady): visibility must apply even while a heavy source
  // keeps isStyleLoaded() false, else the layer toggles on then disappears.
  // See mapGuards.layerExists.
  if (layerExists(map, SETTLEMENTS_LAYER_ID)) {
    map.setLayoutProperty(SETTLEMENTS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Set the opacity of the settlements layer (called when layersStore opacity changes).
 * Multiplies the layersStore opacity against the data-driven importance opacity so
 * the per-tier hierarchy is preserved even at reduced overall opacity.
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1 from layersStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSettlementsOpacity(map: any, opacity: number): void {
  if (layerReady(map, SETTLEMENTS_LAYER_ID)) {
    const clamped = Math.max(0, Math.min(1, opacity));
    // Scale the importance-driven expression by the global opacity.
    const scaledOpacityExpr = ['*', clamped, buildSettlementsOpacityExpression()];
    map.setPaintProperty(SETTLEMENTS_LAYER_ID, 'circle-opacity', scaledOpacityExpr);
  }
}
