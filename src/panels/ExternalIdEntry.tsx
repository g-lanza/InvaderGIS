/**
 * ExternalIdEntry — render a single external identifier as a link when the key
 * is recognised, or plain mono text otherwise.
 *
 * Shared by the Settlement / Capital / Military cards and the entity Sources tab
 * (population-data sources). Extracted from the three near-identical card-local
 * copies so the URL patterns and link styling live in one place.
 *
 * Honest sourcing: only keys with a known stable URL pattern become links; an
 * unknown key renders as plain text rather than a guessed/fabricated link.
 *
 * Tokens only — colour via var(--accent) / var(--ink-mid); no hardcoded hex.
 */

/**
 * Map from a known external_id key to a URL builder.
 * Only keys with known stable URL patterns are linked; unknowns render as plain text.
 *
 * NOTE: `wikipedia` takes an article *title/label* (not a QID) and builds an
 * en.wikipedia.org URL as a FALLBACK only — when the source already supplies its
 * own `url`, callers should prefer that verbatim rather than this default.
 */
const EXT_ID_URL: Record<string, (v: string) => string> = {
  wikidata: (v) => `https://www.wikidata.org/wiki/${v}`,
  pleiades: (v) => `https://pleiades.stoa.org/places/${v}`,
  wikipedia: (v) => `https://en.wikipedia.org/wiki/${encodeURIComponent(v.replace(/ /g, '_'))}`,
};

/** Render a single external ID as a link when the key is recognised. */
export function ExternalIdEntry({ id, value }: { id: string; value: string }) {
  const urlFn = EXT_ID_URL[id];
  if (urlFn) {
    return (
      <a
        href={urlFn(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono"
        style={{
          fontSize: '11px',
          color: 'var(--accent)',
          textDecoration: 'none',
          wordBreak: 'break-all',
        }}
        title={`Open ${id} record ${value}`}
      >
        {id}:{value}
      </a>
    );
  }
  return (
    <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-mid)' }}>
      {id}:{value}
    </span>
  );
}
