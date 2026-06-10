/**
 * AnnotationCard — inspector card for `annotation` records (Wave 6 / research-first layer).
 *
 * An annotation is a passage anchor inside a `source` or `text` record, linked
 * to the entities / claims it attests (record.ts §Annotation). This card leads
 * with the passage text (anchor.quote preferred, then anchor.locator, then body),
 * shows the target record as a navigable chip, entity and claim links as chip
 * groups, tags, and finally the ProvenanceBlock.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Missing fields render nothing (honest-empty) — never fabricated.
 */

import { extractProvenance, fieldStr, inferKindFromId, type CardProps } from '@/panels/types';
import { ProvenanceBlock } from '@/panels/ProvenanceBlock';
import { humanizeId } from '@/data/displayName';

export function AnnotationCard({ record, onNavigate }: CardProps) {
  const prov = extractProvenance(record);

  const rawProv = record.provenance as Record<string, unknown> | undefined;
  const sourceIds: string[] = Array.isArray(rawProv?.sources_used)
    ? (rawProv!.sources_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  // Passage: prefer anchor.quote → anchor.locator → body
  const anchor = record['anchor'] as Record<string, unknown> | undefined;
  const quote    = typeof anchor?.quote    === 'string' && anchor.quote.length    > 0 ? anchor.quote    : null;
  const locator  = typeof anchor?.locator  === 'string' && anchor.locator.length  > 0 ? anchor.locator  : null;
  const body     = typeof record['body']   === 'string' && (record['body'] as string).length > 0 ? (record['body'] as string) : null;
  const passage  = quote ?? locator ?? body;
  const passageIsQuote = passage === quote && quote !== null;

  const targetId = fieldStr(record['target_id']);

  const linksTo: string[] = Array.isArray(record['links_to'])
    ? (record['links_to'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const supportsClaims: string[] = Array.isArray(record['supports_claims'])
    ? (record['supports_claims'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const tags: string[] = Array.isArray(record['tags'])
    ? (record['tags'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  return (
    <div>
      {/* Identity header — leads with the passage */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
            annotation
          </span>
          {locator && !passageIsQuote && (
            <span className="chip mono" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
              {locator}
            </span>
          )}
        </div>
        {passage ? (
          <p
            style={{
              fontFamily: passageIsQuote ? 'var(--font-serif, var(--font-display))' : 'var(--font-display)',
              fontSize: '14px',
              fontStyle: passageIsQuote ? 'italic' : 'normal',
              fontWeight: passageIsQuote ? 400 : 600,
              color: 'var(--ink)',
              margin: 'var(--space-2) 0 0',
              lineHeight: 1.5,
            }}
          >
            {passageIsQuote ? `"${passage}"` : passage}
          </p>
        ) : null}
      </div>

      {/* Target — the source or text record this anchors into */}
      {targetId !== '—' && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Target</span>
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-4)' }}>
            <button
              className="chip"
              style={{ color: 'var(--ink)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent' }}
              onClick={() => onNavigate(targetId, inferKindFromId(targetId))}
              title={`Open ${humanizeId(targetId)}`}
            >
              {humanizeId(targetId)}
            </button>
          </div>
        </div>
      )}

      {/* Links to — entity/place/event ids this passage references */}
      {linksTo.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Links to</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {linksTo.map((id) => (
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

      {/* Supports claims — claim ids this passage evidences */}
      {supportsClaims.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Supports claims</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {supportsClaims.map((id) => (
              <button
                key={id}
                className="chip"
                style={{ color: 'var(--ink-mid)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent' }}
                onClick={() => onNavigate(id, inferKindFromId(id))}
                title={`Open ${humanizeId(id)}`}
              >
                {humanizeId(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tags — named-entity types, themes */}
      {tags.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Tags</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-4)',
            }}
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="chip"
                style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provenance + resolved citations */}
      <ProvenanceBlock prov={prov} sourceIds={sourceIds} />
    </div>
  );
}
