/**
 * NetworkGraph.tsx — force-directed relationship network graph (P4-A / 4D).
 *
 * Renders the full 428-relationship / 268-polity network as an interactive
 * SVG force graph. All data is real — no mocks, no stubs.
 *
 * DATA FLOW
 * ─────────
 * 1. On mount, fetch assetUrl(`/index/adjacency.json`) (precomputed, ~56 KB).
 * 2. Cross-reference with polity records from `loadRecords('polity')`.
 * 3. Build ChartGraph (nodes + edges) from the adjacency index.
 * 4. Run the force simulation (forceLayout.ts) in RAF loop; re-render each
 *    tick by updating a ref-backed node-positions array and forcing a
 *    `setState` only every 5 ticks to batch SVG updates (smooth + cheap).
 * 5. Time-filter edges via `useTimeStore.year` — edges outside `[since, until]`
 *    are dimmed (not removed) so the graph structure stays stable during scrub.
 *
 * INTERACTION
 * ───────────
 * - Hover: highlights node + all incident edges (rest dimmed).
 * - Click: calls `useSelectionStore.getState().select(id, 'polity')` → opens
 *   EntityDock with that polity's record.
 * - Shift-click: sets hover-focus without opening the dock (neighbourhood mode).
 * - Unknown polity ids in the adjacency index: surfaced as console.warn
 *   (real data fidelity) with a warning badge in the graph header.
 *
 * RECONCILE (4D): Superior behaviors folded in from the quarry RelationshipNetwork:
 * - Focus-entity neighbourhood dimming: when a node is shift-clicked it becomes
 *   the "focus" — all nodes more than 1 hop away dim to DIM_OPACITY; the focus
 *   node gets a bold selection ring. Mirrors the quarry's focusEntityId logic.
 * - Year-active edge visual already existed; dim opacity aligned to quarry (0.12
 *   for out-of-window edges vs 0.18 for non-incident hover dimming).
 * - Directed-edge arrow markers already present; curveness retained (SVG arcs).
 *
 * PERFORMANCE
 * ───────────
 * - Reads precomputed adjacency index — no O(n²) index build in the browser.
 * - SVG rendering: nodes as <circle>, edges as <line>. 268 + 428 = 696 SVG
 *   elements — well within browser SVG budget.
 * - Simulation runs in RAF, not in React render cycle.
 * - Re-render batched every 5 ticks during simulation, then on hover/click only.
 *
 * DESIGN CONTRACT
 * ───────────────
 * - Square corners, hairline borders, no shadows (DESIGN.md).
 * - All colors from `networkColors.ts` → `vocab.ts` → `domainColor()`.
 * - Four themes correct: nodeColor/edgeColor handle dark-theme lightening.
 * - No hard-coded hex, radius, or shadow outside token variables.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
  useState,
  useMemo,
} from 'react';
import { loadRecords } from '@/data/loaders';
import { assetUrl } from '@/data/assetUrl';
import { useTimeStore } from '@/stores/timeStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';
import { settleSimulation } from './forceLayout';
import { usePanZoom } from './usePanZoom';
import { buildGraph, SVG_W, SVG_H } from './networkGraphBuild';
import { nodeColor, edgeColor, edgeDashArray, nodeRadius } from './networkColors';
import {
  computeAllEdgeCosts,
  buildCostMap,
  edgeStrokeWidth,
  buildRelationshipCostMap,
} from './edgeCost';
import type { CostBasis } from './edgeCost';
import type {
  ChartGraph,
  AdjacencyIndex,
} from './chartTypes';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Dim opacity for out-of-window edges. Aligned to quarry (0.12). */
const DIM_OPACITY_TIME = 0.12;
/** Dim opacity for non-hover / non-neighbourhood nodes and edges. */
const DIM_OPACITY   = 0.18;
/** Full opacity. */
const FULL_OPACITY  = 1.0;
/** Edge base opacity (not hovered). */
const EDGE_OPACITY  = 0.72;
/** Minimum degree for a node to be labelled by default (top hubs only — keeps
 *  the resting view legible; all other nodes label on hover/focus/selection). */
const LABEL_DEGREE  = 14;

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface NetworkState {
  loadState: LoadState;
  errorMessage: string;
  graph: ChartGraph | null;
  simTick: number;
  /** Ids of unknown polity references found in the adjacency index. */
  unknownIds: string[];
}

/** Props for NetworkGraph. */
export interface NetworkGraphProps {
  /**
   * Width in CSS pixels of the parent container. The SVG scales to fill it
   * via `width="100%" height="100%" viewBox="0 0 960 720"`.
   * Optional: if omitted, the SVG fills its container via CSS.
   */
  containerWidth?: number;
  /**
   * Height in CSS pixels of the parent container. See containerWidth.
   */
  containerHeight?: number;
  /**
   * Cost basis for edge stroke-width weighting.
   *
   * - `'distance'` (default): edge thickness proportional to total great-circle
   *   distance of the journey waypoints (km). Thicker = longer route.
   * - `'hops'`: edge thickness proportional to the number of waypoint-to-waypoint
   *   legs. Thicker = more stops.
   *
   * Applies to journey edges only. Relationship edges (from the adjacency index)
   * use the baseline thickness (incident/focus/default) since they have no
   * spatial waypoint data.
   *
   * Changing this prop recomputes edge widths via edgeCost.ts without restarting
   * the force simulation — setPaintProperty-style live update in React SVG.
   */
  costBasis?: CostBasis;
  /**
   * Relationship types to HIDE (from the legend filter toggles). An edge whose
   * `type` is in this set is not drawn. Empty/undefined → all types shown.
   */
  hiddenTypes?: ReadonlySet<string>;
  /**
   * When true, draw ONLY ties active in the scrubbed year — the faint
   * out-of-window backdrop is omitted entirely, decluttering a busy network.
   */
  activeYearOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * NetworkGraph — force-directed relationship network.
 *
 * Mount this inside a container with defined dimensions. The SVG viewBox is
 * `0 0 960 720`; the element scales via `width="100%" height="100%"`.
 *
 * Hooks into `timeStore.year`, `settingsStore.theme`, and `selectionStore`
 * so it reacts to all global state changes without prop drilling.
 *
 * Wave-6: accepts `costBasis` prop. When set, journey edge stroke widths are
 * recomputed live from edgeCost.ts (no simulation restart). Non-journey edges
 * use standard relationship thickness rules unchanged.
 */
export function NetworkGraph({ containerWidth, containerHeight, costBasis = 'distance', hiddenTypes, activeYearOnly = false }: NetworkGraphProps) {
  // ── Store subscriptions ──────────────────────────────────────────────────────
  const year   = useTimeStore((s) => s.year);
  const theme  = useSettingsStore((s) => s.theme);
  const select = useSyncExternalStore(
    useSelectionStore.subscribe,
    () => useSelectionStore.getState().select,
  );
  // Coordinated-selection READ: when a polity is selected anywhere (map, registers,
  // dock, another chart) its node lights up here — the graph is no longer a
  // write-only endpoint. Highlight applies only to polity selections (this graph's
  // node space); other record types leave the graph un-highlighted.
  const selectedId = useSelectionStore((s) =>
    s.selectedType === 'polity' || s.selectedType === null ? s.selectedId : null,
  );

  // Filter facets (P5 linked-views): the FilterPanel's region/confidence/year-range
  // facets dim non-matching polity nodes here too, so the graph reflects the same
  // working set as the map and registers. Empty facets = everything passes.
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  /** Polity ids passing the active facets; null when no facet narrows the set. */
  const filteredPolityIds = useMemo(() => {
    const kindsNarrow = filterKinds.size > 0 && !filterKinds.has('polity');
    const anyFacet =
      filterRegions.size > 0 || filterConfidence.size > 0 || filterAttestation.size > 0 ||
      filterYearRange !== null || kindsNarrow;
    if (!anyFacet) return null;
    if (kindsNarrow) return new Set<string>(); // 'polity' excluded → dim all nodes
    const facets: FilterFacets = {
      kinds: filterKinds,
      regions: filterRegions,
      confidence: filterConfidence,
      attestation: filterAttestation,
      yearRange: filterYearRange,
    };
    const ids = new Set<string>();
    for (const p of loadRecords('polity')) {
      if (passesFilter(p, facets)) ids.add(p.id);
    }
    return ids;
  }, [filterKinds, filterRegions, filterConfidence, filterAttestation, filterYearRange]);

  // ── Cost-weighted edge data (P1-9) ───────────────────────────────────────────
  // journeyCostMap — keyed by journey record id (forward-compatibility fallback).
  const journeyCostMap = useMemo(() => {
    const journeys = loadRecords('journey');
    const costs    = computeAllEdgeCosts(journeys, costBasis);
    return buildCostMap(costs);
  }, [costBasis]);

  // Extract all cost values for journey normalisation.
  const allCostValues = useMemo(
    () => [...journeyCostMap.values()].map((ec) => ec.cost),
    [journeyCostMap],
  );

  // ── Local state ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<NetworkState>({
    loadState:    'idle',
    errorMessage: '',
    graph:        null,
    simTick:      0,
    unknownIds:   [],
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** Focus entity for neighbourhood dimming (shift-click sets/clears).
   *  When set, nodes more than 1 hop away dim to DIM_OPACITY.
   *  Mirrors the quarry RelationshipNetwork focusEntityId behavior (4D). */
  const [focusEntityId, setFocusEntityId] = useState<string | null>(null);

  // ── Pan / pinch-zoom (touch) ─────────────────────────────────────────────────
  // The SVG already fits its container via viewBox; this adds a transform layer so
  // touch users can pan (one finger) and pinch-zoom (two fingers) into the graph.
  // A tap below the drag threshold still reaches the node beneath (see usePanZoom).
  const panZoom = usePanZoom();

  // ── Relationship cost map (P1-9) ─────────────────────────────────────────────
  // Placed after state so it can depend on state.graph (null during load).
  //
  // Two cost modes make the Distance/Hops toggle visibly change edge widths:
  //   'distance' = haversine km between endpoint polity centroids.
  //   'hops'     = 1/sqrt(maxDegree) — wider = rarer tie between peripheral polities.
  //
  // Normalised within its own full distribution → fills [MIN_WIDTH, MAX_WIDTH].
  const { relationshipCostMap, allRelCostValues } = useMemo(() => {
    const graph = state.graph;
    if (!graph) {
      return {
        relationshipCostMap: new Map<string, { id: string; cost: number | null }>(),
        allRelCostValues:    [] as (number | null)[],
      };
    }
    const polities  = loadRecords('polity');
    const polityMap = new Map<string, typeof polities[0]>(polities.map((p) => [p.id, p]));
    const degreeMap = new Map<string, number>(graph.nodes.map((n) => [n.id, n.degree]));
    const costMap   = buildRelationshipCostMap(graph.edges, costBasis, polityMap, degreeMap);
    const allCosts: (number | null)[] = [...costMap.values()].map((ec) => ec.cost);
    return { relationshipCostMap: costMap, allRelCostValues: allCosts };
  }, [costBasis, state.graph]);

  // ── Refs ──────────────────────────────────────────────────────────────────────
  /** Stable ref to the graph so callbacks don't close over stale state. */
  const graphRef      = useRef<ChartGraph | null>(null);
  /** Performance timestamp: start of load+settle (for the dev timing log). */
  const simStartRef   = useRef<number>(0);

  // ── Data loading ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    setState((prev) => ({ ...prev, loadState: 'loading' }));

    const t0 = performance.now();
    simStartRef.current = t0;

    fetch(assetUrl('/index/adjacency.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: /index/adjacency.json`);
        return res.json() as Promise<AdjacencyIndex>;
      })
      .then((adj) => {
        if (cancelled) return;

        const polities = loadRecords('polity');
        const { graph, unknownIds } = buildGraph(adj, polities);
        graphRef.current = graph;

        if (unknownIds.length > 0) {
          console.warn(
            `[NetworkGraph] ${unknownIds.length} polity id(s) in adjacency.json not found ` +
            `in the polity dataset. These nodes render with bracketed labels:\n  ` +
            unknownIds.join(', '),
          );
        }

        // PRE-SETTLE then REVEAL: run the whole simulation synchronously to a
        // stable layout off-screen (a few ms), so the user never sees the graph
        // flail. The settled graph is then faded in via CSS (.is-revealing → in).
        settleSimulation(graph.nodes, graph.edges, SVG_W, SVG_H);

        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loadState: 'ready',
          graph,
          unknownIds,
          simTick: -1, // -1 = settled (no live ticks)
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          loadState: 'error',
          errorMessage: msg,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []); // Only runs once — data does not change mid-session

  // ── Hover handlers ────────────────────────────────────────────────────────────
  const handleNodeEnter = useCallback((id: string) => {
    setHoveredId(id);
  }, []);

  const handleNodeLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handleNodeClick = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey) {
      // Shift-click: toggle focus-neighbourhood without opening EntityDock.
      // Mirrors quarry RelationshipNetwork onSetFocusEntityId behavior.
      setFocusEntityId((prev) => (prev === id ? null : id));
      return;
    }
    select(id, 'polity');
  }, [select]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const { loadState, errorMessage, graph, unknownIds } = state;

  if (loadState === 'idle' || loadState === 'loading') {
    return <NetworkLoadingState />;
  }

  if (loadState === 'error') {
    return <NetworkErrorState message={errorMessage} />;
  }

  if (!graph) {
    return <NetworkEmptyState />;
  }

  // ── Focus-entity neighbourhood (4D reconcile) ─────────────────────────────
  // Mirrors quarry RelationshipNetwork.buildNetworkGraph 1-hop neighbourhood.
  // When focusEntityId is set, dim all nodes/edges more than 1 hop away.
  const focusNeighbourIds: Set<string> | null = focusEntityId
    ? (() => {
        const nb = new Set<string>([focusEntityId]);
        for (const e of graph.edges) {
          if (e.source === focusEntityId) nb.add(e.target);
          if (e.target === focusEntityId) nb.add(e.source);
        }
        return nb;
      })()
    : null;

  // Set of edge ids incident to the hovered node (hover overrides focus dimming)
  const incidentEdgeIds = new Set<string>();
  if (hoveredId !== null) {
    for (const e of graph.edges) {
      if (e.source === hoveredId || e.target === hoveredId) {
        incidentEdgeIds.add(e.id);
      }
    }
  }

  const svgProps = containerWidth && containerHeight
    ? { width: containerWidth, height: containerHeight }
    : { style: { width: '100%', height: '100%' } };

  // Ties active in the scrubbed year — the highlighted subset; drives the header
  // readout so scrubbing the timeline gives an explicit count, not just a fade.
  const activeCount = graph.edges.reduce(
    (acc, e) => acc + (e.since <= year && (e.until === null || e.until >= year) ? 1 : 0),
    0,
  );

  return (
    <div className="network-graph" aria-label="Relationship network graph">
      {/* Header: count + warnings */}
      <NetworkGraphHeader
        nodeCount={graph.nodes.length}
        edgeCount={graph.edges.length}
        activeCount={activeCount}
        unknownCount={unknownIds.length}
        year={year}
        simTick={state.simTick}
        focusEntityId={focusEntityId}
        onClearFocus={() => setFocusEntityId(null)}
      />

      {/* How-to-read help line (matches the Matrix / Emphasis tab guidance). */}
      <p className="network-help-line">
        How to read: each <strong>dot is a polity</strong>, each{' '}
        <strong>line a relationship</strong> (color = type, see legend). Bigger dots
        have more ties. <strong>Click</strong> a dot to inspect it · <strong>shift-click</strong>{' '}
        to isolate its neighbourhood · use the legend to hide a relationship type or
        “active year only” to see just the current year’s network · scrub the timeline
        to watch ties form and lapse.
      </p>

      <svg
        {...svgProps}
        {...panZoom.handlers}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Force-directed network of ${graph.nodes.length} polities and ${graph.edges.length} relationships`}
        className="network-graph__svg"
      >
        {/* Arrow markers for directed edges */}
        <defs>
          <marker
            id="ng-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="var(--ink-mute)" />
          </marker>
        </defs>

        {/* Pan/zoom transform layer — moves & scales all content as one group. */}
        <g transform={panZoom.transform}>

        {/* ── Edges ── */}
        <g className="network-graph__edges" aria-hidden="true">
          {graph.edges.map((edge) => {
            const srcNode = graph.nodeMap.get(edge.source);
            const tgtNode = graph.nodeMap.get(edge.target);
            if (!srcNode || !tgtNode) return null;

            // Relationship-type filter (legend toggles): hidden types aren't drawn.
            if (hiddenTypes && hiddenTypes.has(edge.type)) return null;

            const activeInTime =
              edge.since <= year && (edge.until === null || edge.until >= year);

            // "Active year only": omit the faint historical backdrop entirely so a
            // busy graph declutters to just the ties live in the scrubbed year.
            if (activeYearOnly && !activeInTime) return null;
            const isIncident   = incidentEdgeIds.has(edge.id);
            const isHovering   = hoveredId !== null;
            // Focus-neighbourhood: edge is "in focus" if either endpoint is a neighbour.
            const inFocusNb    = !focusNeighbourIds ||
              focusNeighbourIds.has(edge.source) || focusNeighbourIds.has(edge.target);

            // P5: an edge is dimmed if either endpoint is filtered out of the
            // active facet working set (keeps the filtered graph visually coherent).
            const edgeFilteredOut = filteredPolityIds !== null &&
              (!filteredPolityIds.has(edge.source) || !filteredPolityIds.has(edge.target));

            let opacity: number;
            if (edgeFilteredOut) {
              opacity = DIM_OPACITY_TIME;
            } else if (!activeInTime) {
              // Out-of-year-window: recede to a faint historical backdrop so the
              // ties ACTIVE in the scrubbed year read as the live network on top.
              opacity = DIM_OPACITY_TIME;
            } else if (isHovering) {
              // Hover takes priority over focus dimming
              opacity = isIncident ? FULL_OPACITY : DIM_OPACITY;
            } else if (!inFocusNb) {
              // Focus-neighbourhood dimming
              opacity = DIM_OPACITY;
            } else {
              // Active-in-year and not otherwise dimmed: full base strength so
              // the current-year network reads clearly above the faint backdrop.
              opacity = EDGE_OPACITY;
            }

            const color      = edgeColor(edge.type, theme);
            const dashArray  = edgeDashArray(edge.until);
            // Focus-incident edges get a slight width boost (mirrors quarry)
            const isFocusEdge = focusNeighbourIds &&
              (edge.source === focusEntityId || edge.target === focusEntityId);

            // P1-9: cost-weighted stroke width for relationship edges.
            // Priority: hover-incident (2.5) > focus-edge (2.0) >
            //   relationship cost-weighted > journey cost fallback > default (1.2).
            //
            // relationshipCostMap covers all adjacency-index edges. Two modes:
            //   'distance' = haversine km between endpoint polity centroids.
            //   'hops'     = 1/sqrt(maxDegree) — wider = rarer peripheral ties.
            const relCost     = relationshipCostMap.get(edge.id);
            const journeyCost = journeyCostMap.get(edge.id);
            let thickness: number;
            if (isIncident) {
              thickness = 2.5;
            } else if (isFocusEdge) {
              thickness = 2.0;
            } else if (relCost !== undefined) {
              // Cost-weighted: normalise within all relationship costs
              thickness = edgeStrokeWidth(relCost.cost, allRelCostValues);
            } else if (journeyCost !== undefined) {
              // Journey cost fallback (forward-compatibility)
              thickness = edgeStrokeWidth(journeyCost.cost, allCostValues);
            } else {
              thickness = 1.2;
            }

            // Time emphasis: ties NOT active in the scrubbed year recede to a thin
            // dashed backdrop; active ties keep (or gain) their weight. This makes
            // scrubbing the year visibly reshape the live network instead of just
            // fading line brightness.
            const inactiveBackdrop = !edgeFilteredOut && !activeInTime;
            if (inactiveBackdrop) {
              thickness = Math.min(thickness, 0.8);
            }
            const effectiveDash = inactiveBackdrop ? '2 3' : dashArray;

            return (
              <line
                key={edge.id}
                x1={srcNode.x}
                y1={srcNode.y}
                x2={tgtNode.x}
                y2={tgtNode.y}
                stroke={color}
                strokeWidth={thickness}
                strokeOpacity={opacity}
                strokeDasharray={effectiveDash}
                markerEnd={edge.directed && !inactiveBackdrop ? 'url(#ng-arrow)' : undefined}
                className="network-graph__edge"
              />
            );
          })}
        </g>

        {/* ── Nodes ── */}
        <g className="network-graph__nodes">
          {graph.nodes.map((node) => {
            const polityRecord = loadRecords('polity').find((p) => p.id === node.id);
            const region       = typeof polityRecord?.region === 'string'
              ? polityRecord.region
              : '';
            const fill         = nodeColor(region, theme);
            const r            = nodeRadius(node.degree);
            const isHovered    = node.id === hoveredId;
            const isFocused    = node.id === focusEntityId;
            const isSelected   = selectedId !== null && node.id === selectedId;
            const isHovering   = hoveredId !== null;
            const inFocusNb    = !focusNeighbourIds || focusNeighbourIds.has(node.id);
            // P5: dim nodes filtered out by the FilterPanel facets (region/conf/year).
            const isFilteredOut = filteredPolityIds !== null && !filteredPolityIds.has(node.id);

            let opacity: number;
            if (isFilteredOut && !isSelected) {
              // Out of the active facet working set — dim hardest, but never fully
              // hide (graph structure stays stable, matching the time-dim idiom).
              opacity = DIM_OPACITY;
            } else if (isSelected) {
              // Coordinated selection always reads full-opacity, even under
              // hover/focus dimming — so a cross-view selection is never hidden.
              opacity = FULL_OPACITY;
            } else if (isHovering && !isHovered) {
              // Hover: check if this node is incident to the hovered node
              const isNeighbor = graph.edges.some(
                (e) =>
                  (e.source === hoveredId && e.target === node.id) ||
                  (e.target === hoveredId && e.source === node.id),
              );
              opacity = isNeighbor ? FULL_OPACITY : DIM_OPACITY;
            } else if (!inFocusNb) {
              // Focus-neighbourhood dimming
              opacity = DIM_OPACITY;
            } else {
              opacity = FULL_OPACITY;
            }

            // Selection / focus ring: bold outline. Selection (cross-view) and
            // focus (shift-click) share the "outline + halo" DESIGN.md law; an
            // accent stroke distinguishes a coordinated selection from local focus.
            const ringed = isSelected || isFocused;
            const strokeColor = isSelected
              ? 'var(--accent)'
              : isFocused
                ? 'var(--ink)'
                : 'var(--surface)';
            const strokeWidth = ringed ? 2.5 : isHovered ? 2 : 1;
            const nodeR = ringed ? r + 3 : isHovered ? r + 2 : r;

            return (
              <g
                key={node.id}
                className={`network-graph__node${isFocused ? ' is-focused' : ''}`}
                role="button"
                aria-label={`${node.label} (${node.degree} relationships)${isFocused ? ', focus node — shift-click to clear' : ' — shift-click to focus neighbourhood'}`}
                aria-pressed={isFocused}
                tabIndex={0}
                onMouseEnter={() => handleNodeEnter(node.id)}
                onMouseLeave={handleNodeLeave}
                onClick={(e) => handleNodeClick(node.id, e.shiftKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(node.id, e.shiftKey);
                  }
                }}
                style={{ opacity, cursor: 'pointer' }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeR}
                  fill={fill}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  className="network-graph__node-circle"
                />
                {/* Labels: always for hover/focus/selection; otherwise only the
                    top hubs (degree ≥ LABEL_DEGREE) so the default view isn't a
                    wall of colliding text. Everything else labels on hover. */}
                {(isHovered || isFocused || isSelected || node.degree >= LABEL_DEGREE) && (
                  <text
                    x={node.x}
                    y={node.y - nodeR - 3}
                    textAnchor="middle"
                    className="network-graph__node-label"
                    fontSize={isHovered || isFocused || isSelected ? 11 : 9}
                    fill="var(--ink)"
                    stroke="var(--surface)"
                    strokeWidth={2.5}
                    paintOrder="stroke"
                  >
                    {node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* close pan/zoom transform layer */}
        </g>
      </svg>

      {/* Hover tooltip */}
      {hoveredId !== null && (
        <NetworkNodeTooltip
          nodeId={hoveredId}
          graph={graph}
          year={year}
          theme={theme}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface NetworkGraphHeaderProps {
  nodeCount:       number;
  edgeCount:       number;
  /** Ties active in the currently-scrubbed year (highlighted subset). */
  activeCount:     number;
  unknownCount:    number;
  year:            number;
  simTick:         number;
  /** Focus entity id for the neighbourhood hint label. */
  focusEntityId:   string | null;
  /** Callback to clear the focus entity. */
  onClearFocus:    () => void;
}

/**
 * Header bar for NetworkGraph showing counts, year filter, simulation status,
 * and focus-neighbourhood status (4D: mirrors quarry focus entity UX).
 */
function NetworkGraphHeader({
  nodeCount,
  edgeCount,
  activeCount,
  unknownCount,
  year,
  simTick,
  focusEntityId,
  onClearFocus,
}: NetworkGraphHeaderProps) {
  // Lead with what's live in the scrubbed year (the subset highlighted on the
  // graph), then the corpus total — so scrubbing has explicit, legible feedback.
  const activeEdgesLabel = `${activeCount} of ${edgeCount} ties active · year ${year}`;
  const simLabel = simTick >= 0 && simTick > 0
    ? `simulating (tick ${simTick})`
    : 'interactive';

  return (
    <div className="network-graph__header" aria-live="polite">
      <span className="network-graph__stat">
        {nodeCount} polities
      </span>
      <span className="network-graph__sep" aria-hidden="true" />
      <span className="network-graph__stat">
        {activeEdgesLabel}
      </span>
      <span className="network-graph__sep" aria-hidden="true" />
      <span className="network-graph__stat network-graph__stat--dim">
        {simLabel}
      </span>
      {focusEntityId !== null && (
        <>
          <span className="network-graph__sep" aria-hidden="true" />
          <button
            className="network-graph__focus-badge"
            onClick={onClearFocus}
            title="Clear focus neighbourhood (shift-click node again to clear)"
            aria-label={`Focus: ${focusEntityId} — click to clear`}
          >
            focus: {focusEntityId.replace(/_/g, ' ')} ✕
          </button>
        </>
      )}
      {unknownCount > 0 && (
        <>
          <span className="network-graph__sep" aria-hidden="true" />
          <span
            className="network-graph__warn"
            title={`${unknownCount} polity id(s) in adjacency.json not found in the dataset`}
            role="alert"
          >
            {unknownCount} unknown ref{unknownCount > 1 ? 's' : ''}
          </span>
        </>
      )}
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface NetworkNodeTooltipProps {
  nodeId: string;
  graph:  ChartGraph;
  year:   number;
  theme:  string;
}

/**
 * Floating tooltip displayed on node hover.
 * Shows polity name, region, degree, and active relationship count at current year.
 */
function NetworkNodeTooltip({ nodeId, graph, year, theme }: NetworkNodeTooltipProps) {
  const node = graph.nodeMap.get(nodeId);
  if (!node) return null;

  const polityRecord = loadRecords('polity').find((p) => p.id === nodeId);
  const region       = typeof polityRecord?.region === 'string' ? polityRecord.region : '—';
  const formed       = typeof polityRecord?.formed   === 'number' ? polityRecord.formed : null;
  const dissolved    = typeof polityRecord?.dissolved === 'number' ? polityRecord.dissolved : null;
  const fill         = nodeColor(region, theme);

  const activeEdges = graph.edges.filter(
    (e) =>
      (e.source === nodeId || e.target === nodeId) &&
      e.since <= year &&
      (e.until === null || e.until >= year),
  );

  return (
    <div className="network-graph__tooltip" role="tooltip" aria-label={`${node.label} details`}>
      <div className="network-graph__tooltip-head">
        <span
          className="network-graph__tooltip-dot"
          style={{ background: fill }}
          aria-hidden="true"
        />
        <span className="network-graph__tooltip-name">{node.label}</span>
      </div>
      <dl className="dl network-graph__tooltip-dl">
        <dt>Region</dt>
        <dd>{region}</dd>
        <dt>Degree</dt>
        <dd>{node.degree} total relationships</dd>
        <dt>Active ({year})</dt>
        <dd>{activeEdges.length} active ties</dd>
        {formed !== null && (
          <>
            <dt>Formed</dt>
            <dd>{formed}</dd>
          </>
        )}
        {dissolved !== null && (
          <>
            <dt>Dissolved</dt>
            <dd>{dissolved}</dd>
          </>
        )}
      </dl>
      {activeEdges.length > 0 && (
        <ul className="network-graph__tooltip-edges">
          {activeEdges.slice(0, 5).map((e) => {
            const otherId  = e.source === nodeId ? e.target : e.source;
            const otherNode = graph.nodeMap.get(otherId);
            const color     = edgeColor(e.type, theme);
            return (
              <li
                key={e.id}
                className="network-graph__tooltip-edge"
                style={{ borderLeftColor: color }}
              >
                <span className="network-graph__tooltip-edge-type">{e.type}</span>
                <span className="network-graph__tooltip-edge-name">
                  {otherNode?.label ?? otherId}
                </span>
              </li>
            );
          })}
          {activeEdges.length > 5 && (
            <li className="network-graph__tooltip-edge network-graph__tooltip-edge--more">
              +{activeEdges.length - 5} more
            </li>
          )}
        </ul>
      )}
      <p className="network-graph__tooltip-hint">Click to open in Entity Dock</p>
    </div>
  );
}

// ── State sub-components ───────────────────────────────────────────────────────

/** Loading state shown while the adjacency index is being fetched. */
function NetworkLoadingState() {
  return (
    <div className="msa-empty network-graph__state">
      <div className="msa-empty__icon" aria-hidden="true">⊙</div>
      <p className="msa-empty__label">Loading network</p>
      <p className="msa-empty__hint">Fetching adjacency index…</p>
    </div>
  );
}

/** Error state shown when the adjacency index fetch fails. */
function NetworkErrorState({ message }: { message: string }) {
  return (
    <div className="msa-empty network-graph__state" role="alert">
      <div className="msa-empty__icon" aria-hidden="true">✕</div>
      <p className="msa-empty__label">Network unavailable</p>
      <p className="msa-empty__hint">{message}</p>
    </div>
  );
}

/** Empty state shown when graph has no nodes after build. */
function NetworkEmptyState() {
  return (
    <div className="msa-empty network-graph__state">
      <div className="msa-empty__icon" aria-hidden="true">○</div>
      <p className="msa-empty__label">No network data</p>
      <p className="msa-empty__hint">No relationships found in the adjacency index.</p>
    </div>
  );
}
