/**
 * ClaimCard — inspector card for `claim` records (Wave 6 / research-first layer).
 *
 * A claim is a single falsifiable assertion linking subjects + sources +
 * confidence/attestation (Competitive Audit §4B). This card leads with the
 * STATEMENT (the assertion itself), then shows the subject entities as
 * navigable chips, the predicate/period, and the provenance block — which
 * renders the resolved sources as readable Chicago footnotes (ClaimCitations).
 * Unresolved source ids (cited but not yet in the library) are shown honestly
 * as a separate, muted note — never as a fake citation.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 */

import { extractProvenance, fieldStr, inferKindFromId, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { humanizeId } from '@/data/displayName';

/** Read claim.period {from,to} into a display span, or "" when absent. */
function periodLabel(record: CardProps['record']): string {
  const p = record['period'];
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const o = p as { from?: unknown; to?: unknown };
    const from = typeof o.from === 'number' ? o.from : null;
    const to = typeof o.to === 'number' ? o.to : null;
    if (from !== null && to !== null) return from === to ? String(from) : `${from} – ${to}`;
    if (from !== null) return `${from} – …`;
    if (to !== null) return `… – ${to}`;
  }
  return '';
}

export function ClaimCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv!.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const statement = fieldStr(record['statement']);
  const predicate = fieldStr(record['predicate']);
  const period = periodLabel(record);

  const subjects: string[] = Array.isArray(record['subject_ids'])
    ? (record['subject_ids'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const unresolved: string[] = Array.isArray(record['unresolved_sources'])
    ? (record['unresolved_sources'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const derivedFrom = fieldStr(record['derived_from']);

  return (
    <div>
      {/* Identity header — leads with the assertion */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            claim
          </span>
          {predicate !== '—' && (
            <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {predicate}
            </span>
          )}
          {period && (
            <span className="chip mono" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {period}
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--ink)',
            margin: 'var(--space-2) 0 0',
            lineHeight: 1.4,
          }}
        >
          {statement}
        </p>
      </div>

      {/* Subjects — navigable chips into the linked entities */}
      {subjects.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Subjects</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {subjects.map((id) => (
              <button
                key={id}
                className="chip"
                style={{ color: 'var(--ink)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent' }}
                onClick={() => onNavigate(id, inferKindFromId(id))}
                title={`Open ${humanizeId(id)}`}
              >
                {humanizeId(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Derived-from provenance trace */}
      {derivedFrom !== '—' && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Derived from</span>
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-4)' }}>
            <button
              className="chip"
              style={{ color: 'var(--ink-mid)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent' }}
              onClick={() => onNavigate(derivedFrom, inferKindFromId(derivedFrom))}
              title={`Open ${humanizeId(derivedFrom)}`}
            >
              {humanizeId(derivedFrom)}
            </button>
          </div>
        </div>
      )}

      {/* Unresolved citations — honest flag, never shown as a real footnote */}
      {unresolved.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Cited, source not yet in library</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {unresolved.map((id) => (
              <span
                key={id}
                className="chip mono"
                style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)', opacity: 0.7 }}
                title="This source is cited but does not yet have a source record"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provenance + resolved Chicago-footnote citations */}
      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
