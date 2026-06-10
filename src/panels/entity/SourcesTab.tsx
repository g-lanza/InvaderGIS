/**
 * SourcesTab — provenance and bibliography for a polity record.
 *
 * Sections (all backed by REAL fields — no fabrication):
 *   1. Provenance status / confidence / attestation — via ProvenanceBlock
 *   2. Full bibliography — provenance.sources_used[] resolved to real
 *      source-record titles via ClaimCitations
 *   3. External IDs — any external_ids map present on the record
 *
 * Honest-empty states:
 *   - No sources_used → "No sources recorded" message below provenance
 *   - No external_ids → external IDs section is omitted
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows, token-only.
 *   - No italics in chrome. Correct in all 4 themes.
 */

import { useMemo, type JSX } from 'react';
import type { CardProps } from '@/panels/types';
import { extractProvenance } from '@/panels/types';
import { ProvenanceBlock }   from '@/panels/ProvenanceBlock';
import { ExternalIdEntry }   from '@/panels/ExternalIdEntry';
import { loadRecords }        from '@/data/loaders';
import { extractPopulationSources } from '@/data/populationSources';
import { AnnotationsForTarget } from '@/panels/AnnotationsForTarget';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A source id that resolves to a REAL source record. */
interface ResolvedSource {
  id: string;
  /** Citation label built from real fields: "_quarry.citation" or "Author. Title. Year". */
  label: string;
  /** URL if available on the record. */
  url: string | null;
  /** License string if available. */
  license: string | null;
}

/** Result of splitting sources_used[] into resolvable vs unresolvable ids. */
interface SourceSplit {
  /** Ids that match a real source record — safe to render as citations. */
  resolved: ResolvedSource[];
  /** Ids with no matching source record — listed honestly, NEVER as citations. */
  unresolvedIds: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split source ids into resolved (matching a real source record) and
 * unresolved (no matching record).
 *
 * REALNESS: only ids that resolve to a real record become citations. A bare,
 * unresolved machine id is NEVER dressed up as a bibliography entry — it is
 * surfaced separately under an honest "unresolved" label. This is the fix for
 * the realness gap where 345/351 references resolved to nothing.
 *
 * Reads already-loaded source records — no fetch.
 */
function splitSources(ids: string[]): SourceSplit {
  const sources = loadRecords('source');
  const resolved: ResolvedSource[] = [];
  const unresolvedIds: string[] = [];

  for (const id of ids) {
    const rec = sources.find((s) => s.id === id);
    if (!rec) {
      unresolvedIds.push(id);
      continue;
    }

    // Prefer the pre-formatted quarry citation.
    const quarry = rec['_quarry'];
    const quarryCite =
      quarry && typeof quarry === 'object' &&
      typeof (quarry as Record<string, unknown>)['citation'] === 'string'
        ? ((quarry as Record<string, unknown>)['citation'] as string)
        : null;

    const author  = typeof rec['author']  === 'string' ? rec['author']  : '';
    const title   = typeof rec['title']   === 'string' ? rec['title']   : '';
    const year    = typeof rec['year']    === 'number' ? String(rec['year']) : '';
    const url     = typeof rec['url']     === 'string' ? rec['url']     : null;
    const license = typeof rec['license'] === 'string' ? rec['license'] : null;

    // A resolved record should carry real bibliographic text; if it somehow
    // carries none, the id is the only honest label we can show.
    const label = quarryCite
      ? quarryCite
      : [author, title, year].filter(Boolean).join('. ') || id;

    resolved.push({ id, label, url, license });
  }

  return { resolved, unresolvedIds };
}

// ── SourcesTab ────────────────────────────────────────────────────────────────

/**
 * Sources tab for a polity record.
 *
 * Renders provenance block, full numbered bibliography, and external IDs.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback (unused here, required by CardProps).
 */
export function SourcesTab({ record, onNavigate }: CardProps): JSX.Element {
  const prov = extractProvenance(record);
  const recordId = typeof record['id'] === 'string' ? (record['id'] as string) : '';

  // ── Source ids ──────────────────────────────────────────────────────────
  const sourceIds: string[] = useMemo(() => {
    const provObj = record['provenance'] as Record<string, unknown> | undefined;
    if (!provObj) return [];
    const raw = provObj['sources_used'];
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }, [record]);

  // ── Split into resolvable vs unresolvable ids ────────────────────────────
  const { resolved: resolvedSources, unresolvedIds } = useMemo(
    () => splitSources(sourceIds),
    [sourceIds],
  );

  /** True when sources_used had entries but none matched a real record. */
  const hasRefsButNoneResolve = sourceIds.length > 0 && resolvedSources.length === 0;

  // ── External IDs ────────────────────────────────────────────────────────
  const externalIds: Record<string, string> | null = useMemo(() => {
    const raw = record['external_ids'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      ([, v]) => typeof v === 'string',
    ) as Array<[string, string]>;
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }, [record]);

  // ── Population data sources ───────────────────────────────────────────────
  // The wikidata/wikipedia sources backing population_estimates[] (previously a
  // raw-URL line on the Overview chart) — shown here as clickable links.
  const populationSources = useMemo(() => extractPopulationSources(record), [record]);

  return (
    <div>
      {/* ── ProvenanceBlock — status / confidence / source count ────────── */}
      <ProvenanceBlock prov={prov} externalIds={externalIds ?? undefined} />

      {/* ── Full bibliography ────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div className="panel-head">
          <span className="panel-head__label">Bibliography</span>
          {resolvedSources.length > 0 && (
            <span
              className="chip mono"
              style={{
                color: 'var(--ink-light)',
                borderColor: 'var(--border)',
                fontSize: '10px',
              }}
            >
              {resolvedSources.length}
            </span>
          )}
        </div>

        {resolvedSources.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.05em',
              color: 'var(--ink-mute)',
              textTransform: 'uppercase',
            }}
          >
            {hasRefsButNoneResolve ? 'No resolvable sources' : 'No sources recorded'}
          </div>
        ) : (
          <ol
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-3)',
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {resolvedSources.map(({ id, label, url, license }, i) => (
              <li
                key={id}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  fontSize: '11px',
                  lineHeight: 1.45,
                  color: 'var(--ink-light)',
                  borderBottom: i < resolvedSources.length - 1
                    ? '0.5px solid var(--border)'
                    : 'none',
                  paddingBottom: i < resolvedSources.length - 1
                    ? 'var(--space-2)'
                    : 0,
                }}
              >
                {/* Number */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ink-mid)',
                    flexShrink: 0,
                    minWidth: '1.6em',
                    marginTop: 1,
                  }}
                  aria-hidden="true"
                >
                  {i + 1}.
                </span>

                {/* Citation */}
                <div style={{ flex: 1 }}>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--ink-light)',
                        textDecoration: 'underline',
                        textDecorationColor: 'var(--border-mid)',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  )}

                  {/* License chip */}
                  {license && (
                    <span
                      className="chip mono"
                      style={{
                        display: 'inline-block',
                        marginLeft: 'var(--space-1)',
                        fontSize: '9px',
                        color: 'var(--ink-mute)',
                        borderColor: 'var(--border-mid)',
                        letterSpacing: '0.03em',
                        verticalAlign: 'middle',
                      }}
                    >
                      {license}
                    </span>
                  )}

                  {/* Raw source id for re-verification */}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      color: 'var(--ink-mute)',
                      marginTop: 2,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {id}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Population data sources ──────────────────────────────────────────
          The wikidata/wikipedia sources backing the population estimates shown
          on the Overview chart. Rendered as clickable links (honest sourcing,
          relocated here from a raw-URL line that used to sit on the chart).
          Omitted entirely when the record has no population sources. */}
      {populationSources.length > 0 && (
        <div
          className="panel"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div className="panel-head">
            <span className="panel-head__label">Population data sources</span>
            <span
              className="chip mono"
              style={{
                color: 'var(--ink-light)',
                borderColor: 'var(--border)',
                fontSize: '10px',
              }}
            >
              {populationSources.length}
            </span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-3)',
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1) var(--space-2)',
            }}
          >
            {populationSources.map((s, i) => (
              <li key={`${s.type}:${s.id ?? s.label ?? i}`}>
                {/* Prefer the donor's own url verbatim when present; otherwise
                    fall back to ExternalIdEntry's builder (never fabricated when
                    a real url exists). */}
                {s.type === 'wikipedia' && s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', wordBreak: 'break-all' }}
                    title={`Open Wikipedia article ${s.label ?? ''}`}
                  >
                    wikipedia:{s.label}
                  </a>
                ) : (
                  <ExternalIdEntry id={s.type} value={s.id ?? s.label ?? ''} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Unresolved source refs ───────────────────────────────────────────
          Ids in sources_used[] that match NO real source record. Surfaced
          honestly as raw refs in muted mono — NEVER dressed up as citations.
          Only shown when at least one resolved source already exists (otherwise
          the bibliography panel already says "No resolvable sources"). */}
      {resolvedSources.length > 0 && unresolvedIds.length > 0 && (
        <div
          className="panel"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div className="panel-head">
            <span className="panel-head__label">Unresolved source refs</span>
            <span
              className="chip mono"
              style={{
                color: 'var(--ink-light)',
                borderColor: 'var(--border)',
                fontSize: '10px',
              }}
            >
              {unresolvedIds.length}
            </span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-3)',
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-1) var(--space-2)',
            }}
          >
            {unresolvedIds.map((id) => (
              <li
                key={id}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--ink-mute)',
                  letterSpacing: '0.03em',
                }}
              >
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cited in passages — annotations elsewhere that reference this entity.
          Activates the annotation layer on the entity side (Recogito-style). */}
      {recordId !== '' && (
        <AnnotationsForTarget recordId={recordId} mode="links" onNavigate={onNavigate} />
      )}
    </div>
  );
}
