/**
 * ChartFrame — OWID-style chart wrapper for InvaderGIS.
 *
 * Every chart in InvaderGIS that wants claim-style titling, inline source
 * attribution, and consistent chrome can wrap its content in ChartFrame.
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ TITLE (claim sentence — assertive, not a label)         │
 *   │ SUBTITLE (optional — qualifying clause)                 │
 *   │ ─────────────────────────────────── hairline rule       │
 *   │ [chart content / children]                              │
 *   │ Source: resolved label  ·  Licence: CC-BY-4.0           │
 *   └─────────────────────────────────────────────────────────┘
 *
 * SOURCE RESOLUTION
 * -----------------
 * Pass `sourceIds` as a string array of source-record ids from data/sources/.
 * ChartFrame resolves them against the already-loaded source records:
 *   - If the record has a `license` field (e.g. wals.json → "CC-BY-4.0"), it
 *     is shown after the author/title.
 *   - If the record is not found, the raw id is shown (honest fallback — never
 *     a fabricated label).
 *
 * DESIGN CONTRACT
 * ---------------
 * - Square corners (--radius: 0), hairline 0.5px rule under title.
 * - No panel shadows, no hardcoded hex; tokens only.
 * - Works across all 4 themes (Atlas / Manuscript / Dark / Contrast).
 * - No italics in chrome (sea-label italics belong to MapCanvas, not here).
 *
 * Wave 6 / Phase G — OWID-style storytelling.
 */

import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { loadRecords } from '@/data/loaders';
import type { RawRecord } from '@/data/loaders';

// ── Source resolution ─────────────────────────────────────────────────────────

/** A resolved source for the inline attribution line. */
interface ResolvedSource {
  id: string;
  /** Short human-readable label: "Author, Title (Year)". */
  label: string;
  /** License string if present on the record, e.g. "CC-BY-4.0". */
  license: string | null;
  /** URL to the source if present. */
  url: string | null;
}

/**
 * Resolve source-record ids to display objects.
 * Reads already-loaded in-memory records — no additional fetch.
 * Missing records render as raw id (honest empty state).
 */
function resolveSources(ids: readonly string[]): ResolvedSource[] {
  const records = loadRecords('source');
  return ids.map((id) => {
    const rec: RawRecord | undefined = records.find((s) => s.id === id);
    if (!rec) {
      return { id, label: id, license: null, url: null };
    }
    const author  = typeof rec.author  === 'string' ? rec.author  : '';
    const title   = typeof rec.title   === 'string' ? rec.title   : '';
    const year    = typeof rec.year    === 'number' ? String(rec.year) : '';
    const license = typeof rec.license === 'string' ? rec.license : null;
    const url     = typeof rec.url     === 'string' ? rec.url     : null;

    // Build minimal label from available fields
    const parts = [author, title].filter(Boolean);
    const label = parts.length > 0
      ? `${parts.join('. ')}${year ? ` (${year})` : ''}`
      : id;

    return { id, label, license, url };
  });
}

// ── Source line ───────────────────────────────────────────────────────────────

interface SourceLineProps {
  sources: ResolvedSource[];
}

/** Inline source attribution rendered at the bottom of the frame. */
function SourceLine({ sources }: SourceLineProps): JSX.Element | null {
  if (sources.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 'var(--space-2)',
        paddingTop: 'var(--space-1)',
        borderTop: '0.5px solid var(--border)',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        color: 'var(--ink-mute)',
        lineHeight: 1.5,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0 var(--space-3)',
      }}
    >
      <span style={{ color: 'var(--ink-light)', marginRight: 'var(--space-1)' }}>
        Source:
      </span>
      {sources.map((s, i) => (
        <span key={s.id}>
          {i > 0 && (
            <span aria-hidden="true" style={{ marginRight: 'var(--space-1)' }}>
              ·
            </span>
          )}
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--ink-mute)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--border-mid)',
                textUnderlineOffset: '2px',
              }}
            >
              {s.label}
            </a>
          ) : (
            <span>{s.label}</span>
          )}
          {s.license && (
            <span
              style={{
                marginLeft: 'var(--space-1)',
                padding: '0 3px',
                border: '0.5px solid var(--border-mid)',
                letterSpacing: '0.03em',
                fontSize: '9px',
              }}
            >
              {s.license}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── ChartFrame props ──────────────────────────────────────────────────────────

/** Props for ChartFrame. */
export interface ChartFrameProps {
  /**
   * Claim-style title — an assertive sentence stating what the chart shows.
   * E.g. "The Abbasid–Fatimid rivalry split the Islamic world for 262 years."
   * NOT a label like "Abbasid Caliphate relationships".
   */
  title: string;
  /**
   * Optional qualifying clause shown below the title in a lighter weight.
   * E.g. "Polity relationships · 909–1171 CE"
   */
  subtitle?: string;
  /**
   * Source-record ids from data/sources/. Each id is resolved against
   * the already-loaded source records for bibliographic attribution.
   * If empty, no source line is rendered.
   */
  sourceIds?: readonly string[];
  /**
   * Whether the frame renders as a section landmark with a heading.
   * Defaults to true. Set false when nested inside another landmark.
   */
  asSection?: boolean;
  children: ReactNode;
}

/**
 * OWID-style chart wrapper: claim title, subtitle, hairline rule, source line.
 *
 * Usage:
 * ```tsx
 * <ChartFrame
 *   title="The Seljuk vassalage redefined Islamic governance for 139 years."
 *   subtitle="Polity relationships · 1055–1194 CE"
 *   sourceIds={['hodgson_venture_of_islam_1974']}
 * >
 *   <MyChart />
 * </ChartFrame>
 * ```
 */
export function ChartFrame({
  title,
  subtitle,
  sourceIds = [],
  asSection = true,
  children,
}: ChartFrameProps): JSX.Element {
  const sources = useMemo(() => resolveSources(sourceIds), [sourceIds]);

  const Wrapper = asSection ? 'section' : 'div';

  return (
    <Wrapper
      aria-label={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        // No hardcoded background — inherits surface from parent
      }}
    >
      {/* ── Title block ─────────────────────────────────────────────── */}
      <header style={{ paddingBottom: 'var(--space-2)' }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '13px',
            fontWeight: 700,
            lineHeight: 1.35,
            color: 'var(--ink)',
            // No italics — DESIGN.md law
          }}
        >
          {title}
        </p>

        {subtitle && (
          <p
            style={{
              margin: '3px 0 0',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.05em',
              color: 'var(--ink-mute)',
              textTransform: 'uppercase',
            }}
          >
            {subtitle}
          </p>
        )}

        {/* Hairline rule under title block */}
        <div
          aria-hidden="true"
          style={{
            marginTop: 'var(--space-2)',
            height: '0.5px',
            background: 'var(--border-mid)',
          }}
        />
      </header>

      {/* ── Chart content ───────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>

      {/* ── Source attribution ──────────────────────────────────────── */}
      <SourceLine sources={sources} />
    </Wrapper>
  );
}
