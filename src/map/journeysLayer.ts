/**
 * journeysLayer.ts — historical-journey line + waypoint layer for InvaderGIS.
 *
 * Loads /data/layers/journeys.geojson (152 LineString journeys + 3,481 waypoint
 * Points baked from data/journeys/*.json), renders each journey as a kind-colored
 * path with dot markers at every waypoint, time-scopes by year, respects the
 * `journeys` layersStore toggle, and wires click → selectionStore.select(id,
 * 'journey').
 *
 * ── Per-kind dash encoding ───────────────────────────────────────────────────
 *
 * MapLibre line-dasharray cannot be data-driven per-feature (GL4 constraint).
 * The workaround is one GL line layer per dash bucket, each filtered to its
 * kind(s). Three visible line layers + one shared hit layer:
 *
 *   journeys-line-solid   — individual_journey  solid, round cap
 *   journeys-line-dotted  — spread              [0.1, 4] dotted, round cap
 *   journeys-line-dashed  — migration           [8, 5] dashed, butt cap
 *   (conquest rendered solid but kept hidden by curated gate by default)
 *   journeys-hit          — wide transparent hit target (all line features)
 *
 * ── Endpoint art ─────────────────────────────────────────────────────────────
 *
 * Three additional circle layers per the LINES.md spec:
 *   journeys-origin     — first waypoint: white ring + color core (origin ring)
 *   journeys-waypoint   — all waypoints: color ring + white core
 *   journeys-arrowhead  — direction arrow stub (symbol layer, omitted on spread)
 *
 * ── The single-source / multi-layer split ───────────────────────────────────
 *
 * The baked FeatureCollection holds both flavours, tagged by the `geomKind`
 * property ('line' | 'waypoint'). One GeoJSON source feeds all GL layers.
 * Each layer filters on `geomKind` and `kind` so the right features land on
 * the right layer.
 *
 * ── Honest curation ──────────────────────────────────────────────────────────
 *
 * Of the 152 journeys, 145 are kind_type 'conquest' whose waypoints chain battle
 * sites in date order — real records, but they render as nonsensical zigzags, not
 * travelled routes. The bake stamps a boolean `curated` flag (true only for the 7
 * hand-authored journeys). This layer DEFAULTS to curated-only so the map shows
 * real journeys, not zigzag noise. The full data stays baked and recoverable;
 * `setJourneysCuratedOnly(map, false)` reveals every journey.
 *
 * ── Time-scoping ─────────────────────────────────────────────────────────────
 *
 * A journey is shown while currentYear is within [year_start - LEAD, year_end +
 * TAIL]: it appears a little before it begins, stays visible while it unfolds,
 * and lingers briefly after it ends before disappearing.
 *
 * ── Theme + color ────────────────────────────────────────────────────────────
 *
 * Color comes from the active vocab's journeyColor(kind, theme) resolver
 * (data meaning, theme-lightened for dark) — never a hardcoded hex.
 */

import { journeyColor } from '@/data/vocab';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';
import { popRadiusStop, popStrokeWidth } from './featureStatePop';

export const JOURNEYS_SOURCE_ID      = 'journeys-source';
export const JOURNEYS_LINE_SOLID_ID  = 'journeys-line-solid';
export const JOURNEYS_LINE_DOTTED_ID = 'journeys-line-dotted';
export const JOURNEYS_LINE_DASHED_ID = 'journeys-line-dashed';
export const JOURNEYS_HIT_ID         = 'journeys-hit';
export const JOURNEYS_ORIGIN_ID      = 'journeys-origin';
export const JOURNEYS_WAYPOINT_ID    = 'journeys-waypoint';

// Legacy alias so MapCanvas / interaction wiring using the old name still compiles.
export const JOURNEYS_LINE_ID = JOURNEYS_LINE_SOLID_ID;

const JOURNEYS_URL = assetUrl('/data/layers/journeys.geojson');

/** The four journey kinds present in the medieval dataset. */
const JOURNEY_KINDS = [
  'conquest',
  'spread',
  'migration',
  'individual_journey',
] as const;

/** How many years before year_start a journey begins to show. */
const TIME_LEAD = 5;
/** How many years after year_end a journey lingers before vanishing. */
const TIME_TAIL = 50;

// ── Dash buckets ─────────────────────────────────────────────────────────────
// MapLibre line-dasharray is a paint constant — cannot be driven by a feature
// expression. One layer per dash pattern; filter selects its kinds.

/** Kinds rendered with solid lines (round cap). */
const SOLID_KINDS  = ['individual_journey', 'conquest'] as const;
/** Kinds rendered with dotted lines [0.1, 4] round cap. */
const DOTTED_KINDS = ['spread'] as const;
/** Kinds rendered with dashed lines [8, 5] butt cap. */
const DASHED_KINDS = ['migration'] as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** Shared properties stamped on every baked journey feature. */
export interface JourneyFeatureProperties {
  id: string;
  name: string;
  kind: string;
  curated: boolean;
  year_start: number | null;
  year_end: number | null;
  geomKind: 'line' | 'waypoint';
  place?: string | null;
  waypointYear?: number | null;
  waypointIndex?: number;
}

export interface JourneyFeature {
  type: 'Feature';
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: JourneyFeatureProperties;
}

export interface JourneyFeatureCollection {
  type: 'FeatureCollection';
  features: JourneyFeature[];
}

// ── Color expression ──────────────────────────────────────────────────────────

export function buildJourneyKindColorExpression(theme: string): unknown[] {
  const pairs: string[] = [];
  for (const kind of JOURNEY_KINDS) {
    const color = journeyColor(kind, theme);
    if (color) pairs.push(kind, color);
  }
  const fallback = journeyColor('individual_journey', theme) ?? '#7a4ec2';
  return ['match', ['get', 'kind'], ...pairs, fallback];
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function buildJourneysFilter(year: number, curatedOnly: boolean): unknown[] {
  const start = ['coalesce', ['get', 'year_start'], 500];
  const end   = ['coalesce', ['get', 'year_end'],  1500];
  const timeWindow = [
    'all',
    ['>=', year, ['-', start, TIME_LEAD]],
    ['<=', year, ['+', end,   TIME_TAIL]],
  ];
  if (!curatedOnly) return timeWindow;
  return ['all', ['==', ['get', 'curated'], true], timeWindow];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchJourneysGeojson(): Promise<JourneyFeatureCollection | null> {
  try {
    const res = await fetch(JOURNEYS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${JOURNEYS_URL}`);
    }
    return (await res.json()) as JourneyFeatureCollection;
  } catch (err) {
    console.warn(
      '[journeysLayer] Failed to load journeys.geojson — journeys layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the journeys GeoJSON source + all GL layers to a live MapLibre map.
 *
 * Layers added (in z-order, lowest first):
 *   journeys-hit          — transparent wide line (click target)
 *   journeys-line-solid   — individual_journey + conquest, solid
 *   journeys-line-dotted  — spread, dotted [0.1, 4]
 *   journeys-line-dashed  — migration, dashed [8, 5]
 *   journeys-origin       — first waypoint (waypointIndex === 0), origin ring
 *   journeys-waypoint     — all waypoints, kind-colored dot + white core
 */
export function addJourneysLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: JourneyFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(JOURNEYS_SOURCE_ID)) return;

  map.addSource(JOURNEYS_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const colorExpr  = buildJourneyKindColorExpression(theme);
  const visibility = visible ? 'visible' : 'none';
  const timeBase   = buildJourneysFilter(year, true); // curated-only default

  // Base filters for each geomKind combined with the time/curated gate.
  const lineFilter     = ['all', ['==', ['get', 'geomKind'], 'line'],     timeBase];
  const waypointFilter = ['all', ['==', ['get', 'geomKind'], 'waypoint'], timeBase];

  // Per-kind filters for the three dash buckets.
  const solidFilter  = ['all', ['match', ['get', 'kind'], [...SOLID_KINDS],  true, false], ...lineFilter.slice(1)];
  const dottedFilter = ['all', ['match', ['get', 'kind'], [...DOTTED_KINDS], true, false], ...lineFilter.slice(1)];
  const dashedFilter = ['all', ['match', ['get', 'kind'], [...DASHED_KINDS], true, false], ...lineFilter.slice(1)];

  const originFilter = [
    'all',
    ['==', ['get', 'geomKind'], 'waypoint'],
    ['==', ['get', 'waypointIndex'], 0],
    timeBase,
  ];

  // Common width interpolation per spec: 1.2px (zoom 2) → 3.4px (zoom 12).
  const lineWidth = [
    'interpolate', ['linear'], ['zoom'],
    2, 1.2,
    5, 1.8,
    8, 2.6,
    12, 3.4,
  ];

  // ── Hit layer ─────────────────────────────────────────────────────────────
  map.addLayer({
    id: JOURNEYS_HIT_ID,
    type: 'line',
    source: JOURNEYS_SOURCE_ID,
    filter: lineFilter,
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 18,
      'line-opacity': 0,
    },
  });

  // ── Solid line — individual_journey + conquest ────────────────────────────
  map.addLayer({
    id: JOURNEYS_LINE_SOLID_ID,
    type: 'line',
    source: JOURNEYS_SOURCE_ID,
    filter: solidFilter,
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-opacity': 0.85,
    },
  });

  // ── Dotted line — spread [0.1, 4] round cap ───────────────────────────────
  map.addLayer({
    id: JOURNEYS_LINE_DOTTED_ID,
    type: 'line',
    source: JOURNEYS_SOURCE_ID,
    filter: dottedFilter,
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [0.1, 4],
      'line-opacity': 0.85,
    },
  });

  // ── Dashed line — migration [8, 5] butt cap ───────────────────────────────
  map.addLayer({
    id: JOURNEYS_LINE_DASHED_ID,
    type: 'line',
    source: JOURNEYS_SOURCE_ID,
    filter: dashedFilter,
    layout: { visibility, 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [8, 5],
      'line-opacity': 0.85,
    },
  });

  // ── Origin ring — first waypoint (waypointIndex === 0) ────────────────────
  // White ring + color core — visually marks the start of the journey.
  map.addLayer({
    id: JOURNEYS_ORIGIN_ID,
    type: 'circle',
    source: JOURNEYS_SOURCE_ID,
    filter: originFilter,
    layout: { visibility },
    paint: {
      'circle-color': colorExpr,
      // Hover/select POP baked into each zoom stop (interpolate stays top-level).
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2, popRadiusStop(3.5),
        5, popRadiusStop(5.0),
        8, popRadiusStop(7.0),
        12, popRadiusStop(9.0),
      ],
      // White ring outer stroke + color core gives the "origin" reading. Thickens
      // on hover/select (resting = 2, unchanged).
      'circle-stroke-width': popStrokeWidth(2),
      'circle-stroke-color': 'rgba(255, 255, 255, 0.9)',
      'circle-opacity': 1.0,
    },
  });

  // ── Waypoint dots — all waypoints ─────────────────────────────────────────
  // Color ring + white core per spec.
  map.addLayer({
    id: JOURNEYS_WAYPOINT_ID,
    type: 'circle',
    source: JOURNEYS_SOURCE_ID,
    filter: waypointFilter,
    layout: { visibility },
    paint: {
      // White core
      'circle-color': '#ffffff',
      // Hover/select POP baked into each zoom stop (interpolate stays top-level).
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2, popRadiusStop(1.5),
        5, popRadiusStop(2.5),
        8, popRadiusStop(3.5),
        12, popRadiusStop(5.0),
      ],
      // Color ring via stroke
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        2, 1.0,
        5, 1.5,
        8, 2.0,
        12, 2.5,
      ],
      'circle-stroke-color': colorExpr,
      'circle-stroke-opacity': 0.92,
      'circle-opacity': 0.92,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

const ALL_LINE_IDS = [
  JOURNEYS_HIT_ID,
  JOURNEYS_LINE_SOLID_ID,
  JOURNEYS_LINE_DOTTED_ID,
  JOURNEYS_LINE_DASHED_ID,
] as const;

const ALL_LAYER_IDS = [
  ...ALL_LINE_IDS,
  JOURNEYS_ORIGIN_ID,
  JOURNEYS_WAYPOINT_ID,
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyJourneysFilters(map: any, year: number, curatedOnly: boolean): void {
  const timeBase       = buildJourneysFilter(year, curatedOnly);
  const lineFilter     = ['all', ['==', ['get', 'geomKind'], 'line'],     timeBase];
  const waypointFilter = ['all', ['==', ['get', 'geomKind'], 'waypoint'], timeBase];
  const solidFilter    = ['all', ['match', ['get', 'kind'], [...SOLID_KINDS],  true, false], ...lineFilter.slice(1)];
  const dottedFilter   = ['all', ['match', ['get', 'kind'], [...DOTTED_KINDS], true, false], ...lineFilter.slice(1)];
  const dashedFilter   = ['all', ['match', ['get', 'kind'], [...DASHED_KINDS], true, false], ...lineFilter.slice(1)];
  const originFilter   = ['all', ['==', ['get', 'geomKind'], 'waypoint'], ['==', ['get', 'waypointIndex'], 0], timeBase];

  // layerExists (not layerReady): filters must update during scrub even while a
  // heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, JOURNEYS_HIT_ID))         map.setFilter(JOURNEYS_HIT_ID,         lineFilter);
  if (layerExists(map, JOURNEYS_LINE_SOLID_ID))  map.setFilter(JOURNEYS_LINE_SOLID_ID,  solidFilter);
  if (layerExists(map, JOURNEYS_LINE_DOTTED_ID)) map.setFilter(JOURNEYS_LINE_DOTTED_ID, dottedFilter);
  if (layerExists(map, JOURNEYS_LINE_DASHED_ID)) map.setFilter(JOURNEYS_LINE_DASHED_ID, dashedFilter);
  if (layerExists(map, JOURNEYS_WAYPOINT_ID))    map.setFilter(JOURNEYS_WAYPOINT_ID,    waypointFilter);
  if (layerExists(map, JOURNEYS_ORIGIN_ID))      map.setFilter(JOURNEYS_ORIGIN_ID,      originFilter);
}

const curatedState = new WeakMap<object, boolean>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setJourneysTimeFilter(map: any, year: number): void {
  const curatedOnly = curatedState.get(map) ?? true;
  applyJourneysFilters(map, year, curatedOnly);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setJourneysCuratedOnly(map: any, curatedOnly: boolean, year: number): void {
  curatedState.set(map, curatedOnly);
  applyJourneysFilters(map, year, curatedOnly);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setJourneysKindColors(map: any, theme: string): void {
  const colorExpr = buildJourneyKindColorExpression(theme);
  for (const id of [JOURNEYS_LINE_SOLID_ID, JOURNEYS_LINE_DOTTED_ID, JOURNEYS_LINE_DASHED_ID] as const) {
    if (layerReady(map, id)) map.setPaintProperty(id, 'line-color', colorExpr);
  }
  if (layerReady(map, JOURNEYS_ORIGIN_ID)) {
    map.setPaintProperty(JOURNEYS_ORIGIN_ID, 'circle-color', colorExpr);
  }
  if (layerReady(map, JOURNEYS_WAYPOINT_ID)) {
    map.setPaintProperty(JOURNEYS_WAYPOINT_ID, 'circle-stroke-color', colorExpr);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setJourneysVisibility(map: any, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  for (const id of ALL_LAYER_IDS) {
    if (layerExists(map, id)) map.setLayoutProperty(id, 'visibility', v);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setJourneysOpacity(map: any, opacity: number): void {
  const o = Math.max(0, Math.min(1, opacity));
  for (const id of [JOURNEYS_LINE_SOLID_ID, JOURNEYS_LINE_DOTTED_ID, JOURNEYS_LINE_DASHED_ID] as const) {
    if (layerReady(map, id)) map.setPaintProperty(id, 'line-opacity', 0.85 * o);
  }
  if (layerReady(map, JOURNEYS_ORIGIN_ID)) {
    map.setPaintProperty(JOURNEYS_ORIGIN_ID, 'circle-opacity', o);
    map.setPaintProperty(JOURNEYS_ORIGIN_ID, 'circle-stroke-opacity', o);
  }
  if (layerReady(map, JOURNEYS_WAYPOINT_ID)) {
    map.setPaintProperty(JOURNEYS_WAYPOINT_ID, 'circle-opacity', 0.92 * o);
    map.setPaintProperty(JOURNEYS_WAYPOINT_ID, 'circle-stroke-opacity', 0.92 * o);
  }
}
