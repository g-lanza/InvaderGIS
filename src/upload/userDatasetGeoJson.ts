/**
 * userDatasetGeoJson.ts — convert a UserDataset into a MapLibre-ready
 * FeatureCollection of points.
 *
 * Kept in src/upload/ (not src/map/) so the map module stays scope-clean: the
 * map wiring imports this one pure function plus the layer module. Every record
 * in a UserDataset is a point (importParse rejects geometry-less features), so
 * the conversion is a 1:1 map record → Point feature carrying the fields the map
 * layer needs (`id`, `name`, `year`).
 *
 * Phase: Wave2-A (additive — pure function, no side effects).
 */

import type { UserDataset } from './types';

/** Properties stamped on every emitted user feature (consumed by the map layer). */
export interface UserFeatureProperties {
  /** Record id within its dataset (selection target / dedupe key). */
  id: string;
  /** Owning dataset id (so multiple datasets can share one source). */
  datasetId: string;
  /** Display name (already resolved from the chosen name field). */
  name: string;
  /** Resolved instant year, or null when the dataset has no time field. */
  year: number | null;
}

/** A single emitted Point feature. */
export interface UserPointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: UserFeatureProperties;
}

/** The emitted FeatureCollection. */
export interface UserFeatureCollection {
  type: 'FeatureCollection';
  features: UserPointFeature[];
}

/**
 * Convert ONE dataset's records into Point features. Records whose spatial ref
 * is not a `point` (should not occur given the parser, but guarded for safety)
 * are skipped rather than emitted with bad geometry.
 *
 * @param ds - The user dataset to convert.
 */
export function userDatasetToGeoJson(ds: UserDataset): UserFeatureCollection {
  const features: UserPointFeature[] = [];
  for (const rec of ds.records) {
    if (rec.spatial?.shape !== 'point') continue;
    const [lat, lon] = rec.spatial.coords;
    const year =
      rec.temporal && rec.temporal.shape === 'instant' ? rec.temporal.year : null;
    features.push({
      type: 'Feature',
      // GeoJSON coordinate order is [lon, lat]; our SpatialRef stores [lat, lon].
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id: rec.id, datasetId: ds.id, name: rec.name, year },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Merge the visible datasets into ONE FeatureCollection for the single map
 * source. Only datasets in `visibleIds` contribute features; an empty input
 * yields an empty (but valid) collection so the map source can clear cleanly.
 *
 * @param datasets   - All user datasets.
 * @param visibleIds - The set of dataset ids currently toggled visible.
 */
export function mergeVisibleDatasets(
  datasets: readonly UserDataset[],
  visibleIds: ReadonlySet<string>,
): UserFeatureCollection {
  const features: UserPointFeature[] = [];
  for (const ds of datasets) {
    if (!visibleIds.has(ds.id)) continue;
    features.push(...userDatasetToGeoJson(ds).features);
  }
  return { type: 'FeatureCollection', features };
}
