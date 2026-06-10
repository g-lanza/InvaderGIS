/**
 * RelationshipDonut — SVG donut/pie chart of a polity's relationship types.
 *
 * DATA CONTRACT:
 *   Accepts either:
 *     a) `relationships` prop: an array of { type: string } objects — the panel
 *        resolves a polity's relationships via participants[].entity_id and passes
 *        them in (preferred — caller does the matching).
 *     b) `polityId` prop: the component self-loads all relationship records and
 *        filters by participants[].entity_id === polityId (fallback when the
 *        caller cannot pre-filter).
 *
 *   When both are supplied, `relationships` takes precedence.
 *   When neither resolves to data, renders an honest empty state.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (--radius: 0), hairline 0.5px strokes — no boxes.
 *   - No drop shadows; no hardcoded hex — colors exclusively from RELATIONSHIP_TYPES
 *     token map in design/tokens.ts + CSS custom properties for chrome.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *     In dark theme, domain colors are lightened via domainColor().
 *   - Responsive to the ~300px EntityDock width.
 *
 * REALNESS LAWS:
 *   - Counts ONLY real relationship records — never fabricated.
 *   - Center label = total number of real ties.
 *   - Honest empty state ("No recorded relationships") when array is empty.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title.
 *   Donut + square legend swatches beneath. Responsive to ~300px container.
 *
 *
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { loadRecords } from '@/data/loaders';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';
import { RELATIONSHIP_TYPES, RELATIONSHIP_FALLBACK, domainColor } from '@/design/tokens';
import { ChartFrame } from '@/charts/ChartFrame';
import { ChartLegend, type LegendItem } from '@/charts/ChartLegend';
import { ChartTooltip, type TooltipState } from '@/charts/ChartTooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A minimal relationship entry the caller passes to RelationshipDonut. */
export interface RelationshipEntry {
  /** The relationship type string, e.g. "rivalry", "alliance", "vassalage". */
  type: string;
}

/** A resolved type bucket for rendering. */
interface TypeBucket {
  type: string;
  /** Human-readable label — title-cased from the type key. */
  label: string;
  count: number;
  /** Token color for this type (already theme-adjusted). */
  color: string;
  /** Fraction of the total (0–1). */
  fraction: number;
}

/** Props for RelationshipDonut. Exactly one of the two sources should be provided. */
export interface RelationshipDonutProps {
  /**
   * Pre-resolved array of relationship entries for a specific polity.
   * The panel filters by participants[].entity_id === polityId and passes
   * the matching records here. When provided, `polityId` is ignored.
   */
  relationships?: readonly RelationshipEntry[];
  /**
   * Fallback: when `relationships` is not supplied, the component self-loads
   * all relationship records and filters by participants[].entity_id === polityId.
   * Only used when the caller cannot pre-filter.
   */
  polityId?: string;
  /**
   * The active theme name — used to lighten domain colors in dark mode.
   * E.g. "atlas" | "manuscript" | "dark" | "contrast".
   * Defaults to "atlas" (no lightening).
   */
  theme?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Donut outer radius in SVG user-units. */
const OUTER_R = 56;

/** Donut inner radius (hole). ~60% of outer = typical donut proportion. */
const INNER_R = 33;

/** Half-hairline for donut segment gaps. */
const GAP_DEG = 0.8;

/** Minimum fraction to render a slice (avoid 1px slivers for tiny segments). */
const MIN_FRACTION = 0.02;

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Title-case a snake_case type key.
 * E.g. "dynastic_union" → "Dynastic Union".
 */
function toLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Load and filter relationship records by polityId using participants[].entity_id.
 * This is the correct matching strategy — from_id/to_id are often empty strings.
 */
function loadRelationshipsForPolity(polityId: string, facets: FilterFacets): RelationshipEntry[] {
  const records = loadRecords('relationship');
  const result: RelationshipEntry[] = [];

  for (const rec of records) {
    // Pass 1 (linked views): honor the shared facets on the self-load path
    // (kinds/year-range narrow the ties counted). The prop path is pre-filtered
    // by the caller and is intentionally left untouched.
    if (!passesFilter(rec, facets)) continue;
    const type = typeof rec['type'] === 'string' ? rec['type'] : '';
    if (!type) continue;

    // Prefer participants[] (real data shape)
    const participants = rec['participants'];
    if (Array.isArray(participants)) {
      const matched = participants.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          (p as Record<string, unknown>)['entity_id'] === polityId,
      );
      if (matched) {
        result.push({ type });
      }
      continue;
    }

    // Fallback: legacy from_id / to_id (kept for back-compat)
    const fromId = typeof rec['from_id'] === 'string' ? rec['from_id'] : '';
    const toId   = typeof rec['to_id']   === 'string' ? rec['to_id']   : '';
    if ((fromId && fromId === polityId) || (toId && toId === polityId)) {
      result.push({ type });
    }
  }

  return result;
}

/**
 * Aggregate relationship entries into sorted type buckets.
 * Buckets are sorted descending by count so the legend reads naturally.
 */
function buildBuckets(
  entries: readonly RelationshipEntry[],
  theme: string,
): TypeBucket[] {
  // Count per type
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!e.type) continue;
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  }

  const total = entries.length;
  if (total === 0) return [];

  const buckets: TypeBucket[] = [];
  for (const [type, count] of counts) {
    const baseHex = RELATIONSHIP_TYPES[type] ?? RELATIONSHIP_FALLBACK;
    const color   = domainColor(baseHex, theme);
    buckets.push({
      type,
      label: toLabel(type),
      count,
      color,
      fraction: count / total,
    });
  }

  // Sort descending by count for a natural reading order
  return [...buckets].sort((a, b) => b.count - a.count);
}

// ── SVG arc helpers ───────────────────────────────────────────────────────────

/** Convert degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Build an SVG arc path for a donut segment.
 *
 * @param cx       - Center x of the donut.
 * @param cy       - Center y of the donut.
 * @param outerR   - Outer radius.
 * @param innerR   - Inner radius (hole).
 * @param startDeg - Start angle in degrees (0 = top, clockwise).
 * @param endDeg   - End angle in degrees.
 * @returns        An SVG path `d` string for the segment.
 */
function donutSegmentPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  // Convert to standard math angles (0 = right, CCW)
  // We rotate by -90 so 0-degree is at the top.
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

// ── SVG Donut renderer ────────────────────────────────────────────────────────

interface DonutSvgProps {
  buckets: TypeBucket[];
  total: number;
  /** Types currently hidden via the legend (rendered transparent). */
  hidden: ReadonlySet<string>;
  /** The hovered type (from legend or segment) — emphasised; others dimmed. */
  hovered: string | null;
  /** Report a hovered segment for the shared tooltip. */
  onSegmentHover: (tip: TooltipState | null) => void;
  /** Report a hovered segment's type so the legend/chart highlight in sync. */
  onHoverType: (type: string | null) => void;
}

/**
 * Pure SVG donut chart. No external libraries.
 * Hairline gaps between segments via GAP_DEG offset.
 * Center label shows total tie count.
 * Segments dim when another type is hovered or when toggled off via the legend.
 */
function DonutSvg({
  buckets,
  total,
  hidden,
  hovered,
  onSegmentHover,
  onHoverType,
}: DonutSvgProps): JSX.Element {
  const cx = OUTER_R + 2; // +2px margin
  const cy = OUTER_R + 2;
  const svgSize = (OUTER_R + 2) * 2;

  // Build angle extents for each segment
  interface SegmentAngle {
    startDeg: number;
    endDeg: number;
    bucket: TypeBucket;
  }

  const segments: SegmentAngle[] = [];
  let cursor = 0; // degrees walked so far

  for (const bucket of buckets) {
    const spanDeg = bucket.fraction * 360;

    // Skip slices too small to render legibly
    if (spanDeg < MIN_FRACTION * 360) {
      cursor += spanDeg;
      continue;
    }

    // Apply half-gap on each side of the segment (hairline visual separation)
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
      {/* Donut segments — dim when hidden via legend or when another is hovered. */}
      {segments.map(({ startDeg, endDeg, bucket }) => {
        const isHidden = hidden.has(bucket.type);
        const dimmed   = hovered !== null && hovered !== bucket.type;
        const opacity  = isHidden ? 0 : dimmed ? 0.3 : 0.88;
        return (
          <path
            key={bucket.type}
            d={donutSegmentPath(cx, cy, OUTER_R, INNER_R, startDeg, endDeg)}
            fill={bucket.color}
            fillOpacity={opacity}
            stroke="var(--surface)"
            strokeWidth={0.5}
            style={{ transition: 'fill-opacity 120ms ease', cursor: 'pointer' }}
            onPointerMove={(e) =>
              onSegmentHover({
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
                lines: [
                  {
                    swatch: bucket.color,
                    label: bucket.label,
                    value: `${bucket.count} (${Math.round(bucket.fraction * 100)}%)`,
                  },
                ],
              })
            }
            onPointerEnter={() => onHoverType(bucket.type)}
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
        ties
      </text>
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

/** Honest empty state when a polity has no recorded relationships. */
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
        borderTop: '0.5px solid var(--border)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      No recorded relationships
    </div>
  );
}

// ── Claim title builder ───────────────────────────────────────────────────────

/**
 * Build an OWID-style assertive claim title from the bucket distribution.
 * Uses only real aggregated counts — never fabricated.
 */
function buildClaimTitle(buckets: TypeBucket[], total: number): string {
  if (buckets.length === 0) return 'No recorded relationships';

  const dominant = buckets[0];
  const pct = Math.round(dominant.fraction * 100);

  if (buckets.length === 1) {
    return `All ${total} recorded tie${total === 1 ? '' : 's'} are of type ${dominant.label.toLowerCase()}.`;
  }

  return (
    `${dominant.label} is the dominant tie (${pct}% of ${total} recorded relationship${total === 1 ? '' : 's'}).`
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * RelationshipDonut — donut chart of a polity's relationship type distribution.
 *
 * Accepts pre-resolved `relationships` from the panel (preferred), or
 * falls back to self-loading via `polityId`. Uses the `theme` prop to
 * lighten domain colors in dark mode.
 *
 * Renders inside ChartFrame with a claim-style title. Honest empty state
 * when no relationships are found.
 *
 * @param relationships - Pre-filtered relationship entries ({ type }[]).
 * @param polityId      - Polity id for self-loading (used when relationships is absent).
 * @param theme         - Active theme string ("atlas"|"manuscript"|"dark"|"contrast").
 */
export function RelationshipDonut({
  relationships,
  polityId,
  theme = 'atlas',
}: RelationshipDonutProps): JSX.Element {
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);

  // Resolve entries — caller-supplied takes precedence over self-loaded
  const entries = useMemo<readonly RelationshipEntry[]>(() => {
    if (relationships !== undefined) return relationships;
    if (polityId)
      return loadRelationshipsForPolity(polityId, {
        yearRange: filterYearRange,
        kinds: filterKinds,
        regions: filterRegions,
        confidence: filterConfidence,
        attestation: filterAttestation,
      });
    return [];
  }, [relationships, polityId, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation]);

  const buckets = useMemo(() => buildBuckets(entries, theme), [entries, theme]);
  const total   = entries.length;

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
    key: b.type,
    label: b.label,
    color: b.color,
    value: b.count,
  }));

  const claimTitle = buildClaimTitle(buckets, total);

  const subtitle =
    total > 0
      ? `${buckets.length} type${buckets.length === 1 ? '' : 's'} · ${total} relationship${total === 1 ? '' : 's'}`
      : 'Relationship types';

  if (total === 0) {
    return (
      <ChartFrame
        title="No recorded relationships"
        subtitle="Relationship types"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={claimTitle}
      subtitle={subtitle}
      asSection={false}
    >
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
        {/* Donut SVG */}
        <DonutSvg
          buckets={buckets}
          total={total}
          hidden={hidden}
          hovered={hovered}
          onSegmentHover={setTip}
          onHoverType={setHovered}
        />

        {/* Interactive legend — hover highlights, click toggles a series. */}
        <ChartLegend
          items={legendItems}
          hidden={hidden}
          onToggle={toggle}
          onHover={setHovered}
          ariaLabel="Relationship type legend — click to toggle"
        />

        {/* Shared styled tooltip (replaces the SVG <title>). */}
        <ChartTooltip tip={tip} />
      </div>
    </ChartFrame>
  );
}
