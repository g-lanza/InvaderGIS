/**
 * GenericCard — fallback record card for institution, technology, text records,
 * and any future kinds not covered by a dedicated card.
 *
 * Renders: kind discriminant, name_primary (or name), formed/dissolved, domain,
 * _quarry.description (or any top-level summary/description field), and provenance.
 * Missing fields show as "—". No fabricated values ever.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent.
 */

import { extractProvenance, fieldStr, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { AnnotationsForTarget } from '@/panels/AnnotationsForTarget';
import { RelationshipLink } from '@/panels/RelationshipLink';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Generic fallback card for institution / technology / text / unknown kinds.
 * Reads: kind, name_primary | name, formed, dissolved, domain,
 *        _quarry.description | summary | description, provenance.
 */
export function GenericCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);
  const recordId = fieldStr(record['id']);

  // sources_used for ProvenanceBlock citations (resolves to source records + links)
  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const kind = fieldStr(record['kind']);
  const name = fieldStr(record['name_primary'] ?? record['name']);
  const domain = fieldStr(record['domain']);

  const formed   = typeof record['formed']    === 'number' ? String(record['formed'])    : '—';
  const dissolved = typeof record['dissolved'] === 'number' ? String(record['dissolved']) : '—';
  const span = formed !== '—'
    ? `${formed}${dissolved !== '—' ? ` – ${dissolved}` : ''}`
    : '—';

  // Description: try _quarry.description → summary → description at top level
  const quarry = record['_quarry'] as Record<string, unknown> | undefined;
  const description =
    (typeof quarry?.['description'] === 'string' && quarry['description'].length > 0
      ? quarry['description']
      : null) ??
    (typeof record['summary'] === 'string' && record['summary'].length > 0
      ? (record['summary'] as string)
      : null) ??
    (typeof record['description'] === 'string' && record['description'].length > 0
      ? (record['description'] as string)
      : null);

  // Collect any quarry key_developments or influences
  const keyDev: Array<{ year: number; event: string }> = Array.isArray(quarry?.['key_developments'])
    ? (quarry['key_developments'] as Array<{ year: number; event: string }>).filter(
        (d) => typeof d.year === 'number' && typeof d.event === 'string',
      )
    : [];

  const influences: string[] = Array.isArray(quarry?.['influences_entities'])
    ? (quarry['influences_entities'] as string[])
    : [];

  return (
    <div>
      {/* Identity header */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {kind}
          </span>
          {domain !== '—' && (
            <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {domain}
            </span>
          )}
        </div>
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
      </div>

      {/* Temporal (only if present) */}
      {formed !== '—' && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Temporal</span>
          </div>
          <dl className="dl">
            <dt>Active</dt>
            <dd>{span}</dd>
            <dt>Formed</dt>
            <dd>{formed}</dd>
            {dissolved !== '—' && (
              <>
                <dt>Dissolved</dt>
                <dd>{dissolved}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Description</span>
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
            {description}
          </p>
        </div>
      )}

      {/* Key developments */}
      {keyDev.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Key developments</span>
          </div>
          <dl className="dl">
            {keyDev.map((d) => (
              <div key={`${d.year}-${d.event}`} style={{ display: 'contents' }}>
                <dt className="mono">{d.year}</dt>
                <dd>{d.event}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Influences */}
      {influences.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Influenced entities</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {influences.map((id) => (
              // Navigable + humanized — was a raw, non-clickable slug chip.
              <RelationshipLink key={id} targetId={id} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {/* Annotated passages — the Recogito-style reading surface for texts/sources.
          Honest-empty: renders nothing when this record has no annotations. */}
      {recordId !== '—' && (
        <AnnotationsForTarget recordId={recordId} mode="target" onNavigate={onNavigate} />
      )}

      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
