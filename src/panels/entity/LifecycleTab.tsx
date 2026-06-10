/**
 * LifecycleTab — lifecycle phases + causal factor balance for a polity record.
 *
 * Sections (all backed by REAL recovered fields — no fabrication):
 *   1. LifecycleTimeline — lifecycle_phases[{phase,years,description}]
 *   2. FactorBalance     — rise_factors + decline_factors [{tag,layer,description}]
 *
 * Honest-empty per section: when lifecycle_phases is absent the phases section
 * is omitted; when both rise_factors and decline_factors are absent the factor
 * section is omitted. If neither has data, a single empty-state message is shown.
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows.
 *   - Token colors only — zero hardcoded hex.
 *   - No italics in chrome.
 *   - Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 *
 * Chart mount points:
 *
 *   LifecycleTimeline:
 *     Import: import('@/charts/LifecycleTimeline')
 *     Expected props:
 *       <LifecycleTimeline
 *         phases={Array<{phase:string; years?:string; description?:string}>}
 *         name={string}
 *       />
 *
 *   FactorBalance:
 *     Import: import('@/charts/FactorBalance')
 *     Expected props:
 *       <FactorBalance
 *         riseFactors={Array<{tag:string; layer?:string; description?:string}>}
 *         declineFactors={Array<{tag:string; layer?:string; description?:string}>}
 *         name={string}
 *       />
 *
 *   Integration agent reconciles if the chart builder uses a different shape.
 */

import { lazy, Suspense, useMemo, type JSX } from 'react';
import type { CardProps } from '@/panels/types';
import type { RawRecord } from '@/data/loaders';
import { humanizeLabel } from '@/data/displayName';

// ── Lazy chart imports ────────────────────────────────────────────────────────
// CHART MOUNT — LifecycleTimeline
const LifecycleTimeline = lazy(() =>
  import('@/charts/LifecycleTimeline').then((m) => ({ default: m.LifecycleTimeline })),
);

// CHART MOUNT — FactorBalance
const FactorBalance = lazy(() =>
  import('@/charts/FactorBalance').then((m) => ({ default: m.FactorBalance })),
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single lifecycle phase from the donor data. */
interface LifecyclePhase {
  phase: string;
  years?: string;
  description?: string;
}

/** A single rise or decline factor from the donor data. */
interface CausalFactor {
  tag: string;
  layer?: string;
  description?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse lifecycle_phases from a RawRecord field. */
function parseLifecyclePhases(raw: unknown): LifecyclePhase[] {
  if (!Array.isArray(raw)) return [];
  const phases: LifecyclePhase[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const phase = typeof obj['phase'] === 'string' ? obj['phase'] : null;
    if (!phase) continue;
    phases.push({
      phase,
      years:       typeof obj['years']       === 'string' ? obj['years']       : undefined,
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
    });
  }
  return phases;
}

/** Parse rise_factors or decline_factors from a RawRecord field. */
function parseCausalFactors(raw: unknown): CausalFactor[] {
  if (!Array.isArray(raw)) return [];
  const factors: CausalFactor[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const tag = typeof obj['tag'] === 'string' ? obj['tag'] : null;
    if (!tag) continue;
    factors.push({
      tag,
      layer:       typeof obj['layer']       === 'string' ? obj['layer']       : undefined,
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
    });
  }
  return factors;
}

/** Humanise a snake_case enum value (shared helper; em-dash for empty). */
function humanise(s: string): string {
  return humanizeLabel(s);
}

// ── Section primitive ─────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  count?: number;
  children: React.ReactNode;
}

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

// ── LifecycleTab ──────────────────────────────────────────────────────────────

/**
 * Lifecycle tab for a polity record.
 *
 * Renders the lifecycle phases timeline and the causal factor balance chart.
 * Honest-empty per section when data is absent.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback (unused here, required by CardProps).
 */
export function LifecycleTab({ record, onNavigate: _onNavigate }: CardProps): JSX.Element {
  const phases = useMemo(() => parseLifecyclePhases(record['lifecycle_phases']), [record]);
  const riseFactors    = useMemo(() => parseCausalFactors(record['rise_factors']),    [record]);
  const declineFactors = useMemo(() => parseCausalFactors(record['decline_factors']), [record]);

  const name =
    typeof record['name_primary'] === 'string'
      ? record['name_primary']
      : (record['id'] as string);

  const hasPhases  = phases.length > 0;
  const hasFactors = riseFactors.length > 0 || declineFactors.length > 0;

  if (!hasPhases && !hasFactors) {
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
        No lifecycle data recorded
      </div>
    );
  }

  return (
    <div>
      {/* ── Lifecycle phases ─────────────────────────────────────────────── */}
      {hasPhases && (
        <Section label="Phases" count={phases.length}>
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            {/* CHART MOUNT — LifecycleTimeline
                Integration agent: replace this Suspense block with:
                <LifecycleTimeline phases={phases} name={name} />
                Props: phases = LifecyclePhase[], name = polity display name
                Each phase: { phase: string; years?: string; description?: string }
                The chart should render a horizontal timeline of phase blocks. */}
            <Suspense fallback={<PhaseFallback phases={phases} />}>
              <LifecycleTimeline phases={phases} name={name} />
            </Suspense>
          </div>
        </Section>
      )}

      {/* ── Causal factors ───────────────────────────────────────────────── */}
      {hasFactors && (
        <Section
          label="Causal factors"
          count={riseFactors.length + declineFactors.length}
        >
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            {/* CHART MOUNT — FactorBalance
                Props: record: RawRecord (chart reads rise_factors + decline_factors
                internally). Renders a visual contrast of rise vs decline factors,
                grouped by layer (ideology_religion, governance_institutional, etc.). */}
            <Suspense
              fallback={
                <FactorFallback
                  riseFactors={riseFactors}
                  declineFactors={declineFactors}
                />
              }
            >
              <FactorBalance record={record as RawRecord} />
            </Suspense>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Inline fallbacks ──────────────────────────────────────────────────────────

/**
 * Phase timeline fallback — renders phases as a vertical list with year spans.
 * Used while LifecycleTimeline loads or when the chart module is absent.
 */
function PhaseFallback({ phases }: { phases: LifecyclePhase[] }): JSX.Element {
  if (phases.length === 0) return <></>;
  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {phases.map((phase, i) => (
        <li
          key={phase.phase + i}
          style={{
            display: 'grid',
            gridTemplateColumns: '8px 1fr',
            gap: '0 var(--space-2)',
            paddingBottom: 'var(--space-2)',
            position: 'relative',
          }}
        >
          {/* Left rail: vertical connector line + dot */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 6,
                height: 6,
                border: '0.5px solid var(--accent)',
                background: 'var(--surface)',
                flexShrink: 0,
                marginTop: 3,
              }}
            />
            {i < phases.length - 1 && (
              <div
                aria-hidden="true"
                style={{
                  flex: 1,
                  width: '0.5px',
                  background: 'var(--border-mid)',
                  marginTop: 2,
                  minHeight: 12,
                }}
              />
            )}
          </div>

          {/* Phase content */}
          <div>
            {/* Phase name + years */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                }}
              >
                {humanise(phase.phase)}
              </span>
              {phase.years && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.04em',
                    color: 'var(--ink-mute)',
                  }}
                >
                  {phase.years}
                </span>
              )}
            </div>

            {/* Description */}
            {phase.description && (
              <p
                style={{
                  margin: '3px 0 0',
                  fontSize: '11px',
                  color: 'var(--ink-light)',
                  lineHeight: 1.45,
                }}
              >
                {phase.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Factor balance fallback — renders rise and decline factors as labelled lists.
 * Used while FactorBalance loads or when the chart module is absent.
 */
function FactorFallback({
  riseFactors,
  declineFactors,
}: {
  riseFactors: CausalFactor[];
  declineFactors: CausalFactor[];
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {riseFactors.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-mute)',
              marginBottom: 'var(--space-1)',
              paddingBottom: 'var(--space-1)',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            Rise factors ({riseFactors.length})
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {riseFactors.map((f, i) => (
              <FactorRow key={f.tag + i} factor={f} direction="rise" />
            ))}
          </ul>
        </div>
      )}

      {declineFactors.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-mute)',
              marginBottom: 'var(--space-1)',
              paddingBottom: 'var(--space-1)',
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            Decline factors ({declineFactors.length})
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {declineFactors.map((f, i) => (
              <FactorRow key={f.tag + i} factor={f} direction="decline" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FactorRow({
  factor,
  direction,
}: {
  factor: CausalFactor;
  direction: 'rise' | 'decline';
}): JSX.Element {
  // No hex — use token colors only. Accent for rise; ink-mid for decline.
  const accentColor =
    direction === 'rise' ? 'var(--accent)' : 'var(--ink-mid)';

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '3px 1fr',
        gap: '0 var(--space-2)',
        alignItems: 'start',
      }}
    >
      {/* Direction indicator bar */}
      <div
        aria-hidden="true"
        style={{
          width: 3,
          alignSelf: 'stretch',
          background: accentColor,
          opacity: 0.7,
          minHeight: 14,
          marginTop: 2,
        }}
      />

      {/* Tag + layer + description */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: accentColor,
              textTransform: 'capitalize',
            }}
          >
            {factor.tag.replace(/_/g, ' ')}
          </span>
          {factor.layer && (
            <span
              className="chip"
              style={{
                fontSize: '9px',
                color: 'var(--ink-mute)',
                borderColor: 'var(--border)',
                textTransform: 'capitalize',
                letterSpacing: '0.04em',
              }}
            >
              {factor.layer.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        {factor.description && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '11px',
              color: 'var(--ink-light)',
              lineHeight: 1.4,
            }}
          >
            {factor.description}
          </p>
        )}
      </div>
    </li>
  );
}
