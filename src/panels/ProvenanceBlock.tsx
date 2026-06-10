/**
 * ProvenanceBlock — sourcing and confidence block shown on every record card.
 *
 * Research law: every panel must show how a claim is sourced. This block makes
 * provenance.status, confidence, and sources_used visible to the researcher.
 * Low-confidence or draft records are styled distinctly so users can weigh them.
 *
 * Wave 1B extension: renders ClaimCitations for records that carry
 * provenance.sources_used ids, resolving them to real source-record titles.
 * The sourceIds prop is optional — when absent the citations section is omitted.
 *
 * Uses only .dl, .chip, and token CSS — no new hex or radius.
 * Phase 3 — record-panels agent. Extended Wave 1B.
 */

import type { ProvenanceDisplay } from '@/panels/types';
import type { Attestation, Dispute } from '@/types/record';
import { ClaimCitations } from '@/components/ClaimCitations';

/** Props for ProvenanceBlock. */
export interface ProvenanceBlockProps {
  /** Normalised provenance fields ready for display. */
  prov: ProvenanceDisplay;
  /**
   * Raw source-record ids from provenance.sources_used.
   * When provided, ClaimCitations renders a resolved bibliography below the
   * standard provenance fields. When absent or empty, no citations section shows.
   */
  sourceIds?: string[];
  /** B.3 (additive): evidence strength, rendered only when present. */
  attestation?: Attestation;
  /** B.3 (additive): scholarly disputes, rendered honestly when present (docs/03 §6). */
  disputes?: Dispute[];
  /** B.3 (additive): external ids for re-verification, rendered when present. */
  externalIds?: Record<string, string>;
}

/**
 * Renders a compact provenance section: status chip + confidence + source count.
 * When sourceIds are provided, also renders a ClaimCitations bibliography.
 * Always shown, even for draft/low records — researchers must see data maturity.
 */
export function ProvenanceBlock({ prov, sourceIds, attestation, disputes, externalIds }: ProvenanceBlockProps) {
  const isWeak = prov.statusMod === 'draft' || prov.confidenceLabel === 'Low' || prov.confidenceLabel === 'Unknown';
  const extEntries = externalIds ? Object.entries(externalIds) : [];

  return (
    <div className="panel" style={{ borderTop: '1px solid var(--border-mid)' }}>
      <div className="panel-head">
        <span className="panel-head__label">Provenance</span>
        {isWeak && (
          <span
            className="chip"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
            title="This record has low confidence or is still in draft — treat with caution."
          >
            Draft
          </span>
        )}
      </div>
      <dl className="dl">
        <dt>Status</dt>
        <dd>
          <span
            className="chip"
            style={{
              color: prov.statusMod === 'reviewed' ? 'var(--ink-mid)' : 'var(--ink-light)',
              borderColor: 'var(--border-mid)',
            }}
          >
            {prov.statusLabel}
          </span>
        </dd>
        <dt>Confidence</dt>
        <dd>{prov.confidenceLabel}</dd>
        {attestation && (
          <>
            <dt>Attestation</dt>
            <dd>{attestation}</dd>
          </>
        )}
        <dt>Sources</dt>
        <dd>{prov.sourcesLabel}</dd>
        {extEntries.length > 0 && (
          <>
            <dt>External IDs</dt>
            <dd>{extEntries.map(([k, v]) => `${k}:${v}`).join(' · ')}</dd>
          </>
        )}
      </dl>
      {disputes && disputes.length > 0 && (
        <div style={{ padding: '0 var(--space-3) var(--space-2)' }}>
          {disputes.map((d, i) => (
            <div key={`${i}-${d.field}`} style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <div className="mono" style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
                Disputed · {d.field}
              </div>
              <div style={{ fontSize: 12 }}>{d.summary}</div>
              {d.positions.map((p, j) => (
                <div key={`${j}-${p.claim.slice(0, 24)}`} style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 2 }}>
                  • {p.claim}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {sourceIds && sourceIds.length > 0 && (
        <div style={{ padding: '0 var(--space-3) var(--space-2)' }}>
          <ClaimCitations sourceIds={sourceIds} />
        </div>
      )}
    </div>
  );
}
