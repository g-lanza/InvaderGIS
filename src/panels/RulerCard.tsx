/**
 * RulerCard — record detail card for ruler records.
 *
 * Renders every real field on a ruler record:
 *   name, title, polity (RelationshipLink), reign_start, reign_end,
 *   succeeds (RelationshipLink), _quarry.name_variants[],
 *   _quarry.lifespan{birth_year,death_year},
 *   _quarry.entity_associations[] (all role/polity spans),
 *   _quarry.key_actions[] — handles both {year,event} and {year,summary,source_id} shapes,
 *   _quarry.region, provenance (full: status, confidence, sources_used via ClaimCitations).
 *
 * Missing fields render as "—". No fabricated values.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent.
 * Wave 4D: SuccessionSankey is React.lazy-loaded.
 */

import { lazy, Suspense } from 'react';
import { extractProvenance, fieldStr, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { RelationshipLink } from '@/panels/RelationshipLink';

/**
 * Lazy-loaded SuccessionSankey — splits the echarts-free SVG Sankey into a
 * separate async chunk so it does not inflate the initial app bundle.
 */
const SuccessionSankey = lazy(
  () => import('@/charts/SuccessionSankey').then((m) => ({ default: m.SuccessionSankey })),
);

/** A key action entry from _quarry — handles both legacy and enriched shapes. */
interface KeyAction {
  year: number;
  /** Legacy shape: plain event string. */
  event?: string;
  /** Enriched shape: narrative summary. */
  summary?: string;
  /** Enriched shape: source id for this specific action. */
  source_id?: string;
}

/** An entity association entry from _quarry.entity_associations. */
interface EntityAssociation {
  entity_id: string;
  role: string;
  start_year?: number | null;
  end_year?: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a ruler record.
 *
 * Fields surfaced:
 *   name, title, polity, reign_start, reign_end, succeeds,
 *   _quarry.name_variants[], _quarry.lifespan, _quarry.entity_associations[],
 *   _quarry.key_actions[] (both event + summary shapes), _quarry.region,
 *   provenance (status, confidence, sources_used).
 */
export function RulerCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const name       = fieldStr(record['name']);
  const title      = fieldStr(record['title']);
  const polityId   = typeof record['polity'] === 'string' && record['polity'].length > 0
    ? record['polity']
    : null;
  const succeedsId = typeof record['succeeds'] === 'string' && record['succeeds'].length > 0
    ? record['succeeds']
    : null;

  const reignStart = typeof record['reign_start'] === 'number' ? String(record['reign_start']) : '—';
  const reignEnd   = typeof record['reign_end'] === 'number'   ? String(record['reign_end'])   : '—';
  const reign = reignStart !== '—'
    ? `${reignStart} – ${reignEnd === '—' ? '?' : reignEnd}`
    : '—';

  // _quarry fields
  const quarry = record['_quarry'] as Record<string, unknown> | undefined;

  // Lifespan
  const lifespan  = quarry?.['lifespan'] as Record<string, unknown> | undefined;
  const birthYear = typeof lifespan?.['birth_year'] === 'number' ? String(lifespan['birth_year']) : null;
  const deathYear = typeof lifespan?.['death_year'] === 'number' ? String(lifespan['death_year']) : null;
  const lifespanStr = birthYear
    ? `b. ${birthYear}${deathYear ? ` – d. ${deathYear}` : ''}`
    : null;

  // Name variants
  const nameVariants: string[] = Array.isArray(quarry?.['name_variants'])
    ? (quarry['name_variants'] as unknown[])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];

  // Entity associations (all role/polity spans beyond the primary polity field)
  const entityAssociations: EntityAssociation[] = Array.isArray(quarry?.['entity_associations'])
    ? (quarry['entity_associations'] as EntityAssociation[]).filter(
        (a) => typeof a.entity_id === 'string' && a.entity_id.length > 0,
      )
    : [];

  // Key actions — handle both {year,event} and {year,summary,source_id} shapes
  const keyActions: KeyAction[] = Array.isArray(quarry?.['key_actions'])
    ? (quarry['key_actions'] as KeyAction[]).filter(
        (a) =>
          typeof a.year === 'number' &&
          (typeof a.event === 'string' || typeof a.summary === 'string'),
      )
    : [];

  // Region
  const region = typeof quarry?.['region'] === 'string' ? fieldStr(quarry['region']) : '—';

  // Source ids for ProvenanceBlock / ClaimCitations
  const sourceIds: string[] = Array.isArray(
    (record.provenance as Record<string, unknown> | undefined)?.sources_used,
  )
    ? (
        (record.provenance as Record<string, unknown>).sources_used as unknown[]
      ).filter((s): s is string => typeof s === 'string')
    : [];

  return (
    <div>
      {/* ── Identity header ─────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        {title !== '—' && (
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {title}
          </span>
        )}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--ink)',
            marginTop: 'var(--space-1)',
            lineHeight: 1.25,
          }}
        >
          {name}
        </div>
        {lifespanStr && (
          <div className="mono" style={{ fontSize: '11px', color: 'var(--ink-light)', marginTop: 2 }}>
            {lifespanStr}
          </div>
        )}
        {nameVariants.length > 0 && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--ink-light)',
              marginTop: 'var(--space-1)',
              lineHeight: 1.4,
            }}
          >
            {nameVariants.join(' · ')}
          </div>
        )}
      </div>

      {/* ── Reign ───────────────────────────────────────────────────────── */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Reign</span>
        </div>
        <dl className="dl">
          <dt>Period</dt>
          <dd>{reign}</dd>
          <dt>Start</dt>
          <dd>{reignStart}</dd>
          <dt>End</dt>
          <dd>{reignEnd}</dd>
          {polityId && (
            <>
              <dt>Polity</dt>
              <dd>
                <RelationshipLink
                  targetId={polityId}
                  targetKind="polity"
                  onNavigate={onNavigate}
                />
              </dd>
            </>
          )}
          {region !== '—' && (
            <>
              <dt>Region</dt>
              <dd>{region}</dd>
            </>
          )}
          {succeedsId && (
            <>
              <dt>Succeeds</dt>
              <dd>
                <RelationshipLink
                  targetId={succeedsId}
                  targetKind="ruler"
                  onNavigate={onNavigate}
                />
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* ── Entity associations (all role/polity spans) ──────────────────── */}
      {entityAssociations.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Associations</span>
          </div>
          <dl className="dl">
            {entityAssociations.map((a, i) => (
              <div key={`${i}-${a.entity_id}-${a.role}`} style={{ display: 'contents' }}>
                <dt style={{ textTransform: 'capitalize' }}>
                  {a.role}
                  {(typeof a.start_year === 'number' || typeof a.end_year === 'number') && (
                    <span
                      className="mono"
                      style={{ fontSize: '10px', color: 'var(--ink-light)', display: 'block' }}
                    >
                      {typeof a.start_year === 'number' ? a.start_year : '?'}
                      {' – '}
                      {typeof a.end_year === 'number' ? a.end_year : '?'}
                    </span>
                  )}
                </dt>
                <dd>
                  <RelationshipLink
                    targetId={a.entity_id}
                    targetKind="polity"
                    onNavigate={onNavigate}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ── Key actions ─────────────────────────────────────────────────── */}
      {keyActions.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Key actions</span>
          </div>
          <dl className="dl">
            {keyActions.map((a, i) => {
              // Prefer enriched `summary`, fall back to legacy `event`
              const text = typeof a.summary === 'string' && a.summary.length > 0
                ? a.summary
                : (a.event ?? '');
              return (
                <div key={`${i}-${a.year}`} style={{ display: 'contents' }}>
                  <dt className="mono">{a.year}</dt>
                  <dd>
                    {text}
                    {typeof a.source_id === 'string' && a.source_id.length > 0 && (
                      <span
                        className="mono"
                        style={{
                          fontSize: '10px',
                          color: 'var(--ink-light)',
                          display: 'block',
                          marginTop: 2,
                        }}
                      >
                        [{a.source_id}]
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* Wave 4D lazy: succession flow — only loaded when a ruler is selected. */}
      <Suspense fallback={null}>
        <SuccessionSankey rulerId={record.id} />
      </Suspense>

      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
