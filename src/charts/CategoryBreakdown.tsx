/**
 * CategoryBreakdown — donut chart of a polity's events grouped by category.
 *
 * DATA CONTRACT:
 *   Reads event records from loadRecords('event') where rec.entity === polityId.
 *   Category is derived from event.type via SUBTYPE_TO_CATEGORY[event.type],
 *   with a fallback to 'power' (as documented in design/tokens.ts).
 *   Colors come from EVENT_CATEGORIES[category].color from design/tokens.ts.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes only.
 *   - No drop shadows; no hardcoded hex — colors exclusively from EVENT_CATEGORIES
 *     token map in design/tokens.ts.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *     Dark theme: domain colors lightened via domainColor().
 *
 * REALNESS LAWS:
 *   - Counts ONLY real event records — never fabricated.
 *   - Center label = total number of real events.
 *   - Honest empty state ("No events recorded") when event array is empty.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title.
 *   Donut SVG + square-swatch legend. Responsive to ~300px container.
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { loadRecords } from '@/data/loaders';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';
import {
  EVENT_CATEGORIES,
  SUBTYPE_TO_CATEGORY,
  domainColor,
} from '@/design/tokens';
import type { EventCategory } from '@/design/tokens';
import { ChartFrame } from '@/charts/ChartFrame';
import { ChartLegend, type LegendItem } from '@/charts/ChartLegend';
import { ChartTooltip, type TooltipState } from '@/charts/ChartTooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A resolved category bucket for rendering. */
interface CategoryBucket {
  category: EventCategory;
  label: string;
  code: string;
  count: number;
  color: string;
  fraction: number;
}

/** Props for CategoryBreakdown. */
export interface CategoryBreakdownProps {
  /**
   * The polity id to match events against (event.entity === polityId).
   */
  polityId: string;
  /**
   * Optional display name for the polity (used in claim title).
   */
  polityName?: string;
  /**
   * Active theme string — used to lighten domain colors in dark mode.
   * E.g. "atlas" | "manuscript" | "dark" | "contrast".
   * Defaults to "atlas" (no lightening).
   */
  theme?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Donut outer radius in SVG user-units. */
const OUTER_R = 52;

/** Donut inner radius (hole). ~60% of outer. */
const INNER_R = 31;

/** Half-hairline gap between segments (degrees). */
const GAP_DEG = 0.8;

/** Minimum fraction to render a slice. */
const MIN_FRACTION = 0.015;

/** Hairline width. */
const HAIRLINE = 0.5;

// ── Data helpers ──────────────────────────────────────────────────────────────

/** Build a lookup map from EVENT_CATEGORIES: id → { label, code, color }. */
const CATEGORY_META: Record<string, { label: string; code: string; color: string }> = {};
for (const cat of EVENT_CATEGORIES) {
  CATEGORY_META[cat.id] = { label: cat.label, code: cat.code, color: cat.color };
}

/**
 * Load all events for a polity and aggregate into category buckets.
 * Returns buckets sorted descending by count.
 */
function buildCategoryBuckets(
  polityId: string,
  theme: string,
  facets: FilterFacets,
): CategoryBucket[] {
  const events = loadRecords('event');
  const counts = new Map<EventCategory, number>();

  for (const ev of events) {
    if (ev['entity'] !== polityId) continue;
    // Pass 1 (linked views): honor the shared facets so this donut reflects the
    // active filter (e.g. confidence / year-range narrows the events counted).
    if (!passesFilter(ev, facets)) continue;
    const type     = typeof ev['type'] === 'string' ? ev['type'] : '';
    const category = (SUBTYPE_TO_CATEGORY[type] ?? 'power') as EventCategory;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const total = Array.from(counts.values()).reduce((s, c) => s + c, 0);
  if (total === 0) return [];

  const buckets: CategoryBucket[] = [];
  for (const [category, count] of counts) {
    const meta = CATEGORY_META[category];
    if (!meta) continue;
    const color = domainColor(meta.color, theme);
    buckets.push({
      category,
      label:    meta.label,
      code:     meta.code,
      count,
      color,
      fraction: count / total,
    });
  }

  return [...buckets].sort((a, b) => b.count - a.count);
}

// ── Claim title builder ───────────────────────────────────────────────────────

function buildClaimTitle(polityName: string, buckets: CategoryBucket[], total: number): string {
  if (buckets.length === 0) return `${polityName} — event history`;
  const dominant = buckets[0];
  const pct      = Math.round(dominant.fraction * 100);
  if (buckets.length === 1) {
    return `All ${total} recorded event${total === 1 ? '' : 's'} for ${polityName} are ${dominant.label.toLowerCase()}.`;
  }
  return `${dominant.label} events dominate ${polityName}'s history — ${pct}% of ${total} recorded.`;
}

// ── SVG arc helpers ───────────────────────────────────────────────────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Build an SVG path for a donut segment (same shape as RelationshipDonut).
 */
function donutSegmentPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const startRad = toRad(startDeg - 90);
  const endRad   = toRad(endDeg   - 90);

  const x1o = cx + outerR * Math.cos(startRad);
  const y1o = cy + outerR * Math.sin(startRad);
  const x2o = cx + outerR * Math.cos(endRad);
  const y2o = cy + outerR * Math.sin(endRad);
  const x1i = cx + innerR * Math.cos(endRad);
  const y1i = cy + innerR * Math.sin(endRad);
  const x2i = cx + innerR * Math.cos(startRad);
  const y2i = cy + innerR * Math.sin(startRad);

  const sweep = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${x1o.toFixed(3)} ${y1o.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${sweep} 1 ${x2o.toFixed(3)} ${y2o.toFixed(3)}`,
    `L ${x1i.toFixed(3)} ${y1i.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${sweep} 0 ${x2i.toFixed(3)} ${y2i.toFixed(3)}`,
    'Z',
  ].join(' ');
}

// ── SVG Donut ─────────────────────────────────────────────────────────────────

interface DonutSvgProps {
  buckets: CategoryBucket[];
  total: number;
  hidden: ReadonlySet<string>;
  hovered: string | null;
  onSegmentHover: (tip: TooltipState | null) => void;
  onHoverType: (key: string | null) => void;
}

/** Pure SVG donut chart. Hairline gaps between segments. Center = total count.
 *  Segments dim when hidden via legend or when another category is hovered. */
function DonutSvg({
  buckets,
  total,
  hidden,
  hovered,
  onSegmentHover,
  onHoverType,
}: DonutSvgProps): JSX.Element {
  const cx      = OUTER_R + 2;
  const cy      = OUTER_R + 2;
  const svgSize = (OUTER_R + 2) * 2;

  const segments: { startDeg: number; endDeg: number; bucket: CategoryBucket }[] = [];
  let cursor = 0;

  for (const bucket of buckets) {
    const spanDeg = bucket.fraction * 360;
    if (spanDeg < MIN_FRACTION * 360) { cursor += spanDeg; continue; }

    const startDeg = cursor + GAP_DEG / 2;
    const endDeg   = cursor + spanDeg - GAP_DEG / 2;
    segments.push({ startDeg, endDeg, bucket });
    cursor += spanDeg;
  }

  return (
    <svg
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      width={svgSize}
      height={svgSize}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {segments.map(({ startDeg, endDeg, bucket }) => {
        const isHidden = hidden.has(bucket.category);
        const dimmed   = hovered !== null && hovered !== bucket.category;
        const opacity  = isHidden ? 0 : dimmed ? 0.3 : 0.88;
        return (
          <path
            key={bucket.category}
            d={donutSegmentPath(cx, cy, OUTER_R, INNER_R, startDeg, endDeg)}
            fill={bucket.color}
            fillOpacity={opacity}
            stroke="var(--surface)"
            strokeWidth={HAIRLINE}
            style={{ transition: 'fill-opacity 120ms ease', cursor: 'pointer' }}
            onPointerMove={(e) =>
              onSegmentHover({
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
                lines: [
                  {
                    swatch: bucket.color,
                    label: `${bucket.label} [${bucket.code}]`,
                    value: `${bucket.count} (${Math.round(bucket.fraction * 100)}%)`,
                  },
                ],
              })
            }
            onPointerEnter={() => onHoverType(bucket.category)}
            onPointerLeave={() => {
              onSegmentHover(null);
              onHoverType(null);
            }}
          />
        );
      })}

      {/* Center total label */}
      <text
        x={cx}
        y={cy - 5}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 700,
          fill: 'var(--ink)',
        }}
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 9}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '7px',
          letterSpacing: '0.07em',
          fill: 'var(--ink-mute)',
          textTransform: 'uppercase',
        }}
      >
        events
      </text>
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

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
      No events recorded for this polity
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * CategoryBreakdown — donut chart of events for a polity grouped by category.
 *
 * Self-loads event records via `loadRecords('event')`, filters by event.entity === polityId.
 * Derives category via SUBTYPE_TO_CATEGORY from design/tokens.ts.
 * Colors from EVENT_CATEGORIES token map; lightened in dark theme via domainColor().
 *
 * Honest empty state when no events are found.
 *
 * @param polityId   - The polity id to filter events by.
 * @param polityName - Optional display name for claim title.
 * @param theme      - Active theme ("atlas"|"manuscript"|"dark"|"contrast").
 */
export function CategoryBreakdown({
  polityId,
  polityName = polityId,
  theme = 'atlas',
}: CategoryBreakdownProps): JSX.Element {
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);
  const buckets = useMemo(
    () =>
      buildCategoryBuckets(polityId, theme, {
        yearRange: filterYearRange,
        kinds: filterKinds,
        regions: filterRegions,
        confidence: filterConfidence,
        attestation: filterAttestation,
      }),
    [polityId, theme, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation],
  );
  const total   = useMemo(() => buckets.reduce((s, b) => s + b.count, 0), [buckets]);

  // Interactive legend + tooltip state.
  const [hidden, setHidden]   = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip]         = useState<TooltipState | null>(null);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const legendItems: LegendItem[] = buckets.map((b) => ({
    key: b.category,
    label: b.label,
    color: b.color,
    value: b.count,
  }));

  const claimTitle = buildClaimTitle(polityName, buckets, total);
  const subtitle   =
    total > 0
      ? `${buckets.length} categor${buckets.length === 1 ? 'y' : 'ies'} · ${total} event${total === 1 ? '' : 's'}`
      : 'Event categories';

  if (total === 0) {
    return (
      <ChartFrame
        title={`${polityName} — event history`}
        subtitle="Event categories"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={claimTitle} subtitle={subtitle} asSection={false}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-2)',
          minHeight: `${(OUTER_R + 2) * 2}px`,
        }}
      >
        <DonutSvg
          buckets={buckets}
          total={total}
          hidden={hidden}
          hovered={hovered}
          onSegmentHover={setTip}
          onHoverType={setHovered}
        />
        <ChartLegend
          items={legendItems}
          hidden={hidden}
          onToggle={toggle}
          onHover={setHovered}
          ariaLabel="Event category legend — click to toggle"
        />
        <ChartTooltip tip={tip} />
      </div>
    </ChartFrame>
  );
}
