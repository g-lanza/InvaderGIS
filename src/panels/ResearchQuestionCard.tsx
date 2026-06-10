/**
 * ResearchQuestionCard — inspector card for `research_question` records
 * (Wave 6 / research-first layer).
 *
 * A research question is the workspace a researcher starts from, binding the
 * entities, sources, claims, relationships, events, and annotations assembled
 * to answer a historical inquiry (record.ts §ResearchQuestion). This card leads
 * with the question text, shows a status chip, scope (from/to/regions), the
 * six evidence-chain groups as navigable chip rows, findings text, and
 * the ProvenanceBlock.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Missing fields render nothing (honest-empty) — never fabricated.
 */

import { extractProvenance, fieldStr, inferKindFromId, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { statusRootLabel } from '@/panels/statusRoots';

/** Status chip label (etymological-root form) + muted color per working status. */
function statusLabel(raw: unknown): string {
  if (typeof raw === 'string' && raw.length > 0) {
    const root = statusRootLabel(raw);
    return root.charAt(0).toUpperCase() + root.slice(1);
  }
  return '';
}

/** Build a display string for the scope temporal range. */
function scopeRange(scope: Record<string, unknown>): string {
  const from = typeof scope.from === 'number' ? scope.from : null;
  const to   = typeof scope.to   === 'number' ? scope.to   : null;
  if (from !== null && to !== null) return from === to ? String(from) : `${from} – ${to}`;
  if (from !== null) return `${from} – …`;
  if (to   !== null) return `… – ${to}`;
  return '';
}

export function ResearchQuestionCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv!.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const question = fieldStr(record['question']);
  const status   = record['status'];
  const statusStr = statusLabel(status);

  const scope = record['scope'] as Record<string, unknown> | undefined;
  const range  = scope ? scopeRange(scope) : '';
  const regions: string[] = Array.isArray(scope?.regions)
    ? (scope!.regions as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const evidence = record['evidence'] as Record<string, unknown> | undefined;

  const entityIds: string[] = Array.isArray(evidence?.entity_ids)
    ? (evidence!.entity_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const claimIds: string[] = Array.isArray(evidence?.claim_ids)
    ? (evidence!.claim_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const evidenceSourceIds: string[] = Array.isArray(evidence?.source_ids)
    ? (evidence!.source_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const relationshipIds: string[] = Array.isArray(evidence?.relationship_ids)
    ? (evidence!.relationship_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const eventIds: string[] = Array.isArray(evidence?.event_ids)
    ? (evidence!.event_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const annotationIds: string[] = Array.isArray(evidence?.annotation_ids)
    ? (evidence!.annotation_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const findings = typeof record['findings'] === 'string' && (record['findings'] as string).length > 0
    ? (record['findings'] as string)
    : null;

  /** Renders a labelled row of navigable chips; hidden when the array is empty. */
  function EvidenceGroup({ label, ids }: { label: string; ids: string[] }) {
    if (ids.length === 0) return null;
    return (
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">{label}</span>
          <span className="chip mono" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {ids.length}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-1)',
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          {ids.map((id) => (
            <button
              key={id}
              className="chip mono"
              style={{ color: 'var(--ink)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent' }}
              onClick={() => onNavigate(id, inferKindFromId(id))}
              title={`Open ${id}`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Identity header — leads with the question */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            research question
          </span>
          {statusStr && (
            <span className="chip" style={{ color: 'var(--ink-mid)', borderColor: 'var(--border)' }}>
              {statusStr}
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
          {question}
        </p>
      </div>

      {/* Scope — temporal range + regions */}
      {(range || regions.length > 0) && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Scope</span>
          </div>
          <dl className="dl">
            {range && (
              <>
                <dt>Period</dt>
                <dd className="mono">{range}</dd>
              </>
            )}
            {regions.length > 0 && (
              <>
                <dt>Regions</dt>
                <dd>{regions.join(', ')}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Evidence chain — six navigable chip groups */}
      <EvidenceGroup label="Entities"      ids={entityIds} />
      <EvidenceGroup label="Claims"        ids={claimIds} />
      <EvidenceGroup label="Sources"       ids={evidenceSourceIds} />
      <EvidenceGroup label="Relationships" ids={relationshipIds} />
      <EvidenceGroup label="Events"        ids={eventIds} />
      <EvidenceGroup label="Annotations"   ids={annotationIds} />

      {/* Findings — the synthesised answer */}
      {findings && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Findings</span>
          </div>
          <p
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-4)',
              fontSize: '12px',
              color: 'var(--ink-mid)',
              lineHeight: 1.55,
            }}
          >
            {findings}
          </p>
        </div>
      )}

      {/* Provenance + resolved citations */}
      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
