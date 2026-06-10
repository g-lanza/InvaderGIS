/**
 * RelationshipCard — record detail card for relationship records.
 *
 * Renders every real field on a relationship record:
 *   type, directed, since, until,
 *   participants[] (entity_id as RelationshipLink + role),
 *   from_id / to_id (legacy fallback when participants[] is absent),
 *   active_periods[] (each period rendered as its own row),
 *   note (full text),
 *   _quarry.key_events[] (year + event text, when present),
 *   _quarry.structural_significance (full text),
 *   provenance (status, confidence, sources_used via ClaimCitations).
 *
 * Missing fields render as "—". No fabricated values.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent.
 */

import { extractProvenance, fieldStr, inferKindFromId, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { RelationshipLink } from '@/panels/RelationshipLink';

/** A participant entry as stored in real data. */
interface ParticipantEntry {
  entity_id: string;
  role: string;
}

/** A key event entry from _quarry.key_events. */
interface KeyEvent {
  year: number;
  event?: string;
  summary?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a relationship record.
 *
 * Fields surfaced:
 *   type, directed, since, until, participants[], from_id, to_id,
 *   active_periods[] (each as a labelled period row),
 *   note (full text), _quarry.key_events[],
 *   _quarry.structural_significance, provenance.
 */
export function RelationshipCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const type     = fieldStr(record['type']);
  const directed = typeof record['directed'] === 'boolean'
    ? (record['directed'] ? 'Directed' : 'Undirected')
    : '—';
  const since = typeof record['since'] === 'number' ? String(record['since']) : '—';
  const until = typeof record['until'] === 'number'
    ? String(record['until'])
    : record['until'] === null ? 'ongoing' : '—';

  const note = typeof record['note'] === 'string' && record['note'].length > 0
    ? record['note']
    : '';

  // participants[] (primary data shape)
  const participants: ParticipantEntry[] = Array.isArray(record['participants'])
    ? (record['participants'] as ParticipantEntry[]).filter(
        (p) => typeof p.entity_id === 'string' && p.entity_id.length > 0,
      )
    : [];

  // Legacy from_id / to_id (always empty strings in current data, but retained
  // as a safety fallback in case any record uses them instead of participants[])
  const fromId = typeof record['from_id'] === 'string' && record['from_id'].length > 0
    ? record['from_id']
    : null;
  const toId = typeof record['to_id'] === 'string' && record['to_id'].length > 0
    ? record['to_id']
    : null;

  // active_periods [[start, end], ...] — render each as a distinct labelled row
  const activePeriods: Array<[number, number]> = Array.isArray(record['active_periods'])
    ? (record['active_periods'] as unknown[])
        .filter(
          (p): p is [number, number] =>
            Array.isArray(p) && p.length === 2 &&
            typeof p[0] === 'number' && typeof p[1] === 'number',
        )
    : [];

  // _quarry
  const quarry = record['_quarry'] as Record<string, unknown> | undefined;

  // _quarry.key_events[]
  const keyEvents: KeyEvent[] = Array.isArray(quarry?.['key_events'])
    ? (quarry['key_events'] as KeyEvent[]).filter(
        (e) =>
          typeof e.year === 'number' &&
          (typeof e.event === 'string' || typeof e.summary === 'string'),
      )
    : [];

  // _quarry.structural_significance (full text)
  const significance = typeof quarry?.['structural_significance'] === 'string'
    ? (quarry['structural_significance'] as string)
    : '';

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
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {type}
          </span>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {directed}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--ink)',
            marginTop: 'var(--space-1)',
            // Long underscore-joined relationship ids must break inside the
            // 280px dock rather than overflow it (mirrors the .dl dd primitive).
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {fieldStr(record['id'])}
        </div>
      </div>

      {/* ── Participants ────────────────────────────────────────────────── */}
      {participants.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Participants</span>
          </div>
          <dl className="dl">
            {participants.map((p) => (
              <div key={p.entity_id} style={{ display: 'contents' }}>
                <dt style={{ textTransform: 'capitalize' }}>{p.role}</dt>
                <dd>
                  <RelationshipLink
                    targetId={p.entity_id}
                    targetKind={inferKindFromId(p.entity_id)}
                    onNavigate={onNavigate}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ── Legacy from/to (only when participants[] absent) ────────────── */}
      {(fromId || toId) && participants.length === 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Entities</span>
          </div>
          <dl className="dl">
            {fromId && (
              <>
                <dt>From</dt>
                <dd>
                  <RelationshipLink
                    targetId={fromId}
                    targetKind={inferKindFromId(fromId)}
                    onNavigate={onNavigate}
                  />
                </dd>
              </>
            )}
            {toId && (
              <>
                <dt>To</dt>
                <dd>
                  <RelationshipLink
                    targetId={toId}
                    targetKind={inferKindFromId(toId)}
                    onNavigate={onNavigate}
                  />
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* ── Temporal ────────────────────────────────────────────────────── */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Temporal</span>
        </div>
        <dl className="dl">
          <dt>Since</dt>
          <dd>{since}</dd>
          <dt>Until</dt>
          <dd>{until}</dd>
        </dl>
      </div>

      {/* ── Active periods (each as its own labelled row) ────────────────── */}
      {activePeriods.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Active periods</span>
          </div>
          <dl className="dl">
            {activePeriods.map(([s, e], i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt className="mono">{i + 1}</dt>
                <dd className="mono">
                  {s} – {e}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ── Note (full text) ────────────────────────────────────────────── */}
      {note.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Note</span>
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
            {note}
          </p>
        </div>
      )}

      {/* ── Key events from _quarry ─────────────────────────────────────── */}
      {keyEvents.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Key events</span>
          </div>
          <dl className="dl">
            {keyEvents.map((e, i) => {
              const text = typeof e.summary === 'string' && e.summary.length > 0
                ? e.summary
                : (e.event ?? '');
              return (
                <div key={i} style={{ display: 'contents' }}>
                  <dt className="mono">{e.year}</dt>
                  <dd>{text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {/* ── Structural significance ─────────────────────────────────────── */}
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
