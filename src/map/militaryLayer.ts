/**
 * militaryLayer.ts — FORTS layer for InvaderGIS (formerly all military sites).
 *
 * Loads /data/layers/military.geojson (2,055 Point features) but now renders only
 * the `subtype === 'fort'` features (32 forts/fortifications) — see
 * buildMilitaryTimeFilter. Battles + sieges (single-year violence) are routed
 * through the EVENTS layer as violence-category events (baked into events.geojson),
 * so they obey the events span window + category solo and read across years.
 * Forts have real multi-year spans (e.g. 1142–1271) and read across their lifetime.
 * Time-scoped by start_year / end_year. (The layer id stays 'military' in the
 * store; its user-facing label is "Forts" and it lives in the Places group.)
 *
 * ── Module contract (mirrors journeysLayer.ts / eventsLayer.ts) ─────────────
 *
 *   MILITARY_SOURCE_ID, MILITARY_LAYER_ID — exported constants
 *   fetchMilitaryGeojson()                — non-crashing fetch, null on failure
 *   addMilitaryLayer(map, geojson, theme, year, visible)
 *   setMilitaryTimeFilter(map, year)
 *   setMilitaryColors(map, theme)
 *   setMilitaryVisibility(map, visible)
 *   setMilitaryOpacity(map, opacity)
 *
 * ── Color by subtype ─────────────────────────────────────────────────────────
 *
 * Military subtype colors are drawn from the existing vocabulary rather than
 * invented hues:
 *   - castle / fort → violence red (#9c1c1c) — fortifications, coercion
 *   - battle         → hazard dark-red (#6e3030) — slightly lighter than fort
 *   - other/unknown  → fallback: violence red (#9c1c1c)
 * All values are theme-lightened via domainColor().
 *
 * ── Time-scoping ─────────────────────────────────────────────────────────────
 *
 * A military site is visible while start_year <= year <= end_year. Null
 * start_year coalesces to 500; null end_year to 1500.
 *
 * ── Z-order ──────────────────────────────────────────────────────────────────
 *
 * Military sites sit above settlements and below capitals in the stack.
 * useMapLifecycle wires them in this order.
 *
 * ── Wave 4A — Zoom-stepped declutter ─────────────────────────────────────────
 *
 * The real subtype distribution: battle=2015, fort=32, siege=8. All 2,055 sites
 * carry a named subtype — there are no null entries. A zoom-stepped subtype gate
 * is wired in the composite filter as future-proofing (any null-subtype sites
 * added later will be deferred until zoom ≥ 4). For the current data, all 2,055
 * sites render at every zoom level. The filter adds no per-feature JS cost.
 */

import { domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';
import { popRadiusStop, popStrokeWidth } from './featureStatePop';

export const MILITARY_SOURCE_ID  = 'military-source';
export const MILITARY_LAYER_ID   = 'military-circle';
export const MILITARY_SYMBOL_ID  = 'military-symbol';
/**
 * Wide transparent hit-circle (16px) layered above the visible marker so
 * the 2.5–8.5px circle is reliably clickable at all zoom levels. Wired in
 * MapCanvas for click → select(id, 'military').
 */
export const MILITARY_HIT_ID = 'military-hit';

/**
 * Build a MapLibre 'match' expression mapping military subtype → distinguishing glyph.
 *   battle  → ✕  (crossed swords shorthand — clear at 8px)
 *   fort    → ■  (solid square — fortification)
 *   castle  → ■  (same as fort)
 *   default → +  (generic cross)
 */
export function buildMilitaryGlyphExpression(): unknown[] {
  return [
    'match', ['get', 'subtype'],
    'battle', '✕',
    'fort',   '■',
    'castle', '■',
    '+',
  ];
}

const MILITARY_URL = assetUrl('/data/layers/military.geojson');

/**
 * Subtype color map — real subtypes from the baked data, tied to vocabulary hues.
 * Unknown subtypes fall through to the match fallback (MILITARY_FALLBACK_COLOR).
 */
const MILITARY_SUBTYPE_COLORS: Record<string, string> = {
  castle: '#9c1c1c',   // violence red — fortification = coercion
  fort:   '#9c1c1c',   // violence red — same semantic as castle
  battle: '#6e3030',   // hazard dark-red — sites of battle, slightly distinct
};

/** Fallback color for unknown / null subtypes — violence red. */
const MILITARY_FALLBACK_COLOR = '#9c1c1c';

// ── Dataset year bounds ───────────────────────────────────────────────────────
const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Properties stamped on every baked military site feature. */
export interface MilitaryFeatureProperties {
  /** Unique feature id. */
  id: string;
  /** Human-readable site name. */
  name: string;
  /** Always 'military' for this layer. */
  kind: 'military';
  /** First year this site was active, or null. */
  start_year: number | null;
  /** Last year, or null if open-ended. */
  end_year: number | null;
  /** Site subtype: fort | castle | battle | other (or null). */
  subtype: string | null;
}

/** A single baked military Point feature. */
export interface MilitaryFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: MilitaryFeatureProperties;
}

/** The baked military FeatureCollection. */
export interface MilitaryFeatureCollection {
  type: 'FeatureCollection';
  features: MilitaryFeature[];
}

// ── Color expression ──────────────────────────────────────────────────────────

/**
 * Build a MapLibre 'match' expression mapping military subtype → theme-aware hex.
 * Covers the real subtypes (castle, fort, battle); unknown values fall through to
 * the fallback color — no fabricated data, no silent drop.
 *
 * @param theme The active theme id.
 * @returns A MapLibre match expression array.
 */
export function buildMilitaryColorExpression(theme: string): unknown[] {
  const pairs: string[] = [];
  for (const [subtype, hex] of Object.entries(MILITARY_SUBTYPE_COLORS)) {
    pairs.push(subtype, domainColor(hex, theme));
  }
  const fallback = domainColor(MILITARY_FALLBACK_COLOR, theme);
  return ['match', ['get', 'subtype'], ...pairs, fallback];
}

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression that shows military sites active at `year`,
 * combined with the zoom-stepped subtype declutter gate.
 *
 * A site is active when start_year <= year <= end_year.
 * At zoom ≤ 4 only named-subtype (castle | fort | battle) sites are shown;
 * at zoom ≥ 5 all sites render (honest deferred draw — no data dropped).
 *
 * @param year The current scrubber year.
 * @returns A MapLibre filter expression array.
 */
export function buildMilitaryTimeFilter(year: number): unknown[] {
  return [
    'all',
    // FORTS ONLY: battles + sieges are now routed through the events layer as
    // violence events (so they get the span window + category solo). This layer
    // renders only the 32 forts/fortifications — they belong in "Places" and have
    // real multi-year spans, so they read across their lifetime as you scrub.
    ['==', ['get', 'subtype'], 'fort'],
    ['<=', ['coalesce', ['get', 'start_year'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'end_year'],   DATASET_END],   year],
  ];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the military GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning so the developer knows the layer is absent.
 */
export async function fetchMilitaryGeojson(): Promise<MilitaryFeatureCollection | null> {
  try {
    const res = await fetch(MILITARY_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${MILITARY_URL}`);
    }
    return (await res.json()) as MilitaryFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[militaryLayer] Failed to load military.geojson — military layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the military GeoJSON source + GL circle layer to a live MapLibre map.
 *
 * Military sites use a smaller radius than capitals (they are numerous —
 * 2,055 — and should not occlude capitals or events). A thin dark stroke
 * gives a slight square-ish visual cue without requiring a separate symbol layer.
 *
 * Must be called only after the map style has loaded. Safe to call multiple times.
 *
 * @param map     The live MapLibre Map instance.
 * @param geojson The loaded MilitaryFeatureCollection.
 * @param theme   The active theme id for color computation.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addMilitaryLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: MilitaryFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(MILITARY_SOURCE_ID)) return;

  map.addSource(MILITARY_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const colorExpr  = buildMilitaryColorExpression(theme);
  const timeFilter = buildMilitaryTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';

  map.addLayer({
    id: MILITARY_LAYER_ID,
    type: 'circle',
    source: MILITARY_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': colorExpr,
      // Hover/select POP baked into each zoom stop (interpolate stays top-level).
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2,  popRadiusStop(3.5),
        5,  popRadiusStop(5.5),
        8,  popRadiusStop(8.0),
        12, popRadiusStop(11.0),
      ],
      'circle-stroke-width': popStrokeWidth(1.5),
      'circle-stroke-color': 'rgba(0, 0, 0, 0.6)',
      'circle-opacity': 0.88,
    },
  });

  // ── Symbol glyph layer ────────────────────────────────────────────────────────
  // ✕ for battles, ■ for forts/castles — visible from zoom 5 so glyphs only
  // appear when the circle is large enough to frame them. MapLibre text collision
  // naturally culls overlapping glyphs at dense zooms.
  map.addLayer({
    id: MILITARY_SYMBOL_ID,
    type: 'symbol',
    source: MILITARY_SOURCE_ID,
    filter: timeFilter,
    layout: {
      visibility,
      'text-field': buildMilitaryGlyphExpression(),
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        5,  0,    // hidden at region zoom
        6,  7,    // appears small
        8,  9,    // readable at city zoom
        12, 11,
      ],
      'text-allow-overlap': false,
      'text-anchor': 'center',
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': 'rgba(255, 255, 255, 0.95)',
      'text-halo-color': 'rgba(0, 0, 0, 0.3)',
      'text-halo-width': 0.5,
    },
  });

  // Hit circle — wide transparent target so markers are reliably clickable.
  map.addLayer({
    id: MILITARY_HIT_ID,
    type: 'circle',
    source: MILITARY_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-radius': 16,
      'circle-opacity': 0,
      'circle-stroke-width': 0,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on the military layer (called on year change).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMilitaryTimeFilter(map: any, year: number): void {
  const filter = buildMilitaryTimeFilter(year);
  // layerExists (not layerReady): filters must update during scrub even while a
  // heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, MILITARY_LAYER_ID))  map.setFilter(MILITARY_LAYER_ID,  filter);
  if (layerExists(map, MILITARY_SYMBOL_ID)) map.setFilter(MILITARY_SYMBOL_ID, filter);
  if (layerExists(map, MILITARY_HIT_ID))    map.setFilter(MILITARY_HIT_ID,    filter);
}

/**
 * Update military circle colors when the theme changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMilitaryColors(map: any, theme: string): void {
  if (layerReady(map, MILITARY_LAYER_ID)) {
    map.setPaintProperty(MILITARY_LAYER_ID, 'circle-color', buildMilitaryColorExpression(theme));
  }
}

/**
 * Show or hide the military layer (visible circle + hit circle together).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMilitaryVisibility(map: any, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  // layerExists (not layerReady): visibility must apply even while a heavy source
  // keeps isStyleLoaded() false, else the toggle is silently skipped (layer appears
  // then disappears). See mapGuards.layerExists.
  if (layerExists(map, MILITARY_LAYER_ID))  map.setLayoutProperty(MILITARY_LAYER_ID,  'visibility', v);
  if (layerExists(map, MILITARY_SYMBOL_ID)) map.setLayoutProperty(MILITARY_SYMBOL_ID, 'visibility', v);
  if (layerExists(map, MILITARY_HIT_ID))    map.setLayoutProperty(MILITARY_HIT_ID,    'visibility', v);
}

/**
 * Set the opacity of the military layer (called when layersStore opacity changes).
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMilitaryOpacity(map: any, opacity: number): void {
  if (layerReady(map, MILITARY_LAYER_ID)) {
    map.setPaintProperty(MILITARY_LAYER_ID, 'circle-opacity', Math.max(0, Math.min(1, opacity)));
  }
}
