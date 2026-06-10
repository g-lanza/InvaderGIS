/**
 * regionExpression.ts — builds a MapLibre data-driven 'match' expression
 * that maps each polity feature's `region` property to a tinted color.
 *
 * Called by MapCanvas whenever the theme changes so the map repaints with
 * correct domain colors. Uses the active vocab bundle (medievalVocab by default)
 * so it stays dataset-aware once multi-dataset support lands.
 *
 * All 18 regions present in polities.geojson are covered by the medieval vocab
 * (verified programmatically — zero fall-through regions). The fallback color
 * (--map-land CSS token) is used for any unknown region that may appear in future
 * datasets: it is a neutral parchment/land tone, never a fabricated hue.
 *
 * Returns a MapLibre expression: ['match', ['get', 'region'], r1, c1, r2, c2, ..., fallback]
 */

import { regionColor } from '@/data/vocab';

/**
 * Build a MapLibre `match` expression for polity polygon fill colors.
 *
 * @param theme    The active theme id (e.g. 'atlas', 'dark'). Passed to
 *                 regionColor() so dark-theme colors are lightened correctly.
 * @param fallback A CSS color string used for unrecognised region keys.
 *                 Should be the current --map-land token value.
 * @returns        A MapLibre expression array: ['match', ['get', 'region'], ...pairs, fallback]
 */
export function buildRegionMatchExpression(
  theme: string,
  fallback: string,
): unknown[] {
  /** The 18 regions present in polities.geojson (all covered by medieval vocab). */
  const REGIONS = [
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

  // Build flat [region, color, region, color, ...] pairs for the match expression.
  const pairs: string[] = [];
  for (const region of REGIONS) {
    const color = regionColor(region, theme);
    // regionColor returns undefined if region is missing from vocab — guarded here.
    pairs.push(region, color ?? fallback);
  }

  // MapLibre match expression: ['match', input, v1, r1, v2, r2, ..., fallback]
  return ['match', ['get', 'region'], ...pairs, fallback];
}
