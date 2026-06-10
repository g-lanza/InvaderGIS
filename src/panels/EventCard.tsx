/**
 * EventCard — record detail card for event records.
 *
 * Surfaces every real field per the data inventory:
 *   name, year, type, category, entity (RelationshipLink), coords, summary,
 *   outcomes[] (rendered as an ordered list, not a joined string),
 *   _quarry.participants[] (RelationshipLinks), _quarry.structural_significance,
 *   _quarry.year_range (the documented duration range when distinct from point year),
 *   provenance (status, confidence, sources_used).
 *
 * No phantom fields. Missing fields show as "—".
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent. Updated: enricher/movement.
 */

import { extractProvenance, fieldStr, fmtCoordsLatLon, inferKindFromId, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { RelationshipLink } from '@/panels/RelationshipLink';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for an event record.
 *
 * Reads: name, year, type, category, entity, coords, summary, outcomes[],
 *        _quarry.participants[], _quarry.structural_significance,
 *        _quarry.year_range, provenance.
 */
export function EventCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const name     = fieldStr(record['name']);
  const year     = typeof record['year'] === 'number' ? String(record['year']) : '—';
  const type     = fieldStr(record['type']);
  const category = fieldStr(record['category']);
  const summary  = fieldStr(record['summary']);

  // coords: stored as [lat, lon]. Hemisphere derived from sign — never hardcoded.
  const coordStr = fmtCoordsLatLon(record['coords'], 2);

  // entity — owning polity id
  const entityId = typeof record['entity'] === 'string' && record['entity'].length > 0
    ? record['entity']
    : null;

  // outcomes — rendered as a proper ordered list, not a joined string
  const outcomes: string[] = Array.isArray(record['outcomes'])
    ? (record['outcomes'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  // _quarry sub-object
  const quarry = record['_quarry'] as Record<string, unknown> | undefined;

  // participants — navigable links
  const participants: string[] = Array.isArray(quarry?.['participants'])
    ? (quarry['participants'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  // structural_significance — full text prose
  const significance = typeof quarry?.['structural_significance'] === 'string'
    && (quarry['structural_significance'] as string).length > 0
    ? quarry['structural_significance'] as string
    : '';

  // year_range — the documented duration range [start, end] when present
  const yearRange = Array.isArray(quarry?.['year_range'])
    && (quarry['year_range'] as unknown[]).length === 2
    ? quarry['year_range'] as [number, number]
    : null;
  const yearRangeStr = yearRange
    ? `${yearRange[0]} – ${yearRange[1]}`
    : '—';

  // sources_used for ProvenanceBlock citations
  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
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
            {type}
          </span>
          {category !== '—' && (
            <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {category}
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
        <div
          className="mono"
          style={{ fontSize: '12px', color: 'var(--ink-mute)', marginTop: 'var(--space-1)' }}
        >
          {year}
        </div>
      </div>

      {/* Details */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Details</span>
        </div>
        <dl className="dl">
          <dt>Year</dt>
          <dd>{year}</dd>
          {yearRange !== null && (
            <>
              <dt>Year range</dt>
              <dd className="mono">{yearRangeStr}</dd>
            </>
          )}
          {entityId && (
            <>
              <dt>Entity</dt>
              <dd>
                <RelationshipLink
                  targetId={entityId}
                  targetKind={inferKindFromId(entityId)}
                  onNavigate={onNavigate}
                />
              </dd>
            </>
          )}
          <dt>Location</dt>
          <dd className="mono">{coordStr}</dd>
        </dl>
      </div>

      {/* Outcomes — ordered list of real outcome strings */}
      {outcomes.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Outcomes ({outcomes.length})</span>
          </div>
          <ol
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) + 1.2em)',
              listStyle: 'decimal',
            }}
          >
            {outcomes.map((outcome, i) => (
              <li
                key={`${i}-${outcome}`}
                style={{
                  fontSize: '12px',
                  color: 'var(--ink-mid)',
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-body)',
                  paddingBottom: i < outcomes.length - 1 ? 'var(--space-1)' : 0,
                }}
              >
                {outcome}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Participants from _quarry */}
      {participants.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Participants ({participants.length})</span>
          </div>
          <dl className="dl">
            {participants.map((pid) => (
              <dd key={pid} style={{ gridColumn: '1 / -1', paddingLeft: 0 }}>
                <RelationshipLink
                  targetId={pid}
                  targetKind={inferKindFromId(pid)}
                  onNavigate={onNavigate}
                />
              </dd>
            ))}
          </dl>
        </div>
      )}

      {/* Summary — full prose text */}
      {summary !== '—' && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Summary</span>
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
            {summary}
          </p>
        </div>
      )}

      {/* Structural significance from _quarry */}
      {significance.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Significance</span>
          </div>
          <p
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-4)',
              fontSize: '12px',
              color: 'var(--ink-light)',
              lineHeight: 1.55,
            }}
          >
            {significance}
          </p>
        </div>
      )}

      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
