/**
 * SourcesLibrary.tsx — sortable/filterable table of all source records.
 *
 * DATA CONTRACT (Realness Law):
 *   - Renders the REAL records from loadRecords('source') (432 at time of writing;
 *     count is data-driven, never hardcoded). Each carries a unique id.
 *   - Gated on useRecordsStore(s => s.counts) !== null to avoid the bootstrap
 *     race that bit LineageGantt. If counts is null → <LoadingState/>.
 *   - Citation count = number of OTHER records (across all kinds) that reference
 *     this source id in their provenance.sources_used. Computed once via useMemo.
 *   - Missing fields → "—". No fabricated values.
 *
 * COLUMNS: title, author, year, kind_type, status, citations
 *
 * INTERACTIONS:
 *   - Click column header → sort by that column (toggle asc/desc).
 *   - Text filter input → narrows rows by title/author/kind_type.
 *   - Click a row → useSelectionStore.getState().select(sourceId, 'source')
 *     so the EntityDock opens the record.
 *
 * DESIGN: square corners, hairline borders, no shadows, token CSS only,
 *         mono numerals via font-variant-numeric: tabular-nums.
 *
 * Phase 5-c — Sources Library (registers builder).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecordsStore }    from '@/stores/recordsStore';
import { useSelectionStore }  from '@/stores/selectionStore';
import { useFilterStore }     from '@/stores/filterStore';
import { passesFilter }       from '@/data/filterPredicate';
import { loadRecords }        from '@/data/loaders';
import type { RawRecord }     from '@/data/loaders';
import { statusRootLabel }    from '@/panels/statusRoots';
import { LoadingState }       from '@/components/states/LoadingState';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Column ids used for sort state. */
type SortCol = 'title' | 'author' | 'year' | 'kind_type' | 'status' | 'citations';

/** Sort direction. */
type SortDir = 'asc' | 'desc';

/** A row in the sources table — all fields coerced to display-safe strings. */
interface SourceRow {
  id:        string;
  title:     string;
  author:    string;
  year:      string;
  /** Numeric year for sort; NaN when absent. */
  yearNum:   number;
  kind_type: string;
  status:    string;
  citations: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce an unknown value to a display string; missing → "—". */
function str(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string')  return val;
  if (typeof val === 'number')  return String(val);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/**
 * Compute citation counts: for each source id, count how many records across
 * ALL other kinds list that id in their provenance.sources_used array.
 * Called once via useMemo; result is a Map<sourceId, count>.
 */
function computeCitationCounts(sources: RawRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sources) counts.set(s.id, 0);

  // Every record kind EXCEPT 'source' — a source is "cited by" any other kind that
  // lists it in provenance.sources_used. Must stay in sync with RecordType
  // (src/types/record.ts).
  const ALL_OTHER_KINDS = [
    'polity', 'event', 'journey', 'relationship', 'ruler',
    'institution', 'technology', 'text',
    'settlement', 'military', 'capital',
    'claim', 'annotation', 'research_question',
  ] as const;

  for (const kind of ALL_OTHER_KINDS) {
    for (const record of loadRecords(kind)) {
      const prov = record.provenance as Record<string, unknown> | undefined;
      if (!Array.isArray(prov?.sources_used)) continue;
      for (const sid of prov.sources_used as unknown[]) {
        if (typeof sid === 'string' && counts.has(sid)) {
          counts.set(sid, (counts.get(sid) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/** Build a SourceRow from a RawRecord + pre-computed citation count. */
function toRow(record: RawRecord, citations: number): SourceRow {
  const yearRaw = record['year'];
  const yearNum = typeof yearRaw === 'number' ? yearRaw : NaN;
  const kindType = str(record['kind_type'] ?? record['kind']);
  return {
    id:        record.id,
    title:     str(record['title']),
    author:    str(record['author']),
    year:      isNaN(yearNum) ? '—' : String(yearNum),
    yearNum,
    kind_type: kindType,
    status:    str(record['status']),
    citations,
  };
}

/** Compare two SourceRow values for a given column, returning -1/0/1. */
function compareRows(a: SourceRow, b: SourceRow, col: SortCol): number {
  if (col === 'year') {
    const an = isNaN(a.yearNum) ? -Infinity : a.yearNum;
    const bn = isNaN(b.yearNum) ? -Infinity : b.yearNum;
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  if (col === 'citations') {
    return a.citations - b.citations;
  }
  const av = a[col].toLowerCase();
  const bv = b[col].toLowerCase();
  return av < bv ? -1 : av > bv ? 1 : 0;
}

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  id:    SortCol;
  label: string;
  /** CSS class suffix for alignment / width. */
  align: 'left' | 'right' | 'center';
}

const COLS: ColDef[] = [
  { id: 'title',     label: 'Title',      align: 'left'  },
  { id: 'author',    label: 'Author',     align: 'left'  },
  { id: 'year',      label: 'Year',       align: 'right' },
  { id: 'kind_type', label: 'Type',       align: 'left'  },
  { id: 'status',    label: 'Status',     align: 'left'  },
  { id: 'citations', label: 'Cited by',   align: 'right' },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SourcesLibrary — scrollable, sortable, filterable register of all source records.
 *
 * Bootstrap race guard: reads useRecordsStore(s => s.counts); renders
 * <LoadingState/> until counts is non-null (mirrors LineageGantt pattern).
 *
 * @param focusId - Optional source id to select + scroll into view when set,
 *   used by the claim-citation deep link (`#page=sources&item=<id>`). Null = none.
 */
export function SourcesLibrary({ focusId = null }: { focusId?: string | null } = {}) {
  // Bootstrap race guard — gate on counts !== null
  const counts = useRecordsStore((s) => s.counts);

  // Row element refs (keyed by source id) so a deep-linked footnote can scroll
  // the targeted source into view.
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const [filterText, setFilterText] = useState('');
  const [sortCol, setSortCol]       = useState<SortCol>('citations');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');

  // selectionStore.select — via getState() to avoid re-render coupling
  const selectRecord = useSelectionStore((s) => s.select);

  // Deep-link focus: when a claim footnote opens this page to a specific source
  // (`#page=sources&item=<id>`), select it and scroll its row into view. Runs
  // after rows render; the rAF lets the (possibly just-opened) overlay lay out.
  useEffect(() => {
    if (!focusId || counts === null) return;
    selectRecord(focusId, 'source');
    const raf = requestAnimationFrame(() => {
      const el = rowRefs.current.get(focusId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusId, counts, selectRecord]);

  // ── Linked views (Pass 1): shared filter + cross-view hover ──────────────────
  // Sources are non-temporal and region-less, so only the kinds + confidence facets
  // meaningfully narrow this table; passesFilter() treats year/region as no-ops here.
  const hoverId = useSelectionStore((s) => s.hoverId);
  const setHover = useSelectionStore((s) => s.setHover);
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);

  // Build rows — computed once after bootstrap, memoised on counts identity
  const allRows: SourceRow[] = useMemo(() => {
    if (counts === null) return [];
    const facets = {
      yearRange: filterYearRange,
      kinds: filterKinds,
      regions: filterRegions,
      confidence: filterConfidence,
      attestation: filterAttestation,
    };
    const sources  = loadRecords('source');
    const citemap  = computeCitationCounts(sources);
    return sources
      .filter((r) => passesFilter(r, facets))
      .map((r) => toRow(r, citemap.get(r.id) ?? 0));
  }, [counts, filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation]);

  // Filter rows by text query (title, author, kind_type)
  const filteredRows: SourceRow[] = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.kind_type.toLowerCase().includes(q),
    );
  }, [allRows, filterText]);

  // Sort
  const sortedRows: SourceRow[] = useMemo(() => {
    const copy = filteredRows.slice().sort((a, b) => compareRows(a, b, sortCol));
    return sortDir === 'asc' ? copy : copy.reverse();
  }, [filteredRows, sortCol, sortDir]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleColClick(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      // Default: numeric cols descend first; text cols ascend first
      setSortDir(col === 'citations' || col === 'year' ? 'desc' : 'asc');
    }
  }

  function handleRowClick(row: SourceRow) {
    selectRecord(row.id, 'source');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Bootstrap loading guard
  if (counts === null) {
    return <LoadingState label="Loading sources…" className="sl-loading" />;
  }

  const sortIndicator = (col: SortCol) =>
    col === sortCol ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="sl-root">
      {/* Toolbar ─────────────────────────────────────────────────────── */}
      <div className="sl-toolbar">
        <span className="sl-toolbar__count">
          {sortedRows.length === allRows.length
            ? `${allRows.length} sources`
            : `${sortedRows.length} of ${allRows.length}`}
        </span>
        <input
          className="sl-filter"
          type="search"
          placeholder="Filter by title, author, or type…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label="Filter sources"
        />
      </div>

      {/* Table ───────────────────────────────────────────────────────── */}
      <div className="sl-table-scroll" role="region" aria-label="Sources table">
        <table className="sl-table" aria-rowcount={sortedRows.length}>
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col.id}
                  className={`sl-th sl-th--${col.align}`}
                  aria-sort={
                    col.id === sortCol
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    className="sl-th__btn"
                    onClick={() => handleColClick(col.id)}
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    <span className="sl-th__indicator" aria-hidden="true">
                      {sortIndicator(col.id)}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td className="sl-empty" colSpan={COLS.length}>
                  No matching sources
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.id, el);
                    else rowRefs.current.delete(row.id);
                  }}
                  className={`sl-row${row.id === hoverId ? ' is-hovered' : ''}${row.id === focusId ? ' is-focused' : ''}`}
                  onClick={() => handleRowClick(row)}
                  onMouseEnter={() => setHover(row.id, 'source')}
                  onMouseLeave={() => setHover(null, null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${row.title}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(row);
                    }
                  }}
                >
                  <td className="sl-td sl-td--title">{row.title}</td>
                  <td className="sl-td sl-td--author">{row.author}</td>
                  <td className="sl-td sl-td--num">{row.year}</td>
                  <td className="sl-td">{row.kind_type}</td>
                  <td className="sl-td">
                    <span className={`sl-status sl-status--${row.status.toLowerCase()}`}>
                      {statusRootLabel(row.status)}
                    </span>
                  </td>
                  <td className="sl-td sl-td--num sl-td--cite">
                    {row.citations > 0 ? (
                      <span className="sl-cite-count">{row.citations}</span>
                    ) : (
                      <span className="sl-cite-zero">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
