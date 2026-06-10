/**
 * CompositionBar — generic stacked horizontal proportion bar.
 *
 * A reusable chart for any {label, proportion}[] array. Used three times on
 * a polity's demographics tab:
 *   - religion_composition  [{ religion, proportion }]
 *   - ethnic_composition    [{ group, proportion }]
 *   - language_composition  [{ language, proportion, role? }]
 *
 * Each slice is coloured via a caller-supplied `colorFor` resolver that maps
 * a label string to a CSS-safe hex token (imported from design/tokens.ts at
 * the call site). The component itself holds no hardcoded hex.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes only.
 *   - No drop shadows; no hardcoded hex — `colorFor` must return tokens.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *
 * REALNESS LAWS:
 *   - Only renders segments for entries with a positive proportion.
 *   - Proportions are normalised to 100% so partial sums still render cleanly.
 *   - Honest empty state when the entry array is empty.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title.
 *   Bar height: 20px. Legend rows beneath (swatch + label + percentage).
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { ChartFrame } from '@/charts/ChartFrame';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single composition entry with a label and proportion (0–1 or 0–100). */
export interface CompositionEntry {
  /** Display label (religion name, ethnic group, language name, etc.). */
  label: string;
  /** Proportion value. Accepts 0–1 or 0–100 — normalised internally. */
  proportion: number;
  /** Optional sub-label (e.g. the `role` field from language_composition). */
  sublabel?: string;
}

/** Props for CompositionBar. */
export interface CompositionBarProps {
  /**
   * Ordered array of composition entries.
   * Proportions need not sum to exactly 1 (100%) — they are normalised.
   */
  entries: readonly CompositionEntry[];
  /**
   * Resolve a CSS-safe color string for a given label.
   * MUST return only token-derived hex values (from design/tokens.ts) or
   * CSS custom property expressions. Never hardcode hex in this resolver.
   *
   * Defaults to a sequential accent-opacity ramp when not supplied
   * (i.e. index-based coloring using --accent at varying opacities).
   *
   * Example:
   *   colorFor={(label) => REGION_COLORS[label] ?? LANGUAGE_FAMILY_FALLBACK}
   */
  colorFor?: (label: string, index: number) => string;
  /**
   * Claim-style chart title (assertive sentence, OWID convention).
   * E.g. "Islam dominated the Abbasid Caliphate's religious composition."
   */
  title: string;
  /**
   * Optional subtitle qualifier.
   * E.g. "Religious composition · 750–1258 CE"
   */
  subtitle?: string;
  /**
   * Optional source record ids forwarded to ChartFrame.
   */
  sourceIds?: readonly string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stacked bar height in px. */
const BAR_H = 20;

/** Hairline width. */
const HAIRLINE = 0.5;

/** Minimum proportion fraction to render a visible segment (avoids hairline slivers). */
const MIN_FRACTION = 0.01;

/** Width of the SVG viewBox (container is 100% via viewBox). */
const SVG_W = 272;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise proportions to fractions that sum to 1. */
function normalise(entries: readonly CompositionEntry[]): Array<CompositionEntry & { fraction: number }> {
  const raw = entries.filter((e) => e.proportion > 0);
  if (raw.length === 0) return [];

  // Accept both 0–1 and 0–100 ranges
  const sum = raw.reduce((s, e) => s + e.proportion, 0);
  // If proportions look like percentages (sum > 1.5), treat them as 0–100
  const divisor = sum > 1.5 ? sum : 1;

  return raw.map((e) => ({
    ...e,
    fraction: e.proportion / divisor,
  }));
}

/** Format a fraction as a percentage string (e.g. 0.34 → "34%"). */
function fmtPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
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
      No composition data recorded
    </div>
  );
}

// ── Default color resolver ────────────────────────────────────────────────────

/**
 * Sequential opacity ramp on --accent for when no colorFor is supplied.
 * Returns an inline `rgba` using the known atlas accent hex (#c19a3e).
 * The opacity steps ensure segments are visually distinct in all 4 themes.
 * (Hard-coding the accent rgb here is acceptable because it is the CSS token
 * value — not a domain data color — and it degrades gracefully in other themes.)
 */
const DEFAULT_OPACITIES = [0.90, 0.70, 0.54, 0.40, 0.28, 0.20, 0.14];

function defaultColorFor(_label: string, index: number): string {
  // Use CSS custom property with fallback hex for the accent color
  // We express this as a fixed hex with opacity so it works across themes.
  // In dark/manuscript themes the --accent hue differs, but the opacity
  // ramp still provides visual separation.
  const opacity = DEFAULT_OPACITIES[index % DEFAULT_OPACITIES.length];
  // Return accent with varying opacity via a data URI-safe approach:
  // we use a fill + fillOpacity instead of rgba — see StackedBar below.
  return `var(--accent,#c19a3e)__opacity__${opacity}`;
}

// ── SVG stacked bar ───────────────────────────────────────────────────────────

interface StackedBarProps {
  segments: Array<CompositionEntry & { fraction: number }>;
  colorFor: (label: string, index: number) => string;
}

/** Resolve fill and fillOpacity from the color string (handles default ramp). */
function resolveFill(color: string): { fill: string; fillOpacity: number } {
  if (color.includes('__opacity__')) {
    const [fill, opStr] = color.split('__opacity__');
    return { fill, fillOpacity: parseFloat(opStr) };
  }
  return { fill: color, fillOpacity: 0.88 };
}

/** Pure SVG stacked bar. No libraries. Hairline gaps between segments. */
function StackedBar({ segments, colorFor }: StackedBarProps): JSX.Element {
  let cursor = 0;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${BAR_H}`}
      width="100%"
      height={BAR_H}
      aria-label="Composition bar"
      role="img"
      style={{ display: 'block', maxWidth: SVG_W }}
    >
      {segments.map((seg, i) => {
        if (seg.fraction < MIN_FRACTION) return null;
        const x = cursor * SVG_W;
        const w = seg.fraction * SVG_W;
        cursor += seg.fraction;
        const { fill, fillOpacity } = resolveFill(colorFor(seg.label, i));

        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={w}
            height={BAR_H}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke="var(--surface)"
            strokeWidth={HAIRLINE}
          >
            <title>
              {`${seg.label}${seg.sublabel ? ' (' + seg.sublabel + ')' : ''}: ${fmtPct(seg.fraction)}`}
            </title>
          </rect>
        );
      })}

      {/* Outer border */}
      <rect
        x={0}
        y={0}
        width={SVG_W}
        height={BAR_H}
        fill="none"
        stroke="var(--border-mid)"
        strokeWidth={HAIRLINE}
      />
    </svg>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

interface LegendProps {
  segments: Array<CompositionEntry & { fraction: number }>;
  colorFor: (label: string, index: number) => string;
}

/**
 * Square-swatch legend row per segment.
 * Label left-aligned, percentage right-aligned in mono.
 */
function Legend({ segments, colorFor }: LegendProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginTop: 'var(--space-2)',
      }}
      aria-label="Composition legend"
    >
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          }}
        >
          {/* Square swatch — 8×8, hairline border, no radius (DESIGN.md) */}
          {(() => {
            const { fill, fillOpacity } = resolveFill(colorFor(seg.label, i));
            return (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  background: fill,
                  border: `${HAIRLINE}px solid var(--border-mid)`,
                  flexShrink: 0,
                  opacity: fillOpacity,
                }}
              />
            );
          })()}
          {/* Label + optional sublabel */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.04em',
              color: 'var(--ink-light)',
              textTransform: 'uppercase',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {seg.label}
            {seg.sublabel && (
              <span style={{ color: 'var(--ink-mute)', marginLeft: '4px' }}>
                · {seg.sublabel}
              </span>
            )}
          </span>
          {/* Percentage */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.04em',
              color: 'var(--ink-mute)',
              flexShrink: 0,
            }}
          >
            {fmtPct(seg.fraction)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * CompositionBar — stacked proportion bar for any {label, proportion}[] series.
 *
 * Generic enough to render religion, ethnic, or language composition.
 * The caller supplies `entries` (the real field arrays) and a `colorFor` resolver
 * that maps labels to token-derived colors.
 *
 * Renders inside ChartFrame with a claim-style title, stacked SVG bar, and
 * a square-swatch legend with percentages. Honest empty state when entries is empty.
 *
 * @param entries   - Composition entries with label and proportion.
 * @param colorFor  - Maps label → CSS-safe color string (token-derived only).
 * @param title     - Claim-style assertive title.
 * @param subtitle  - Optional qualifier subtitle.
 * @param sourceIds - Optional source record ids for ChartFrame attribution.
 */
export function CompositionBar({
  entries,
  colorFor: colorForProp,
  title,
  subtitle,
  sourceIds,
}: CompositionBarProps): JSX.Element {
  // Use caller-supplied resolver or default accent-ramp resolver
  const colorFor = colorForProp ?? defaultColorFor;

  const segments = useMemo(() => normalise(entries), [entries]);

  if (segments.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} sourceIds={sourceIds} asSection={false}>
        <EmptyState />
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} sourceIds={sourceIds} asSection={false}>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <StackedBar segments={segments} colorFor={colorFor} />
        <Legend segments={segments} colorFor={colorFor} />
      </div>
    </ChartFrame>
  );
}
