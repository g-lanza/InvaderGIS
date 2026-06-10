/**
 * AnnotationsForTarget — the Recogito-style passage list for a reading surface.
 *
 * Given a target record id (a `text` or `source`) OR an entity id, finds the
 * annotations that reference it and renders each as an anchored passage with its
 * locator, interpretive note, and links. This is the surface that activates the
 * annotation layer on the reading side — opening a primary text now shows the
 * passages scholars have anchored into it, the way Recogito surfaces annotations
 * on a document.
 *
 * Two modes:
 *   - mode="target"  → annotations whose `target_id` is this record (the text's
 *                      own annotated passages). Default.
 *   - mode="links"   → annotations whose `links_to` includes this id (passages
 *                      elsewhere that reference this entity). Used on entity cards.
 *
 * Honest-empty: renders nothing when there are no matching annotations — never a
 * placeholder. Token CSS only, square corners, hairline borders (DESIGN.md).
 */

import { loadRecords } from '@/data/loaders';
import { fieldStr, inferKindFromId } from '@/panels/types';
import { humanizeId } from '@/data/displayName';

interface AnnotationsForTargetProps {
  /** The record id to find annotations for. */
  recordId: string;
  /** target = this record's own passages; links = passages referencing it. */
  mode?: 'target' | 'links';
  /** Dock navigation. */
  onNavigate: (id: string, type: string) => void;
  /** Section heading override. */
  label?: string;
}

interface AnchorShape {
  quote?: string;
  locator?: string;
}

export function AnnotationsForTarget({
  recordId,
  mode = 'target',
  onNavigate,
  label,
}: AnnotationsForTargetProps) {
  const all = loadRecords('annotation');
  const matches = all.filter((a) => {
    if (mode === 'target') return fieldStr(a['target_id']) === recordId;
    const links = Array.isArray(a['links_to']) ? (a['links_to'] as unknown[]) : [];
    return links.includes(recordId);
  });

  if (matches.length === 0) return null;

  const heading = label ?? (mode === 'target' ? 'Annotated passages' : 'Cited in passages');

  return (
    <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="panel-head">
        <span className="panel-head__label">{heading}</span>
        <span className="chip mono" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
          {matches.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {matches.map((a) => {
          const anchor = (a['anchor'] as AnchorShape | undefined) ?? {};
          const quote = typeof anchor.quote === 'string' && anchor.quote.length > 0 ? anchor.quote : null;
          const locator = typeof anchor.locator === 'string' && anchor.locator.length > 0 ? anchor.locator : null;
          const body = typeof a['body'] === 'string' && (a['body'] as string).length > 0 ? (a['body'] as string) : null;
          const annId = fieldStr(a['id']);
          const links = Array.isArray(a['links_to'])
            ? (a['links_to'] as unknown[]).filter((s): s is string => typeof s === 'string')
            : [];
          const tags = Array.isArray(a['tags'])
            ? (a['tags'] as unknown[]).filter((s): s is string => typeof s === 'string')
            : [];

          return (
            <div
              key={annId}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderTop: '0.5px solid var(--border)',
              }}
            >
              {locator && (
                <div
                  className="mono"
                  style={{ fontSize: '9px', color: 'var(--ink-mute)', letterSpacing: '0.04em', marginBottom: 3 }}
                >
                  {locator}
                </div>
              )}
              {quote && (
                <blockquote
                  style={{
                    margin: 0,
                    paddingLeft: 'var(--space-2)',
                    borderLeft: '2px solid var(--accent)',
                    fontFamily: 'var(--font-serif, var(--font-display))',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    lineHeight: 1.5,
                  }}
                >
                  {`"${quote}"`}
                </blockquote>
              )}
              {body && (
                <p
                  style={{
                    margin: 'var(--space-1) 0 0',
                    fontSize: '11px',
                    color: 'var(--ink-mid)',
                    lineHeight: 1.45,
                  }}
                >
                  {body}
                </p>
              )}
              {(links.length > 0 || tags.length > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                  {links.map((id) => (
                    <button
                      key={id}
                      className="chip"
                      style={{ color: 'var(--ink)', borderColor: 'var(--border)', cursor: 'pointer', background: 'transparent', fontSize: '9px' }}
                      onClick={() => onNavigate(id, inferKindFromId(id))}
                      title={`Open ${humanizeId(id)}`}
                    >
                      {humanizeId(id)}
                    </button>
                  ))}
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="chip"
                      style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)', fontSize: '9px' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <button
                className="chip mono"
                style={{ color: 'var(--ink-mute)', borderColor: 'transparent', cursor: 'pointer', background: 'transparent', fontSize: '9px', marginTop: 3, padding: 0 }}
                onClick={() => onNavigate(annId, 'annotation')}
                title="Open full annotation"
              >
                open annotation →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
