/**
 * userLayer.ts — MapLibre source + layer for user-uploaded datasets (Wave2-A).
 *
 * Mirrors the module contract of src/map/eventsLayer.ts (add / setData /
 * setVisibility / setTimeFilter) but lives in src/upload to keep the map module
 * scope-clean. MapCanvas calls these helpers behind a single guarded effect that
 * no-ops when the user has uploaded nothing.
 *
 * ── Why a distinct visual treatment ─────────────────────────────────────────────
 * User points use the `--accent` token as their color so they read as clearly
 * "yours" against the medieval domain palette — a hairline ring (DESIGN.md: rings
 * not shadows) over a filled disc, name labels above zoom 6. No hardcoded hex:
 * the accent is read from a CSS token by the caller and passed in.
 *
 * ── Time-scoping ────────────────────────────────────────────────────────────────
 * User points may or may not have a year. The filter shows a feature when EITHER
 * it has no year (`year == null` ⇒ always visible) OR its year ≤ the scrubber —
 * the same accreting-history model as events, but honest about undated points
 * (they are not hidden just because the user gave no time column).
 *
 * Phase: Wave2-A (additive — no frozen stores touched).
 */

import type { UserFeatureCollection } from './userDatasetGeoJson';

export const USER_SOURCE_ID = 'user-data-source';
export const USER_CIRCLE_ID = 'user-data-circle';
export const USER_LABEL_ID = 'user-data-label';

/**
 * Build a MapLibre filter that shows undated points always and dated points once
 * the scrubber reaches their year (accreting history). `['get','year']` is null
 * for undated features; the `==` null branch keeps them visible.
 */
export function buildUserTimeFilter(year: number): unknown[] {
  return [
    'any',
    ['==', ['get', 'year'], null],
    ['<=', ['get', 'year'], year],
  ];
}

/**
 * Add the user-data source + circle + label layers to a live MapLibre map.
 * Idempotent: guards against duplicate registration. The accent color is passed
 * in (read from the `--accent` CSS token by the caller) to honor the token law.
 *
 * @param map     - The live MapLibre Map instance (untyped to avoid heavy import).
 * @param geojson - The merged user FeatureCollection.
 * @param accent  - Resolved `--accent` color string for the active theme.
 * @param year    - Initial scrubber year for time-scoping.
 * @param visible - Whether the layer starts visible.
 */
export function addUserLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: UserFeatureCollection,
  accent: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(USER_SOURCE_ID)) return;

  map.addSource(USER_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  const visibility = visible ? 'visible' : 'none';
  const timeFilter = buildUserTimeFilter(year);

  map.addLayer({
    id: USER_CIRCLE_ID,
    type: 'circle',
    source: USER_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': accent,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2, 3,
        5, 5,
        8, 7,
        12, 10,
      ],
      'circle-stroke-width': 1.2,
      'circle-stroke-color': 'rgba(255, 255, 255, 0.7)',
      'circle-opacity': 0.9,
    },
  });

  map.addLayer({
    id: USER_LABEL_ID,
    type: 'symbol',
    source: USER_SOURCE_ID,
    filter: timeFilter,
    layout: {
      visibility,
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        6, 0,
        7, 9,
        12, 12,
      ],
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': 'rgba(255, 255, 255, 0.95)',
      'text-halo-color': 'rgba(0, 0, 0, 0.45)',
      'text-halo-width': 1,
    },
  });
}

/**
 * Replace the data on the existing user source (called when datasets/visibility
 * change). No-op when the source isn't present yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setUserData(map: any, geojson: UserFeatureCollection): void {
  const src = map.getSource(USER_SOURCE_ID);
  if (src && typeof src.setData === 'function') {
    src.setData(geojson);
  }
}

/** Update the accent color (theme change). No-op when the layer is absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setUserAccent(map: any, accent: string): void {
  if (map.getLayer(USER_CIRCLE_ID)) {
    map.setPaintProperty(USER_CIRCLE_ID, 'circle-color', accent);
  }
}

/** Update the time filter on both user layers. No-op when absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setUserTimeFilter(map: any, year: number): void {
  const filter = buildUserTimeFilter(year);
  if (map.getLayer(USER_CIRCLE_ID)) map.setFilter(USER_CIRCLE_ID, filter);
  if (map.getLayer(USER_LABEL_ID)) map.setFilter(USER_LABEL_ID, filter);
}

/** Show/hide both user layers. No-op when absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setUserVisibility(map: any, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  if (map.getLayer(USER_CIRCLE_ID)) map.setLayoutProperty(USER_CIRCLE_ID, 'visibility', v);
  if (map.getLayer(USER_LABEL_ID)) map.setLayoutProperty(USER_LABEL_ID, 'visibility', v);
}
