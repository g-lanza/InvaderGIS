/**
 * FactorBalance — two-sided diverging bar chart of rise vs decline factors.
 *
 * DATA CONTRACT (real donor shape on polity records):
 *   rise_factors[]:    { tag: string; layer?: string; description?: string }
 *   decline_factors[]: { tag: string; layer?: string; description?: string }
 *
 * Factors are grouped by their `layer` field. Within each layer group, bars
 * grow left (rise) or right (decline) from a centre axis. Tag labels appear
 * next to bars; full descriptions are accessible via SVG <title> tooltip.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes only.
 *   - No drop shadows; no hardcoded hex — tokens only.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *
 * REALNESS LAWS:
 *   - Renders ONLY real factor arrays. No fabrication.
 *   - Honest empty state when BOTH arrays are empty.
 *   - Each bar represents ONE factor (count = 1 per entry). Bars are equal-width;
 *     the visual is qualitative, not quantitative magnitude.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame. Centre axis hairline. Rise bars left (--accent),
 *   decline bars right (--ink-mute at reduced opacity). Layer group headers
 *   sit above their rows in mono uppercase.
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import type { RawRecord } from '@/data/loaders';
import { ChartFrame } from '@/charts/ChartFrame';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A validated factor entry from rise_factors or decline_factors. */
interface FactorEntry {
  tag: string;
  layer: string;
  description: string;
  side: 'rise' | 'decline';
}

/** A layer group containing both rise and decline entries. */
interface LayerGroup {
  layer: string;
  rise: FactorEntry[];
  decline: FactorEntry[];
}

/** A single factor entry as passed by LifecycleTab. */
export interface FactorItem {
  tag: string;
  layer?: string;
  description?: string;
}

/** Props for FactorBalance. */
export interface FactorBalanceProps {
  /**
   * Pre-parsed rise factors (from LifecycleTab). When supplied, `record` is ignored.
   * Shape: { tag: string; layer?: string; description?: string }[]
   */
  riseFactors?: FactorItem[];
  /**
   * Pre-parsed decline factors (from LifecycleTab). When supplied alongside
   * `riseFactors`, `record` is ignored.
   */
  declineFactors?: FactorItem[];
  /**
   * Polity display name (from LifecycleTab). Used in claim title.
   */
  name?: string;
  /**
   * The raw polity record (alternative to riseFactors/declineFactors/name).
   * When supplied without the pre-parsed props, reads rise_factors and
   * decline_factors from the record directly.
   */
  record?: RawRecord;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Row height per factor entry in px. */
const ROW_H = 18;

/** Group header height in px. */
const GROUP_H = 16;

/** Gap between groups in px. */
const GROUP_GAP = 6;

/** Hairline width. */
const HAIRLINE = 0.5;

/** Full bar width (half of chart width, from centre). */
const HALF_W = 120;

/** Width of the tag label area on each side (px). */
const LABEL_W = 70;

/** Total SVG width: label + bar + centre + bar + label. */
const SVG_W = LABEL_W * 2 + HALF_W * 2 + 4; // +4 for centre axis space

/** X position of the centre axis. */
const CX = LABEL_W + HALF_W + 2;

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Parse factor array from a RawRecord field.
 * Returns validated FactorEntry[] with only real, non-empty tags.
 */
function parseFactors(record: RawRecord, field: 'rise_factors' | 'decline_factors', side: 'rise' | 'decline'): FactorEntry[] {
  const raw = record[field];
  if (!Array.isArray(raw)) return [];

  const entries: FactorEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const tag = typeof obj['tag'] === 'string' ? obj['tag'].trim() : '';
    if (!tag) continue;

    const layer      = typeof obj['layer'] === 'string' ? obj['layer'].trim() : 'general';
    const description = typeof obj['description'] === 'string' ? obj['description'] : '';

    entries.push({ tag, layer, description, side });
  }
  return entries;
}

/**
 * Group rise and decline factors by layer.
 * Layers are union of all layer values in both arrays, in encounter order.
 */
function buildLayerGroups(rise: FactorEntry[], decline: FactorEntry[]): LayerGroup[] {
  const layerOrder: string[] = [];
  const seen = new Set<string>();

  for (const f of [...rise, ...decline]) {
    if (!seen.has(f.layer)) {
      layerOrder.push(f.layer);
      seen.add(f.layer);
    }
  }

  return layerOrder.map((layer) => ({
    layer,
    rise:    rise.filter((f) => f.layer === layer),
    decline: decline.filter((f) => f.layer === layer),
  }));
}

/** Title-case a snake_case label. */
function toLabel(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Claim title builder ───────────────────────────────────────────────────────

function buildClaimTitle(name: string, riseCount: number, declineCount: number): string {
  if (riseCount === 0 && declineCount === 0) return `${name} — causal factors`;
  if (riseCount === 0) return `${name} had ${declineCount} recorded decline factor${declineCount === 1 ? '' : 's'} and no documented rise drivers.`;
  if (declineCount === 0) return `${name} had ${riseCount} recorded rise factor${riseCount === 1 ? '' : 's'} and no documented decline drivers.`;
  const balance = riseCount > declineCount ? 'skewed toward rise' : riseCount < declineCount ? 'skewed toward decline' : 'balanced';
  return `${name}'s documented causal factors are ${balance}: ${riseCount} rise, ${declineCount} decline.`;
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
      No causal factors recorded
    </div>
  );
}

// ── SVG diverging chart ───────────────────────────────────────────────────────

interface DivergingSvgProps {
  groups: LayerGroup[];
}

/**
 * Pure SVG two-sided diverging bar chart grouped by layer.
 * Rise bars (--accent) grow left from centre; decline bars (muted) grow right.
 */
function DivergingSvg({ groups }: DivergingSvgProps): JSX.Element {
  // Calculate total SVG height
  let totalH = 0;
  for (const g of groups) {
    totalH += GROUP_H; // group header
    const rows = Math.max(g.rise.length, g.decline.length, 1);
    totalH += rows * ROW_H + GROUP_GAP;
  }

  const rows: JSX.Element[] = [];
  let y = 0;

  for (const group of groups) {
    // Group header
    rows.push(
      <text
        key={`hdr-${group.layer}`}
        x={CX}
        y={y + GROUP_H - 4}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.07em',
          fill: 'var(--ink-mute)',
          textTransform: 'uppercase',
        }}
      >
        {toLabel(group.layer)}
      </text>,
    );
    // Hairline under header
    rows.push(
      <line
        key={`hdr-line-${group.layer}`}
        x1={0}
        y1={y + GROUP_H}
        x2={SVG_W}
        y2={y + GROUP_H}
        stroke="var(--border)"
        strokeWidth={HAIRLINE}
      />,
    );
    y += GROUP_H;

    const maxRows = Math.max(group.rise.length, group.decline.length);
    for (let i = 0; i < maxRows; i++) {
      const rowY = y + i * ROW_H;
      const riseEntry    = group.rise[i];
      const declineEntry = group.decline[i];

      // Rise bar (left side, from CX going left)
      if (riseEntry) {
        const barW = HALF_W * 0.72; // fixed qualitative bar width
        rows.push(
          <g key={`rise-${group.layer}-${i}`}>
            <rect
              x={CX - barW}
              y={rowY + 3}
              width={barW}
              height={ROW_H - 6}
              fill="var(--accent)"
              fillOpacity={0.75}
              stroke="var(--border)"
              strokeWidth={HAIRLINE}
            >
              {riseEntry.description && (
                <title>{`Rise · ${riseEntry.tag}: ${riseEntry.description}`}</title>
              )}
            </rect>
            {/* Tag label to the left of the bar */}
            <text
              x={CX - barW - 3}
              y={rowY + ROW_H / 2 + 3}
              textAnchor="end"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                fill: 'var(--ink-light)',
                letterSpacing: '0.03em',
              }}
            >
              {riseEntry.tag.replace(/_/g, ' ')}
            </text>
          </g>,
        );
      }

      // Decline bar (right side, from CX going right)
      if (declineEntry) {
        const barW = HALF_W * 0.72;
        rows.push(
          <g key={`decline-${group.layer}-${i}`}>
            <rect
              x={CX}
              y={rowY + 3}
              width={barW}
              height={ROW_H - 6}
              fill="var(--ink-mute)"
              fillOpacity={0.45}
              stroke="var(--border)"
              strokeWidth={HAIRLINE}
            >
              {declineEntry.description && (
                <title>{`Decline · ${declineEntry.tag}: ${declineEntry.description}`}</title>
              )}
            </rect>
            {/* Tag label to the right of the bar */}
            <text
              x={CX + barW + 3}
              y={rowY + ROW_H / 2 + 3}
              textAnchor="start"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                fill: 'var(--ink-light)',
                letterSpacing: '0.03em',
              }}
            >
              {declineEntry.tag.replace(/_/g, ' ')}
            </text>
          </g>,
        );
      }
    }

    y += maxRows * ROW_H + GROUP_GAP;
  }

  // Column headers
  const headerElements = (
    <g key="col-headers">
      <text
        x={CX - HALF_W * 0.36}
        y={10}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', fill: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        Rise
      </text>
      <text
        x={CX + HALF_W * 0.36}
        y={10}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', fill: 'var(--ink-mute)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        Decline
      </text>
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${totalH + 12}`}
      width="100%"
      height={totalH + 12}
      aria-label="Rise and decline factor balance"
      role="img"
      style={{ display: 'block', overflow: 'visible', maxWidth: SVG_W }}
    >
      {headerElements}
      <g transform="translate(0, 12)">
        {/* Centre axis */}
        <line
          x1={CX}
          y1={0}
          x2={CX}
          y2={totalH}
          stroke="var(--border-mid)"
          strokeWidth={HAIRLINE}
        />
        {rows}
      </g>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Convert a FactorItem to a FactorEntry with a side label. */
function factorItemToEntry(item: FactorItem, side: 'rise' | 'decline'): FactorEntry {
  return {
    tag:         item.tag.trim(),
    layer:       item.layer?.trim() || 'general',
    description: item.description ?? '',
    side,
  };
}

/**
 * FactorBalance — two-sided diverging bar of a polity's rise vs decline factors.
 *
 * Accepts either:
 *   - `riseFactors` + `declineFactors` + `name` (from LifecycleTab — pre-parsed)
 *   - `record` (RawRecord — reads rise_factors / decline_factors internally)
 *
 * Honest empty state when both arrays are empty.
 *
 * @param riseFactors    - Pre-parsed rise factors (from LifecycleTab).
 * @param declineFactors - Pre-parsed decline factors (from LifecycleTab).
 * @param name           - Polity display name (from LifecycleTab).
 * @param record         - Raw polity RawRecord (alternative source).
 */
export function FactorBalance({ riseFactors: riseFactorsProp, declineFactors: declineFactorsProp, name: nameProp, record }: FactorBalanceProps): JSX.Element {
  const name = nameProp ?? (record
    ? (typeof record['name_primary'] === 'string' ? record['name_primary'] : String(record['id']))
    : 'Unknown');

  const { riseEntries, declineEntries, groups } = useMemo(() => {
    let rise: FactorEntry[];
    let decline: FactorEntry[];

    if (riseFactorsProp !== undefined || declineFactorsProp !== undefined) {
      rise    = (riseFactorsProp    ?? []).map((f) => factorItemToEntry(f, 'rise'));
      decline = (declineFactorsProp ?? []).map((f) => factorItemToEntry(f, 'decline'));
    } else if (record) {
      rise    = parseFactors(record, 'rise_factors',    'rise');
      decline = parseFactors(record, 'decline_factors', 'decline');
    } else {
      rise    = [];
      decline = [];
    }

    return {
      riseEntries:    rise,
      declineEntries: decline,
      groups:         buildLayerGroups(rise, decline),
    };
  }, [riseFactorsProp, declineFactorsProp, record]);

  const riseCount    = riseEntries.length;
  const declineCount = declineEntries.length;

  if (riseCount === 0 && declineCount === 0) {
    return (
      <ChartFrame
        title={`${name} — causal factors`}
        subtitle="Rise and decline drivers"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  const claimTitle = buildClaimTitle(name, riseCount, declineCount);
  const subtitle   = `${riseCount} rise · ${declineCount} decline`;

  return (
    <ChartFrame title={claimTitle} subtitle={subtitle} asSection={false}>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <DivergingSvg groups={groups} />
      </div>
    </ChartFrame>
  );
}
