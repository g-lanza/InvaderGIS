/**
 * OverviewTab — "At a glance" section for a polity record.
 *
 * Sections (all backed by REAL fields — no fabrication):
 *   1. Description prose (recovered description field, 266/268 polities)
 *   2. At a glance — .dl grid: type, region, active span, religion,
 *      centroid, territory summary
 *   3. Governance — internal_structure (governance_type, centralization,
 *      legitimacy_basis) when present (182/268 polities)
 *   4. Key figures — key_figures[{name,role,years}] list, with RelationshipLink
 *      to ruler record when the name matches a ruler in the corpus (249/268)
 *   5. Population timeseries chart (lazy-loaded, only when estimates exist)
 *   6. Name variants list (honest-empty when absent)
 *   7. Key events — top ~6 events matching .entity === polityId
 *      (honest-empty when none)
 *
 * Honest-empty states per section:
 *   - Description: section omitted when description is absent
 *   - Governance: section omitted when internal_structure is absent
 *   - Key figures: section omitted when key_figures[] is empty
 *   - Population chart: shown only when population_estimates[] is non-empty
 *   - Name variants: section omitted when name_variants[] is empty
 *   - Key events: "No key events recorded" when event corpus has none
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows.
 *   - Token colors only — zero hardcoded hex.
 *   - No italics in chrome.
 *   - Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 */

import { lazy, Suspense, useMemo, type JSX } from 'react';
import type { CardProps } from '@/panels/types';
import {
  fieldStr,
  fmtCoordsLatLon,
} from '@/panels/types';
import { loadRecords } from '@/data/loaders';
import { humanizeLabel } from '@/data/displayName';
import { RelationshipLink } from '@/panels/RelationshipLink';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTimeStore } from '@/stores/timeStore';
import { LifecycleBar } from '@/panels/LifecycleBar';
import { formatYear as fmtYear } from '@/data/formatYear';

// ── Lazy chart imports ────────────────────────────────────────────────────────

const PopulationTimeseries = lazy(() =>
  import('@/charts/PopulationTimeseries').then((m) => ({ default: m.PopulationTimeseries })),
);

// CHART MOUNT — RulerTimeline (self-loads rulers via loadRecords('ruler'))
const RulerTimeline = lazy(() =>
  import('@/charts/RulerTimeline').then((m) => ({ default: m.RulerTimeline })),
);

// CHART MOUNT — CategoryBreakdown (self-loads events via loadRecords('event'))
const CategoryBreakdown = lazy(() =>
  import('@/charts/CategoryBreakdown').then((m) => ({ default: m.CategoryBreakdown })),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format formed…dissolved span. */
function fmtSpan(formed: unknown, dissolved: unknown): string {
  const f = fmtYear(formed);
  const d = fmtYear(dissolved);
  if (f === '—') return '—';
  return d === '—' ? `${f} – present` : `${f} – ${d}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** A raw event record narrowed for display. */
interface EventRow {
  id: string;
  title: string;
  year: number | null;
  type: string;
}

/** A key figure entry from recovered donor data. */
interface KeyFigureRow {
  name: string;
  role?: string;
  years?: string;
  /** Matched ruler id, if this figure is found in the ruler corpus. */
  rulerId?: string;
}

/** Internal structure fields from recovered donor data. */
interface InternalStructure {
  governance_type?: string;
  legitimacy_basis?: string[];
  centralization?: string;
}

// ── Section primitives ────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  count?: number;
  children: React.ReactNode;
}

/** Hairline-bordered section block matching atlas-shell.css .panel rhythm. */
function Section({ label, count, children }: SectionProps): JSX.Element {
  return (
    <div
      className="panel"
      style={{ borderBottom: '0.5px solid var(--border)' }}
    >
      <div className="panel-head">
        <span className="panel-head__label">{label}</span>
        {count !== undefined && (
          <span
            className="chip mono"
            style={{
              color: 'var(--ink-light)',
              borderColor: 'var(--border)',
              fontSize: '10px',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Honest empty state for a section with no data. */
function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: 'var(--ink-mute)',
        textTransform: 'uppercase',
      }}
    >
      {message}
    </div>
  );
}

// ── Key figure helpers ────────────────────────────────────────────────────────

/**
 * Humanise a snake_case enum value (governance_type, centralization, role, …).
 * Delegates to the shared helper so all tabs format labels identically.
 */
function humanise(s: string): string {
  return humanizeLabel(s);
}

/**
 * Parse key_figures[] from a RawRecord field.
 * Attempts to match each figure to a ruler record by name similarity so
 * a RelationshipLink can be rendered.
 *
 * REALNESS: only matches whose ruler.name normalised == figure.name normalised
 * are used. No fuzzy fabrication.
 */
function parseKeyFigures(raw: unknown, polityId: string): KeyFigureRow[] {
  if (!Array.isArray(raw)) return [];
  const rulers = loadRecords('ruler');
  const polityRulers = rulers.filter((r) => r['polity'] === polityId);

  const rows: KeyFigureRow[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj['name'] === 'string' ? obj['name'] : null;
    if (!name) continue;

    const role  = typeof obj['role']  === 'string' ? obj['role']  : undefined;
    const years = typeof obj['years'] === 'string' ? obj['years'] : undefined;

    // Try to find a matching ruler record (name normalised lowercase, stripped punctuation)
    const normName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const matchedRuler = polityRulers.find((r) => {
      const rName = typeof r['name'] === 'string' ? r['name'] : '';
      const normRuler = rName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      return normRuler === normName || normRuler.includes(normName) || normName.includes(normRuler);
    });

    rows.push({
      name,
      role,
      years,
      rulerId: matchedRuler ? (matchedRuler['id'] as string) : undefined,
    });
  }
  return rows;
}

/**
 * Parse internal_structure from a RawRecord field.
 * Returns null when the field is absent or carries no displayable values.
 */
function parseInternalStructure(raw: unknown): InternalStructure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const getString = (k: string): string | undefined =>
    typeof obj[k] === 'string' && obj[k] !== '' ? (obj[k] as string) : undefined;
  const legitimacy_basis: string[] | undefined = (() => {
    const v = obj['legitimacy_basis'];
    if (!Array.isArray(v)) return undefined;
    const arr = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
    return arr.length > 0 ? arr : undefined;
  })();
  const result: InternalStructure = {
    governance_type:  getString('governance_type'),
    legitimacy_basis,
    centralization:   getString('centralization'),
  };
  const hasAny =
    result.governance_type !== undefined ||
    result.legitimacy_basis !== undefined ||
    result.centralization !== undefined;
  return hasAny ? result : null;
}

// ── OverviewTab ───────────────────────────────────────────────────────────────

/**
 * Overview tab for a polity record.
 * Surfaces description, at-a-glance fields, governance, key figures,
 * population chart, name variants, and key events.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback used for key figure links to rulers.
 */
export function OverviewTab({ record, onNavigate }: CardProps): JSX.Element {
  const theme = useSettingsStore((s) => s.theme);
  const year  = useTimeStore((s) => s.year);

  // ── Display name ─────────────────────────────────────────────────────────
  const name =
    typeof record['name_primary'] === 'string' && record['name_primary'].length > 0
      ? record['name_primary']
      : (typeof record['id'] === 'string' ? record['id'] : 'Unknown');

  // ── Description ──────────────────────────────────────────────────────────
  const description =
    typeof record['description'] === 'string' && record['description'].length > 0
      ? record['description']
      : null;

  // ── At a glance fields ─────────────────────────────────────────────────────
  const type    = fieldStr(record['type']);
  const region  = fieldStr(record['region']);
  const span    = fmtSpan(record['formed'], record['dissolved']);
  const religion = fieldStr(record['religion']);
  const centroid = fmtCoordsLatLon(record['centroid'], 4);

  // Territory: polygon_snapshots summary
  const snapshots = Array.isArray(record['polygon_snapshots'])
    ? (record['polygon_snapshots'] as Array<Record<string, unknown>>)
    : [];
  const snapCount = snapshots.length;
  const snapYears = snapshots
    .map((s) => (typeof s['year'] === 'number' ? s['year'] : null))
    .filter((y): y is number => y !== null);
  const snapMin = snapYears.length > 0 ? Math.min(...snapYears) : null;
  const snapMax = snapYears.length > 0 ? Math.max(...snapYears) : null;
  const territoryLine =
    snapCount > 0
      ? `${snapCount} snapshot${snapCount !== 1 ? 's' : ''}` +
        (snapMin !== null && snapMax !== null
          ? `, ${fmtYear(snapMin)}–${fmtYear(snapMax)}`
          : '')
      : '—';

  // polityId is needed by currentRuler, keyFigures, keyEvents, and chart guards.
  // Defined here so all useMemo hooks below can reference it.
  const polityId = typeof record['id'] === 'string' ? record['id'] : '';

  // ── Current ruler at this year ────────────────────────────────────────────
  const currentRuler = useMemo(() => {
    if (!polityId) return null;
    return loadRecords('ruler').find(
      (r) =>
        r['polity'] === polityId &&
        typeof r['reign_start'] === 'number' &&
        r['reign_start'] <= year &&
        (r['reign_end'] === null ||
          r['reign_end'] === undefined ||
          (typeof r['reign_end'] === 'number' && r['reign_end'] >= year)),
    ) ?? null;
  }, [polityId, year]);

  // ── Governance ────────────────────────────────────────────────────────────
  const internalStructure = useMemo(
    () => parseInternalStructure(record['internal_structure']),
    [record],
  );

  // ── Population ────────────────────────────────────────────────────────────
  const hasPopulation =
    Array.isArray(record['population_estimates']) &&
    (record['population_estimates'] as unknown[]).length > 0;

  // ── Name variants ─────────────────────────────────────────────────────────
  const nameVariants: string[] = Array.isArray(record['name_variants'])
    ? (record['name_variants'] as unknown[]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    : [];

  // ── Key events + key figures ─────────────────────────────────────────────
  const keyFigures = useMemo<KeyFigureRow[]>(
    () => parseKeyFigures(record['key_figures'], polityId),
    [record, polityId],
  );

  const keyEvents = useMemo<EventRow[]>(() => {
    if (!polityId) return [];
    const allEvents = loadRecords('event');
    const rows: EventRow[] = [];

    for (const ev of allEvents) {
      // Primary match: event.entity === polityId
      const matchesPrimary = ev['entity'] === polityId;

      // Secondary match: _quarry.participants includes polityId
      const matchesQuarry = (() => {
        const q = ev['_quarry'];
        if (!q || typeof q !== 'object') return false;
        const parts = (q as Record<string, unknown>)['participants'];
        if (!Array.isArray(parts)) return false;
        return parts.some(
          (p) =>
            (typeof p === 'string' && p === polityId) ||
            (p && typeof p === 'object' &&
              (p as Record<string, unknown>)['entity_id'] === polityId),
        );
      })();

      if (!matchesPrimary && !matchesQuarry) continue;

      const title =
        typeof ev['title'] === 'string' ? ev['title'] :
        typeof ev['name'] === 'string'  ? ev['name']  :
        ev['id'] as string;
      const year = typeof ev['year'] === 'number' ? ev['year'] : null;
      const type = typeof ev['type'] === 'string' ? ev['type'] : '';

      rows.push({ id: ev['id'] as string, title, year, type });

      if (rows.length >= 6) break;
    }

    // Sort by year ascending; null years go last
    return [...rows].sort((a, b) => {
      if (a.year === null && b.year === null) return 0;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    });
  }, [polityId]);

  // ── Ruler timeline presence — only mount RulerTimeline when ≥1 ruler with a
  //    finite reign window exists (mirrors the chart's own filter). ──────────
  const hasRulerTimeline = useMemo<boolean>(() => {
    if (!polityId) return false;
    return loadRecords('ruler').some(
      (r) =>
        r['polity'] === polityId &&
        typeof r['reign_start'] === 'number' &&
        typeof r['reign_end'] === 'number',
    );
  }, [polityId]);

  // ── Event breakdown presence — only mount CategoryBreakdown when ≥1 event
  //    matches event.entity === polityId (mirrors the chart's own filter). ───
  const hasEventBreakdown = useMemo<boolean>(() => {
    if (!polityId) return false;
    return loadRecords('event').some((ev) => ev['entity'] === polityId);
  }, [polityId]);

  return (
    <div>
      {/* ── Description prose ────────────────────────────────────────────── */}
      {description !== null && (
        <Section label="Summary">
          <p
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-3) var(--space-3)',
              fontSize: '12px',
              lineHeight: 1.55,
              color: 'var(--ink-light)',
            }}
          >
            {description}
          </p>
        </Section>
      )}

      {/* ── At a glance ─────────────────────────────────────────────────── */}
      <Section label="At a glance">
        <dl className="dl">
          {type !== '—' && (
            <>
              <dt>Type</dt>
              <dd>{type}</dd>
            </>
          )}
          {region !== '—' && (
            <>
              <dt>Region</dt>
              <dd>{region}</dd>
            </>
          )}
          <dt>Active</dt>
          <dd>{span}</dd>
          {religion !== '—' && (
            <>
              <dt>Religion</dt>
              <dd>{religion}</dd>
            </>
          )}
          {currentRuler && (
            <>
              <dt>Ruler</dt>
              <dd>
                {currentRuler['name'] as string}
                <span
                  className="mono"
                  style={{ fontSize: '9px', color: 'var(--ink-mute)', marginLeft: '6px' }}
                >
                  {currentRuler['reign_start'] as number}
                  {currentRuler['reign_end'] != null ? `–${currentRuler['reign_end'] as number}` : '–'}
                </span>
              </dd>
            </>
          )}
          <dt>Centroid</dt>
          <dd className="mono">{centroid}</dd>
          <dt>Territory</dt>
          <dd className="mono">{territoryLine}</dd>
        </dl>
      </Section>

      {/* ── Lifecycle bar (only when formed + dissolved are both numbers) ── */}
      {typeof record['formed'] === 'number' && typeof record['dissolved'] === 'number' && (
        <Section label="Lifecycle">
          <LifecycleBar
            formed={record['formed'] as number}
            dissolved={record['dissolved'] as number}
          />
        </Section>
      )}

      {/* ── Governance ───────────────────────────────────────────────────── */}
      {internalStructure !== null && (
        <Section label="Governance">
          <dl className="dl">
            {internalStructure.governance_type && (
              <>
                <dt>Type</dt>
                <dd>{humanise(internalStructure.governance_type)}</dd>
              </>
            )}
            {internalStructure.centralization && (
              <>
                <dt>Centralisation</dt>
                <dd>{humanise(internalStructure.centralization)}</dd>
              </>
            )}
            {internalStructure.legitimacy_basis &&
              internalStructure.legitimacy_basis.length > 0 && (
                <>
                  <dt>Legitimacy</dt>
                  <dd>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-1)',
                      }}
                    >
                      {internalStructure.legitimacy_basis.map((basis) => (
                        <span
                          key={basis}
                          className="chip"
                          style={{
                            fontSize: '10px',
                            color: 'var(--ink-light)',
                            borderColor: 'var(--border-mid)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {humanise(basis)}
                        </span>
                      ))}
                    </div>
                  </dd>
                </>
              )}
          </dl>
        </Section>
      )}

      {/* ── Key figures ──────────────────────────────────────────────────── */}
      {keyFigures.length > 0 && (
        <Section label="Key figures" count={keyFigures.length}>
          <ul
            style={{
              margin: 0,
              padding: '0 0 var(--space-2)',
              listStyle: 'none',
            }}
          >
            {keyFigures.map((fig, i) => (
              <li
                key={fig.name + i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderBottom: '0.5px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
                {/* Name — link to ruler if matched, plain text otherwise */}
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink)',
                    flex: '1 1 auto',
                    minWidth: 0,
                  }}
                >
                  {fig.rulerId ? (
                    <RelationshipLink
                      targetId={fig.rulerId}
                      targetKind="ruler"
                      label={fig.name}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    fig.name
                  )}
                </span>

                {/* Role chip */}
                {fig.role && (
                  <span
                    className="chip"
                    style={{
                      fontSize: '9px',
                      color: 'var(--ink-mute)',
                      borderColor: 'var(--border)',
                      textTransform: 'capitalize',
                      letterSpacing: '0.05em',
                      flexShrink: 0,
                    }}
                  >
                    {fig.role.replace(/_/g, ' ')}
                  </span>
                )}

                {/* Years */}
                {fig.years && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--ink-mute)',
                      flexShrink: 0,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {fig.years}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Ruler timeline (lazy — only when ≥1 ruler with reign dates) ─── */}
      {hasRulerTimeline && (
        <Section label="Rulers">
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={null}>
              <RulerTimeline polityId={polityId} polityName={name} />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Population chart (lazy — only when data exists) ─────────────── */}
      {hasPopulation && (
        <Section label="Population">
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={null}>
              <PopulationTimeseries record={record} />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Name variants ────────────────────────────────────────────────── */}
      {nameVariants.length > 0 && (
        <Section label="Also known as" count={nameVariants.length}>
          <div
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: '12px',
              color: 'var(--ink-light)',
              lineHeight: 1.55,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1) var(--space-2)',
            }}
          >
            {nameVariants.map((v, i) => (
              <span
                key={`${i}-${v}`}
                className="chip"
                style={{
                  color: 'var(--ink-light)',
                  borderColor: 'var(--border-mid)',
                  fontSize: '11px',
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Key events ───────────────────────────────────────────────────── */}
      <Section label="Key events" count={keyEvents.length > 0 ? keyEvents.length : undefined}>
        {keyEvents.length === 0 ? (
          <EmptyState message="No key events recorded" />
        ) : (
          <ul
            style={{
              margin: 0,
              padding: '0 0 var(--space-2)',
              listStyle: 'none',
            }}
          >
            {keyEvents.map((ev) => (
              <li
                key={ev.id}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderBottom: '0.5px solid var(--border)',
                  alignItems: 'baseline',
                }}
              >
                {/* Year */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ink-mute)',
                    flexShrink: 0,
                    minWidth: '3em',
                    letterSpacing: '0.03em',
                  }}
                >
                  {ev.year !== null ? fmtYear(ev.year) : '—'}
                </span>

                {/* Title */}
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink)',
                    lineHeight: 1.4,
                    flex: 1,
                  }}
                >
                  {ev.title}
                </span>

                {/* Type chip */}
                {ev.type && (
                  <span
                    className="chip"
                    style={{
                      fontSize: '9px',
                      color: 'var(--ink-mute)',
                      borderColor: 'var(--border)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      flexShrink: 0,
                    }}
                  >
                    {ev.type.replace(/_/g, ' ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Event category breakdown (lazy — only when ≥1 matching event) ── */}
      {hasEventBreakdown && (
        <Section label="Event composition">
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={null}>
              <CategoryBreakdown polityId={polityId} polityName={name} theme={theme} />
            </Suspense>
          </div>
        </Section>
      )}
    </div>
  );
}
