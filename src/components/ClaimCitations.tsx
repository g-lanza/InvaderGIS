/**
 * ClaimCitations — inline numbered citations + footnote list (Wave 1B).
 *
 * Two surfaces ship together:
 *
 *   <CitedSpan refs={[1, 2]}>The grain trade collapsed by 1340.</CitedSpan>
 *   <ClaimCitations sourceIds={["pieper_scholasticism_1960"]} />
 *
 * CitedSpan wraps any inline text with one or more numbered superscript
 * anchors that scroll to the matching footnote row.
 *
 * ClaimCitations renders the numbered list, resolving source-record ids
 * to real title + author via the loaded records (provenance.sources_used).
 * If the source record cannot be found, the raw id is shown — never a
 * fabricated citation.
 *
 * Both are pure, token-only, zero-hex. All 4 themes correct.
 *
 * MOUNT: Used inside ProvenanceBlock (rendered in EntityDock). The verify
 * agent does not need to mount ClaimCitations separately — it renders
 * automatically when a record with sources_used is selected.
 */
import { useCallback, type JSX, type ReactNode } from 'react';
import { loadRecords } from '@/data/loaders';

// ── CitedSpan ─────────────────────────────────────────────────────────────────

/** Props for CitedSpan. */
export interface CitedSpanProps {
  /** 1-indexed reference numbers into the surrounding ClaimCitations list. */
  refs: number[];
  /**
   * Id prefix matching the ClaimCitations idPrefix. Defaults to "cite".
   * Disambiguates when multiple citation groups exist in the same panel.
   */
  idPrefix?: string;
  children: ReactNode;
}

/**
 * Inline wrapper that appends numbered superscript anchors after its children.
 * Each anchor scrolls + focuses the matching footnote row in ClaimCitations.
 */
export function CitedSpan({ refs, idPrefix = 'cite', children }: CitedSpanProps): JSX.Element {
  const onClick = useCallback(
    (n: number) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const target = document.getElementById(`${idPrefix}-${n}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    },
    [idPrefix],
  );

  return (
    <span className="cited-span">
      {children}
      {refs.map((n, i) => (
        <sup key={`${n}-${i}`} className="cited-span__sup">
          {i > 0 && ','}
          <a
            href={`#${idPrefix}-${n}`}
            onClick={onClick(n)}
            aria-label={`Footnote ${n}`}
            className="cited-span__marker"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7em',
              color: 'var(--accent)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {n}
          </a>
        </sup>
      ))}
    </span>
  );
}

// ── ClaimCitations ────────────────────────────────────────────────────────────

/** A resolved source entry for display. */
interface ResolvedSource {
  /** The raw source id from provenance.sources_used. */
  id: string;
  /** Human-readable label: "Author, Title (Year)" or the raw id if not found. */
  label: string;
  /** External URL to the original document, when the source record carries one. */
  url?: string;
}

/** Props for ClaimCitations. */
export interface ClaimCitationsProps {
  /**
   * Ordered source-record ids from provenance.sources_used.
   * Resolved against the loaded source records. Empty → renders nothing.
   */
  sourceIds: string[];
  /** Id prefix matching CitedSpan callers. Default: "cite". */
  idPrefix?: string;
  /** Optional heading override. Default: "Sources". */
  heading?: string;
}

/**
 * Resolves source-record ids to display labels.
 * Reads the already-loaded source records synchronously — no fetch.
 * Returns the raw id if no matching source record is found (honest fallback).
 */
function resolveSources(ids: string[]): ResolvedSource[] {
  const sources = loadRecords('source');
  return ids.map((id) => {
    const rec = sources.find((s) => s.id === id);
    if (!rec) return { id, label: id };

    const author = typeof rec.author === 'string' ? rec.author : '';
    const title  = typeof rec.title  === 'string' ? rec.title  : '';
    const year   = typeof rec.year   === 'number' ? String(rec.year) : '';
    // External URL to the original document (e.g. a Fordham Sourcebook page).
    const rawUrl = typeof rec.url === 'string' ? rec.url : '';
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;

    // Prefer the quarry citation if available (already Chicago-formatted).
    const quarryCite =
      rec._quarry && typeof (rec._quarry as Record<string, unknown>).citation === 'string'
        ? (rec._quarry as Record<string, unknown>).citation as string
        : null;

    if (quarryCite) return { id, label: quarryCite, url };

    // Build a minimal label from available fields.
    const parts = [author, title, year].filter(Boolean);
    return { id, label: parts.join('. ') || id, url };
  });
}

/**
 * Numbered footnote list resolving source ids to real bibliographic records.
 * Renders null when sourceIds is empty (honest empty state).
 */
export function ClaimCitations({
  sourceIds,
  idPrefix = 'cite',
  heading  = 'Sources',
}: ClaimCitationsProps): JSX.Element | null {
  if (sourceIds.length === 0) return null;

  const resolved = resolveSources(sourceIds);

  return (
    <section
      aria-label={heading}
      style={{
        marginTop: 'var(--space-2)',
        borderTop: '0.5px solid var(--border-mid)',
        paddingTop: 'var(--space-2)',
      }}
    >
      <p
        className="cap-sm"
        style={{ color: 'var(--ink-mid)', marginBottom: 'var(--space-1)' }}
      >
        {heading}
      </p>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        {resolved.map(({ id, label, url }, i) => {
          const n = i + 1;
          return (
            <li
              key={`${idPrefix}-${n}`}
              id={`${idPrefix}-${n}`}
              tabIndex={-1}
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--ink-light)',
              }}
            >
              <span
                className="mono"
                style={{
                  flexShrink: 0,
                  color: 'var(--ink-mid)',
                  minWidth: '1.4em',
                }}
                aria-hidden="true"
              >
                {n}.
              </span>
              <span style={{ display: 'inline-flex', gap: 'var(--space-1)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <a
                  href={`#page=sources&item=${id}`}
                  style={{
                    color: 'var(--ink-light)',
                    textDecoration: 'underline',
                    textDecorationColor: 'var(--border-mid)',
                    textUnderlineOffset: '2px',
                  }}
                  title={`Open source record: ${id}`}
                >
                  {label}
                </a>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open the original document: ${url}`}
                    style={{
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9em',
                    }}
                    aria-label="Open original source document in a new tab"
                  >
                    ↗
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
