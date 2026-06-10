/**
 * MilitaryCard — record detail card for military records.
 *
 * Surfaces every real field a military record carries:
 *   name, subtype (battle / siege / fort), start_year, end_year,
 *   description (full text — never truncated), coords,
 *   provenance: status, confidence, attestation, sources_used (ClaimCitations),
 *   external_ids rendered as real linkable identifiers (wikidata QIDs, etc.),
 *   disputes (if present).
 *
 * The "military" kind covers both static fortifications (forts) and discrete
 * engagements (battles, sieges). The subtype field discriminates them.
 * For battle/siege records start_year === end_year = the engagement year.
 * For forts start_year..end_year is the operational lifespan.
 *
 * System fields (kind, dataset, id) are metadata — not shown in the body.
 * Missing fields show as "—" — no fabricated values (REALNESS law).
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 *
 * Wave 3 / Phase C — Group C: Inspector Cards. Enriched Wave-places pass.
 */

import { extractProvenance, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { ExternalIdEntry } from '@/panels/ExternalIdEntry';
import type { Attestation, Dispute } from '@/types/record';
import { formatYear as fmtYear } from '@/data/formatYear';

/** Format a [lon, lat] coords pair for display. */
function fmtCoords(coords: unknown): string {
  if (!Array.isArray(coords) || coords.length < 2) return '—';
  const [lon, lat] = coords as [unknown, unknown];
  if (typeof lon !== 'number' || typeof lat !== 'number') return '—';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

/**
 * Derive a readable section heading for the temporal row.
 * Battles and sieges are point-in-time events; forts have a lifespan.
 */
function temporalLabel(subtype: string): string {
  if (subtype === 'battle' || subtype === 'siege') return 'Year';
  return 'Active';
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Card for a military record (battle, siege, fort).
 *
 * Fields surfaced (per data inventory):
 *   name, subtype, start_year, end_year, description (full text), coords,
 *   provenance: status, confidence, attestation, sources_used (ClaimCitations),
 *   external_ids (wikidata as clickable links), disputes.
 *
 * Fields intentionally omitted:
 *   kind — shown as a static chip label, not a data field.
 *   dataset — system provenance metadata, not a semantic content field.
 *   id — internal record key, not displayed.
 */
export function MilitaryCard({ record }: CardProps) {
  const prov = extractProvenance(record);

  const name    = typeof record['name'] === 'string' && record['name'].length > 0
    ? record['name']
    : '—';
  const subtype = typeof record['subtype'] === 'string' && record['subtype'].length > 0
    ? record['subtype']
    : '—';

  const startYear = fmtYear(record['start_year']);
  const endYear   = fmtYear(record['end_year']);

  // Battles/sieges: start_year === end_year — show a single year, not a range.
  const isSingleYear = startYear !== '—' && startYear === endYear;
  const span = isSingleYear
    ? startYear
    : startYear !== '—'
      ? `${startYear} – ${endYear !== '—' ? endYear : '?'}`
      : '—';

  const coordStr = fmtCoords(record['coords']);

  // Full description text — never truncated.
  const description = typeof record['description'] === 'string' && record['description'].length > 0
    ? record['description']
    : null;

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            military
          </span>
          {subtype !== '—' && (
            <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {subtype}
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
        {isSingleYear && (
          <div className="mono" style={{ fontSize: '12px', color: 'var(--ink-mute)', marginTop: 'var(--space-1)' }}>
            {startYear}
          </div>
        )}
        {!isSingleYear && startYear !== '—' && (
          <div className="mono" style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: 2 }}>
            {span}
          </div>
        )}
      </div>

      {/* ── Site details ────────────────────────────────────────────────────── */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Site details</span>
        </div>
        <dl className="dl">
          <dt>{temporalLabel(subtype)}</dt>
          <dd className="mono">{span}</dd>
          {!isSingleYear && (
            <>
              <dt>Start</dt>
              <dd className="mono">{startYear}</dd>
              <dt>End</dt>
              <dd className="mono">{endYear}</dd>
            </>
          )}
          <dt>Subtype</dt>
          <dd>{subtype}</dd>
          <dt>Coords</dt>
          <dd className="mono">{coordStr}</dd>
        </dl>
      </div>

      {/* ── Description (full text — never truncated) ───────────────────────── */}
      {description !== null && (
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
