/**
 * geodesy.ts — pure great-circle distance + path-length + polygon-area math.
 *
 * Powers the client-side Measure tool (a competitive-gap closer vs ArcGIS: the
 * historical-distance questions this audience asks — campaign ranges, trade-route
 * lengths — answered fully offline, no server). All functions are pure and operate
 * on [lon, lat] pairs (GeoJSON order) in degrees. No external deps.
 */

/** Mean Earth radius (WGS-84 authalic), metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle (haversine) distance between two [lon, lat] points, in metres.
 */
export function haversineMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = toRad(lat2 - lat1);
  const dλ = toRad(lon2 - lon1);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Total length of a path (polyline) of [lon, lat] points, in metres.
 * Returns 0 for fewer than two points.
 */
export function pathLengthMeters(points: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Spherical polygon area for a ring of [lon, lat] points, in square metres.
 * Uses the spherical-excess (shoelace-on-sphere) formula. The ring need not be
 * explicitly closed — the last→first segment is implied. Returns 0 for < 3 points.
 */
export function polygonAreaSqMeters(ring: ReadonlyArray<readonly [number, number]>): number {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    sum += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/**
 * Format a distance in metres as a compact human string: "742 m" or "1,240 km".
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${rounded.toLocaleString('en-US')} km`;
}

/**
 * Format an area in square metres as "km²" (or "m²" below 1 km²).
 */
export function formatArea(sqMeters: number): string {
  if (sqMeters < 1_000_000) return `${Math.round(sqMeters).toLocaleString('en-US')} m²`;
  const sqKm = sqMeters / 1_000_000;
  const rounded = sqKm >= 100 ? Math.round(sqKm) : Math.round(sqKm * 10) / 10;
  return `${rounded.toLocaleString('en-US')} km²`;
}
