/**
 * tradeLayer.ts — historical trade routes layer for InvaderGIS.
 *
 * Loads /data/layers/trade.geojson (25 LineString features baked from real
 * donor data). Renders each route as a dashed line in the vocabulary's trade
 * / economy color. Time-scoped by start_year / end_year.
 *
 * ── Module contract (mirrors journeysLayer.ts / eventsLayer.ts) ─────────────
 *
 *   TRADE_SOURCE_ID, TRADE_LINE_ID, TRADE_HIT_ID — exported constants
 *   fetchTradeGeojson()                   — non-crashing fetch, null on failure
 *   addTradeLayer(map, geojson, theme, year, visible)
 *   setTradeTimeFilter(map, year)
 *   setTradeColors(map, theme)
 *   setTradeVisibility(map, visible)
 *   setTradeOpacity(map, opacity)
 *
 * ── Color ────────────────────────────────────────────────────────────────────
 *
 * Trade routes use the vocabulary 'economy' / 'trade' hue (#a3592a — orange-
 * brown from RELATIONSHIP_TYPES.trade and EVENT_CATEGORIES.economy). This is
 * the canonical meaning-color for economic exchange in this dataset. Lightened
 * in dark theme via domainColor().
 *
 * ── Dashed line ───────────────────────────────────────────────────────────────
 *
 * Routes render as dashed lines to visually distinguish them from the solid
 * journey paths and polity outlines. A wide transparent hit-layer (TRADE_HIT_ID)
 * sits on top to give a forgiving click/hover target for thin lines — the same
 * pattern used by journeysLayer.
 *
 * ── Time-scoping ─────────────────────────────────────────────────────────────
 *
 * A route is visible while start_year <= year <= end_year. Null start_year
 * coalesces to 500; null end_year to 1500.
 *
 * ── Z-order ──────────────────────────────────────────────────────────────────
 *
 * Trade lines are added FIRST among the new layers (beneath all points) so
 * they do not occlude settlements, capitals, or military markers.
 * useMapLifecycle wires them before the point layers.
 */

import { domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';

export const TRADE_SOURCE_ID = 'trade-source';
export const TRADE_LINE_ID   = 'trade-line';
export const TRADE_HIT_ID    = 'trade-hit';

const TRADE_URL = assetUrl('/data/layers/trade.geojson');

/**
 * Economy/trade orange-brown — matches RELATIONSHIP_TYPES.trade (#a3592a) and
 * EVENT_CATEGORIES.economy (#a3592a) from the vocabulary. Canonical meaning-color
 * for economic exchange; not invented.
 */
const TRADE_BASE_COLOR = '#a3592a';

// ── Dataset year bounds ───────────────────────────────────────────────────────
const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Transport mode of a trade route. */
export type TradeMode = 'overland' | 'maritime' | 'river-and-portage';

/** Properties stamped on every baked trade route feature. */
export interface TradeFeatureProperties {
  /** Unique feature id. */
  id: string;
  /** Human-readable route name. */
  name: string;
  /** Always 'trade' for this layer. */
  kind: 'trade';
  /** First year this route was active, or null. */
  start_year: number | null;
  /** Last year, or null if open-ended. */
  end_year: number | null;
  /** Real 1–2 sentence historical summary (enrich-trade.mjs). Absent on un-enriched data. */
  summary?: string;
  /** Primary commodities carried along the route. */
  goods?: string[];
  /** Key cities / emporia along the route. */
  hubs?: string[];
  /** Transport mode (overland / maritime / river-and-portage). */
  mode?: TradeMode;
}

/** A single baked trade route LineString feature. */
export interface TradeFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: TradeFeatureProperties;
}

/** The baked trade routes FeatureCollection. */
export interface TradeFeatureCollection {
  type: 'FeatureCollection';
  features: TradeFeature[];
}

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression that shows trade routes active at `year`.
 *
 * @param year The current scrubber year.
 * @returns A MapLibre filter expression array.
 */
export function buildTradeTimeFilter(year: number): unknown[] {
  return [
    'all',
    ['<=', ['coalesce', ['get', 'start_year'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'end_year'],   DATASET_END],   year],
  ];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the trade routes GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning so the developer knows the layer is absent.
 */
export async function fetchTradeGeojson(): Promise<TradeFeatureCollection | null> {
  try {
    const res = await fetch(TRADE_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${TRADE_URL}`);
    }
    return (await res.json()) as TradeFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[tradeLayer] Failed to load trade.geojson — trade layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the trade routes GeoJSON source + two GL line layers to a live MapLibre map.
 *
 * Two layers per route (mirrors journeysLayer hit-line pattern):
 *   1. trade-hit  — wide transparent line for forgiving click/hover targets.
 *   2. trade-line — the visible dashed route, economy-orange colored.
 *
 * Must be called only after the map style has loaded. Safe to call multiple times.
 *
 * @param map     The live MapLibre Map instance.
 * @param geojson The loaded TradeFeatureCollection.
 * @param theme   The active theme id for color computation.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addTradeLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: TradeFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(TRADE_SOURCE_ID)) return;

  map.addSource(TRADE_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const color      = domainColor(TRADE_BASE_COLOR, theme);
  const timeFilter = buildTradeTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';

  // ── Hit layer (wide, transparent — forgiving click/hover target) ─────────────
  // Added first so it sits beneath the visible line and never occludes it.
  // Mirrors journeysLayer JOURNEYS_HIT_ID pattern.
  map.addLayer({
    id: TRADE_HIT_ID,
    type: 'line',
    source: TRADE_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 16,
      'line-opacity': 0,
    },
  });

  // ── Visible dashed trade line ─────────────────────────────────────────────────
  // Dashed pattern distinguishes trade routes from solid journey paths and polity
  // outlines. line-dasharray is a constant property — cannot be data-driven in
  // MapLibre GL 4.x (same constraint as journeysLayer).
  map.addLayer({
    id: TRADE_LINE_ID,
    type: 'line',
    source: TRADE_SOURCE_ID,
    filter: timeFilter,
    layout: {
      visibility,
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': color,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        2, 1.0,
        5, 1.6,
        8, 2.4,
        12, 3.2,
      ],
      // Dashed — visually distinct from solid journey paths.
      'line-dasharray': [4, 3],
      'line-opacity': 0.78,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on both trade layers (called on year change).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTradeTimeFilter(map: any, year: number): void {
  const filter = buildTradeTimeFilter(year);
  // layerExists (not layerReady): filters must update during scrub even while a
  // heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, TRADE_HIT_ID))  map.setFilter(TRADE_HIT_ID,  filter);
  if (layerExists(map, TRADE_LINE_ID)) map.setFilter(TRADE_LINE_ID, filter);
}

/**
 * Update trade line color when the theme changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTradeColors(map: any, theme: string): void {
  const color = domainColor(TRADE_BASE_COLOR, theme);
  if (layerReady(map, TRADE_LINE_ID)) {
    map.setPaintProperty(TRADE_LINE_ID, 'line-color', color);
  }
}

/**
 * Show or hide both trade layers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTradeVisibility(map: any, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  if (layerExists(map, TRADE_HIT_ID))  map.setLayoutProperty(TRADE_HIT_ID,  'visibility', v);
  if (layerExists(map, TRADE_LINE_ID)) map.setLayoutProperty(TRADE_LINE_ID, 'visibility', v);
}

/**
 * Set the opacity of the trade line layer (called when layersStore opacity changes).
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTradeOpacity(map: any, opacity: number): void {
  if (layerReady(map, TRADE_LINE_ID)) {
    map.setPaintProperty(TRADE_LINE_ID, 'line-opacity', Math.max(0, Math.min(1, opacity)));
  }
}
