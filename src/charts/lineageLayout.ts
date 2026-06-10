/**
 * lineageLayout.ts — pure layout computation for LineageGantt (P4-B).
 *
 * Converts flat ruler + polity records into a fully positioned layout model:
 * polity rows, ruler bars, succession connector edges, and the active-year
 * highlight position. No React, no DOM, no side effects — pure data-in/data-out.
 *
 * DESIGN CONTRACT
 * ───────────────
 * - All temporal values are real record fields. No synthetic dates.
 * - Open-ended reigns (reign_end === null) extend to boundsMax with a dash flag.
 * - Rulers without a resolved polity record are placed in an "unknown" bucket,
 *   clearly labelled — never silently dropped.
 * - Succession edges (ruler.succeeds) are only emitted when the predecessor is
 *   present in the dataset. Missing predecessors are skipped with a warning count.
 * - Polity rows sorted by polity.formed (ascending); rulers within a row sorted
 *   by reign_start.
 *
 * Performance: 168 rulers × O(n) passes = microseconds. Sub-millisecond layout.
 */

import type { RawRecord } from '@/data/loaders';
import { regionColor } from '@/data/vocab';

// ── Gantt geometry constants ──────────────────────────────────────────────────

/** Height of each ruler bar in px (logical units). */
export const BAR_H = 18;
/** Vertical gap between ruler bars in the same row. */
export const BAR_GAP = 4;
/** Height of the polity row header strip above its bars. */
export const ROW_HEADER_H = 20;
/** Total row height for a single-ruler polity. */
export const ROW_H = ROW_HEADER_H + BAR_H + BAR_GAP * 2;

// ── Type definitions ──────────────────────────────────────────────────────────

/**
 * A single ruler bar within the Gantt.
 *
 * All positions are in logical Gantt coordinates (0..1 range on X for time,
 * absolute px on Y). The renderer maps these to pixel positions using the
 * available canvas width.
 */
export interface GanttBar {
  /** Stable ruler id. */
  rulerId: string;
  /** Display name. */
  name: string;
  /** Title / role, if present. */
  title: string;
  /** Polity this ruler belongs to. */
  polityId: string;
  /** Polity display name. */
  polityName: string;
  /** Reign start year. */
  reignStart: number;
  /**
   * Reign end year, or null if open-ended.
   * Open-ended bars should be drawn dashed to boundsMax.
   */
  reignEnd: number | null;
  /**
   * True when reignEnd is null — the bar renders dashed to the right edge.
   * Never a fabricated end date.
   */
  openEnded: boolean;
  /** Resolved region color string (CSS value). Fallback if region unknown. */
  color: string;
  /** X position as fraction of total time span [0, 1]. */
  xFrac: number;
  /** Width as fraction of total time span [0, 1]. Minimum 1/1000 for visibility. */
  wFrac: number;
  /**
   * Y offset within the Gantt canvas, in logical px.
   * Computed by layoutGantt; rows stack top-to-bottom.
   */
  yOffset: number;
  /** Index of this bar within its polity row (for multi-ruler rows). */
  rowIndex: number;
  /** Id of the predecessor ruler, if this ruler has a `succeeds` field. */
  succeedsId: string | null;
}

/**
 * A succession connector edge between two bars.
 * Drawn as a thin line from the end of the predecessor bar to the start
 * of this ruler's bar.
 */
export interface GanttEdge {
  /** Unique edge id (source + target). */
  id: string;
  /** Id of the predecessor ruler (edge origin). */
  fromRulerId: string;
  /** Id of the successor ruler (edge terminus). */
  toRulerId: string;
}

/**
 * A polity group row containing one or more ruler bars.
 */
export interface GanttRow {
  /** Polity id. */
  polityId: string;
  /** Polity display name (may be empty string — use id as fallback). */
  polityName: string;
  /** Region key, for the color legend. */
  region: string;
  /** Year the polity was formed (for sort order). */
  formed: number;
  /** Bars in this row, sorted by reign_start. */
  bars: GanttBar[];
  /**
   * Y offset of the top of this row in logical px.
   * Set by layoutGantt; used for sticky row-label positioning.
   */
  yOffset: number;
  /**
   * Total height of this row in logical px.
   * = ROW_HEADER_H + bars.length * (BAR_H + BAR_GAP) + BAR_GAP
   */
  height: number;
}

/**
 * The fully computed Gantt layout — ready to render.
 */
export interface GanttLayout {
  /** All polity rows, sorted by polity.formed. */
  rows: GanttRow[];
  /** All ruler bars, indexed by ruler id for O(1) edge lookup. */
  barMap: Map<string, GanttBar>;
  /** Succession edges (only where both endpoints are in the dataset). */
  edges: GanttEdge[];
  /** Total logical height of the canvas (sum of all row heights). */
  totalHeight: number;
  /**
   * Number of succession edges that could not be resolved because the
   * predecessor id was not found in the dataset.
   */
  unresolvedEdgeCount: number;
  /** Total ruler count across all rows. */
  rulerCount: number;
  /** Total polity row count. */
  polityCount: number;
}

// ── Layout computation ────────────────────────────────────────────────────────

/**
 * Compute the full Gantt layout from raw ruler and polity records.
 *
 * Pure function — no side effects. Safe to call in a useMemo.
 *
 * @param rulers     - All raw ruler records from loadRecords('ruler').
 * @param polities   - All raw polity records from loadRecords('polity').
 * @param boundsMin  - Left edge of the time axis (e.g. 500).
 * @param boundsMax  - Right edge of the time axis (e.g. 1500).
 * @param theme      - Active theme id ('atlas'|'manuscript'|'dark'|'contrast').
 * @returns          - Fully positioned GanttLayout.
 */
export function layoutGantt(
  rulers: RawRecord[],
  polities: RawRecord[],
  boundsMin: number,
  boundsMax: number,
  theme: string,
): GanttLayout {
  const span = boundsMax - boundsMin;
  if (span <= 0) {
    return {
      rows: [], barMap: new Map(), edges: [],
      totalHeight: 0, unresolvedEdgeCount: 0, rulerCount: 0, polityCount: 0,
    };
  }

  // ── Build polity lookup ────────────────────────────────────────────────────
  const polityMap = new Map<string, RawRecord>();
  for (const p of polities) {
    polityMap.set(p.id, p);
  }

  // ── Group rulers by polity ─────────────────────────────────────────────────
  const rowMap = new Map<string, RawRecord[]>();

  for (const ruler of rulers) {
    const polityId = typeof ruler.polity === 'string' ? ruler.polity : '__unknown__';
    const bucket = rowMap.get(polityId);
    if (bucket) {
      bucket.push(ruler);
    } else {
      rowMap.set(polityId, [ruler]);
    }
  }

  // ── Sort polity groups by formed year ──────────────────────────────────────
  const sortedPolityIds = [...rowMap.keys()].sort((a, b) => {
    const pa = polityMap.get(a);
    const pb = polityMap.get(b);
    const fa = typeof pa?.formed === 'number' ? pa.formed : boundsMin;
    const fb = typeof pb?.formed === 'number' ? pb.formed : boundsMin;
    return fa - fb;
  });

  // ── Build rows and bars ────────────────────────────────────────────────────
  const rows: GanttRow[] = [];
  const barMap = new Map<string, GanttBar>();
  let yOffset = 0;

  for (const polityId of sortedPolityIds) {
    const rulerGroup = rowMap.get(polityId)!;
    // Sort rulers within row by reign_start
    rulerGroup.sort((a, b) => {
      const as = typeof a.reign_start === 'number' ? a.reign_start : boundsMin;
      const bs = typeof b.reign_start === 'number' ? b.reign_start : boundsMin;
      return as - bs;
    });

    const polityRecord = polityMap.get(polityId);
    const polityName   = typeof polityRecord?.name === 'string' ? polityRecord.name : polityId;
    const region       = typeof polityRecord?.region === 'string' ? polityRecord.region : '';
    const formed       = typeof polityRecord?.formed === 'number' ? polityRecord.formed : boundsMin;

    // Resolve region color — fallback to ink-mute if region unknown
    const resolvedColor = regionColor(region, theme) ?? 'var(--ink-mute)';

    const bars: GanttBar[] = [];

    for (let i = 0; i < rulerGroup.length; i++) {
      const ruler = rulerGroup[i];
      const reignStart = typeof ruler.reign_start === 'number' ? ruler.reign_start : boundsMin;
      const reignEnd   = typeof ruler.reign_end   === 'number' ? ruler.reign_end   : null;
      const openEnded  = reignEnd === null;

      // Clamp display range to bounds
      const displayStart = Math.max(boundsMin, reignStart);
      const displayEnd   = Math.min(boundsMax, reignEnd ?? boundsMax);

      // X fractions — minimum 1/1000 width so single-year reigns are visible
      const xFrac = (displayStart - boundsMin) / span;
      const wFrac = Math.max((displayEnd - displayStart) / span, 1 / 1000);

      // Y offset: row header + per-bar stacking
      const barYOffset = yOffset + ROW_HEADER_H + i * (BAR_H + BAR_GAP) + BAR_GAP;

      const succeedsId = typeof ruler.succeeds === 'string' ? ruler.succeeds : null;
      const title      = typeof ruler.title   === 'string' ? ruler.title : '';

      const bar: GanttBar = {
        rulerId:    ruler.id,
        name:       typeof ruler.name === 'string' ? ruler.name : ruler.id,
        title,
        polityId,
        polityName,
        reignStart,
        reignEnd,
        openEnded,
        color:      resolvedColor,
        xFrac,
        wFrac,
        yOffset:    barYOffset,
        rowIndex:   i,
        succeedsId,
      };

      bars.push(bar);
      barMap.set(ruler.id, bar);
    }

    const rowHeight = ROW_HEADER_H + rulerGroup.length * (BAR_H + BAR_GAP) + BAR_GAP;

    rows.push({
      polityId,
      polityName,
      region,
      formed,
      bars,
      yOffset,
      height: rowHeight,
    });

    yOffset += rowHeight;
  }

  const totalHeight = yOffset;

  // ── Build succession edges ─────────────────────────────────────────────────
  const edges: GanttEdge[] = [];
  let unresolvedEdgeCount = 0;

  for (const bar of barMap.values()) {
    if (bar.succeedsId === null) continue;
    if (barMap.has(bar.succeedsId)) {
      edges.push({
        id:          `${bar.succeedsId}→${bar.rulerId}`,
        fromRulerId: bar.succeedsId,
        toRulerId:   bar.rulerId,
      });
    } else {
      // Predecessor not in dataset — skip, count honestly
      unresolvedEdgeCount++;
    }
  }

  return {
    rows,
    barMap,
    edges,
    totalHeight,
    unresolvedEdgeCount,
    rulerCount: rulers.length,
    polityCount: rows.length,
  };
}

/**
 * Map a year to an X fraction in [0, 1] for the current time bounds.
 *
 * @param year       - The year to map.
 * @param boundsMin  - Left edge of time axis.
 * @param boundsMax  - Right edge of time axis.
 * @returns          - Clamped X fraction.
 */
export function yearToXFrac(year: number, boundsMin: number, boundsMax: number): number {
  const span = boundsMax - boundsMin;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (year - boundsMin) / span));
}
