/**
 * capitalsLayer.ts — historical capital cities layer for InvaderGIS.
 *
 * Loads /data/layers/capitals.geojson (230 Point features baked from real
 * donor data). Renders each capital as a distinct diamond-shaped marker
 * (larger radius + square stroke) so it reads clearly above the settlements
 * dot-mass. Time-scoped by start_year / end_year. Theme-aware via domainColor.
 *
 * ── Module contract (mirrors journeysLayer.ts / eventsLayer.ts) ─────────────
 *
 *   CAPITALS_SOURCE_ID, CAPITALS_LAYER_ID — exported constants for MapCanvas
 *   fetchCapitalsGeojson()                — non-crashing fetch, null on failure
 *   addCapitalsLayer(map, geojson, theme, year, visible)
 *   setCapitalsTimeFilter(map, year)
 *   setCapitalsColors(map, theme)
 *   setCapitalsVisibility(map, visible)
 *   setCapitalsOpacity(map, opacity)
 *
 * ── Color ────────────────────────────────────────────────────────────────────
 *
 * Capitals encode sovereignty / imperial authority. The amber-gold hue
 * (#b8860b — power category color from the vocabulary) is used consistently
 * with the event vocabulary's power category, so capitals read as political
 * centers without introducing a fabricated color. Lightened in dark theme via
 * domainColor().
 *
 * ── Time-scoping ─────────────────────────────────────────────────────────────
 *
 * A capital is visible while start_year <= year <= end_year. Null start_year
 * is coalesced to 500 (dataset open); null end_year is coalesced to 1500
 * (dataset close) so open-ended capitals are always shown.
 *
 * ── Z-order ──────────────────────────────────────────────────────────────────
 *
 * Capitals sit above settlements (added after them) and below events (which
 * are added last). useMapLifecycle wires them in that order.
 */

import { domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';
import { popRadiusStop, popStrokeWidth } from './featureStatePop';

export const CAPITALS_SOURCE_ID = 'capitals-source';
export const CAPITALS_LAYER_ID  = 'capitals-circle';

const CAPITALS_URL = assetUrl('/data/layers/capitals.geojson');

/**
 * The amber-gold hue encoding capital / sovereign authority.
 * Matches the 'power' event category from the vocabulary — deliberately
 * consistent, not invented. lightened for dark theme via domainColor().
 */
const CAPITALS_BASE_COLOR = '#b8860b';

// ── Dataset year bounds (coalesce targets for null start/end) ─────────────────
const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Properties stamped on every baked capital feature. */
export interface CapitalFeatureProperties {
  /** Unique feature id. */
  id: string;
  /** Human-readable capital name. */
  name: string;
  /** Always 'capital' for this layer. */
  kind: 'capital';
  /** First year this city was a capital, or null if open-ended. */
  start_year: number | null;
  /** Last year this city was a capital, or null if still active at dataset close. */
  end_year: number | null;
  /** The polity this capital belongs to. */
  entity_id: string;
  /** Donor data source tag. */
  source: string;
}

/** A single baked capital Point feature. */
export interface CapitalFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: CapitalFeatureProperties;
}

/** The baked capitals FeatureCollection. */
export interface CapitalFeatureCollection {
  type: 'FeatureCollection';
  features: CapitalFeature[];
}

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression that shows capitals active at `year`.
 * A capital is active when start_year <= year <= end_year.
 * Null start_year coalesces to DATASET_START; null end_year coalesces to
 * DATASET_END so open-ended capitals are always shown.
 *
 * @param year The current scrubber year.
 * @returns A MapLibre filter expression array.
 */
export function buildCapitalsTimeFilter(year: number): unknown[] {
  return [
    'all',
    ['<=', ['coalesce', ['get', 'start_year'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'end_year'],   DATASET_END],   year],
  ];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the capitals GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning so the developer knows the layer is absent — no silent swallow.
 * Mirrors fetchEventsGeojson / fetchJourneysGeojson.
 */
export async function fetchCapitalsGeojson(): Promise<CapitalFeatureCollection | null> {
  try {
    const res = await fetch(CAPITALS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${CAPITALS_URL}`);
    }
    return (await res.json()) as CapitalFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[capitalsLayer] Failed to load capitals.geojson — capitals layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the capitals GeoJSON source + GL circle layer to a live MapLibre map.
 *
 * Capitals are rendered larger and with a square-ish stroke (square-cap line)
 * so they read as more significant than the small settlement dots. The circle
 * radius is larger than settlements at every zoom level.
 *
 * Must be called only after the map style has loaded. Safe to call multiple
 * times — guards against duplicate source/layer registration.
 *
 * @param map     The live MapLibre Map instance.
 * @param geojson The loaded CapitalFeatureCollection.
 * @param theme   The active theme id for color computation.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addCapitalsLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: CapitalFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(CAPITALS_SOURCE_ID)) return;

  map.addSource(CAPITALS_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const color      = domainColor(CAPITALS_BASE_COLOR, theme);
  const timeFilter = buildCapitalsTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';

  // Capitals: larger disc with a high-contrast white ring so they pop above
  // the polity fill and the settlements dot-mass. Radius is deliberately
  // bigger than settlements at every zoom step.
  map.addLayer({
    id: CAPITALS_LAYER_ID,
    type: 'circle',
    source: CAPITALS_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': color,
      // Hover/select POP: a feature-state delta is ADDED to each zoom stop output
      // (the zoom interpolate must stay top-level — MapLibre forbids wrapping it in
      // arithmetic). Resting delta is 0, so the at-rest look is unchanged.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2,  popRadiusStop(6),
        5,  popRadiusStop(10),
        8,  popRadiusStop(15),
        12, popRadiusStop(20),
      ],
      // Thick white ring distinguishes capitals from other point layers. Rim
      // thickens on hover/select (resting = 2, unchanged).
      'circle-stroke-width': popStrokeWidth(2),
      'circle-stroke-color': 'rgba(255, 255, 255, 0.85)',
      'circle-opacity': 0.95,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on the capitals layer (called on year change).
 * Guards when the layer is absent (fetch failed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCapitalsTimeFilter(map: any, year: number): void {
  // layerExists (not layerReady): filters must update during scrub even while a heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, CAPITALS_LAYER_ID)) {
    map.setFilter(CAPITALS_LAYER_ID, buildCapitalsTimeFilter(year));
  }
}

/**
 * Update the capitals circle color when the theme changes.
 * Mirrors setEventsCategoryColors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCapitalsColors(map: any, theme: string): void {
  if (layerReady(map, CAPITALS_LAYER_ID)) {
    map.setPaintProperty(CAPITALS_LAYER_ID, 'circle-color', domainColor(CAPITALS_BASE_COLOR, theme));
  }
}

/**
 * Show or hide the capitals layer. Mirrors setEventsVisibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCapitalsVisibility(map: any, visible: boolean): void {
  // layerExists (not layerReady): visibility must apply even while a heavy source
  // keeps isStyleLoaded() false, else the toggle is silently skipped.
  if (layerExists(map, CAPITALS_LAYER_ID)) {
    map.setLayoutProperty(CAPITALS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Set the opacity of the capitals layer (called when layersStore opacity changes).
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCapitalsOpacity(map: any, opacity: number): void {
  if (layerReady(map, CAPITALS_LAYER_ID)) {
    map.setPaintProperty(CAPITALS_LAYER_ID, 'circle-opacity', Math.max(0, Math.min(1, opacity)));
  }
}
