/**
 * edgeCost.ts — Cost-weighted edge analytics for journey, trade, and
 * relationship networks.
 *
 * JOURNEY COST (existing)
 * ───────────────────────
 * Computes edge weights from REAL data/journeys waypoints.
 *
 * DISTANCE COST (journeys)
 * ─────────────
 * Each journey waypoint carries a `coords: [lat, lon]` pair. We compute the
 * great-circle distance (haversine) between consecutive waypoints and sum them
 * to get the total distance cost in kilometres. No invented multipliers.
 *
 * If a journey has fewer than 2 waypoints with valid coords, the cost falls
 * back to `null` (honest absence — not a fabricated 0 or average).
 *
 * HOPS COST (journeys)
 * ─────────
 * Alternative basis: number of waypoints minus 1 (i.e., count of legs).
 * Useful for comparing journey complexity independent of geography.
 *
 * RELATIONSHIP EDGE COST (P1-9)
 * ─────────────────────────────
 * Relationship edges (from the adjacency index) have no journey waypoints.
 * Two cost modes are supported to make the Distance/Hops toggle visibly change
 * edge widths in the NetworkGraph:
 *
 *   'distance' basis: great-circle haversine distance between the two endpoint
 *     polities' centroids (from polity.centroid: [lat, lon] in the real data).
 *     Thicker edge = geographically farther-apart polities. Reflects the
 *     actual spatial reach of the diplomatic/political relationship.
 *
 *   'hops' basis: 1 per edge (all relationship edges have exactly one
 *     connection — there are no waypoints). Width is derived from the inverse
 *     of each polity's degree (number of relationships): highly-connected
 *     polities draw narrower lines because their connections are "cheaper"
 *     (more common); peripheral polities draw wider lines to surface rare ties.
 *     Formula: cost = 1 / sqrt(max(degA, degB, 1)). This gives a genuine
 *     spread of widths without inventing any data.
 *
 * EDGE WEIGHT → STROKE WIDTH
 * ──────────────────────────
 * `edgeStrokeWidth(cost, basis, allCosts)` normalises the cost within the
 * full distribution and maps to [MIN_WIDTH, MAX_WIDTH] so the thickest edge
 * is always `MAX_WIDTH` px and the thinnest is `MIN_WIDTH` px. Edges with
 * null cost use `NULL_WIDTH` (thin neutral line — honest about absence).
 *
 * DESIGN CONTRACT
 * ───────────────
 * - Pure functions only — no side-effects, no module state.
 * - No hardcoded colors — stroke width only; colors remain in networkColors.ts.
 * - No invented data — if a field is missing, the cost is null.
 *
 * @module edgeCost
 */

import type { RawRecord } from '@/data/loaders';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * The cost basis to use when computing edge weights.
 *
 * - `'distance'`: sum of great-circle distances between consecutive waypoints (km).
 * - `'hops'`:     number of waypoint-to-waypoint legs (waypoints.length - 1).
 */
export type CostBasis = 'distance' | 'hops';

/**
 * A computed cost entry for one journey edge.
 * `null` cost means the journey lacked valid waypoint data — surface honestly,
 * do not substitute a fabricated value.
 */
export interface EdgeCost {
  /** Journey or edge id (matches RawRecord.id). */
  id: string;
  /** Computed cost, or null when waypoint data is insufficient. */
  cost: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum rendered stroke width for a cost-weighted edge (px in SVG units). */
const MIN_WIDTH = 1.0;
/** Maximum rendered stroke width for a cost-weighted edge (px in SVG units). */
const MAX_WIDTH = 6.0;
/** Stroke width for edges with null (unknown) cost. */
const NULL_WIDTH = 0.8;
/** Earth radius in kilometres — used by haversine. */
const EARTH_RADIUS_KM = 6371.0;

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Haversine great-circle distance between two lat/lon points (in km).
 *
 * @param lat1 - Latitude of point 1 (degrees).
 * @param lon1 - Longitude of point 1 (degrees).
 * @param lat2 - Latitude of point 2 (degrees).
 * @param lon2 - Longitude of point 2 (degrees).
 * @returns Distance in kilometres.
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dPhi = (lat2 - lat1) * toRad;
  const dLambda = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Attempt to extract a valid [lat, lon] pair from a waypoint's `coords` field.
 *
 * The data stores coords as `[lat, lon]` (see data/journeys/*.json). Returns
 * `null` if the field is absent or malformed — no invented fallback.
 *
 * @param wp - A raw waypoint object.
 * @returns  - [lat, lon] or null.
 */
function extractLatLon(wp: unknown): [number, number] | null {
  if (!wp || typeof wp !== 'object') return null;
  const coords = (wp as Record<string, unknown>).coords;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lat = coords[0];
  const lon = coords[1];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return [lat, lon];
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Compute the total great-circle distance cost for a journey.
 *
 * Sums haversine distances between all consecutive waypoints that carry valid
 * `coords`. Returns `null` when fewer than two valid coord pairs exist (honest
 * absence — not a fabricated value).
 *
 * @param record - A raw journey RawRecord from data/journeys/.
 * @returns Summed distance in km, or null if insufficient waypoint data.
 */
export function distanceCost(record: RawRecord): number | null {
  const waypoints = record.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;

  let totalKm = 0;
  let legsComputed = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = extractLatLon(waypoints[i]);
    const b = extractLatLon(waypoints[i + 1]);
    if (a === null || b === null) continue;

    totalKm += haversine(a[0], a[1], b[0], b[1]);
    legsComputed++;
  }

  return legsComputed > 0 ? totalKm : null;
}

/**
 * Compute the hop count cost for a journey.
 *
 * Returns the number of consecutive waypoint-to-waypoint legs. Returns `null`
 * if the journey has fewer than 2 waypoints.
 *
 * @param record - A raw journey RawRecord from data/journeys/.
 * @returns Leg count (waypoints.length - 1), or null if insufficient data.
 */
export function hopCost(record: RawRecord): number | null {
  const waypoints = record.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  return waypoints.length - 1;
}

/**
 * Compute cost for a single journey record according to the given basis.
 *
 * @param record - A raw journey RawRecord.
 * @param basis  - Which cost metric to use.
 * @returns EdgeCost with `cost` in km (distance) or count (hops), or null.
 */
export function computeEdgeCost(record: RawRecord, basis: CostBasis): EdgeCost {
  const cost = basis === 'distance' ? distanceCost(record) : hopCost(record);
  return { id: record.id, cost };
}

/**
 * Compute edge costs for an array of journey records.
 *
 * Returns one EdgeCost per record. Records lacking valid waypoints get
 * `cost: null` — never a fabricated fallback.
 *
 * @param journeys - Array of raw journey RawRecord objects.
 * @param basis    - Which cost metric to use.
 * @returns Array of EdgeCost objects in the same order as input.
 */
export function computeAllEdgeCosts(
  journeys: RawRecord[],
  basis: CostBasis,
): EdgeCost[] {
  return journeys.map((j) => computeEdgeCost(j, basis));
}

/**
 * Build a lookup map from journey id to EdgeCost.
 *
 * @param costs - Array returned by computeAllEdgeCosts.
 * @returns Map<journeyId, EdgeCost>.
 */
export function buildCostMap(costs: EdgeCost[]): Map<string, EdgeCost> {
  return new Map(costs.map((c) => [c.id, c]));
}

/**
 * Compute the SVG stroke width for a single edge given its cost and the
 * full cost distribution (for normalisation).
 *
 * Maps the cost linearly to [MIN_WIDTH, MAX_WIDTH]. Edges with null cost
 * use NULL_WIDTH — visually thin and distinct so their absence is legible.
 *
 * @param cost     - The edge's individual cost (null = unknown).
 * @param allCosts - All costs in the active set (used for min/max normalisation).
 * @returns Stroke width in SVG units (px at 1:1).
 */
export function edgeStrokeWidth(cost: number | null, allCosts: (number | null)[]): number {
  if (cost === null) return NULL_WIDTH;

  const validCosts = allCosts.filter((c): c is number => c !== null);
  if (validCosts.length === 0) return NULL_WIDTH;

  const minCost = Math.min(...validCosts);
  const maxCost = Math.max(...validCosts);

  if (maxCost === minCost) {
    // All edges have the same cost — render at the midpoint width
    return (MIN_WIDTH + MAX_WIDTH) / 2;
  }

  const t = (cost - minCost) / (maxCost - minCost);
  return MIN_WIDTH + t * (MAX_WIDTH - MIN_WIDTH);
}

// ── Relationship edge cost (P1-9) ─────────────────────────────────────────────
// Journey edges key to journey record ids. Relationship edges from the
// adjacency index have no waypoints; these two functions compute per-edge costs
// from REAL polity graph properties so the Distance/Hops toggle produces
// visibly different stroke widths.

/**
 * Attempt to extract a [lat, lon] centroid from a raw polity record.
 *
 * Polity records carry `centroid: [lat, lon]` in the baked data. Returns null
 * if the field is absent or malformed — no invented fallback.
 *
 * @param record - A raw polity RawRecord.
 * @returns [lat, lon] or null.
 */
function extractPolityCentroid(record: RawRecord): [number, number] | null {
  const c = record.centroid;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lat = c[0];
  const lon = c[1];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return [lat, lon];
}

/**
 * A cost entry for one relationship edge, keyed by the adjacency edge id.
 * `null` cost means centroid data is missing for one or both endpoints.
 */
export interface RelationshipEdgeCost {
  /** Edge id (matches ChartEdge.id / AdjacencyEntry.relId or canonical key). */
  id: string;
  /** Computed cost or null when centroid data is insufficient. */
  cost: number | null;
}

/**
 * Compute 'distance' basis cost for a relationship edge.
 *
 * Uses the haversine great-circle distance between the two endpoint polities'
 * centroids (polity.centroid: [lat, lon] from the real baked records).
 * Thicker = geographically farther-apart polities.
 *
 * Returns null when either endpoint polity lacks a centroid — honest absence,
 * not a fabricated 0 or average.
 *
 * @param sourceId  - Polity id for the edge source.
 * @param targetId  - Polity id for the edge target.
 * @param polityMap - Pre-built Map<polityId, RawRecord> for O(1) lookup.
 * @returns Great-circle distance in km, or null.
 */
export function relationshipDistanceCost(
  sourceId: string,
  targetId: string,
  polityMap: Map<string, RawRecord>,
): number | null {
  const src = polityMap.get(sourceId);
  const tgt = polityMap.get(targetId);
  if (!src || !tgt) return null;

  const cSrc = extractPolityCentroid(src);
  const cTgt = extractPolityCentroid(tgt);
  if (!cSrc || !cTgt) return null;

  return haversine(cSrc[0], cSrc[1], cTgt[0], cTgt[1]);
}

/**
 * Compute 'hops' basis cost for a relationship edge.
 *
 * Since every relationship edge is exactly one link (no waypoints), all edges
 * have the same raw hop count. To produce a visible spread of widths, the cost
 * is scaled by the inverse square root of the maximum degree of the two
 * endpoint polities: cost = 1 / sqrt(max(degA, degB, 1)).
 *
 * Rationale: highly-connected polities have "cheaper" (more common) ties;
 * peripheral polities have rarer, more distinctive connections — wider lines
 * surface those rare relationships. No data is invented; degrees come from the
 * real adjacency index.
 *
 * Returns null only when both endpoints are missing from the degree map (edge
 * has no real polity record). In practice this is the unknown-id fallback.
 *
 * @param sourceId  - Polity id for the edge source.
 * @param targetId  - Polity id for the edge target.
 * @param degreeMap - Pre-built Map<polityId, degree> from the adjacency index.
 * @returns Inverse-sqrt-degree cost, or null when both endpoints are unknown.
 */
export function relationshipHopCost(
  sourceId: string,
  targetId: string,
  degreeMap: Map<string, number>,
): number | null {
  const degA = degreeMap.get(sourceId);
  const degB = degreeMap.get(targetId);
  if (degA === undefined && degB === undefined) return null;
  const maxDeg = Math.max(degA ?? 1, degB ?? 1, 1);
  return 1 / Math.sqrt(maxDeg);
}

/**
 * Build a Map from edge id to RelationshipEdgeCost for all relationship edges
 * in the adjacency index.
 *
 * Called once per costBasis change in NetworkGraph — lightweight because the
 * adjacency index is already in memory.
 *
 * @param edges     - All ChartEdge objects from the built graph.
 * @param basis     - Which cost metric to use.
 * @param polityMap - Pre-built Map<polityId, RawRecord> for distance computation.
 * @param degreeMap - Pre-built Map<polityId, degree> for hops computation.
 * @returns Map<edgeId, RelationshipEdgeCost>.
 */
export function buildRelationshipCostMap(
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
  basis: CostBasis,
  polityMap: Map<string, RawRecord>,
  degreeMap: Map<string, number>,
): Map<string, RelationshipEdgeCost> {
  const result = new Map<string, RelationshipEdgeCost>();
  for (const edge of edges) {
    const cost =
      basis === 'distance'
        ? relationshipDistanceCost(edge.source, edge.target, polityMap)
        : relationshipHopCost(edge.source, edge.target, degreeMap);
    result.set(edge.id, { id: edge.id, cost });
  }
  return result;
}
