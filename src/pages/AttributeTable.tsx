/**
 * AttributeTable.tsx — a sortable / filterable attribute table for one record
 * kind, the core GIS "open attribute table" feature (docs/09 §Attribute table:
 * FeatureTable convention — rows = features, cols = fields, sortable headers,
 * row-click highlights the feature on the map, virtual scroll for large layers).
 *
 * DATA CONTRACT (Realness Law):
 *   - Rows are the REAL records from `loadRecords(schema.kind)`. No mocks.
 *   - Columns come from the kind's RegisterSchema (registerSchemas.ts); each
 *     header is the human field ALIAS, each cell a real field read. Missing
 *     fields render "—".
 *   - Honest empty state: a kind with zero records, or a filter that matches
 *     nothing, shows a neutral message — never a fabricated row.
 *
 * KEY GIS CONVENTION — row ↔ map link:
 *   Clicking a row calls `selectionStore.select(id, kind)`, which highlights /
 *   opens the feature (the EntityDock + map selection layer both subscribe to
 *   selectionStore). Keyboard Enter/Space does the same. The currently-selected
 *   row (selectionStore.selectedId) is marked `.is-selected` so the map → table
 *   direction is reflected too.
 *
 * PERFORMANCE — windowing:
 *   The Events register has 2,914 rows. Rendering 2,914 <tr> with click + key
 *   handlers is wasteful. We window: only the rows in the visible scroll range
 *   (+ overscan) are rendered as real <tr>; the remaining height above/below is
 *   reserved with two spacer rows so the scrollbar geometry is exact. Row height
 *   is a fixed constant (matches the CSS), so the visible slice is pure
 *   arithmetic on scrollTop — no per-row measurement.
 *
 * DESIGN: square corners, hairline borders, no shadows, tokens only,
 *         tabular-nums on numeric cells. Reuses the `.sl-*` classes already
 *         defined in sources-library.css plus a few `.at-*` additions in
 *         registers.css.
 *
 * Phase Wave2-B — Attribute Table registers (ArcGIS FeatureTable convention).
 */

import { useMemo, useRef, useState } from 'react';
import { loadRecords } from '@/data/loaders';
import type { RawRecord } from '@/data/loaders';
import { useSelectionStore } from '@/stores/selectionStore';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter } from '@/data/filterPredicate';
import { useCompareStore, MAX_COMPARE } from '@/stores/compareStore';
import type { RegisterSchema } from './registerSchemas';
import { cell, compare } from './registerRowUtils';

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Fixed row height in px — MUST match `.at-row` height in registers.css. */
const ROW_H = 30;
/** Extra rows rendered above/below the viewport to avoid blank flashes on scroll. */
const OVERSCAN = 8;
/** Fallback viewport height (px) before the scroll container is measured. */
const FALLBACK_VIEWPORT_H = 600;

// ── Sort state ────────────────────────────────────────────────────────────────

/** Sort direction. */
type SortDir = 'asc' | 'desc';

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for the AttributeTable. */
export interface AttributeTableProps {
  /** The register schema (kind + columns) to render. */
  schema: RegisterSchema;
}

// `cell()` + `compare()` now live in ./registerRowUtils so the GalleryGrid view
// shares the exact same formatting + sort behaviour (no drift).

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * AttributeTable — windowed, sortable, filterable table of one kind's records.
 *
 * @param schema - The register schema (kind + column aliases) to display.
 */
export function AttributeTable({ schema }: AttributeTableProps) {
  const { columns, kind } = schema;

  // First column is the implicit "name" column used by the text filter + label.
  const nameCol = columns[0];

  // ── Sort + filter state (reset when the kind changes via key remount) ──────
  const [filterText, setFilterText] = useState('');
  const [sortColId, setSortColId] = useState<string>(columns[0]?.id ?? '');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Scroll windowing state ──────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(FALLBACK_VIEWPORT_H);

  // ── Map → table link: currently selected record id ──────────────────────────
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const select = useSelectionStore((s) => s.select);

  // ── Linked views (Pass 1): shared filter + cross-view hover ──────────────────
  const hoverId = useSelectionStore((s) => s.hoverId);
  const setHover = useSelectionStore((s) => s.setHover);
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);

  // ── Compare set integration ──────────────────────────────────────────────────
  const compareAdd    = useCompareStore((s) => s.add);
  const compareRemove = useCompareStore((s) => s.remove);
  const compareItems  = useCompareStore((s) => s.items);
  const compareFull   = compareItems.length >= MAX_COMPARE;

  // ── Build rows from REAL records (memoised on kind) ─────────────────────────
  const allRows: RawRecord[] = useMemo(() => loadRecords(kind), [kind]);

  // ── Filter: shared facets (Pass 1) AND-composed with the local name search ──
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
      if (q && nameCol && !nameCol.get(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, filterText, nameCol, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation]);

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const sortedRows: RawRecord[] = useMemo(() => {
    const col = columns.find((c) => c.id === sortColId);
    if (!col) return filteredRows;
    const copy = filteredRows.slice().sort((a, b) => compare(a, b, col));
    return sortDir === 'asc' ? copy : copy.reverse();
  }, [filteredRows, columns, sortColId, sortDir]);

  // ── Windowing arithmetic ─────────────────────────────────────────────────────
  const total = sortedRows.length;
  const totalHeight = total * ROW_H;
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const lastVisible = Math.min(total, firstVisible + visibleCount);
  const topPad = firstVisible * ROW_H;
  const bottomPad = Math.max(0, totalHeight - lastVisible * ROW_H);
  const windowRows = sortedRows.slice(firstVisible, lastVisible);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleHeaderClick(colId: string) {
    if (colId === sortColId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColId(colId);
      const col = columns.find((c) => c.id === colId);
      // Numeric columns descend first; text columns ascend first.
      setSortDir(col?.kind === 'num' ? 'desc' : 'asc');
    }
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (el.clientHeight !== viewportH) setViewportH(el.clientHeight);
  }

  function handleRowClick(record: RawRecord) {
    // KEY GIS CONVENTION: row → map. Highlights / opens the feature.
    select(record.id, kind);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const sortIndicator = (colId: string) =>
    colId === sortColId ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="sl-root at-root">
      {/* Toolbar ─────────────────────────────────────────────────────── */}
      <div className="sl-toolbar">
        <span className="sl-toolbar__count">
          {total === allRows.length
            ? `${allRows.length} ${schema.label.toLowerCase()}`
            : `${total} of ${allRows.length}`}
        </span>
        <input
          className="sl-filter"
          type="search"
          placeholder={`Filter ${schema.label.toLowerCase()} by ${nameCol?.alias.toLowerCase() ?? 'name'}…`}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label={`Filter ${schema.label}`}
        />
      </div>

      {/* Table ───────────────────────────────────────────────────────── */}
      <div
        className="sl-table-scroll at-scroll"
        role="region"
        aria-label={`${schema.label} attribute table`}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <table className="sl-table at-table" aria-rowcount={total}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={`sl-th sl-th--${col.kind === 'num' ? 'right' : 'left'}`}
                  aria-sort={
                    col.id === sortColId
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    className="sl-th__btn"
                    onClick={() => handleHeaderClick(col.id)}
                    title={`Sort by ${col.alias}`}
                  >
                    {col.alias}
                    <span className="sl-th__indicator" aria-hidden="true">
                      {sortIndicator(col.id)}
                    </span>
                  </button>
                </th>
              ))}
              {/* Compare action column header */}
              <th
                className="sl-th sl-th--center at-th-cmp"
                title={`Compare up to ${MAX_COMPARE} records side-by-side`}
              >
                <span className="sl-th__btn" style={{ cursor: 'default' }}>
                  Cmp
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td className="sl-empty" colSpan={columns.length + 1}>
                  {allRows.length === 0
                    ? `No ${schema.label.toLowerCase()} on record`
                    : `No matching ${schema.label.toLowerCase()}`}
                </td>
              </tr>
            ) : (
              <>
                {/* Top spacer reserves the height of the rows scrolled past. */}
                {topPad > 0 && (
                  <tr aria-hidden="true" className="at-spacer">
                    <td colSpan={columns.length} style={{ height: topPad }} />
                  </tr>
                )}
                {windowRows.map((record) => {
                  const isSelected =
                    record.id === selectedId && selectedType === kind;
                  const isHovered = record.id === hoverId;
                  const inCompare = compareItems.some((e) => e.id === record.id);
                  const label = nameCol ? nameCol.get(record) : record.id;
                  return (
                    <tr
                      key={record.id}
                      className={`sl-row at-row${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}${inCompare ? ' at-row--in-compare' : ''}`}
                      onClick={() => handleRowClick(record)}
                      onMouseEnter={() => setHover(record.id, kind)}
                      onMouseLeave={() => setHover(null, null)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${label || record.id}`}
                      aria-pressed={isSelected}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(record);
                        }
                      }}
                    >
                      {columns.map((col, ci) => (
                        <td
                          key={col.id}
                          className={`sl-td${col.kind === 'num' ? ' sl-td--num' : ''}${
                            ci === 0 ? ' sl-td--title' : ''
                          }`}
                        >
                          {cell(col, record)}
                        </td>
                      ))}
                      {/* Compare action cell — stops click propagation so the
                          row-select (→ map/dock) and compare-toggle are independent */}
                      <td
                        className="sl-td at-td-cmp"
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
                          aria-label={inCompare ? `Remove ${label} from compare` : `Add ${label} to compare`}
                          onClick={() => {
                            if (inCompare) {
                              compareRemove(record.id);
                            } else {
                              compareAdd(record.id, kind);
                            }
                          }}
                        >
                          {inCompare ? '✓' : '+'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* Bottom spacer reserves the height of the rows not yet scrolled to. */}
                {bottomPad > 0 && (
                  <tr aria-hidden="true" className="at-spacer">
                    <td colSpan={columns.length} style={{ height: bottomPad }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
