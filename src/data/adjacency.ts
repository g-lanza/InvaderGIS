import { assetUrl } from '@/data/assetUrl';
/**
 * src/data/adjacency.ts — relationship adjacency loader + similarity ranking.
 *
 * The baker already emits public/index/adjacency.json — a map of entity id →
 * its relationship edges, built from data/records/relationship.json (both
 * directions). Until now no UI consumed it. This module:
 *   1. fetches + caches it once (loadAdjacency / getAdjacency),
 *   2. exposes the direct neighbors of a record (relatedFor), and
 *   3. ranks OTHER entities by how similar their relationship profile is to a
 *      given entity (similarTo) — "find similar" using shared neighbors +
 *      shared relationship-type mix. Pure, deterministic, testable.
 *
 * REALNESS LAW: every edge is a real baked relationship; nothing is fabricated.
 */

/** One adjacency edge: a neighbor id, the relationship type, and start year. */
export interface AdjEdge {
  /** The neighbor entity id. */
  to: string;
  /** Relationship type (e.g. "alliance", "vassalage"). */
  type: string;
  /** Start year, or null when unknown. */
  since: number | null;
}

/** id → its relationship edges. */
export type AdjacencyMap = Record<string, AdjEdge[]>;

// ── Cache ───────────────────────────────────────────────────────────────────

let _cache: AdjacencyMap | null = null;
let _inflight: Promise<AdjacencyMap> | null = null;

/**
 * Fetch the baked adjacency map once and cache it. Concurrent callers share the
 * in-flight promise. Throws with a clear message if the bake artifact is absent.
 */
export async function loadAdjacency(): Promise<AdjacencyMap> {
  if (_cache !== null) return _cache;
  if (_inflight !== null) return _inflight;

  _inflight = (async () => {
    const res = await fetch(assetUrl('/index/adjacency.json'));
    if (!res.ok) {
      throw new Error(
        `[adjacency] Failed to fetch /index/adjacency.json: HTTP ${res.status}. ` +
        `Run \`npm run bake\` to generate it.`,
      );
    }
    const map = (await res.json()) as AdjacencyMap;
    _cache = map;
    _inflight = null;
    return map;
  })();

  return _inflight;
}

/** Synchronous accessor — returns the cached map, or null if not loaded yet. */
export function getAdjacency(): AdjacencyMap | null {
  return _cache;
}

/** Test-only: inject a map (and bypass fetch). */
export function __setAdjacencyForTest(map: AdjacencyMap | null): void {
  _cache = map;
  _inflight = null;
}

// ── Direct neighbors ────────────────────────────────────────────────────────

/** A neighbor with its relationship type(s), de-duplicated by id. */
export interface RelatedNeighbor {
  id: string;
  /** Distinct relationship types connecting the focus entity to this neighbor. */
  types: string[];
  /** Earliest known start year across the shared edges, or null. */
  since: number | null;
}

/**
 * Direct neighbors of `id`, de-duplicated (a pair may share several edges of
 * different types). Ordered by edge count desc, then id, for stable display.
 */
export function relatedFor(map: AdjacencyMap, id: string): RelatedNeighbor[] {
  const edges = map[id] ?? [];
  const byNeighbor = new Map<string, { types: Set<string>; since: number | null }>();
  for (const e of edges) {
    const cur = byNeighbor.get(e.to);
    if (cur) {
      cur.types.add(e.type);
      if (e.since !== null && (cur.since === null || e.since < cur.since)) cur.since = e.since;
    } else {
      byNeighbor.set(e.to, { types: new Set([e.type]), since: e.since });
    }
  }
  return [...byNeighbor.entries()]
    .map(([nid, v]) => ({ id: nid, types: [...v.types].sort(), since: v.since }))
    .sort((a, b) => b.types.length - a.types.length || a.id.localeCompare(b.id));
}

// ── Similarity ranking ──────────────────────────────────────────────────────

/** A similarity result: another entity scored against the focus entity. */
export interface SimilarEntity {
  id: string;
  /** Combined similarity score (higher = more similar). */
  score: number;
  /** Neighbors both entities share (the strongest similarity signal). */
  sharedNeighbors: string[];
}

/** The set of neighbor ids for an entity. */
function neighborSet(map: AdjacencyMap, id: string): Set<string> {
  const s = new Set<string>();
  for (const e of map[id] ?? []) s.add(e.to);
  return s;
}

/** Count of each relationship type for an entity (its "type profile"). */
function typeProfile(map: AdjacencyMap, id: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of map[id] ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1);
  return m;
}

/** Cosine similarity of two type-count profiles (0..1). */
function profileCosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [t, av] of a) dot += av * (b.get(t) ?? 0);
  const mag = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  const denom = mag(a) * mag(b);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Rank other entities by similarity to `id`, combining:
 *   - SHARED NEIGHBORS (Jaccard of neighbor sets) — the dominant signal, weighted
 *     3×: entities tied to the same partners are structurally alike.
 *   - TYPE-PROFILE COSINE — entities with a similar mix of relationship types.
 *
 * Excludes the focus entity itself and its own direct neighbors (those are
 * already surfaced as "related", not "similar"). Returns the top `limit`,
 * score-descending then id, with zero-score entities omitted.
 */
export function similarTo(map: AdjacencyMap, id: string, limit = 6): SimilarEntity[] {
  const focusNeighbors = neighborSet(map, id);
  if (focusNeighbors.size === 0) return [];
  const focusProfile = typeProfile(map, id);

  const results: SimilarEntity[] = [];
  for (const other of Object.keys(map)) {
    if (other === id || focusNeighbors.has(other)) continue;
    const otherNeighbors = neighborSet(map, other);

    // Jaccard of neighbor sets.
    let intersection = 0;
    const shared: string[] = [];
    for (const n of focusNeighbors) {
      if (otherNeighbors.has(n)) {
        intersection++;
        shared.push(n);
      }
    }
    if (intersection === 0) continue; // no shared structure → not "similar"
    const union = focusNeighbors.size + otherNeighbors.size - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;

    const cosine = profileCosine(focusProfile, typeProfile(map, other));
    const score = jaccard * 3 + cosine;

    results.push({ id: other, score, sharedNeighbors: shared.sort() });
  }

  return results
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
