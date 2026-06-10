/**
 * EconomicSummary — structured economic profile block for a polity record.
 *
 * DATA CONTRACT (real donor shape on polity records):
 *   economic?: {
 *     primary_base?:    string
 *     secondary_bases?: string[]
 *     wealth_level?:    string    ("high" | "medium" | "low" | or arbitrary)
 *     major_exports?:   string[]
 *     major_imports?:   string[]
 *   }
 *
 * Renders:
 *   1. Wealth level chip — a transparent chip with a single --accent swatch whose
 *      opacity steps with the tier (very_high=full → subsistence=faint), covering
 *      the full real donor domain. Token-only; no hardcoded accent rgb.
 *   2. Primary base and secondary bases as labelled rows.
 *   3. Major exports and major imports as wrapping tag chips.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px borders only.
 *   - No drop shadows; no hardcoded hex — tokens only.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *
 * REALNESS LAWS:
 *   - Renders ONLY from real economic data in the record.
 *   - Honest empty state when the `economic` field is absent or has no usable data.
 *
 * LAYOUT:
 *   Wrapped in ChartFrame. Not SVG-based — plain HTML/CSS structured block.
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import type { RawRecord } from '@/data/loaders';
import { ChartFrame } from '@/charts/ChartFrame';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Validated economic fields extracted from a raw polity record. */
interface EconomicData {
  wealthLevel:    string | null;
  primaryBase:    string | null;
  secondaryBases: string[];
  exports:        string[];
  imports:        string[];
}

/** The economic sub-object shape (mirrors EconomyTab's EconomicData). */
export interface EconomicObject {
  primary_base?: string;
  secondary_bases?: string[];
  wealth_level?: string;
  major_exports?: string[];
  major_imports?: string[];
  [k: string]: unknown;
}

/** Props for EconomicSummary. */
export interface EconomicSummaryProps {
  /**
   * Pre-extracted economic object (from EconomyTab). When supplied, `record` is ignored.
   * Shape mirrors the real donor economic{} field.
   */
  economic?: EconomicObject;
  /**
   * Polity display name (from EconomyTab). Used in claim title.
   */
  name?: string;
  /**
   * The raw polity record (alternative to economic + name).
   * When supplied without `economic`, reads the economic field internally.
   */
  record?: RawRecord;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hairline width. */
const HAIRLINE = 0.5;

/**
 * Wealth level to opacity mapping.
 * Drives the accent swatch ramp: very_high=full → subsistence=faintest.
 *
 * Domain reconciled against the real donor wealth_level values across all 255
 * polities that carry an economic{} object:
 *   very_high (42) · high (84) · moderate (93) · low (24) · very_low (6) · subsistence (6)
 * `medium` is kept as an alias of `moderate` for any legacy/aliased records.
 * Every real tier maps to a distinct opacity step so the strongest and weakest
 * tiers no longer collapse onto the unknown-default value.
 */
const WEALTH_OPACITY: Record<string, number> = {
  very_high:   1.00,
  high:        0.82,
  medium:      0.58,
  moderate:    0.58,
  low:         0.34,
  very_low:    0.22,
  minimal:     0.18,
  subsistence: 0.14,
};

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Extract and validate economic fields from a plain economic object
 * (e.g. as passed by EconomyTab: { primary_base, secondary_bases, ... }).
 * Returns null when the object contains no usable data.
 */
function parseEconomicObject(eco: Record<string, unknown>): EconomicData | null {

  const wealthLevel   = typeof eco['wealth_level']   === 'string' ? eco['wealth_level'].trim()   : null;
  const primaryBase   = typeof eco['primary_base']   === 'string' ? eco['primary_base'].trim()   : null;

  const secondaryBases: string[] = Array.isArray(eco['secondary_bases'])
    ? (eco['secondary_bases'] as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
    : [];

  const exports: string[] = Array.isArray(eco['major_exports'])
    ? (eco['major_exports'] as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
    : [];

  const imports: string[] = Array.isArray(eco['major_imports'])
    ? (eco['major_imports'] as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
    : [];

  // Only return data if at least one field is present
  const hasData = wealthLevel || primaryBase || secondaryBases.length > 0 || exports.length > 0 || imports.length > 0;
  if (!hasData) return null;

  return { wealthLevel, primaryBase, secondaryBases, exports, imports };
}

/**
 * Extract and validate economic fields from a raw polity record.
 * Returns null when the `economic` field is absent or contains no usable data.
 */
function parseEconomicData(record: RawRecord): EconomicData | null {
  const raw = record['economic'];
  if (typeof raw !== 'object' || raw === null) return null;
  return parseEconomicObject(raw as Record<string, unknown>);
}

/** Title-case a label string. */
function toLabel(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Claim title builder ───────────────────────────────────────────────────────

function buildClaimTitle(name: string, data: EconomicData): string {
  if (data.primaryBase) {
    const wealth = data.wealthLevel ? ` with ${data.wealthLevel} wealth` : '';
    return `${name} was primarily ${toLabel(data.primaryBase).toLowerCase()}-based${wealth}.`;
  }
  if (data.wealthLevel) {
    return `${name} had a ${data.wealthLevel}-wealth economic profile.`;
  }
  return `${name} — economic profile.`;
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
      No economic data recorded
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Wealth chip — the wealth tier rendered as a mono label preceded by a single
 * accent swatch whose opacity encodes the tier (very_high=opaque → subsistence=faint).
 *
 * The chip background is `transparent`: the opacity ramp lives entirely on the
 * token-driven swatch, mirroring the CompositionBar/LifecycleTimeline idiom
 * (fill on var(--accent) + opacity). No rgba(var(--accent-rgb…)) — that token
 * does not exist and previously hardcoded the Atlas gilt RGB in all four themes.
 */
function WealthChip({ level }: { level: string }): JSX.Element {
  const opacity = WEALTH_OPACITY[level.toLowerCase()] ?? 0.35;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        border: `${HAIRLINE}px solid var(--border-mid)`,
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--ink)',
        background: 'transparent',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          background: 'var(--accent)',
          opacity,
          border: `${HAIRLINE}px solid var(--border-mid)`,
          marginRight: '5px',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {toLabel(level)} wealth
    </span>
  );
}

/** A labelled row used for primary/secondary bases. */
function ProfileRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'baseline',
        padding: 'var(--space-1) 0',
        borderBottom: `${HAIRLINE}px solid var(--border)`,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--ink-mute)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          flexShrink: 0,
          minWidth: '5em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--ink-light)',
          lineHeight: 1.4,
        }}
      >
        {toLabel(value)}
      </span>
    </div>
  );
}

/** Wrapping chip row for exports or imports. */
function TagChipRow({ label, chips }: { label: string; chips: string[] }): JSX.Element | null {
  if (chips.length === 0) return null;
  return (
    <div
      style={{
        padding: 'var(--space-1) 0',
        borderBottom: `${HAIRLINE}px solid var(--border)`,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--ink-mute)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {chips.map((chip, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              padding: '1px 5px',
              border: `${HAIRLINE}px solid var(--border-mid)`,
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.04em',
              color: 'var(--ink-light)',
              textTransform: 'uppercase',
            }}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * EconomicSummary — structured economic profile block for a polity.
 *
 * Accepts either:
 *   - `economic` + `name` (from EconomyTab — pre-extracted economic object)
 *   - `record` (RawRecord — reads the economic field internally)
 *
 * Honest empty state when no usable economic data is found.
 *
 * @param economic - Pre-extracted economic object (from EconomyTab).
 * @param name     - Polity display name (from EconomyTab).
 * @param record   - Raw polity RawRecord (alternative source).
 */
export function EconomicSummary({ economic: economicProp, name: nameProp, record }: EconomicSummaryProps): JSX.Element {
  const name = nameProp ?? (record
    ? (typeof record['name_primary'] === 'string' ? record['name_primary'] : String(record['id']))
    : 'Unknown');

  const data = useMemo(() => {
    if (economicProp !== undefined) return parseEconomicObject(economicProp as Record<string, unknown>);
    if (record) return parseEconomicData(record);
    return null;
  }, [economicProp, record]);

  if (!data) {
    return (
      <ChartFrame
        title={`${name} — economic profile`}
        subtitle="Economy"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  const claimTitle = buildClaimTitle(name, data);
  const parts: string[] = [];
  if (data.primaryBase) parts.push(toLabel(data.primaryBase));
  if (data.exports.length > 0) parts.push(`${data.exports.length} export${data.exports.length === 1 ? '' : 's'}`);
  if (data.imports.length > 0) parts.push(`${data.imports.length} import${data.imports.length === 1 ? '' : 's'}`);
  const subtitle = parts.length > 0 ? parts.join(' · ') : 'Economy';

  return (
    <ChartFrame title={claimTitle} subtitle={subtitle} asSection={false}>
      <div style={{ marginTop: 'var(--space-2)' }}>
        {/* Wealth chip */}
        {data.wealthLevel && (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <WealthChip level={data.wealthLevel} />
          </div>
        )}

        {/* Primary base */}
        {data.primaryBase && (
          <ProfileRow label="Primary" value={data.primaryBase} />
        )}

        {/* Secondary bases (rendered as individual rows if multiple, inline if single) */}
        {data.secondaryBases.length > 0 && (
          <ProfileRow
            label="Secondary"
            value={data.secondaryBases.map(toLabel).join(', ')}
          />
        )}

        {/* Exports */}
        <TagChipRow label="Exports" chips={data.exports} />

        {/* Imports */}
        <TagChipRow label="Imports" chips={data.imports} />
      </div>
    </ChartFrame>
  );
}
