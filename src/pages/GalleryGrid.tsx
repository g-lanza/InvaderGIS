/**
 * GalleryGrid.tsx — a card-grid presentation of one record kind (Palladio-style
 * "gallery"), a sibling to AttributeTable that shares the SAME register schemas,
 * data pipeline, filter facets, selection, hover, and compare-set wiring.
 *
 * WHY TEXT CARDS (not image tiles):
 *   No record kind in this corpus carries an image/thumbnail field, so a card
 *   shows the schema's first column as the TITLE and the next few columns as
 *   labeled field rows. This is honest to the data — no placeholder imagery.
 *
 * DATA CONTRACT (Realness Law):
 *   - Cards are REAL records from `loadRecords(kind)`. No mocks.
 *   - Card fields come from the kind's RegisterSchema (registerSchemas.ts) — the
 *     SAME columns the table uses. columns[0] → title; columns[1..4] → field rows.
 *     Missing values render "—" (via the shared `cell()`).
 *   - Honest empty state: a kind with zero records, or a filter matching nothing,
 *     shows a neutral message — never a fabricated card.
 *
 * LINKED VIEWS:
 *   - Click a card → `selectionStore.select(id, kind)` (opens EntityDock + map
 *     highlight). Keyboard Enter/Space does the same.
 *   - Hover → `setHover(id, kind)` for cross-view highlighting.
 *   - Compare `+`/`✓` reuses `compareStore` + MAX_COMPARE; stopPropagation keeps
 *     card-select and compare-toggle independent.
 *   - Shared facets via `filterStore` + `passesFilter` — identical to the table.
 *
 * LARGE KINDS (honest, no silent truncation):
 *   Card grids can't window the way the fixed-height table does, so we render the
 *   first `GALLERY_PAGE` of the filtered+sorted set, ALWAYS show "Showing N of M"
 *   when more exist, and offer "Show more". `content-visibility:auto` on cards
 *   keeps the rendered DOM cheap — it is a paint optimisation only, never the
 *   source of truth for the count. The cap resets whenever the kind or any
 *   facet/text filter changes.
 *
 * DESIGN: square corners, hairline borders, no shadows, tokens only, 4 themes.
 *         Uses `.gal-*` classes (registers.css) + reuses `.sl-toolbar`/`.sl-filter`
 *         and `.at-cmp-btn`.
 */
import { useMemo, useRef, useState } from 'react';
import { loadRecords, type RawRecord } from '@/data/loaders';
import { useSelectionStore } from '@/stores/selectionStore';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter } from '@/data/filterPredicate';
import { useCompareStore, MAX_COMPARE } from '@/stores/compareStore';
import type { RegisterSchema } from './registerSchemas';
import { cell, compare } from './registerRowUtils';

// ── Tuning ──────────────────────────────────────────────────────────────────

/** Cards rendered per page; "Show more" grows the cap by this much. */
const GALLERY_PAGE = 300;
/** Max field rows shown on a card (after the title). */
const MAX_CARD_FIELDS = 4;

// ── Props ───────────────────────────────────────────────────────────────────

/** Props for GalleryGrid — identical to AttributeTable. */
export interface GalleryGridProps {
  /** The register schema (kind + columns) to render as cards. */
  schema: RegisterSchema;
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Card-grid view of one register kind. Mirrors AttributeTable's pipeline; the
 * only difference is the render shell (cards vs rows).
 *
 * @param schema - The register schema (kind + column aliases) to display.
 */
export function GalleryGrid({ schema }: GalleryGridProps) {
  const { columns, kind, label } = schema;

  // First column = title; the next few become labeled field rows on the card.
  const titleCol = columns[0];
  const fieldCols = columns.slice(1, 1 + MAX_CARD_FIELDS);

  // ── Local name search + render cap ──────────────────────────────────────────
  const [filterText, setFilterText] = useState('');
  const [cap, setCap] = useState(GALLERY_PAGE);

  // ── Selection + hover (cross-view linked) ──────────────────────────────────
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const select = useSelectionStore((s) => s.select);
  const hoverId = useSelectionStore((s) => s.hoverId);
  const setHover = useSelectionStore((s) => s.setHover);

  // ── Shared facets (Pass 1) ──────────────────────────────────────────────────
  const filterYearRange   = useFilterStore((s) => s.yearRange);
  const filterKinds       = useFilterStore((s) => s.kinds);
  const filterRegions     = useFilterStore((s) => s.regions);
  const filterConfidence  = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);

  // ── Compare set ─────────────────────────────────────────────────────────────
  const compareAdd    = useCompareStore((s) => s.add);
  const compareRemove = useCompareStore((s) => s.remove);
  const compareItems  = useCompareStore((s) => s.items);
  const compareFull   = compareItems.length >= MAX_COMPARE;

  // ── Real records (memoised on kind) ─────────────────────────────────────────
  const allRows: RawRecord[] = useMemo(() => loadRecords(kind), [kind]);

  // ── Filter: shared facets AND-composed with the local name search ──────────
  const filteredRows: RawRecord[] = useMemo(() => {
    const facets = {
      yearRange: filterYearRange,
      kinds: filterKinds,
      regions: filterRegions,
      confidence: filterConfidence,
      attestation: filterAttestation,
    };
    const q = filterText.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!passesFilter(r, facets)) return false;
      if (q && titleCol && !titleCol.get(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, filterText, titleCol, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation]);

  // ── Sort: name column ascending (shared `compare`) ──────────────────────────
  const sortedRows: RawRecord[] = useMemo(() => {
    if (!titleCol) return filteredRows;
    return filteredRows.slice().sort((a, b) => compare(a, b, titleCol));
  }, [filteredRows, titleCol]);

  // Reset the cap whenever the visible set could change (honest "Show more").
  const total = sortedRows.length;
  const filterKey = useMemo(
    () => [
      kind, filterText, filterYearRange?.join('-') ?? '',
      [...filterKinds].sort().join(','), [...filterRegions].sort().join(','),
      [...filterConfidence].sort().join(','), [...filterAttestation].sort().join(','),
    ].join('|'),
    [kind, filterText, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation],
  );
  // Reset the cap during render when the filter key changes (the React-idiomatic
  // "adjust state on prop/derived change" pattern — no effect needed).
  const lastKeyRef = useRef(filterKey);
  if (lastKeyRef.current !== filterKey) {
    lastKeyRef.current = filterKey;
    if (cap !== GALLERY_PAGE) setCap(GALLERY_PAGE);
  }

  const shown = Math.min(cap, total);
  const visible = sortedRows.slice(0, shown);
  const hasMore = total > shown;

  return (
    <div className="gal-root">
      {/* Toolbar — count + name filter (reuses sources-library classes) */}
      <div className="sl-toolbar">
        <span className="sl-toolbar__count">
          {total === allRows.length
            ? `${allRows.length} ${label.toLowerCase()}`
            : `${total} of ${allRows.length}`}
        </span>
        <input
          className="sl-filter"
          type="search"
          placeholder={`Filter ${label.toLowerCase()} by ${titleCol?.alias.toLowerCase() ?? 'name'}…`}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label={`Filter ${label}`}
        />
      </div>

      {/* Honest "showing N of M" notice — only when more than shown exist */}
      {hasMore && (
        <div className="gal-notice">
          <span>
            Showing {shown.toLocaleString()} of {total.toLocaleString()}
            {total !== allRows.length ? ` (filtered from ${allRows.length.toLocaleString()})` : ''}
            {' — refine filters to narrow'}
          </span>
          <button type="button" className="btn" onClick={() => setCap((c) => c + GALLERY_PAGE)}>
            Show more
          </button>
        </div>
      )}

      {/* Card grid (or honest empty state) */}
      <div className="gal-scroll" role="region" aria-label={`${label} gallery`}>
        {total === 0 ? (
          <p className="gal-empty">
            {allRows.length === 0
              ? `No ${label.toLowerCase()} on record`
              : `No matching ${label.toLowerCase()}`}
          </p>
        ) : (
          <div className="gal-grid">
            {visible.map((record) => {
              const isSelected = record.id === selectedId && selectedType === kind;
              const isHovered = record.id === hoverId;
              const inCompare = compareItems.some((e) => e.id === record.id);
              const title = titleCol ? cell(titleCol, record) : record.id;
              return (
                <div
                  key={record.id}
                  className={`gal-card${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}${inCompare ? ' gal-card--in-compare' : ''}`}
                  onClick={() => select(record.id, kind)}
                  onMouseEnter={() => setHover(record.id, kind)}
                  onMouseLeave={() => setHover(null, null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${title || record.id}`}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(record.id, kind);
                    }
                  }}
                >
                  <div className="gal-card__title">{title}</div>
                  {fieldCols.length > 0 && (
                    <dl className="gal-card__fields">
                      {fieldCols.map((col) => (
                        <div className="gal-card__field" key={col.id}>
                          <dt>{col.alias}</dt>
                          <dd className={col.kind === 'num' ? 'gal-card__num' : undefined}>
                            {cell(col, record)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {/* Compare toggle — stopPropagation keeps select + compare independent */}
                  <div
                    className="gal-card__foot"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`at-cmp-btn${inCompare ? ' is-active' : ''}`}
                      disabled={!inCompare && compareFull}
                      title={
                        inCompare
                          ? 'Remove from compare'
                          : compareFull
                          ? `Compare set full (${MAX_COMPARE} max) — remove one first`
                          : 'Add to compare'
                      }
                      aria-pressed={inCompare}
                      aria-label={inCompare ? `Remove ${title} from compare` : `Add ${title} to compare`}
                      onClick={() => {
                        if (inCompare) compareRemove(record.id);
                        else compareAdd(record.id, kind);
                      }}
                    >
                      {inCompare ? '✓' : '+'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
