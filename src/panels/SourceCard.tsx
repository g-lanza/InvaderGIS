/**
 * SourceCard — record detail card for source records.
 *
 * Renders real fields: title, author, year, kind_type (or kind), status,
 * _quarry.publisher, _quarry.place, _quarry.citation, _quarry.topics,
 * _quarry.peer_reviewed. Missing fields show as "—".
 *
 * Sources do not carry a top-level provenance block (they ARE provenance),
 * but we show whatever provenance data is present if it exists.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent.
 */

import { extractProvenance, fieldStr, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { AnnotationsForTarget } from '@/panels/AnnotationsForTarget';
import { statusRootLabel } from '@/panels/statusRoots';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a source record.
 * Reads: title, author, year, kind_type, kind, status, _quarry.publisher,
 *        _quarry.place, _quarry.citation, _quarry.topics, _quarry.peer_reviewed.
 */
export function SourceCard({ record, onNavigate }: CardProps) {
  // Sources may or may not carry a provenance block
  const hasProv = typeof record['provenance'] === 'object' && record['provenance'] !== null;
  const prov = hasProv ? extractProvenance(record) : null;
  const recordId = fieldStr(record['id']);

  const title  = fieldStr(record['title']);
  const author = fieldStr(record['author']);
  const year   = typeof record['year'] === 'number' ? String(record['year']) : '—';
  // Real data uses 'kind_type' for sources (not 'kind' which is the RecordType discriminant)
  const kindType = fieldStr(record['kind_type'] ?? record['kind']);
  const status = fieldStr(record['status']);
  // External link to the actual source document (e.g. a Fordham Sourcebook page).
  // Only http(s) urls are linked — never a fabricated or internal-only value.
  const rawUrl = typeof record['url'] === 'string' ? record['url'] : '';
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
  const license = fieldStr(record['license']);

  // _quarry metadata
  const quarry = record['_quarry'] as Record<string, unknown> | undefined;
  const publisher   = typeof quarry?.['publisher'] === 'string' ? quarry['publisher'] as string : '—';
  const place       = typeof quarry?.['place']     === 'string' ? quarry['place']     as string : '—';
  const citation    = typeof quarry?.['citation']  === 'string' ? quarry['citation']  as string : '';
  const peerReview  = typeof quarry?.['peer_reviewed'] === 'boolean'
    ? (quarry['peer_reviewed'] ? 'Yes' : 'No')
    : '—';
  const topics: string[] = Array.isArray(quarry?.['topics'])
    ? (quarry['topics'] as string[])
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
            {kindType}
          </span>
          {status !== '—' && (
            <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {statusRootLabel(status)}
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink)',
            marginTop: 'var(--space-1)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
        {author !== '—' && (
          <div style={{ fontSize: '12px', color: 'var(--ink-mid)', marginTop: 2 }}>
            {author}
          </div>
        )}
      </div>

      {/* Bibliographic */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Bibliographic</span>
        </div>
        <dl className="dl">
          <dt>Year</dt>
          <dd>{year}</dd>
          {publisher !== '—' && (
            <>
              <dt>Publisher</dt>
              <dd>{publisher}</dd>
            </>
          )}
          {place !== '—' && (
            <>
              <dt>Place</dt>
              <dd>{place}</dd>
            </>
          )}
          <dt>Peer reviewed</dt>
          <dd>{peerReview}</dd>
          {license !== '—' && (
            <>
              <dt>License</dt>
              <dd>{license}</dd>
            </>
          )}
        </dl>
        {url && (
          <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="chip"
              title={`Open the original source document: ${url}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              View source ↗
            </a>
          </div>
        )}
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Topics</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {topics.map((t) => (
              <span
                key={t}
                className="chip"
                style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Citation */}
      {citation.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Citation</span>
          </div>
          <p
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-4)',
              fontSize: '11px',
              color: 'var(--ink-light)',
              lineHeight: 1.55,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {citation}
          </p>
        </div>
      )}

      {/* Annotated passages anchored into this source (Recogito-style). */}
      {recordId !== '—' && (
        <AnnotationsForTarget recordId={recordId} mode="target" onNavigate={onNavigate} />
      )}

      {prov && <ProvenanceBlock prov={prov} />}
    </div>
  );
}
