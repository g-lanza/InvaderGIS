/**
 * PopulationTimeseries — OWID-style SVG population chart for a polity record.
 *
 * DATA CONTRACT (real donor shape — read from RawRecord):
 *   population_estimates[]: {
 *     year:       number
 *     estimate:   number          // the real field name in donor data
 *     confidence: 'low' | 'moderate' | 'high'
 *     sources?:   Array<{         // array of source objects, not src_ ids
 *       type:      'wikidata' | 'wikipedia'
 *       id?:       string         // Wikidata QID
 *       url?:      string
 *       label?:    string
 *       statement?: string
 *     }>
 *     note?:      string
 *   }
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes — no boxes.
 *   - No drop shadows; no hardcoded hex — tokens only.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *   - Motion on transform/opacity only (~120ms --ease-out-expo).
 *
 * REALNESS LAWS:
 *   - Plot ONLY real {year, estimate} pairs. No interpolation, no fabrication.
 *   - Show "—" / empty state when no estimates are present.
 *   - Confidence encoding: 'low' → dashed line + reduced fill opacity;
 *     'moderate' → solid thin; 'high' → solid full.
 *   - Source attribution is built from the real source objects (wikidata/wikipedia)
 *     — never from made-up labels.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title and source line.
 *   Responsive to the narrow EntityDock width (~300px).
 *   Chart height: 120px fixed; axes use hairline strokes; tokens only.
 *
 * Wave 6 — timeseries-chart agent.
 * Mount point in PolityCard: <!-- POP_CHART --> placeholder is replaced by
 * the integration agent with <PopulationTimeseries record={record} />.
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { RawRecord } from '@/data/loaders';
import { formatYear as fmtYear } from '@/data/formatYear';
import { ChartFrame } from '@/charts/ChartFrame';
import { ChartTooltip, type TooltipState } from '@/charts/ChartTooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A normalised, validated population estimate point for rendering. */
interface PopPoint {
  year: number;
  estimate: number;
  /** Raw confidence string from donor data. */
  confidence: 'low' | 'moderate' | 'high';
  /** Optional curator note for tooltip. */
  note?: string;
}

/** Props for PopulationTimeseries. */
export interface PopulationTimeseriesProps {
  /**
   * The raw polity record to render.
   * Must carry `kind === 'polity'`. Fields are read directly — never fabricated.
   */
  record: RawRecord;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** SVG chart area height in px (not counting axis labels). */
const CHART_H = 120;

/** Left-axis gutter width (for Y labels). */
const AXIS_LEFT = 40;

/** Bottom-axis gutter height (for X labels). */
const AXIS_BOTTOM = 18;

/** Approximate number of Y-axis ticks. */
const Y_TICK_COUNT = 4;

/** Approximate number of X-axis ticks. */
const X_TICK_COUNT = 5;

/** Hairline stroke width — matches DESIGN.md law. */
const HAIRLINE = 0.5;

// ── Data extraction helpers ───────────────────────────────────────────────────

/**
 * Parse and validate population_estimates from a RawRecord.
 * Returns only entries where both year and estimate are finite numbers.
 * Sorted ascending by year. No fabrication — missing fields are dropped silently.
 */
function parseEstimates(record: RawRecord): PopPoint[] {
  const raw = record['population_estimates'];
  if (!Array.isArray(raw)) return [];

  const points: PopPoint[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const year = typeof obj['year'] === 'number' ? obj['year'] : null;
    // Real donor data uses 'estimate'; typed interface uses 'mid' — accept both.
    const estimate =
      typeof obj['estimate'] === 'number'
        ? obj['estimate']
        : typeof obj['mid'] === 'number'
        ? obj['mid']
        : null;

    if (year === null || estimate === null) continue;
    if (!isFinite(year) || !isFinite(estimate)) continue;

    const rawConf = typeof obj['confidence'] === 'string' ? obj['confidence'] : '';
    const confidence: PopPoint['confidence'] =
      rawConf === 'high'
        ? 'high'
        : rawConf === 'moderate'
        ? 'moderate'
        : 'low'; // default to low (most conservative)

    const note = typeof obj['note'] === 'string' ? obj['note'] : undefined;

    points.push({ year, estimate, confidence, note });
  }

  // Stable sort ascending by year (immutable — no mutation of input)
  return [...points].sort((a, b) => a.year - b.year);
}

// Population sources (wikidata/wikipedia backing the estimates) are no longer
// shown on the chart — they live in the entity Sources tab as clickable links.
// See src/data/populationSources.ts + SourcesTab "Population data sources".

// ── Chart layout helpers ──────────────────────────────────────────────────────

/**
 * Format a large number compactly: 30_000_000 → "30M", 500_000 → "500K", etc.
 */
function fmtPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/**
 * Compute evenly spaced "nice" tick values for an axis.
 * Uses a simple step-rounding approach — no fabrication.
 */
function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const rawStep = (max - min) / count;
  // Round to nearest power-of-10 magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) {
    ticks.push(t);
  }
  // Always include the min/max bucket edges if ticks is empty
  if (ticks.length === 0) ticks.push(min);
  return ticks;
}

// ── Claim title builder ───────────────────────────────────────────────────────

/**
 * Build an OWID-style assertive claim title from the estimate series.
 * E.g. "Abbasid Caliphate grew from 30M to 20M between 800–1258".
 * Uses only real data points — never fabricates.
 */
function buildClaimTitle(name: string, points: PopPoint[]): string {
  if (points.length === 0) return `${name} — population estimates`;
  if (points.length === 1) {
    return `${name} estimated at ${fmtPop(points[0].estimate)} in ${fmtYear(points[0].year)}`;
  }
  const first = points[0];
  const last  = points[points.length - 1];
  const direction =
    last.estimate > first.estimate
      ? 'grew'
      : last.estimate < first.estimate
      ? 'fell'
      : 'held steady';
  return (
    `${name} ${direction} from ${fmtPop(first.estimate)} to ${fmtPop(last.estimate)}` +
    ` between ${fmtYear(first.year)}–${fmtYear(last.year)}`
  );
}

// ── SVG path builder ──────────────────────────────────────────────────────────

interface ChartMath {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Convert a data year to SVG x coordinate (within chart area). */
  xOf: (year: number) => number;
  /** Convert a data estimate to SVG y coordinate (within chart area). */
  yOf: (val: number) => number;
  /** Width of the chart drawing area (px). */
  w: number;
  /** Height of the chart drawing area (px). */
  h: number;
}

/**
 * Build chart coordinate math from a set of points and container width.
 * All px values are relative to the top-left of the chart drawing area
 * (i.e. after AXIS_LEFT offset).
 */
function buildChartMath(points: PopPoint[], containerW: number): ChartMath {
  const w = containerW - AXIS_LEFT;
  const h = CHART_H - AXIS_BOTTOM;

  const xMin = points[0].year;
  const xMax = points[points.length - 1].year;
  const allEst = points.map((p) => p.estimate);
  const rawYMin = Math.min(...allEst);
  const rawYMax = Math.max(...allEst);

  // Pad y-range by 10% so the line doesn't sit on the axis edge
  const yPad = (rawYMax - rawYMin) * 0.1 || rawYMax * 0.1 || 1;
  const yMin = Math.max(0, rawYMin - yPad);
  const yMax = rawYMax + yPad;

  const xRange = xMax - xMin || 1; // guard zero-range
  const yRange = yMax - yMin || 1;

  const xOf = (year: number): number => ((year - xMin) / xRange) * w;
  const yOf = (val: number): number => h - ((val - yMin) / yRange) * h;

  return { xMin, xMax, yMin, yMax, xOf, yOf, w, h };
}

/**
 * Build an SVG polyline `points` attribute string from an array of PopPoints.
 * Returns a space-separated list of "x,y" pairs.
 */
function buildPolylinePoints(pts: PopPoint[], math: ChartMath): string {
  return pts.map((p) => `${math.xOf(p.year).toFixed(2)},${math.yOf(p.estimate).toFixed(2)}`).join(' ');
}

/**
 * Build an SVG path `d` attribute for a closed area under the line.
 * Closes down to y=h and back to the first point so we can fill the area.
 */
function buildAreaPath(pts: PopPoint[], math: ChartMath): string {
  if (pts.length === 0) return '';
  const linePoints = pts
    .map((p) => `${math.xOf(p.year).toFixed(2)},${math.yOf(p.estimate).toFixed(2)}`)
    .join(' L ');
  const lastX = math.xOf(pts[pts.length - 1].year).toFixed(2);
  const firstX = math.xOf(pts[0].year).toFixed(2);
  return `M ${linePoints} L ${lastX},${math.h.toFixed(2)} L ${firstX},${math.h.toFixed(2)} Z`;
}

// ── Empty state ───────────────────────────────────────────────────────────────

/** Honest empty state shown when a polity record carries no population estimates. */
function EmptyState(): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: 'var(--ink-mute)',
        textTransform: 'uppercase',
        borderTop: `${HAIRLINE}px solid var(--border)`,
        borderBottom: `${HAIRLINE}px solid var(--border)`,
      }}
    >
      No population estimates recorded
    </div>
  );
}

// ── Confidence segment helpers ────────────────────────────────────────────────

/**
 * Group consecutive points by confidence into segments so each segment can
 * be rendered with its own stroke style (dashed for 'low', solid for others).
 * Each segment carries the two end-points it connects — segments overlap by one
 * point so the polyline is continuous.
 */
interface ConfidenceSegment {
  confidence: PopPoint['confidence'];
  points: PopPoint[];
}

function buildConfidenceSegments(points: PopPoint[]): ConfidenceSegment[] {
  if (points.length === 0) return [];

  const segments: ConfidenceSegment[] = [];
  let current: ConfidenceSegment = { confidence: points[0].confidence, points: [points[0]] };

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.confidence === current.confidence) {
      current = { ...current, points: [...current.points, pt] };
    } else {
      // End the current segment by including the transition point (continuity)
      segments.push({ ...current, points: [...current.points, pt] });
      current = { confidence: pt.confidence, points: [current.points[current.points.length - 1], pt] };
    }
  }
  segments.push(current);
  return segments;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * PopulationTimeseries — small SVG line+area chart of a polity's population
 * over time, wrapped in ChartFrame with claim-style title and source line.
 *
 * Reads population_estimates[] from the raw RawRecord (polity).
 * Plots only real {year, estimate} pairs — no fabricated data points.
 * Confidence encoding: 'low' → dashed stroke; 'moderate' → solid medium;
 * 'high' → solid full. Area fill uses a low-opacity fill under the line.
 *
 * @param record - The raw polity RawRecord to render.
 */
export function PopulationTimeseries({ record }: PopulationTimeseriesProps): JSX.Element {
  const points = useMemo(() => parseEstimates(record), [record]);
  const nameRaw = record['name_primary'];
  const name = typeof nameRaw === 'string' ? nameRaw : (record['id'] as string);
  const [tip, setTip] = useState<TooltipState | null>(null);

  if (points.length === 0) {
    return (
      <ChartFrame
        title={`${name} — population estimates`}
        subtitle="Population over time"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  const claimTitle = buildClaimTitle(name, points);

  // Chart rendering uses a fixed 280px container width that fits EntityDock
  // (~300px minus padding). The SVG uses viewBox so it scales responsively, and
  // is capped at its native width (CONTAINER_W) so it never magnifies its
  // hand-drawn axis text when the dock is fullscreen/wide.
  const CONTAINER_W = 280;
  const math = buildChartMath(points, CONTAINER_W);

  const yTicks = niceTicks(math.yMin, math.yMax, Y_TICK_COUNT);
  const xTicks = niceTicks(math.xMin, math.xMax, X_TICK_COUNT);

  const segments = buildConfidenceSegments(points);
  const areaPath = buildAreaPath(points, math);

  // Overall polyline for area fill (all points, single path)
  // Segment lines are drawn on top per confidence

  return (
    <ChartFrame
      title={claimTitle}
      subtitle={`Population · ${fmtYear(math.xMin)}–${fmtYear(math.xMax)} CE`}
      asSection={false}
    >
      <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${CONTAINER_W} ${CHART_H}`}
        width="100%"
        aria-label={claimTitle}
        role="img"
        style={{ display: 'block', overflow: 'visible', maxWidth: CONTAINER_W }}
      >
        {/* ── Y-axis ticks + gridlines ─────────────────────────────────── */}
        {yTicks.map((tick) => {
          const yPx = math.yOf(tick);
          return (
            <g key={tick}>
              {/* Hairline gridline */}
              <line
                x1={AXIS_LEFT}
                y1={yPx}
                x2={AXIS_LEFT + math.w}
                y2={yPx}
                stroke="var(--border)"
                strokeWidth={HAIRLINE}
              />
              {/* Y tick label */}
              <text
                x={AXIS_LEFT - 3}
                y={yPx + 3}
                textAnchor="end"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fill: 'var(--ink-mute)',
                  letterSpacing: '0.04em',
                }}
              >
                {fmtPop(tick)}
              </text>
            </g>
          );
        })}

        {/* ── X-axis ticks ─────────────────────────────────────────────── */}
        {xTicks.map((tick) => {
          const xPx = AXIS_LEFT + math.xOf(tick);
          return (
            <g key={tick}>
              {/* Tick mark */}
              <line
                x1={xPx}
                y1={math.h}
                x2={xPx}
                y2={math.h + 4}
                stroke="var(--border-mid)"
                strokeWidth={HAIRLINE}
              />
              {/* X tick label */}
              <text
                x={xPx}
                y={math.h + 13}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fill: 'var(--ink-mute)',
                  letterSpacing: '0.03em',
                }}
              >
                {fmtYear(tick)}
              </text>
            </g>
          );
        })}

        {/* ── Y-axis baseline ───────────────────────────────────────────── */}
        <line
          x1={AXIS_LEFT}
          y1={0}
          x2={AXIS_LEFT}
          y2={math.h}
          stroke="var(--border-mid)"
          strokeWidth={HAIRLINE}
        />

        {/* ── Y-axis label (rotated) ────────────────────────────────────── */}
        <text
          x={6}
          y={math.h / 2}
          textAnchor="middle"
          transform={`rotate(-90 6 ${math.h / 2})`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fill: 'var(--ink-mid)',
          }}
        >
          Population
        </text>

        {/* ── X-axis baseline ───────────────────────────────────────────── */}
        <line
          x1={AXIS_LEFT}
          y1={math.h}
          x2={AXIS_LEFT + math.w}
          y2={math.h}
          stroke="var(--border-mid)"
          strokeWidth={HAIRLINE}
        />

        {/* ── Area fill (single path, uniform low opacity) ─────────────── */}
        <path
          d={areaPath}
          transform={`translate(${AXIS_LEFT}, 0)`}
          fill="var(--accent)"
          fillOpacity={0.08}
          stroke="none"
        />

        {/* ── Per-confidence line segments ──────────────────────────────── */}
        {segments.map((seg, segIdx) => {
          const linePoints = buildPolylinePoints(seg.points, math);
          const isLow      = seg.confidence === 'low';
          const isMod      = seg.confidence === 'moderate';
          const strokeW    = isLow ? 1 : isMod ? 1.5 : 2;
          const strokeDash = isLow ? '4 3' : undefined;
          const strokeOpacity = isLow ? 0.6 : 0.9;

          return (
            <polyline
              key={segIdx}
              points={linePoints}
              transform={`translate(${AXIS_LEFT}, 0)`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={strokeW}
              strokeDasharray={strokeDash}
              strokeOpacity={strokeOpacity}
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          );
        })}

        {/* ── Data point dots ───────────────────────────────────────────── */}
        {points.map((pt, i) => {
          const cx = AXIS_LEFT + math.xOf(pt.year);
          const cy = math.yOf(pt.estimate);
          const r  = pt.confidence === 'high' ? 2.5 : 1.8;
          return (
            <g key={i}>
              {/* Visible dot */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={HAIRLINE * 2}
                fillOpacity={1}
              />
              {/* Larger transparent hit target for an easy hover (replaces the
                  unstyled <title> with the shared ChartTooltip). */}
              <circle
                cx={cx}
                cy={cy}
                r={6}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onPointerMove={(e) =>
                  setTip({
                    x: e.nativeEvent.offsetX,
                    y: e.nativeEvent.offsetY,
                    title: `${fmtYear(pt.year)} · ${fmtPop(pt.estimate)}`,
                    lines: [
                      { label: 'Confidence', value: pt.confidence },
                      ...(pt.note ? [{ label: pt.note }] : []),
                    ],
                  })
                }
                onPointerLeave={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
      </div>

      {/* ── Confidence legend ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-1)',
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.04em',
          color: 'var(--ink-mute)',
        }}
        aria-label="Confidence key"
      >
        {/* Only show legend entries for confidence levels that appear in the data */}
        {points.some((p) => p.confidence === 'high') && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width={16} height={8} aria-hidden="true">
              <line x1={0} y1={4} x2={16} y2={4} stroke="var(--accent)" strokeWidth={2} strokeOpacity={0.9} />
            </svg>
            High
          </span>
        )}
        {points.some((p) => p.confidence === 'moderate') && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width={16} height={8} aria-hidden="true">
              <line x1={0} y1={4} x2={16} y2={4} stroke="var(--accent)" strokeWidth={1.5} strokeOpacity={0.9} />
            </svg>
            Moderate
          </span>
        )}
        {points.some((p) => p.confidence === 'low') && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width={16} height={8} aria-hidden="true">
              <line x1={0} y1={4} x2={16} y2={4} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.6} />
            </svg>
            Low
          </span>
        )}
      </div>
    </ChartFrame>
  );
}
