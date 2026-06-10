/**
 * EconomyTab — economic profile for a polity record.
 *
 * Sections (all backed by REAL recovered fields — no fabrication):
 *   1. EconomicSummary chart — wraps economic{} object with ChartFrame idiom
 *   2. Detailed economic fields: primary base, secondary bases, wealth level,
 *      exports, imports, trade partners, revenue sources (all from real data)
 *
 * Honest-empty: entire tab shows a clear empty state when economic{} is absent.
 * Individual fields within economic{} that are absent are simply omitted from
 * the dl — no "—" placeholders for optional sub-fields.
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows.
 *   - Token colors only — zero hardcoded hex.
 *   - No italics in chrome.
 *   - Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 *
 * Chart mount point:
 *   EconomicSummary — imported below as a lazy stub.
 *   Props contract (to be wired by integration agent):
 *     <EconomicSummary
 *       economic={{
 *         primary_base?: string;
 *         secondary_bases?: string[];
 *         wealth_level?: string;
 *         major_exports?: string[];
 *         major_imports?: string[];
 *         [k: string]: unknown;
 *       }}
 *       name={string}
 *     />
 *   Integration agent reconciles if the chart builder uses a different shape.
 */

import { lazy, Suspense, useMemo, type JSX } from 'react';
import type { CardProps } from '@/panels/types';
import type { RawRecord } from '@/data/loaders';
import { humanizeLabel } from '@/data/displayName';

// ── Lazy chart import ─────────────────────────────────────────────────────────
// CHART MOUNT — EconomicSummary
// Integration agent: wire to src/charts/EconomicSummary when built.
// Expected props: economic: EconomicData (see type below), name: string
const EconomicSummary = lazy(() =>
  import('@/charts/EconomicSummary').then((m) => ({ default: m.EconomicSummary })),
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** The economic sub-object shape from recovered donor data. */
interface EconomicData {
  primary_base?: string;
  secondary_bases?: string[];
  wealth_level?: string;
  major_exports?: string[];
  major_imports?: string[];
  major_trade_partners?: string[];
  revenue_sources?: string[];
  [k: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse economic{} from a RawRecord field. Returns null when absent. */
function parseEconomic(raw: unknown): EconomicData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const getString = (k: string): string | undefined =>
    typeof obj[k] === 'string' && obj[k] !== '' ? (obj[k] as string) : undefined;
  const getStringArray = (k: string): string[] | undefined => {
    const v = obj[k];
    if (!Array.isArray(v)) return undefined;
    const arr = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
    return arr.length > 0 ? arr : undefined;
  };
  const result: EconomicData = {
    primary_base:          getString('primary_base'),
    secondary_bases:       getStringArray('secondary_bases'),
    wealth_level:          getString('wealth_level'),
    major_exports:         getStringArray('major_exports'),
    major_imports:         getStringArray('major_imports'),
    major_trade_partners:  getStringArray('major_trade_partners'),
    revenue_sources:       getStringArray('revenue_sources'),
  };
  const hasAny = Object.values(result).some((v) => v !== undefined);
  return hasAny ? result : null;
}

/** Humanise a snake_case enum value (shared helper; em-dash for empty). */
function humanise(s: string): string {
  return humanizeLabel(s);
}

// ── Primitives ────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps): JSX.Element {
  return (
    <div
      className="panel"
      style={{ borderBottom: '0.5px solid var(--border)' }}
    >
      <div className="panel-head">
        <span className="panel-head__label">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** A chip-list of string items — exports/imports/bases/partners. */
function ChipList({ items }: { items: string[] }): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-1) var(--space-3) var(--space-2)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-1) var(--space-2)',
      }}
    >
      {items.map((item) => (
        <span
          key={item}
          className="chip"
          style={{
            fontSize: '10px',
            color: 'var(--ink-light)',
            borderColor: 'var(--border-mid)',
            textTransform: 'capitalize',
          }}
        >
          {humanise(item)}
        </span>
      ))}
    </div>
  );
}

/** Wealth-level indicator: styled token chip with appropriate accent. */
function WealthChip({ level }: { level: string }): JSX.Element {
  // Map donor wealth_level strings to a consistent display tier
  const tier =
    level === 'very_high' || level === 'high'
      ? 'high'
      : level === 'medium' || level === 'moderate'
      ? 'medium'
      : 'low';

  // Token-only color — no hex; use accent for high, ink-mid for medium, ink-mute for low
  const color =
    tier === 'high'
      ? 'var(--accent)'
      : tier === 'medium'
      ? 'var(--ink-mid)'
      : 'var(--ink-mute)';

  return (
    <span
      className="chip"
      style={{
        color,
        borderColor: color,
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {humanise(level)}
    </span>
  );
}

// ── EconomyTab ────────────────────────────────────────────────────────────────

/**
 * Economy tab for a polity record.
 *
 * Renders the EconomicSummary chart followed by a detailed dl breakdown of
 * the economic object. Honest-empty when economic{} is absent.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback (unused here, required by CardProps).
 */
export function EconomyTab({ record, onNavigate: _onNavigate }: CardProps): JSX.Element {
  const economic = useMemo(() => parseEconomic(record['economic']), [record]);
  const name =
    typeof record['name_primary'] === 'string'
      ? record['name_primary']
      : (record['id'] as string);

  if (economic === null) {
    return (
      <div
        style={{
          padding: 'var(--space-6) var(--space-4)',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-mute)',
        }}
      >
        No economic data recorded
      </div>
    );
  }

  return (
    <div>
      {/* ── EconomicSummary chart ────────────────────────────────────────── */}
      <Section label="Economic profile">
        <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
          {/* CHART MOUNT — EconomicSummary
              Props: record: RawRecord (the chart reads economic{} internally)
              The chart renders wealth-tier indicator, primary/secondary bases,
              exports/imports list — all via ChartFrame. */}
          <Suspense fallback={<EconomicFallback economic={economic} name={name} />}>
            <EconomicSummary record={record as RawRecord} />
          </Suspense>
        </div>
      </Section>

      {/* ── Detailed breakdown ────────────────────────────────────────────── */}
      <Section label="Detail">
        <dl className="dl" style={{ paddingBottom: 'var(--space-1)' }}>
          {economic.primary_base && (
            <>
              <dt>Primary base</dt>
              <dd>{humanise(economic.primary_base)}</dd>
            </>
          )}
          {economic.wealth_level && (
            <>
              <dt>Wealth level</dt>
              <dd>
                <WealthChip level={economic.wealth_level} />
              </dd>
            </>
          )}
        </dl>

        {economic.secondary_bases && economic.secondary_bases.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
              }}
            >
              Secondary bases
            </div>
            <ChipList items={economic.secondary_bases} />
          </>
        )}

        {economic.major_exports && economic.major_exports.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
              }}
            >
              Major exports
            </div>
            <ChipList items={economic.major_exports} />
          </>
        )}

        {economic.major_imports && economic.major_imports.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
              }}
            >
              Major imports
            </div>
            <ChipList items={economic.major_imports} />
          </>
        )}

        {economic.major_trade_partners && economic.major_trade_partners.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
              }}
            >
              Trade partners
            </div>
            <ChipList items={economic.major_trade_partners} />
          </>
        )}

        {economic.revenue_sources && economic.revenue_sources.length > 0 && (
          <>
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-mute)',
              }}
            >
              Revenue sources
            </div>
            <ChipList items={economic.revenue_sources} />
          </>
        )}

        {/* Bottom spacer */}
        <div style={{ height: 'var(--space-2)' }} />
      </Section>
    </div>
  );
}

// ── Inline fallback ───────────────────────────────────────────────────────────

/**
 * Minimal economic overview shown while EconomicSummary loads or when the chart
 * module is not yet present. Token-only, no hex.
 */
function EconomicFallback({
  economic,
  name,
}: {
  economic: EconomicData;
  name: string;
}): JSX.Element {
  return (
    <div>
      {/* Title */}
      <p
        style={{
          margin: '0 0 var(--space-2)',
          fontFamily: 'var(--font-display)',
          fontSize: '13px',
          fontWeight: 700,
          lineHeight: 1.35,
          color: 'var(--ink)',
        }}
      >
        {name} economic overview
      </p>

      {/* Hairline rule */}
      <div
        aria-hidden="true"
        style={{
          height: '0.5px',
          background: 'var(--border-mid)',
          marginBottom: 'var(--space-2)',
        }}
      />

      {/* Key fields */}
      <dl className="dl">
        {economic.primary_base && (
          <>
            <dt>Primary</dt>
            <dd style={{ textTransform: 'capitalize' }}>
              {economic.primary_base.replace(/_/g, ' ')}
            </dd>
          </>
        )}
        {economic.wealth_level && (
          <>
            <dt>Wealth</dt>
            <dd style={{ textTransform: 'capitalize' }}>
              {economic.wealth_level.replace(/_/g, ' ')}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
