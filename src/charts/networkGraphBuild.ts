/**
 * networkGraphBuild.ts — pure graph-construction for NetworkGraph (extracted to
 * keep NetworkGraph.tsx under the 800-line cap).
 *
 * buildGraph() turns the adjacency index + polity records into a ChartGraph
 * (nodes + de-duplicated edges) ready for the force simulation. Pure — no React,
 * no component state. SVG_W/SVG_H define the graph's coordinate space and are
 * shared with the renderer (imported back by NetworkGraph).
 */
import type { RawRecord } from '@/data/loaders';
import { seedPositions } from './forceLayout';
import type {
  ChartGraph,
  ChartNode,
  ChartEdge,
  AdjacencyIndex,
} from './chartTypes';

/** Force-layout coordinate space (SVG viewBox is `0 0 SVG_W SVG_H`). */
export const SVG_W = 960;
export const SVG_H = 720;

/**
 * Build a ChartGraph from the adjacency index + polity records.
 *
 * De-duplicates edges (the adjacency index stores both directions for
 * undirected edges). Surfaces unknown polity id references as a warning
 * list rather than silently dropping them.
 *
 * @param adj      - The full adjacency index from adjacency.json.
 * @param polities - Real polity records from loadRecords('polity').
 * @returns        - { graph, unknownIds } — graph is ready for simulation.
 */
export function buildGraph(
  adj: AdjacencyIndex,
  polities: RawRecord[],
): { graph: ChartGraph; unknownIds: string[] } {
  // Build polity id → record lookup
  const polityMap = new Map<string, RawRecord>(polities.map((p) => [p.id, p]));

  // Degree count: traverse adjacency to count per-node degree
  const degreeMap = new Map<string, number>();
  for (const [src, entries] of Object.entries(adj)) {
    for (const entry of entries) {
      degreeMap.set(src,       (degreeMap.get(src)       ?? 0) + 1);
      degreeMap.set(entry.to,  (degreeMap.get(entry.to)  ?? 0) + 1);
    }
  }

  // Track unknown ids
  const unknownIds: string[] = [];

  // Build node list — one node per unique polity id that appears in the adj
  const seenPolityIds = new Set<string>(Object.keys(adj));
  for (const entries of Object.values(adj)) {
    for (const e of entries) seenPolityIds.add(e.to);
  }

  const nodes: ChartNode[] = [];
  for (const pid of seenPolityIds) {
    const record = polityMap.get(pid);
    if (!record) {
      unknownIds.push(pid);
      // Still add a node — real data, real warning
      nodes.push({
        id:     pid,
        label:  `[${pid}]`,
        degree: degreeMap.get(pid) ?? 0,
        x: SVG_W / 2,
        y: SVG_H / 2,
        vx: 0,
        vy: 0,
      });
    } else {
      nodes.push({
        id:     pid,
        label:  typeof record.name === 'string' ? record.name : pid,
        degree: degreeMap.get(pid) ?? 0,
        x: SVG_W / 2,
        y: SVG_H / 2,
        vx: 0,
        vy: 0,
      });
    }
  }

  // Build edge list — de-duplicate undirected edges
  const seenEdges = new Set<string>();
  const edges: ChartEdge[] = [];

  for (const [src, entries] of Object.entries(adj)) {
    for (const entry of entries) {
      // Canonical key: alphabetically sorted pair + type + since
      const [a, b] = [src, entry.to].sort();
      const key = `${a}|${b}|${entry.type}|${entry.since ?? 0}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      edges.push({
        id:       entry.relId ?? key,
        source:   src,
        target:   entry.to,
        type:     entry.type,
        since:    typeof entry.since === 'number' ? entry.since : 500,
        until:    entry.until ?? null,
        directed: entry.directed ?? false,
      });
    }
  }

  const nodeMap = new Map<string, ChartNode>(nodes.map((n) => [n.id, n]));

  // Seed circular initial positions
  seedPositions(nodes, SVG_W, SVG_H);

  const graph: ChartGraph = { nodes, edges, nodeMap };
  return { graph, unknownIds };
}
