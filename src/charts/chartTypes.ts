/**
 * chartTypes.ts — shared primitive types for all charts in src/charts/.
 *
 * P4-A (NetworkGraph) defines the baseline. P4-B (lineage Gantt) will extend
 * ChartEdge and ChartNode with Gantt-specific fields as needed — keep this
 * file small and unopinionated about layout.
 *
 * Design contract: no colors here — colors come from vocab.ts helpers
 * (relationshipColor, regionColor) so they are always theme-correct.
 */

// ── Viewport ──────────────────────────────────────────────────────────────────

/**
 * Logical bounding box for a rendered chart, in SVG / canvas units.
 * Pan/zoom transforms operate on this box.
 */
export interface ChartViewport {
  /** Left edge in chart units. */
  x: number;
  /** Top edge in chart units. */
  y: number;
  /** Width in chart units. */
  width: number;
  /** Height in chart units. */
  height: number;
}

// ── Node ──────────────────────────────────────────────────────────────────────

/**
 * A chart node — maps to a polity in the network graph,
 * or a ruler/dynasty in a lineage Gantt (P4-B extends this).
 */
export interface ChartNode {
  /** Stable entity id (matches RawRecord.id). */
  id: string;
  /** Display name, truncated if necessary. */
  label: string;
  /**
   * Number of edges this node participates in (degree).
   * Used by NetworkGraph to scale node radius.
   */
  degree: number;
  /**
   * Current simulated X position (updated by force layout in-place,
   * immutable after layout stabilises for static renders).
   */
  x: number;
  /**
   * Current simulated Y position.
   */
  y: number;
  /**
   * Velocity in X direction — used by the force simulation; not rendered.
   * P4-B implementations that use a static layout can leave this at 0.
   */
  vx: number;
  /**
   * Velocity in Y direction — used by the force simulation.
   */
  vy: number;
}

// ── Edge ──────────────────────────────────────────────────────────────────────

/**
 * A chart edge — maps to a relationship record in the network graph.
 * P4-B (lineage) will add succession-specific fields as extension fields.
 */
export interface ChartEdge {
  /** Stable relationship id (matches RawRecord.id). */
  id: string;
  /** Id of the source node (first participant or from_id). */
  source: string;
  /** Id of the target node (second participant or to_id). */
  target: string;
  /**
   * Relationship type key (e.g. 'rivalry', 'alliance', 'succession').
   * Passed to relationshipColor(type, theme) for color resolution.
   */
  type: string;
  /** Year the relationship became active (inclusive). */
  since: number;
  /**
   * Year the relationship ended (inclusive), or null if still ongoing
   * at the end of the dataset window (1500 CE).
   */
  until: number | null;
  /** True when the relationship is directed (from source → target). */
  directed: boolean;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

/**
 * The complete graph data structure consumed by NetworkGraph.
 * Derived from the adjacency index + polity records at component mount time.
 */
export interface ChartGraph {
  nodes: ChartNode[];
  edges: ChartEdge[];
  /**
   * Polity id → ChartNode lookup, keyed for O(1) access during
   * edge drawing and hover detection.
   */
  nodeMap: Map<string, ChartNode>;
}

// ── Adjacency index entry ─────────────────────────────────────────────────────

/**
 * Shape of one entry in public/index/adjacency.json.
 * The index is keyed by entity id; each value is an array of these.
 */
export interface AdjacencyEntry {
  /** Id of the adjacent entity. */
  to: string;
  /** Relationship type key. */
  type: string;
  /** Year the relationship began. */
  since: number;
  /** Year the relationship ended, or undefined/null for ongoing. */
  until?: number | null;
  /** Whether the edge is directed (source → to). */
  directed?: boolean;
  /** Relationship record id — present when baked with full metadata. */
  relId?: string;
}

/** The full adjacency index: entity id → adjacency entries. */
export type AdjacencyIndex = Record<string, AdjacencyEntry[]>;
