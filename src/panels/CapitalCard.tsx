/**
 * CapitalCard — record detail card for capital records.
 *
 * Surfaces every real field a capital record carries:
 *   name, entity_id/entity_name (RelationshipLink to the polity),
 *   start_year, end_year, coords,
 *   provenance: status, confidence, attestation, sources_used (ClaimCitations),
 *   external_ids rendered as real linkable identifiers (wikidata QIDs, etc.),
 *   disputes (if present).
 *
 * System fields (kind, dataset, id) are metadata — not shown in the body.
 * Missing fields show as "—" — no fabricated values (REALNESS law).
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 *
 * Wave 3 / Phase C — Group C: Inspector Cards. Enriched Wave-places pass.
 */

import { extractProvenance, fmtCoordsLonLat, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { RelationshipLink } from '@/panels/RelationshipLink';
import { ExternalIdEntry } from '@/panels/ExternalIdEntry';
import type { Attestation, Dispute } from '@/types/record';
import { formatYear as fmtYear } from '@/data/formatYear';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a capital record.
 *
 * Fields surfaced (per data inventory):
 *   name, entity_id + entity_name (RelationshipLink to polity),
 *   start_year, end_year, coords,
 *   provenance: status, confidence, attestation, sources_used (ClaimCitations),
 *   external_ids (wikidata/pleiades as clickable links), disputes.
 *
 * Fields intentionally omitted:
 *   kind — shown as a static chip label, not a data field.
 *   dataset — system provenance metadata, not a semantic content field.
 *   id — internal record key, not displayed.
 */
export function CapitalCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const name = typeof record['name'] === 'string' && record['name'].length > 0
    ? record['name']
    : '—';
  const entityId = typeof record['entity_id'] === 'string' && record['entity_id'].length > 0
    ? record['entity_id']
    : null;
  const entityName = typeof record['entity_name'] === 'string' && record['entity_name'].length > 0
    ? record['entity_name']
    : null;

  const startYear = fmtYear(record['start_year']);
  const endYear   = fmtYear(record['end_year']);
  const span = startYear !== '—'
    ? `${startYear} – ${endYear !== '—' ? endYear : '?'}`
    : '—';

  const coordStr = fmtCoordsLonLat(record['coords'], 4);

  // Provenance extras
  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const attestation = typeof rawProv?.attestation === 'string'
    ? rawProv.attestation as Attestation
    : undefined;
  const disputes = Array.isArray(rawProv?.disputes)
    ? rawProv.disputes as Dispute[]
    : undefined;

  // External IDs — rendered as linkable identifiers in the card body.
  // ProvenanceBlock receives externalIds=undefined to avoid duplicate display.
  const externalIdEntries: [string, string][] =
    rawProv?.external_ids != null && typeof rawProv.external_ids === 'object'
      ? Object.entries(rawProv.external_ids as Record<string, string>).filter(
          ([, v]) => typeof v === 'string' && v.length > 0,
        )
      : [];

  return (
    <div>
      {/* ── Identity header ─────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
          capital
        </span>
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
        {entityName && (
          <div style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: 'var(--space-1)' }}>
            {entityName}
          </div>
        )}
      </div>

      {/* ── Location & dates ────────────────────────────────────────────────── */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Location &amp; Dates</span>
        </div>
        <dl className="dl">
          <dt>Active</dt>
          <dd>{span}</dd>
          <dt>Start</dt>
          <dd className="mono">{startYear}</dd>
          <dt>End</dt>
          <dd className="mono">{endYear}</dd>
          <dt>Coords</dt>
          <dd className="mono">{coordStr}</dd>
          {entityId && (
            <>
              <dt>Polity</dt>
              <dd>
                <RelationshipLink
                  targetId={entityId}
                  targetKind="polity"
                  label={entityName ?? entityId}
                  onNavigate={onNavigate}
                />
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* ── External identifiers ────────────────────────────────────────────── */}
      {externalIdEntries.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">External identifiers</span>
          </div>
          <dl className="dl">
            {externalIdEntries.map(([key, value]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt style={{ textTransform: 'uppercase', fontSize: '10px' }}>{key}</dt>
                <dd>
                  <ExternalIdEntry id={key} value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ProvenanceBlock
        prov={prov}
        sourceIds={sourceIds}
        attestation={attestation}
        disputes={disputes}
      />
    </div>
  );
}
