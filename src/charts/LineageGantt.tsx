/**
 * LineageGantt.tsx — horizontal Gantt chart of medieval rulers (P4-B).
 *
 * DATA FLOW
 * ─────────
 * 1. On mount, call loadRecords('ruler') + loadRecords('polity') — both are
 *    already in memory after bootstrap; no extra fetch needed.
 * 2. Resolve polity → region → regionColor for each ruler bar.
 * 3. Compute layout via layoutGantt() (pure, sub-millisecond for 168 rulers).
 * 4. Render an SVG Gantt: one row per polity, bars per ruler, succession edges.
 * 5. Subscribe to timeStore.year for the "now" vertical rule + opacity dimming.
 *
 * INTERACTION
 * ───────────
 * - Hover a bar: tooltip with ruler name, reign dates, polity name.
 * - Click a bar: useSelectionStore.getState().select(rulerId, 'ruler').
 * - Succession connectors: thin line from predecessor bar-end to successor bar-start.
 *   Only drawn when both rulers are in the dataset.
 * - Active year: vertical "now" line; rulers not active at the year are dimmed.
 * - Open-ended reigns: rendered dashed to boundsMax. No fabricated end date.
 *
 * PERFORMANCE
 * ───────────
 * - Layout computed once in useMemo (no per-render recalculation).
 * - SVG rendering: ~168 bars + ~0 succession edges (no `succeeds` in current data).
 * - useMemo recomputes only when theme or time bounds change.
 * - yearToXFrac() is pure and called only during render, not in animation frames.
 *
 * DESIGN CONTRACT
 * ───────────────
 * - Square corners, hairline borders, no shadows (DESIGN.md).
 * - All colors from regionColor(polity.region, theme) via vocab.ts.
 * - Four themes correct; dark theme handled by domainColor() inside vocab.ts.
 * - No hard-coded hex values.
 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { loadRecords } from '@/data/loaders';
import { formatYear as fmtYear } from '@/data/formatYear';
import { useFilterStore } from '@/stores/filterStore';
import { useTimeStore } from '@/stores/timeStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import {
  layoutGantt,
  yearToXFrac,
  BAR_H,
  ROW_HEADER_H,
} from './lineageLayout';
import type { GanttLayout, GanttBar } from './lineageLayout';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Width of the left row-label gutter in px. */
const LABEL_W = 160;

/** Opacity for bars whose reign does not overlap the active year. */
const DIM_OPACITY = 0.2;

/** Opacity for bars that do overlap the active year (or when no year filter). */
const FULL_OPACITY = 1.0;

/** Approximately how many axis tick labels to show. */
const AXIS_TICK_COUNT = 10;

/** Bar border thickness (hairline, per DESIGN.md). */
const BAR_STROKE_W = 0.5;

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'ready' | 'error';

interface GanttState {
  loadState: LoadState;
  errorMessage: string;
  layout: GanttLayout | null;
}

/** Tooltip data shown on bar hover. */
interface TooltipData {
  bar: GanttBar;
  /** Pixel X of the bar start (relative to SVG) — used for positioning. */
  barXPx: number;
}

/** Props for LineageGantt. */
export interface LineageGanttProps {
  /**
   * If provided, the gantt constrains its SVG width to this pixel value.
   * If omitted, it fills the container via CSS.
   */
  containerWidth?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a reign range for the tooltip.
 *
 * @param start    - Reign start year.
 * @param end      - Reign end year, or null for open-ended.
 * @returns        - E.g. "929 – 961" or "929 – ongoing".
 */
function fmtReign(start: number, end: number | null): string {
  if (end === null) return `${fmtYear(start)} – ongoing`;
  return `${fmtYear(start)} – ${fmtYear(end)}`;
}

/**
 * Compute evenly spaced tick years for the X axis.
 *
 * @param boundsMin - Start year.
 * @param boundsMax - End year.
 * @param count     - Desired number of ticks.
 * @returns         - Array of year integers.
 */
function axisTicks(boundsMin: number, boundsMax: number, count: number): number[] {
  const span = boundsMax - boundsMin;
  const rawStep = span / count;
  // Round step to nearest 50
  const step = Math.max(50, Math.round(rawStep / 50) * 50);
  const ticks: number[] = [];
  const start = Math.ceil(boundsMin / step) * step;
  for (let y = start; y <= boundsMax; y += step) {
    ticks.push(y);
  }
  return ticks;
}

/**
 * Determine whether a ruler's reign overlaps a given year.
 *
 * @param bar  - The ruler bar.
 * @param year - The active year.
 * @returns    - True if the reign overlaps, false otherwise.
 */
function reignOverlapsYear(bar: GanttBar, year: number): boolean {
  if (bar.reignStart > year) return false;
  if (bar.reignEnd !== null && bar.reignEnd < year) return false;
  return true;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * LineageGantt — horizontal ruler lineage chart.
 *
 * Renders 168 medieval rulers grouped by polity, with bars showing each ruler's
 * reign, succession connectors, and an active-year highlight line.
 *
 * @param containerWidth - Optional pixel width for the SVG canvas.
 */
export function LineageGantt({ containerWidth: _containerWidth }: LineageGanttProps) {
  // ── Store subscriptions ────────────────────────────────────────────────────
  const year      = useTimeStore((s) => s.year);
  const boundsMin = useTimeStore((s) => s.boundsMin);
  const boundsMax = useTimeStore((s) => s.boundsMax);
  const theme     = useSettingsStore((s) => s.theme);
  // Coordinated-selection READ: a ruler selected anywhere (network graph, ruler
  // timeline, dock) lights up its bar here — the Gantt is no longer write-only.
  const selectedRulerId = useSelectionStore((s) =>
    s.selectedType === 'ruler' ? s.selectedId : null,
  );
  // P5 linked-views: the FilterPanel facets narrow which rulers this corpus-wide
  // Gantt renders (region via the ruler's _quarry.region, reign-overlap via
  // yearRange, and the kinds facet for 'ruler').
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  // Bootstrap completion signal: counts goes from null → set when initDataset()
  // resolves. Including it in the data-load effect deps fixes the race where the
  // overlay opened before the boot fetch completed and saw an empty cache.
  const recordCounts = useRecordsStore((s) => s.counts);

  // ── Local state ────────────────────────────────────────────────────────────
  const [state, setState] = useState<GanttState>({
    loadState:    'loading',
    errorMessage: '',
    layout:       null,
  });

  const [hoveredBar, setHoveredBar] = useState<TooltipData | null>(null);

  // ── Container width ref (for X→px mapping) ─────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasWidth(Math.max(400, entry.contentRect.width - LABEL_W));
      }
    });
    obs.observe(el);
    // Initial measure
    setCanvasWidth(Math.max(400, el.clientWidth - LABEL_W));
    return () => obs.disconnect();
  }, []);

  // ── Data loading + layout ──────────────────────────────────────────────────
  const t0 = useRef<number>(0);

  useEffect(() => {
    // Wait for bootstrap to finish before reading the loader cache. recordCounts
    // is null until initDataset() resolves; until then keep the loading state.
    if (recordCounts === null) {
      setState({ loadState: 'loading', errorMessage: '', layout: null });
      return;
    }
    t0.current = performance.now();
    try {
      const allRulers = loadRecords('ruler');
      const polities  = loadRecords('polity');

      if (allRulers.length === 0) {
        setState({
          loadState:    'error',
          errorMessage: 'No ruler records found. Ensure npm run bake has been executed.',
          layout:       null,
        });
        return;
      }

      // P5: narrow the corpus by the active FilterPanel facets. 'ruler' excluded
      // from the kinds facet → empty Gantt; region via the ruler's _quarry.region;
      // yearRange via reign overlap. Empty facets pass everything.
      const kindsExclude = filterKinds.size > 0 && !filterKinds.has('ruler');
      const rulers = kindsExclude
        ? []
        : allRulers.filter((r) => {
            if (filterRegions.size > 0) {
              const region = (r['_quarry'] as Record<string, unknown> | undefined)?.['region'];
              if (typeof region !== 'string' || !filterRegions.has(region)) return false;
            }
            if (filterYearRange) {
              const [lo, hi] = filterYearRange;
              const start = typeof r['reign_start'] === 'number' ? (r['reign_start'] as number) : null;
              const end   = typeof r['reign_end']   === 'number' ? (r['reign_end']   as number) : null;
              // overlap test; rulers with no reign bounds are kept (honest — not hidden by a year facet)
              if (start !== null && end !== null && (end < lo || start > hi)) return false;
            }
            return true;
          });

      const layout = layoutGantt(rulers, polities, boundsMin, boundsMax, theme);

      setState({ loadState: 'ready', errorMessage: '', layout });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ loadState: 'error', errorMessage: msg, layout: null });
    }
  }, [boundsMin, boundsMax, theme, recordCounts, filterKinds, filterRegions, filterYearRange]);

  // ── Hover handlers ─────────────────────────────────────────────────────────
  const handleBarEnter = useCallback((bar: GanttBar, barXPx: number) => {
    setHoveredBar({ bar, barXPx });
  }, []);

  const handleBarLeave = useCallback(() => {
    setHoveredBar(null);
  }, []);

  const handleBarClick = useCallback((bar: GanttBar) => {
    useSelectionStore.getState().select(bar.rulerId, 'ruler');
  }, []);

  // ── Derived: current year X fraction ───────────────────────────────────────
  const nowXFrac = yearToXFrac(year, boundsMin, boundsMax);

  // ── Axis ticks ─────────────────────────────────────────────────────────────
  const ticks = useMemo(
    () => axisTicks(boundsMin, boundsMax, AXIS_TICK_COUNT),
    [boundsMin, boundsMax],
  );

  // ── Render states ──────────────────────────────────────────────────────────
  if (state.loadState === 'loading') {
    return (
      <div className="lineage-gantt">
        <div className="lineage-gantt__state">
          <LoadingState label="Loading ruler lineage…" />
        </div>
      </div>
    );
  }

  if (state.loadState === 'error' || state.layout === null) {
    return (
      <div className="lineage-gantt">
        <div className="lineage-gantt__state">
          <ErrorState
            title="Failed to load ruler lineage"
            body={state.errorMessage || 'Unknown error. Ensure npm run bake has been run.'}
          />
        </div>
      </div>
    );
  }

  const { layout } = state;
  const totalH = layout.totalHeight;
  // Full SVG width = label gutter + canvas area
  const svgW = LABEL_W + canvasWidth;

  return (
    <div className="lineage-gantt" style={{ '--lineage-label-w': `${LABEL_W}px` } as React.CSSProperties}>
      {/* ── Axis bar ────────────────────────────────────────────────────────── */}
      <div className="lineage-gantt__axis-bar" aria-hidden="true">
        <svg
          width={canvasWidth}
          height={24}
          style={{ display: 'block', overflow: 'visible' }}
          aria-hidden="true"
        >
          {ticks.map((tick) => {
            const xFrac = yearToXFrac(tick, boundsMin, boundsMax);
            const xPx   = xFrac * canvasWidth;
            return (
              <g key={tick} transform={`translate(${xPx}, 0)`}>
                <line x1={0} y1={0} x2={0} y2={4} stroke="var(--border-mid)" strokeWidth={0.5} />
                <text
                  className="lineage-gantt__tick-label"
                  x={0}
                  y={16}
                  textAnchor="middle"
                >
                  {tick}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Scrollable Gantt body ───────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="lineage-gantt__scroll"
        role="region"
        aria-label="Ruler lineage chart"
      >
        <svg
          className="lineage-gantt__svg"
          width={svgW}
          height={totalH}
          viewBox={`0 0 ${svgW} ${totalH}`}
          aria-label={`Lineage of ${layout.rulerCount} rulers across ${layout.polityCount} polities`}
        >
          {/* ── Row backgrounds + labels ─────────────────────────────────── */}
          {layout.rows.map((row, rowIdx) => (
            <g key={row.polityId}>
              {/* Alternating row background */}
              <rect
                x={0}
                y={row.yOffset}
                width={svgW}
                height={row.height}
                fill={rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'}
              />
              {/* Row divider */}
              <line
                x1={0}
                y1={row.yOffset + row.height - 0.5}
                x2={svgW}
                y2={row.yOffset + row.height - 0.5}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
              {/* Polity label in left gutter */}
              <foreignObject
                x={0}
                y={row.yOffset}
                width={LABEL_W}
                height={ROW_HEADER_H}
              >
                <div
                  className="lineage-gantt__row-label-text"
                  title={row.polityName || row.polityId}
                  style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px', lineHeight: `${ROW_HEADER_H}px`, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-mid)' }}
                >
                  {row.polityName || row.polityId}
                </div>
              </foreignObject>
              {/* Gutter divider */}
              <line
                x1={LABEL_W}
                y1={row.yOffset}
                x2={LABEL_W}
                y2={row.yOffset + row.height}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            </g>
          ))}

          {/* ── Ruler bars ──────────────────────────────────────────────────── */}
          {layout.rows.flatMap((row) =>
            row.bars.map((bar) => {
              const xPx  = LABEL_W + bar.xFrac * canvasWidth;
              const wPx  = Math.max(bar.wFrac * canvasWidth, 2);
              const yPx  = bar.yOffset;
              const isActive = reignOverlapsYear(bar, year);
              const opacity  = isActive ? FULL_OPACITY : DIM_OPACITY;
              const isHovered = hoveredBar?.bar.rulerId === bar.rulerId;
              const isSelected = selectedRulerId !== null && bar.rulerId === selectedRulerId;

              // For open-ended bars, the solid part ends at reignEnd's natural position
              // and a dashed segment extends to boundsMax.
              const solidEndPx = bar.openEnded
                ? Math.max(xPx, LABEL_W + yearToXFrac(boundsMax, boundsMin, boundsMax) * canvasWidth)
                : xPx + wPx;

              return (
                <g
                  key={bar.rulerId}
                  className={`lineage-gantt__bar${isSelected ? ' is-selected' : ''}`}
                  opacity={isHovered || isSelected ? FULL_OPACITY : opacity}
                  onClick={() => handleBarClick(bar)}
                  onMouseEnter={() => handleBarEnter(bar, xPx)}
                  onMouseLeave={handleBarLeave}
                  role="button"
                  tabIndex={0}
                  aria-label={`${bar.name}, ${fmtReign(bar.reignStart, bar.reignEnd)}, ${bar.polityName}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBarClick(bar); }}
                  style={{ cursor: 'pointer' }}
                >
                  {bar.openEnded ? (
                    <>
                      {/* Dashed bar spanning the whole open-ended extent */}
                      <rect
                        className="lineage-gantt__bar-fill"
                        x={xPx}
                        y={yPx}
                        width={solidEndPx - xPx}
                        height={BAR_H}
                        fill={bar.color}
                        fillOpacity={0.3}
                        stroke={bar.color}
                        strokeWidth={BAR_STROKE_W}
                        strokeDasharray="4 3"
                      />
                    </>
                  ) : (
                    <rect
                      className="lineage-gantt__bar-fill"
                      x={xPx}
                      y={yPx}
                      width={wPx}
                      height={BAR_H}
                      fill={bar.color}
                      fillOpacity={0.7}
                      stroke={bar.color}
                      strokeWidth={BAR_STROKE_W}
                    />
                  )}
                  {/* Coordinated-selection ring — accent outline when the ruler is
                      selected anywhere. DESIGN.md "selection = outline + halo". */}
                  {isSelected && (
                    <rect
                      x={xPx - 1.5}
                      y={yPx - 1.5}
                      width={(solidEndPx - xPx) + 3}
                      height={BAR_H + 3}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  )}
                  {/* Ruler name label inside bar (only if bar is wide enough) */}
                  {wPx > 40 && (
                    <text
                      x={xPx + 4}
                      y={yPx + BAR_H / 2 + 4}
                      style={{
                        fontFamily:   'var(--font-mono)',
                        fontSize:     '9px',
                        fill:         'var(--ink)',
                        pointerEvents: 'none',
                        userSelect:   'none',
                      }}
                    >
                      {bar.name.length > 24 ? bar.name.slice(0, 22) + '…' : bar.name}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* ── Succession edges ─────────────────────────────────────────────── */}
          {layout.edges.map((edge) => {
            const fromBar = layout.barMap.get(edge.fromRulerId);
            const toBar   = layout.barMap.get(edge.toRulerId);
            if (!fromBar || !toBar) return null;

            // Origin: end of predecessor bar (or boundsMax if open-ended)
            const fromXPx = LABEL_W + (fromBar.xFrac + fromBar.wFrac) * canvasWidth;
            const fromYPx = fromBar.yOffset + BAR_H / 2;
            // Target: start of successor bar
            const toXPx   = LABEL_W + toBar.xFrac * canvasWidth;
            const toYPx   = toBar.yOffset + BAR_H / 2;

            return (
              <path
                key={edge.id}
                className="lineage-gantt__edge"
                d={`M ${fromXPx} ${fromYPx} C ${fromXPx + 12} ${fromYPx}, ${toXPx - 12} ${toYPx}, ${toXPx} ${toYPx}`}
                fill="none"
                stroke="var(--ink-mute)"
                strokeWidth={1}
                strokeOpacity={0.5}
                markerEnd="url(#lg-arrow)"
              />
            );
          })}

          {/* Arrow marker def for succession edges */}
          {layout.edges.length > 0 && (
            <defs>
              <marker
                id="lg-arrow"
                markerWidth={6}
                markerHeight={6}
                refX={5}
                refY={3}
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--ink-mute)" fillOpacity={0.5} />
              </marker>
            </defs>
          )}

          {/* ── Now-line (active year vertical rule) ──────────────────────── */}
          <line
            className="lineage-gantt__now-line"
            x1={LABEL_W + nowXFrac * canvasWidth}
            y1={0}
            x2={LABEL_W + nowXFrac * canvasWidth}
            y2={totalH}
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 2"
            strokeOpacity={0.8}
          />
          {/* Now-line year label at top */}
          <text
            x={LABEL_W + nowXFrac * canvasWidth + 3}
            y={12}
            style={{
              fontFamily:   'var(--font-mono)',
              fontSize:     '9px',
              fill:         'var(--accent)',
              fontVariantNumeric: 'tabular-nums',
              pointerEvents: 'none',
              userSelect:   'none',
            }}
          >
            {year}
          </text>
        </svg>

        {/* ── Tooltip ───────────────────────────────────────────────────────── */}
        {hoveredBar && (
          <div
            className="lineage-gantt__tooltip"
            role="tooltip"
            aria-live="polite"
          >
            <div className="lineage-gantt__tooltip-head">
              <span
                className="lineage-gantt__tooltip-swatch"
                style={{ background: hoveredBar.bar.color }}
                aria-hidden="true"
              />
              <span className="lineage-gantt__tooltip-name">
                {hoveredBar.bar.name}
              </span>
            </div>
            <dl className="lineage-gantt__tooltip-dl">
              {hoveredBar.bar.title && (
                <div className="lineage-gantt__tooltip-row">
                  <dt className="lineage-gantt__tooltip-key">Title</dt>
                  <dd className="lineage-gantt__tooltip-val">{hoveredBar.bar.title}</dd>
                </div>
              )}
              <div className="lineage-gantt__tooltip-row">
                <dt className="lineage-gantt__tooltip-key">Reign</dt>
                <dd className="lineage-gantt__tooltip-val">
                  {fmtReign(hoveredBar.bar.reignStart, hoveredBar.bar.reignEnd)}
                </dd>
              </div>
              <div className="lineage-gantt__tooltip-row">
                <dt className="lineage-gantt__tooltip-key">Polity</dt>
                <dd className="lineage-gantt__tooltip-val">{hoveredBar.bar.polityName || hoveredBar.bar.polityId}</dd>
              </div>
              {hoveredBar.bar.openEnded && (
                <div className="lineage-gantt__tooltip-row">
                  <dt className="lineage-gantt__tooltip-key">Note</dt>
                  <dd className="lineage-gantt__tooltip-val">Open-ended reign</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
