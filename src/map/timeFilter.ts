/**
 * timeFilter.ts — time-scoping logic for polity polygon visibility.
 *
 * Pure functions; no MapLibre import, no React import. Safe to import from
 * both useMapLifecycle and MapCanvas without creating a circular dependency.
 *
 * Strategy:
 *   For each distinct polity id, find the maximum snapshotYear that is ≤ the
 *   given year AND within the polity's formed..dissolved window. Collect those
 *   snapshot years into a Set, then build a MapLibre 'match' filter that shows
 *   only features whose snapshotYear is in the active set AND whose
 *   formed..dissolved window contains the year.
 *
 * This approach is cheap (O(n) over features) and avoids re-fetching GeoJSON.
 */

/** Minimal polity feature shape needed for time-scoping. */
export interface PolityFilterProps {
  id: string;
  formed: number;
  dissolved: number | null;
  snapshotYear: number;
}

/**
 * From the full feature list, compute the Set of snapshotYear values that
 * should be visible for a given year.
 *
 * For each polity id: find the max snapshotYear ≤ year within formed..dissolved.
 * The resulting set is passed to buildTimeFilter() to construct the MapLibre
 * filter expression.
 */
export function computeActiveSnapshotYears(
  features: Array<{ properties: PolityFilterProps }>,
  year: number,
): Set<number> {
  const bestByPolity = new Map<string, number>();

  for (const f of features) {
    const { id, formed, dissolved, snapshotYear } = f.properties;
    if (formed > year) continue;
    // dissolved === null → polity still active; dissolved is always > year.
    if (dissolved !== null && dissolved <= year) continue;
    if (snapshotYear > year) continue;

    const current = bestByPolity.get(id);
    if (current === undefined || snapshotYear > current) {
      bestByPolity.set(id, snapshotYear);
    }
  }

  return new Set(bestByPolity.values());
}

/**
 * Find the single active snapshot year for ONE polity at a given year.
 *
 * Returns the max snapshotYear ≤ year that falls within that polity's
 * formed..dissolved window, or null when the polity has no active snapshot then
 * (not yet formed, already dissolved, or no snapshot at/under the year).
 *
 * This is the per-polity counterpart to computeActiveSnapshotYears (which unions
 * the active years across ALL polities). The selection highlight needs the
 * per-polity answer: a polity has ~100+ snapshot features, and many of their
 * snapshotYears coincide with OTHER polities' active years — so filtering the
 * selected polity by the global active-year set rings several of its historical
 * outlines at once (the criss-cross bug). Matching the polity's own single active
 * snapshot year guarantees exactly one outline.
 */
export function activeSnapshotYearForPolity(
  features: Array<{ properties: PolityFilterProps }>,
  polityId: string,
  year: number,
): number | null {
  let best: number | null = null;
  for (const f of features) {
    const { id, formed, dissolved, snapshotYear } = f.properties;
    if (id !== polityId) continue;
    if (formed > year) continue;
    if (dissolved !== null && dissolved <= year) continue;
    if (snapshotYear > year) continue;
    if (best === null || snapshotYear > best) best = snapshotYear;
  }
  return best;
}

/**
 * Build the MapLibre filter expression for a given set of active snapshot years.
 *
 * Returns a MapLibre expression array. When the set is empty (no polities
 * exist for this year) returns a filter that hides all features (honest).
 */
export function buildTimeFilter(year: number, activeSnapshotYears: Set<number>): unknown[] {
  const years = Array.from(activeSnapshotYears);

  if (years.length === 0) {
    // Honest: nothing visible for this year.
    return ['==', ['literal', 1], ['literal', 0]];
  }

  // All three conditions must hold:
  //   1. polity was formed by this year
  //   2. polity had not dissolved yet (or dissolved is absent/null)
  //   3. this is the active snapshot year for this polity
  return [
    'all',
    ['<=', ['get', 'formed'], year],
    [
      'any',
      ['!', ['has', 'dissolved']],
      ['==', ['get', 'dissolved'], null],
      ['>', ['get', 'dissolved'], year],
    ],
    ['in', ['get', 'snapshotYear'], ['literal', years]],
  ];
}
