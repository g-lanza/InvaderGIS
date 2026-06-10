/**
 * heatmapLayer.ts — event density heatmap for InvaderGIS.
 *
 * Renders a MapLibre native 'heatmap' layer over the EVENT point dataset
 * (events.geojson, 2,914 Point features). Time-filtered to the exact scrubber year
 * (same exact-year model as eventsLayer.ts).
 *
 * ── Why heatmap and not kernel-density ────────────────────────────────────────
 *
 * MapLibre's built-in heatmap type uses a GPU screen-space kernel — it is the
 * appropriate tool here. We do NOT fabricate a custom KDE or external raster.
 * The weight is UNIFORM (1.0 per feature) because the events.geojson does not
 * carry a real numeric magnitude field that would make a weighted heatmap
 * meaningful. Honest empty: if a magnitude field is added to future bakes,
 * update heatmap-weight to ['get', '<field>'].
 *
 * ── Time filter ──────────────────────────────────────────────────────────────
 *
 * Exact-year: show only events whose year equals currentYear (matching eventsLayer).
 * Filter is updated on year change via setHeatmapTimeFilter().
 *
 * ── Opacity ──────────────────────────────────────────────────────────────────
 *
 * The heatmap-opacity interpolates with zoom so at city-level zoom the layer fades
 * out gracefully (individual event studs from eventsLayer are more informative at
 * that scale). At world/region zoom the heatmap communicates density well.
 *
 * ── Module contract (mirrors eventsLayer.ts) ──────────────────────────────────
 *
 *   HEATMAP_SOURCE_ID, HEATMAP_LAYER_ID — exported constants for MapCanvas
 *   addHeatmapLayer(map, geojson, year, visible)
 *   setHeatmapTimeFilter(map, year)
 *   setHeatmapVisibility(map, visible)
 *   setHeatmapOpacity(map, opacity)
 *
 * The heatmap shares the events GeoJSON source with eventsLayer — both consume
 * EVENTS_SOURCE_ID which is added by addEventsLayer(). addHeatmapLayer() must
 * therefore be called AFTER addEventsLayer() so the shared source exists.
 * If the events source is absent (fetch failed) addHeatmapLayer() is a no-op.
 *
 * Defaults OFF — integration agent ensures layersStore 'heatmap' starts visible:false.
 */

import { EVENTS_SOURCE_ID, buildEventsTimeFilter } from './eventsLayer';
import { layerReady, layerExists } from './mapGuards';

export const HEATMAP_SOURCE_ID = EVENTS_SOURCE_ID; // shared with eventsLayer
export const HEATMAP_LAYER_ID  = 'heatmap-events';

// ── Time filter ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression showing only events on the exact scrubber
 * year. Delegates to buildEventsTimeFilter so the heatmap and the event studs
 * filter identically (both read EVENTS_SOURCE_ID). Exact-year, not accreting
 * (user decision 2026-06-07 — see eventsLayer.ts).
 *
 * @param year The current scrubber year.
 */
export function buildHeatmapTimeFilter(year: number): unknown[] {
  return buildEventsTimeFilter(year);
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add the heatmap GL layer to a live MapLibre map.
 *
 * Uses the EVENTS_SOURCE_ID source (shared with eventsLayer). The heatmap layer
 * must be added AFTER addEventsLayer() so the source already exists.
 * If the source is absent (events fetch failed), this call is a no-op — the
 * heatmap layer is simply not registered.
 *
 * Weight: uniform (1.0 per feature) — the events dataset does not carry a real
 * magnitude field. Honest TSDoc note: if a future bake adds a numeric magnitude
 * (e.g. `severity`), update 'heatmap-weight' to ['get', 'severity'].
 *
 * Heatmap-opacity fades out at zoom > 8 so individual event studs (from
 * eventsLayer) dominate at city-level zoom where they are more informative.
 *
 * Must be called only after the map style has loaded. Safe to call multiple times.
 *
 * @param map     The live MapLibre Map instance.
 * @param year    The initial year for time-scoping.
 * @param visible Whether to show the layer immediately.
 */
export function addHeatmapLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  year: number,
  visible: boolean,
): void {
  // Guard: shared source must exist (added by addEventsLayer).
  if (!map.getSource(HEATMAP_SOURCE_ID)) {
     
    console.warn(
      '[heatmapLayer] Events source not found — heatmap layer disabled.' +
      ' Ensure addEventsLayer() is called before addHeatmapLayer().',
    );
    return;
  }

  // Guard: don't double-register the layer.
  if (layerReady(map, HEATMAP_LAYER_ID)) return;

  const timeFilter = buildHeatmapTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';

  map.addLayer({
    id: HEATMAP_LAYER_ID,
    type: 'heatmap',
    source: HEATMAP_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      // Uniform weight — no real magnitude field in events.geojson.
      // If a future bake adds 'severity' or similar, change to ['get', 'severity'].
      'heatmap-weight': 1,

      // Kernel radius interpolates with zoom: larger at low zoom (more smoothing
      // over world density), smaller at high zoom (sharper point detail).
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        2,  12,
        5,  18,
        8,  24,
        12, 30,
      ],

      // Intensity scales with zoom — at low zoom we need more intensity to make
      // sparse clusters visible; at high zoom individual points are close enough
      // that lower intensity avoids over-saturation.
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        2, 1.0,
        5, 0.8,
        8, 0.5,
      ],

      // Color ramp from transparent → cool → warm → hot.
      // No fabricated palette: maps the standard heatmap convention (cool=sparse,
      // hot=dense) onto a warm amber-red scale that is legible in all four themes.
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0,   'rgba(0,0,0,0)',
        0.1, 'rgba(58,30,15,0.15)',
        0.3, 'rgba(160,80,20,0.45)',
        0.5, 'rgba(200,100,20,0.65)',
        0.7, 'rgba(220,60,20,0.80)',
        1.0, 'rgba(156,28,28,0.92)',
      ],

      // Opacity: full visibility at low-to-mid zoom; fades out at city zoom
      // where individual event studs are more informative than the density field.
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.85,
        8, 0.55,
        10, 0.15,
        12, 0,
      ],
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

/**
 * Update the time filter on the heatmap layer (called on year change).
 * Guards when the layer is absent.
 *
 * @param map  The live MapLibre Map instance.
 * @param year The current scrubber year.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setHeatmapTimeFilter(map: any, year: number): void {
  // layerExists (not layerReady): filters must update during scrub even while a heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, HEATMAP_LAYER_ID)) {
    map.setFilter(HEATMAP_LAYER_ID, buildHeatmapTimeFilter(year));
  }
}

/**
 * Show or hide the heatmap layer.
 *
 * @param map     The live MapLibre Map instance.
 * @param visible Whether to show the layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setHeatmapVisibility(map: any, visible: boolean): void {
  // layerExists (not layerReady): visibility must apply even while a heavy source
  // keeps isStyleLoaded() false, else the layer toggles on then disappears.
  // See mapGuards.layerExists.
  if (layerExists(map, HEATMAP_LAYER_ID)) {
    map.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Set the maximum opacity of the heatmap layer (called when layersStore opacity changes).
 * Scales the zoom-stepped opacity ramp by the store value so the zoom-based fade-out
 * is preserved at reduced overall opacity.
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1 from layersStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setHeatmapOpacity(map: any, opacity: number): void {
  if (layerReady(map, HEATMAP_LAYER_ID)) {
    const clamped = Math.max(0, Math.min(1, opacity));
    // Scale the zoom-based ramp by the global opacity.
    map.setPaintProperty(HEATMAP_LAYER_ID, 'heatmap-opacity', [
      'interpolate', ['linear'], ['zoom'],
      5,  0.85 * clamped,
      8,  0.55 * clamped,
      10, 0.15 * clamped,
      12, 0,
    ]);
  }
}
