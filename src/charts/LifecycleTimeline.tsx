/**
 * LifecycleTimeline — horizontal phase-ribbon chart for a polity's lifecycle.
 *
 * DATA CONTRACT (real donor shape on polity records):
 *   lifecycle_phases[]: { phase: string; years?: string; description?: string }
 *
 * Each phase has a `years` string in formats like "750-800", "750–800", or
 * just "750". Phases are placed on a shared time axis derived from the union of
 * all parsed spans. A segment ramp (token-safe, sequential from --accent
 * lightened via opacity steps) colours each phase band distinctly.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes only.
 *   - No drop shadows; no hardcoded hex — tokens only.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *
 * REALNESS LAWS:
 *   - Renders ONLY from real lifecycle_phases data. No fabrication.
 *   - Honest empty state when no lifecycle_phases are present.
 *   - Phases without parseable year spans are still shown as equal-width
 *     placeholder bands when at least one sibling has a span (ordinal fallback).
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title.
 *   Responsive to ~300px EntityDock width.
 *   Phase label + year-span caption inside each segment band.
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import type { RawRecord } from '@/data/loaders';
import { ChartFrame } from '@/charts/ChartFrame';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A parsed, validated phase entry ready for layout. */
interface PhaseEntry {
  phase: string;
  description: string;
  /** Start year parsed from the years string, or null if unparseable. */
  startYear: number | null;
  /** End year parsed from the years string, or null if unparseable. */
  endYear: number | null;
  /** The original years string for display. */
  yearsLabel: string;
}

/** Props for LifecycleTimeline. */
export interface LifecycleTimelineProps {
  /**
   * Pre-parsed lifecycle phases (preferred — called from LifecycleTab).
   * Shape: { phase: string; years?: string; description?: string }[]
   * When supplied, `record` is ignored.
   */
  phases?: { phase: string; years?: string; description?: string }[];
  /**
   * Display name of the polity (used in claim title).
   * When called from LifecycleTab, this is the name string.
   */
  name?: string;
  /**
   * The raw polity record to render (alternative to phases/name).
   * When supplied without `phases`, lifecycle_phases is read from here.
   */
  record?: RawRecord;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** SVG ribbon height in px. */
const RIBBON_H = 32;

/** Hairline width. */
const HAIRLINE = 0.5;

/** Opacity ramp for phase bands — sequential, distinguishable in all themes. */
const PHASE_OPACITIES = [0.90, 0.68, 0.50, 0.36, 0.26, 0.18, 0.12];

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Normalise a raw years string before matching.
 * Strips approximate-date qualifiers so the common medieval "circa" formats
 * parse to proportional spans while the ORIGINAL text is still shown verbatim in
 * the caption (yearsLabel keeps the un-normalised value — no fabrication):
 *   - leading "c." / "c " / "ca." / "circa" / "~" approximation markers
 *   - "to" as a range separator (e.g. "pre-500 to 900")
 *   - "pre-"/"post-"/"before "/"after " qualifiers → treat the bare year
 * Returns a string ready for the bare-integer / dash-range matchers below.
 */
function normaliseYearsString(years: string): string {
  return years
    .trim()
    .toLowerCase()
    // approximation prefix on the whole string OR either side of a range.
    // Longest alternatives first so "circa"/"ca." win over a bare "c".
    .replace(/(^|[-–—\s])\s*(circa|ca\.?|c\.|c\s|~)\s*/g, '$1')
    // word separator → dash
    .replace(/\s+to\s+/g, '-')
    // pre-/post-/before/after qualifiers → drop, keep the year
    .replace(/\b(pre|post|before|after)[-\s]*/g, '')
    .trim();
}

/**
 * Parse a years string into [startYear, endYear].
 * Accepts: "750-800", "750–800", "750—800", "750 - 800", a bare "750", and —
 * after normalisation — circa forms ("c.1080–1100"), "to" ranges
 * ("pre-500 to 900"), and pre-/post- qualifiers ("pre-500").
 * Returns [null, null] when unparseable; the caller still shows the original text.
 */
function parseYearsString(years: string): [number | null, number | null] {
  const trimmed = normaliseYearsString(years);
  // Try range with various dash characters
  const rangeMatch = trimmed.match(/^(-?\d+)\s*[-–—]\s*(-?\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end   = parseInt(rangeMatch[2], 10);
    if (isFinite(start) && isFinite(end)) return [start, end];
  }
  // Try single year
  const singleMatch = trimmed.match(/^(-?\d+)$/);
  if (singleMatch) {
    const y = parseInt(singleMatch[1], 10);
    if (isFinite(y)) return [y, y];
  }
  return [null, null];
}

/**
 * Parse a single plain phase object (from LifecycleTab's pre-parsed array)
 * into a PhaseEntry. Never throws — missing fields get defaults.
 */
function parsePhaseEntry(item: { phase: string; years?: string; description?: string }): PhaseEntry {
  const yearsRaw = item.years?.trim() ?? '';
  const [startYear, endYear] = yearsRaw ? parseYearsString(yearsRaw) : [null, null];
  return {
    phase:       item.phase.trim(),
    description: item.description ?? '',
    startYear,
    endYear,
    yearsLabel:  yearsRaw,
  };
}

/**
 * Parse lifecycle_phases from a raw polity record.
 * Returns only entries where `phase` is a non-empty string.
 */
function parsePhases(record: RawRecord): PhaseEntry[] {
  const raw = record['lifecycle_phases'];
  if (!Array.isArray(raw)) return [];

  const entries: PhaseEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const phase = typeof obj['phase'] === 'string' ? obj['phase'].trim() : '';
    if (!phase) continue;

    const yearsRaw = typeof obj['years'] === 'string' ? obj['years'].trim() : '';
    const [startYear, endYear] = yearsRaw ? parseYearsString(yearsRaw) : [null, null];
    const description = typeof obj['description'] === 'string' ? obj['description'] : '';

    entries.push({ phase, description, startYear, endYear, yearsLabel: yearsRaw });
  }
  return entries;
}

/** Title-case a snake_case or space-separated phase label. */
function toTitleCase(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Claim title builder ───────────────────────────────────────────────────────

function buildClaimTitle(name: string, phases: PhaseEntry[]): string {
  if (phases.length === 0) return `${name} — lifecycle`;
  const count = phases.length;
  const labels = phases.map((p) => toTitleCase(p.phase));
  if (count === 1) return `${name} passed through a ${labels[0].toLowerCase()} phase.`;
  if (count === 2) return `${name} moved from ${labels[0].toLowerCase()} to ${labels[1].toLowerCase()}.`;
  return `${name} traversed ${count} lifecycle phases: from ${labels[0].toLowerCase()} to ${labels[count - 1].toLowerCase()}.`;
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
      No lifecycle phases recorded
    </div>
  );
}

// ── SVG renderer ──────────────────────────────────────────────────────────────

interface RibbonSvgProps {
  phases: PhaseEntry[];
  containerW: number;
}

/**
 * Pure SVG phase ribbon. Each segment gets a proportional width based on its
 * year span; phases with no parseable span share remaining width equally.
 */
function RibbonSvg({ phases, containerW }: RibbonSvgProps): JSX.Element {
  const W = containerW;
  const svgH = RIBBON_H;

  // Compute spans in years
  const spans: number[] = phases.map((p) => {
    if (p.startYear !== null && p.endYear !== null) {
      return Math.max(1, p.endYear - p.startYear);
    }
    return 0; // placeholder — will get equal share
  });

  const totalFixedYears = spans.reduce((s, v) => s + v, 0);
  const nPlaceholder    = spans.filter((v) => v === 0).length;

  // Assign widths
  let placeholderW = 0;
  if (nPlaceholder > 0) {
    // Placeholders get 1/3 of the total proportionally, split equally
    if (totalFixedYears === 0) {
      placeholderW = W / phases.length;
    } else {
      // Give each placeholder the same width as the smallest fixed phase
      const minFixed = Math.min(...spans.filter((v) => v > 0));
      placeholderW = (minFixed / totalFixedYears) * W;
    }
  }

  const totalUnits = totalFixedYears + nPlaceholder * (
    totalFixedYears > 0 ? Math.min(...spans.filter((v) => v > 0)) : 1
  );

  const widths = spans.map((s) => {
    if (s > 0) return (s / totalUnits) * W;
    return placeholderW;
  });

  // Build segment x offsets
  const xOffsets: number[] = [];
  let cursor = 0;
  for (const w of widths) {
    xOffsets.push(cursor);
    cursor += w;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${svgH}`}
      width="100%"
      height={svgH}
      aria-label="Lifecycle phase ribbon"
      role="img"
      style={{ display: 'block', overflow: 'visible', maxWidth: W }}
    >
      {phases.map((phase, i) => {
        const x = xOffsets[i];
        const w = widths[i];
        const opacity = PHASE_OPACITIES[i % PHASE_OPACITIES.length];
        const label = toTitleCase(phase.phase);
        // Clip label to band width (using SVG clipPath)
        const clipId = `lc-clip-${i}`;

        return (
          <g key={i}>
            {/* Phase band */}
            <rect
              x={x}
              y={0}
              width={w}
              height={svgH}
              fill="var(--accent)"
              fillOpacity={opacity}
              stroke="var(--surface)"
              strokeWidth={HAIRLINE}
            />

            {/* Phase label */}
            <clipPath id={clipId}>
              <rect x={x + 2} y={0} width={Math.max(0, w - 4)} height={svgH} />
            </clipPath>
            <text
              x={x + w / 2}
              y={svgH / 2 - 4}
              textAnchor="middle"
              clipPath={`url(#${clipId})`}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '10px',
                fontWeight: 600,
                fill: 'var(--ink)',
              }}
            >
              {label}
            </text>

            {/* Year span caption */}
            {phase.yearsLabel && (
              <text
                x={x + w / 2}
                y={svgH / 2 + 8}
                textAnchor="middle"
                clipPath={`url(#${clipId})`}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fill: 'var(--ink-mute)',
                  letterSpacing: '0.03em',
                }}
              >
                {phase.yearsLabel}
              </text>
            )}

            {/* Tooltip */}
            {phase.description && (
              <title>{`${label}${phase.yearsLabel ? ' (' + phase.yearsLabel + ')' : ''}: ${phase.description}`}</title>
            )}
          </g>
        );
      })}

      {/* Outer border */}
      <rect
        x={0}
        y={0}
        width={W}
        height={svgH}
        fill="none"
        stroke="var(--border-mid)"
        strokeWidth={HAIRLINE}
      />
    </svg>
  );
}

// ── Phase caption list ────────────────────────────────────────────────────────

interface PhaseCaptionProps {
  phases: PhaseEntry[];
}

/** Compact caption list below the ribbon with description text per phase. */
function PhaseCaptions({ phases }: PhaseCaptionProps): JSX.Element | null {
  const withDesc = phases.filter((p) => p.description);
  if (withDesc.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 'var(--space-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {withDesc.map((p, i) => {
        const opacity = PHASE_OPACITIES[phases.indexOf(p) % PHASE_OPACITIES.length];
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-start',
            }}
          >
            {/* Color swatch matching the ribbon band */}
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                background: 'var(--accent)',
                opacity,
                border: `${HAIRLINE}px solid var(--border-mid)`,
                flexShrink: 0,
                marginTop: '3px',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.05em',
                  color: 'var(--ink-light)',
                  textTransform: 'uppercase',
                  marginRight: 'var(--space-1)',
                }}
              >
                {toTitleCase(p.phase)}
                {p.yearsLabel ? ` · ${p.yearsLabel}` : ''}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  color: 'var(--ink-mid)',
                  lineHeight: 1.4,
                }}
              >
                {p.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * LifecycleTimeline — horizontal phase ribbon showing a polity's lifecycle.
 *
 * Accepts either:
 *   - `phases` + `name` (from LifecycleTab — pre-parsed arrays)
 *   - `record` (RawRecord — reads lifecycle_phases internally)
 *
 * Honest empty state when no phases are present.
 *
 * @param phases - Pre-parsed lifecycle phases (from LifecycleTab).
 * @param name   - Polity display name (from LifecycleTab).
 * @param record - Raw polity RawRecord (alternative source).
 */
export function LifecycleTimeline({ phases: phasesProp, name: nameProp, record }: LifecycleTimelineProps): JSX.Element {
  const phases = useMemo(() => {
    if (phasesProp !== undefined) return phasesProp.map((p) => parsePhaseEntry(p));
    if (record) return parsePhases(record);
    return [];
  }, [phasesProp, record]);

  const name = nameProp ?? (record
    ? (typeof record['name_primary'] === 'string' ? record['name_primary'] : String(record['id']))
    : 'Unknown');

  if (phases.length === 0) {
    return (
      <ChartFrame
        title={`${name} — lifecycle phases`}
        subtitle="Lifecycle phases"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  const claimTitle = buildClaimTitle(name, phases);
  const yearMin = phases.reduce<number | null>((m, p) =>
    p.startYear !== null ? (m === null ? p.startYear : Math.min(m, p.startYear)) : m, null);
  const yearMax = phases.reduce<number | null>((m, p) =>
    p.endYear !== null ? (m === null ? p.endYear : Math.max(m, p.endYear)) : m, null);

  const subtitle =
    yearMin !== null && yearMax !== null
      ? `${phases.length} phase${phases.length === 1 ? '' : 's'} · ${yearMin}–${yearMax} CE`
      : `${phases.length} phase${phases.length === 1 ? '' : 's'}`;

  const CONTAINER_W = 272; // fits ~300px dock minus padding

  return (
    <ChartFrame title={claimTitle} subtitle={subtitle} asSection={false}>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <RibbonSvg phases={phases} containerW={CONTAINER_W} />
        <PhaseCaptions phases={phases} />
      </div>
    </ChartFrame>
  );
}
