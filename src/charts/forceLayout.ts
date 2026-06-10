/**
 * forceLayout.ts — hand-rolled force-directed layout for NetworkGraph.
 *
 * Implements a velocity-Verlet integration loop with three forces:
 *   1. Repulsion — all-pairs charge repulsion, O(n²) but fast for n ≤ 300
 *      because we use a simple cutoff and fixed-step integration.
 *   2. Spring attraction — edges pull connected nodes together.
 *   3. Centering — soft center-of-mass pull to prevent graph drift.
 *
 * Performance target: 268 nodes + 428 edges interactive in < 500 ms warm-up.
 * Measured: ~260 ms for 150 ticks at 60 Hz on a mid-range laptop (reported
 * in the P4-A completion report). The simulation runs off the React render
 * cycle via requestAnimationFrame so it never blocks the main thread per tick.
 *
 * Why not d3-force? d3-force is not in package.json and adding a ~45 KB dep
 * for a single graph (when we have full control) is heavier than the 120-line
 * custom loop below. The custom implementation is faster to tune and has no
 * sub-dependency risk.
 *
 * No external deps — pure TypeScript.
 */

import type { ChartNode, ChartEdge } from './chartTypes';

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Charge repulsion strength. Higher = nodes push apart more. */
const REPULSION     = 2_800;
/** Maximum distance at which repulsion acts (cutoff for performance). */
const REPULSION_MAX = 340;
/** Spring rest length (preferred edge length in SVG units). */
const SPRING_LEN    = 90;
/** Spring stiffness (fraction of displacement corrected per tick). */
const SPRING_K      = 0.04;
/** Centering force fraction (pulls every node toward the canvas center). */
const CENTER_K      = 0.008;
/** Velocity damping factor per tick (0 = full stop, 1 = no damping). */
const DAMPING       = 0.78;
/** Number of ticks before the simulation freezes (prevents drift). */
const MAX_TICKS     = 180;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Options passed to `runForceSimulation`.
 */
export interface ForceSimulationOptions {
  /** Mutable array of nodes — positions updated in-place. */
  nodes: ChartNode[];
  /** Edges providing spring constraints. */
  edges: ChartEdge[];
  /** Width of the layout canvas in SVG units. */
  width: number;
  /** Height of the layout canvas in SVG units. */
  height: number;
  /** Called each tick with the current tick index; return false to abort. */
  onTick?: (tick: number, nodes: ChartNode[]) => boolean | void;
  /** Called once when simulation stabilises (MAX_TICKS or convergence). */
  onDone?: (nodes: ChartNode[]) => void;
}

/**
 * Start a force-directed simulation on the given node/edge arrays.
 *
 * Nodes are positioned in-place; their `x`, `y`, `vx`, `vy` fields are
 * mutated each tick. The simulation runs via `requestAnimationFrame` so it
 * never blocks the render thread for more than one tick at a time.
 *
 * Returns a `stop` function that aborts the simulation when called.
 *
 * @param options - Simulation configuration.
 * @returns A function that stops the simulation loop when invoked.
 */
export function runForceSimulation(options: ForceSimulationOptions): () => void {
  const { nodes, edges, width, height, onTick, onDone } = options;
  const cx = width / 2;
  const cy = height / 2;

  let tick     = 0;
  let rafId    = 0;
  let stopped  = false;

  // Build edge adjacency as parallel arrays for fast iteration
  const srcIdx: number[] = [];
  const tgtIdx: number[] = [];
  const nodeIndex = new Map<string, number>(nodes.map((n, i) => [n.id, i]));

  for (const e of edges) {
    const si = nodeIndex.get(e.source);
    const ti = nodeIndex.get(e.target);
    if (si !== undefined && ti !== undefined) {
      srcIdx.push(si);
      tgtIdx.push(ti);
    }
  }

  function step() {
    if (stopped || tick >= MAX_TICKS) {
      onDone?.(nodes);
      return;
    }

    const n = nodes.length;

    // ── 1. Repulsion (all-pairs, O(n²), fast for n ≤ 300) ────────────────────
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b  = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.01; // add epsilon to avoid div/0
        const d  = Math.sqrt(d2);
        if (d > REPULSION_MAX) continue;      // cutoff

        const force = REPULSION / d2;
        const fx    = (dx / d) * force;
        const fy    = (dy / d) * force;
        // a is pushed away from b, b away from a
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // ── 2. Spring attraction (per edge) ───────────────────────────────────────
    for (let k = 0; k < srcIdx.length; k++) {
      const a  = nodes[srcIdx[k]];
      const b  = nodes[tgtIdx[k]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const disp = d - SPRING_LEN;
      const fx   = (dx / d) * disp * SPRING_K;
      const fy   = (dy / d) * disp * SPRING_K;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // ── 3. Centering + integration + damping ─────────────────────────────────
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      // Center pull
      nd.vx += (cx - nd.x) * CENTER_K;
      nd.vy += (cy - nd.y) * CENTER_K;
      // Integrate
      nd.x  += nd.vx;
      nd.y  += nd.vy;
      // Damping
      nd.vx *= DAMPING;
      nd.vy *= DAMPING;
      // Clamp to canvas with a margin
      nd.x = Math.max(20, Math.min(width  - 20, nd.x));
      nd.y = Math.max(20, Math.min(height - 20, nd.y));
    }

    tick++;
    const cont = onTick?.(tick, nodes);
    if (cont === false) {
      onDone?.(nodes);
      return;
    }
    rafId = requestAnimationFrame(step);
  }

  rafId = requestAnimationFrame(step);

  return () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * Run the force simulation SYNCHRONOUSLY to a settled layout — no RAF, no
 * per-tick rendering. Used for the "pre-settle then reveal" startup so the user
 * never sees the graph flail: we compute the stable layout off-screen in one
 * tight loop (a few ms for n ≤ 300), then fade the finished graph in.
 *
 * Mutates node x/y/vx/vy in place. Stops early once the layout is quiet (total
 * kinetic energy below a threshold) or at `maxTicks`.
 *
 * @param nodes  - Nodes to position (mutated in place).
 * @param edges  - Edges providing spring constraints.
 * @param width  - Canvas width in SVG units.
 * @param height - Canvas height in SVG units.
 * @param maxTicks - Hard cap on iterations (default MAX_TICKS).
 */
export function settleSimulation(
  nodes: ChartNode[],
  edges: ChartEdge[],
  width: number,
  height: number,
  maxTicks: number = MAX_TICKS,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const n = nodes.length;

  const srcIdx: number[] = [];
  const tgtIdx: number[] = [];
  const nodeIndex = new Map<string, number>(nodes.map((nd, i) => [nd.id, i]));
  for (const e of edges) {
    const si = nodeIndex.get(e.source);
    const ti = nodeIndex.get(e.target);
    if (si !== undefined && ti !== undefined) { srcIdx.push(si); tgtIdx.push(ti); }
  }

  // Settle when the mean per-node speed drops below this (graph is "quiet").
  const QUIET = 0.04;

  for (let tick = 0; tick < maxTicks; tick++) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        if (d > REPULSION_MAX) continue;
        const force = REPULSION / d2;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    for (let k = 0; k < srcIdx.length; k++) {
      const a = nodes[srcIdx[k]];
      const b = nodes[tgtIdx[k]];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const disp = d - SPRING_LEN;
      const fx = (dx / d) * disp * SPRING_K;
      const fy = (dy / d) * disp * SPRING_K;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      nd.vx += (cx - nd.x) * CENTER_K;
      nd.vy += (cy - nd.y) * CENTER_K;
      nd.x += nd.vx;
      nd.y += nd.vy;
      nd.vx *= DAMPING;
      nd.vy *= DAMPING;
      nd.x = Math.max(20, Math.min(width - 20, nd.x));
      nd.y = Math.max(20, Math.min(height - 20, nd.y));
      energy += Math.abs(nd.vx) + Math.abs(nd.vy);
    }
    if (tick > 20 && energy / n < QUIET) break; // converged — stop early
  }
  // Freeze residual velocity so a later interactive nudge starts from rest.
  for (let i = 0; i < n; i++) { nodes[i].vx = 0; nodes[i].vy = 0; }
}

/**
 * Seed node positions in a uniform circle to give the force simulation
 * a good starting layout that avoids degenerate all-at-origin collapses.
 *
 * High-degree nodes are placed near the center (radius inversely scaled by
 * degree) so the simulation converges faster with a sensible initial layout.
 *
 * Mutates the `x`/`y` fields on each node in-place.
 *
 * @param nodes - Nodes to seed.
 * @param width  - Canvas width in SVG units.
 * @param height - Canvas height in SVG units.
 */
export function seedPositions(nodes: ChartNode[], width: number, height: number): void {
  const cx   = width  / 2;
  const cy   = height / 2;
  const maxR = Math.min(width, height) * 0.42;
  const n    = nodes.length;
  // Sort by degree descending so high-degree nodes get smaller radii
  const order = [...nodes].sort((a, b) => b.degree - a.degree);
  const maxDeg = order[0]?.degree ?? 1;

  for (let i = 0; i < n; i++) {
    const nd = order[i];
    const fraction = 0.15 + 0.85 * (i / n);      // inner to outer
    const degFrac  = nd.degree / (maxDeg || 1);
    const r        = maxR * fraction * (1 - degFrac * 0.3); // high-deg closer
    const theta    = (i / n) * 2 * Math.PI + (i % 7) * 0.1; // slight spiral
    nd.x  = cx + r * Math.cos(theta);
    nd.y  = cy + r * Math.sin(theta);
    nd.vx = 0;
    nd.vy = 0;
  }
}
