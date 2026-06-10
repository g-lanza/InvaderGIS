/**
 * JourneyCard — record detail card for journey records.
 *
 * Surfaces every real field per the data inventory:
 *   name, kind_type, year_start, year_end,
 *   waypoints[] rendered as a full ordered itinerary — each stop shows
 *   its sequential index, year, place name, coords, and note.
 *   provenance (status, confidence, sources_used).
 *
 * Missing fields show as "—". No phantom fields.
 * Design: square corners, hairline borders, no shadows, token CSS only.
 *
 * Phase 3 — record-panels agent. Updated: enricher/movement.
 */

import { extractProvenance, fieldStr, fmtCoordsLatLon, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A waypoint entry as stored in journey records. */
interface Waypoint {
  year?: number;
  place?: string;
  coords?: [number, number];
  note?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a journey record.
 *
 * Reads: name, kind_type, year_start, year_end, waypoints[], provenance.
 * Each waypoint renders: stop number, year, place, coords, note.
 */
export function JourneyCard({ record }: CardProps) {
  const prov = extractProvenance(record);

  const name      = fieldStr(record['name']);
  const kindType  = fieldStr(record['kind_type']);
  const yearStart = typeof record['year_start'] === 'number' ? String(record['year_start']) : '—';
  const yearEnd   = typeof record['year_end']   === 'number' ? String(record['year_end'])   : '—';
  const span = yearStart !== '—'
    ? `${yearStart}${yearEnd !== '—' ? ` – ${yearEnd}` : ''}`
    : '—';

  const waypoints: Waypoint[] = Array.isArray(record['waypoints'])
    ? (record['waypoints'] as Waypoint[])
    : [];

  // First and last place names for the endpoint summary shown in the header
  const firstPlace = waypoints[0]?.place ?? null;
  const lastPlace  = waypoints[waypoints.length - 1]?.place ?? null;
  const routeSummary =
    waypoints.length >= 2 && firstPlace && lastPlace
      ? `${firstPlace} → ${lastPlace}`
      : waypoints.length === 1 && firstPlace
      ? firstPlace
      : null;

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
        {kindType !== '—' && (
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            {kindType}
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
        <div className="mono" style={{ fontSize: '12px', color: 'var(--ink-mute)', marginTop: 2 }}>
          {span}
        </div>
        {routeSummary && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--ink-light)',
              marginTop: 'var(--space-1)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {routeSummary}
          </div>
        )}
      </div>

      {/* Span details */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Span</span>
        </div>
        <dl className="dl">
          <dt>Start</dt>
          <dd>{yearStart}</dd>
          <dt>End</dt>
          <dd>{yearEnd}</dd>
          <dt>Stops</dt>
          <dd>{waypoints.length > 0 ? String(waypoints.length) : '—'}</dd>
        </dl>
      </div>

      {/* Full itinerary — every waypoint with all its fields */}
      {waypoints.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Itinerary ({waypoints.length} stops)</span>
          </div>
          <ol
            style={{
              margin: 0,
              padding: 'var(--space-1) 0 var(--space-2)',
              listStyle: 'none',
            }}
          >
            {waypoints.map((w, i) => {
              const place     = w.place ?? '—';
              const yearLabel = w.year !== undefined ? String(w.year) : '—';
              const coordLabel = fmtCoordsLatLon(w.coords, 2);
              const hasExtra  = coordLabel !== '—' || (w.note && w.note.length > 0);

              return (
                <li
                  key={`${i}-${place}-${yearLabel}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr',
                    columnGap: 'var(--space-2)',
                    padding: 'var(--space-1) var(--space-3)',
                    borderBottom:
                      i < waypoints.length - 1 ? '0.5px solid var(--border)' : 'none',
                  }}
                >
                  {/* Stop index + year */}
                  <div
                    className="mono"
                    style={{
                      fontSize: '10px',
                      color: 'var(--ink-mute)',
                      lineHeight: 1.4,
                      paddingTop: '1px',
                      userSelect: 'none',
                    }}
                  >
                    {i + 1}
                    {yearLabel !== '—' && (
                      <>
                        <br />
                        {yearLabel}
                      </>
                    )}
                  </div>

                  {/* Place + supplementary detail */}
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--ink)',
                        lineHeight: 1.35,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {place}
                    </div>
                    {hasExtra && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--ink-light)',
                          lineHeight: 1.45,
                          marginTop: '1px',
                        }}
                      >
                        {coordLabel !== '—' && (
                          <span className="mono" style={{ marginRight: 'var(--space-2)' }}>
                            {coordLabel}
                          </span>
                        )}
                        {w.note && w.note.length > 0 && (
                          <span>{w.note}</span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
