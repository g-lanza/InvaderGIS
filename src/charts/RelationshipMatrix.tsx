/**
 * RelationshipMatrix.tsx — Adjacency matrix view of the 428 relationship records.
 *
 * DATA
 * ────
 * Reads `loadRecords('relationship')` — the same pre-loaded in-memory array
 * used by the rest of the app. Each record carries:
 *   - participants[]  → entity_id, role (the real entity ids)
 *   - type           → relationship type key (rivalry, vassalage, …)
 *   - since / until  → temporal span
 *   - directed       → boolean
 *
 * MATRIX LAYOUT
 * ─────────────
 * Rows and columns are the unique entities that participate in at least one
 * relationship. A cell at (row, col) is colored by the relationship type when
 * a relationship exists between those two entities; empty cells are blank.
 * When multiple relationship types exist between two entities, the cell shows
 * a small stack of type chips.
 *
 * INTERACTION
 * ───────────
 * Clicking a non-empty cell calls `useSelectionStore.getState().select(relId, 'relationship')`
 * using the existing frozen selectionStore API. When multiple relationships
 * share a cell, the first one is selected (alphabetical by type).
 *
 * DESIGN CONTRACT
 * ───────────────
 * - Hairline 0.5px borders — no panel shadows.
 * - Square corners everywhere (--radius: 0).
 * - All colors from --ng-color-* CSS custom properties (set in network-graph.css).
 * - Four themes correct: tokens only, no hardcoded hex.
 * - No italics in chrome.
 * - Honest empty state when no relationships loaded.
 */

import { useMemo, useState, useCallback } from 'react';
import { loadRecords } from '@/data/loaders';
import { humanizeType } from '@/data/displayName';
import { useFilterStore } from '@/stores/filterStore';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';
import { useSelectionStore } from '@/stores/selectionStore';
import { relationshipColor } from '@/data/vocab';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTimeStore } from '@/stores/timeStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Parsed relationship extracted from a RawRecord. */
interface ParsedRelationship {
  id: string;
  entityA: string;
  entityB: string;
  type: string;
  since: number;
  until: number | null;
  directed: boolean;
}

/** A cell in the matrix — may hold zero or more relationships. */
interface MatrixCell {
  entityA: string;
  entityB: string;
  relationships: ParsedRelationship[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum entities to show in each axis before the matrix becomes unreadable. */
const MAX_ENTITIES = 60;

/** Size of each square matrix cell in px. */
const CELL_SIZE = 14;

/** Label area width (left axis). */
const LABEL_WIDTH = 140;

/** Label area height (top axis). Sized to clear the rotated column labels so they
 *  never slant into the grid cells. */
const LABEL_HEIGHT = 168;

/** Column-label rotation (degrees). Steep (near-vertical) so adjacent labels stack
 *  in their own column lane instead of fanning out across the top rows. */
const COL_LABEL_ANGLE = -72;

/** Gap (px) between a column label's end and the top of the grid. */
const COL_LABEL_GAP = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse raw relationship records into a normalized form.
 * Extracts the two participant entity_ids regardless of from_id/to_id
 * (which are often empty strings in the real data — participants[] is canonical).
 */
/**
 * @param year         - The scrubber year (single-point temporal filter).
 * @param facets       - Active FilterPanel facets (null = no facet narrowing).
 * @param regionPolitySet - Polity ids whose region passes the region facet, or
 *   null when the region facet is empty. A relationship is kept only if BOTH
 *   endpoints are in this set (region is a polity attribute — the matrix axes are
 *   polity ids — so we gate on endpoints, not the relationship record's own region).
 */
function parseRelationships(
  year: number,
  facets: FilterFacets | null,
  regionPolitySet: Set<string> | null,
): ParsedRelationship[] {
  const raw = loadRecords('relationship');
  const out: ParsedRelationship[] = [];

  for (const r of raw) {
    // P5: facet gate (yearRange/confidence/kinds) via the shared predicate, plus
    // the region-by-endpoints rule. Region is excluded from the predicate here
    // because the predicate reads the relationship's own region, not its endpoints'.
    if (facets && !passesFilter(r, { ...facets, regions: new Set<string>() })) continue;

    const participants = r.participants;
    if (!Array.isArray(participants) || participants.length < 2) continue;

    const entityA = typeof (participants[0] as Record<string, unknown>).entity_id === 'string'
      ? (participants[0] as Record<string, unknown>).entity_id as string
      : null;
    const entityB = typeof (participants[1] as Record<string, unknown>).entity_id === 'string'
      ? (participants[1] as Record<string, unknown>).entity_id as string
      : null;

    if (!entityA || !entityB) continue;

    // Region facet: keep only relationships whose BOTH endpoints pass the region.
    if (regionPolitySet && (!regionPolitySet.has(entityA) || !regionPolitySet.has(entityB))) continue;

    const since = typeof r.since === 'number' ? r.since : 0;
    const until = typeof r.until === 'number' ? r.until : null;
    const type  = typeof r.type === 'string' ? r.type : 'unknown';

    // Filter to active relationships at the current year
    const activeAtYear = since <= year && (until === null || until >= year);
    if (!activeAtYear) continue;

    out.push({
      id:       r.id,
      entityA,
      entityB,
      type,
      since,
      until,
      directed: r.directed === true,
    });
  }

  return out;
}

/**
 * Build the sorted entity list from the parsed relationships.
 * Limits to MAX_ENTITIES (by degree, descending) to keep the matrix readable.
 */
function buildEntityList(rels: ParsedRelationship[]): string[] {
  const degreeMap = new Map<string, number>();
  for (const r of rels) {
    degreeMap.set(r.entityA, (degreeMap.get(r.entityA) ?? 0) + 1);
    degreeMap.set(r.entityB, (degreeMap.get(r.entityB) ?? 0) + 1);
  }

  const sorted = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTITIES)
    .map(([id]) => id);

  return sorted;
}

/**
 * Build the full cell map: "entityA|entityB" → MatrixCell.
 * Both canonical and mirror keys are stored so lookup is O(1) for either direction.
 */
function buildCellMap(
  rels: ParsedRelationship[],
  entitySet: Set<string>,
): Map<string, MatrixCell> {
  const map = new Map<string, MatrixCell>();

  for (const rel of rels) {
    if (!entitySet.has(rel.entityA) || !entitySet.has(rel.entityB)) continue;

    const key = `${rel.entityA}|${rel.entityB}`;
    const cell = map.get(key) ?? { entityA: rel.entityA, entityB: rel.entityB, relationships: [] };
    cell.relationships.push(rel);
    map.set(key, cell);
  }

  return map;
}

/**
 * Truncate a label to fit the given character width, appending ellipsis.
 */
function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 1) + '…';
}

/**
 * Lowercase prepositions for title-case fallback (P2-5).
 * These words are kept lowercase when they appear mid-label.
 */
const LOWERCASE_PREPS = new Set(['of', 'the', 'and', 'de', 'al', 'ibn', 'abu', 'bin']);

/**
 * Convert a raw snake_case id to a proper title-case label.
 *
 * Rules (P2-5):
 *   - Replace underscores with spaces.
 *   - Capitalise the first word unconditionally.
 *   - Keep LOWERCASE_PREPS (of, the, and, de, al, …) lowercase when mid-label.
 *   - Capitalise all other word fragments.
 *
 * Used only when the real record name_primary is unavailable.
 *
 * @param id - Raw snake_case entity id.
 * @returns Human-readable title-case string.
 */
function titleCaseId(id: string): string {
  const words = id.replace(/_/g, ' ').split(' ');
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && LOWERCASE_PREPS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Build a display-name lookup map from polity and ruler records.
 *
 * Prefers `name_primary` (the canonical name on the real record).
 * Falls back to `name` if `name_primary` is absent.
 * If neither is present, the map will not contain an entry for that id and
 * the caller falls back to `titleCaseId`.
 *
 * P2-5: replaces raw ids / bad title-casing ("Kingdom Of Cordoba",
 * "umayyad_emirate_cordoba") with the real display name.
 *
 * @returns Map<entityId, displayName>.
 */
function buildNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  // Polities are the primary source — all matrix axes are polity ids.
  for (const r of loadRecords('polity')) {
    const name =
      (typeof r.name_primary === 'string' && r.name_primary.trim().length > 0)
        ? r.name_primary.trim()
        : (typeof r.name === 'string' && r.name.trim().length > 0)
          ? r.name.trim()
          : null;
    if (name !== null) map.set(r.id, name);
  }
  // Rulers are secondary — fill in any ruler ids that might appear.
  for (const r of loadRecords('ruler')) {
    if (!map.has(r.id)) {
      const name =
        (typeof r.name === 'string' && r.name.trim().length > 0)
          ? r.name.trim()
          : null;
      if (name !== null) map.set(r.id, name);
    }
  }
  return map;
}

/**
 * Resolve a display label for an entity id (P2-5).
 *
 * Resolution order:
 *   1. Real `name_primary` / `name` from polity or ruler record (nameMap).
 *   2. Proper title-case fallback via titleCaseId (no raw snake_case on screen).
 *
 * @param id      - Raw entity id (snake_case).
 * @param nameMap - Pre-built map from buildNameMap().
 * @returns Human-readable display name.
 */
function resolveEntityLabel(id: string, nameMap: Map<string, string>): string {
  return nameMap.get(id) ?? titleCaseId(id);
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for RelationshipMatrix — no required external props; it reads from stores. */
export interface RelationshipMatrixProps {
  /**
   * Width of the container in px. The matrix scroll-container uses this to
   * compute whether scrollbars are needed. Optional — defaults to auto sizing.
   */
  containerWidth?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RelationshipMatrix — adjacency matrix from the 428 real relationship records.
 *
 * Reads `selectionStore.select` to emit cell-click selection events.
 * Reads `settingsStore.theme` for color resolution.
 * Reads `timeStore.year` to filter relationships active at the current year.
 *
 * Renders as an SVG matrix (rows × cols) with:
 * - Hairline 0.5px cell borders
 * - Cells colored by relationship type via --ng-color-* CSS variables
 * - Honest empty state when no relationships are active at the current year
 */
export function RelationshipMatrix({ containerWidth: _containerWidth }: RelationshipMatrixProps) {
  const theme  = useSettingsStore((s) => s.theme);
  const year   = useTimeStore((s) => s.year);
  const select = useSelectionStore((s) => s.select);
  // Coordinated-selection READ: a relationship selected anywhere (network graph,
  // dock, register) lights up its cell here — the matrix is no longer write-only.
  // A selected polity emphasises its whole row/column.
  const selectedRelId    = useSelectionStore((s) =>
    s.selectedType === 'relationship' ? s.selectedId : null,
  );
  const selectedPolityId = useSelectionStore((s) =>
    s.selectedType === 'polity' ? s.selectedId : null,
  );

  // P5 linked-views: the FilterPanel facets narrow which relationships show.
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);
  const filterYearRange  = useFilterStore((s) => s.yearRange);

  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // ── Parse + build matrix from real data ─────────────────────────────────────
  const { entities, cellMap, relationshipCount, nameMap } = useMemo(() => {
    // Compose active facets; null when nothing narrows the relationship set.
    const kindsNarrow = filterKinds.size > 0 && !filterKinds.has('relationship');
    const anyFacet =
      filterRegions.size > 0 || filterConfidence.size > 0 || filterAttestation.size > 0 ||
      filterYearRange !== null || kindsNarrow;
    const facets: FilterFacets | null = anyFacet
      ? { kinds: filterKinds, regions: filterRegions, confidence: filterConfidence, attestation: filterAttestation, yearRange: filterYearRange }
      : null;
    // Region gate: polity ids whose region passes the region facet (else null).
    let regionPolitySet: Set<string> | null = null;
    if (filterRegions.size > 0) {
      regionPolitySet = new Set<string>();
      for (const p of loadRecords('polity')) {
        const region = (p['_quarry'] as Record<string, unknown> | undefined)?.['region'];
        if (typeof region === 'string' && filterRegions.has(region)) regionPolitySet.add(p.id);
      }
    }
    // 'relationship' kind excluded entirely → empty matrix.
    const rels     = kindsNarrow ? [] : parseRelationships(year, facets, regionPolitySet);
    const entList  = buildEntityList(rels);
    const entSet   = new Set(entList);
    const cMap     = buildCellMap(rels, entSet);
    // P2-5: build real-name lookup once per data change (not per render).
    const nMap     = buildNameMap();
    return {
      entities:          entList,
      cellMap:           cMap,
      relationshipCount: rels.length,
      nameMap:           nMap,
    };
  }, [year, filterKinds, filterRegions, filterConfidence, filterAttestation, filterYearRange]);

  // ── Cell click handler ───────────────────────────────────────────────────────
  const handleCellClick = useCallback((cell: MatrixCell) => {
    if (cell.relationships.length === 0) return;
    // Select the first relationship (sorted by type for determinism)
    const sorted = [...cell.relationships].sort((a, b) => a.type.localeCompare(b.type));
    select(sorted[0].id, 'relationship');
  }, [select]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (relationshipCount === 0) {
    return (
      <div className="msa-empty relationship-matrix__state">
        <div className="msa-empty__icon" aria-hidden="true">□</div>
        <p className="msa-empty__label">No relationships active</p>
        <p className="msa-empty__hint">
          No relationships are active at year {year}. Adjust the year slider to see the matrix.
        </p>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="msa-empty relationship-matrix__state">
        <div className="msa-empty__icon" aria-hidden="true">□</div>
        <p className="msa-empty__label">No matrix data</p>
        <p className="msa-empty__hint">Relationship records found but no participant entities resolved.</p>
      </div>
    );
  }

  const n         = entities.length;
  const svgW      = LABEL_WIDTH + n * CELL_SIZE;
  const svgH      = LABEL_HEIGHT + n * CELL_SIZE;

  return (
    <div
      className="relationship-matrix"
      aria-label={`Relationship adjacency matrix — ${n} entities, ${relationshipCount} active ties at year ${year}`}
    >
      {/* Matrix header stat strip */}
      <div className="relationship-matrix__header" aria-live="polite">
        <span className="relationship-matrix__stat">
          {n} entities
        </span>
        <span className="relationship-matrix__sep" aria-hidden="true" />
        <span className="relationship-matrix__stat">
          {relationshipCount} active ties · year {year}
        </span>
        {n >= MAX_ENTITIES && (
          <>
            <span className="relationship-matrix__sep" aria-hidden="true" />
            <span className="relationship-matrix__note">
              showing top {MAX_ENTITIES} by degree
            </span>
          </>
        )}
      </div>

      {/* How-to-read help line (matches the Graph / Emphasis tab guidance). */}
      <p className="network-help-line">
        How to read: each <strong>row and column is a polity</strong>; a colored
        cell where row × column cross means those two had a tie (color = type). The
        grid is symmetric across the diagonal. Click a cell to open that relationship;
        scrub the year to see ties appear and fade.
      </p>

      {/* Scrollable matrix container */}
      <div className="relationship-matrix__scroll" tabIndex={0} aria-label="Scroll to explore matrix">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          role="img"
          aria-label={`Adjacency matrix for ${n} polities and ${relationshipCount} relationships`}
          className="relationship-matrix__svg"
        >
          {/* ── Column labels (top axis) ── */}
          <g className="relationship-matrix__col-labels" aria-hidden="true">
            {entities.map((entityId, colIdx) => {
              const x = LABEL_WIDTH + colIdx * CELL_SIZE + CELL_SIZE / 2;
              const label = truncateLabel(resolveEntityLabel(entityId, nameMap), 16);
              // Anchor at the column center just above the grid; textAnchor="start"
              // + rotate(-72°) makes the label body extend UP-and-to-the-right,
              // entirely within the header band — never down into the cells.
              return (
                <text
                  key={entityId}
                  x={0}
                  y={0}
                  transform={`translate(${x}, ${LABEL_HEIGHT - COL_LABEL_GAP}) rotate(${COL_LABEL_ANGLE})`}
                  textAnchor="start"
                  className="relationship-matrix__axis-label"
                  fontSize={9}
                  fill="var(--ink-mute)"
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              );
            })}
          </g>

          {/* ── Row labels (left axis) ── */}
          <g className="relationship-matrix__row-labels" aria-hidden="true">
            {entities.map((entityId, rowIdx) => {
              const y = LABEL_HEIGHT + rowIdx * CELL_SIZE + CELL_SIZE / 2 + 3;
              const label = truncateLabel(resolveEntityLabel(entityId, nameMap), 18);
              return (
                <text
                  key={entityId}
                  x={LABEL_WIDTH - 4}
                  y={y}
                  textAnchor="end"
                  className="relationship-matrix__axis-label"
                  fontSize={9}
                  fill="var(--ink-mute)"
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              );
            })}
          </g>

          {/* ── Matrix cells ── */}
          <g className="relationship-matrix__cells">
            {entities.map((rowEntity, rowIdx) => (
              <g key={rowEntity} className="relationship-matrix__row">
                {entities.map((colEntity, colIdx) => {
                  if (rowEntity === colEntity) {
                    // Diagonal — self-relationship: render a muted fill
                    return (
                      <rect
                        key={colEntity}
                        x={LABEL_WIDTH + colIdx * CELL_SIZE}
                        y={LABEL_HEIGHT + rowIdx * CELL_SIZE}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        fill="var(--border)"
                        stroke="var(--border)"
                        strokeWidth={0.5}
                        aria-hidden="true"
                      />
                    );
                  }

                  // Look up cell in canonical direction, then mirror
                  const key     = `${rowEntity}|${colEntity}`;
                  const mirrorKey = `${colEntity}|${rowEntity}`;
                  const cell    = cellMap.get(key) ?? cellMap.get(mirrorKey) ?? null;
                  const hasRels = cell !== null && cell.relationships.length > 0;
                  const cellKey = `${rowIdx}-${colIdx}`;
                  const isHovered = hoveredCell === cellKey;
                  // Coordinated selection: cell is selected if it holds the selected
                  // relationship; row/col is emphasised for a selected polity.
                  const isSelectedCell = hasRels && cell != null && selectedRelId !== null &&
                    cell.relationships.some((r) => r.id === selectedRelId);
                  const inSelectedLine = selectedPolityId !== null &&
                    (rowEntity === selectedPolityId || colEntity === selectedPolityId);

                  // Determine fill color: first relationship type's color
                  let fillColor = 'transparent';
                  let title = '';
                  if (hasRels && cell) {
                    const primaryType = cell.relationships[0].type;
                    fillColor = relationshipColor(primaryType, theme) ?? 'var(--ink-mute)';
                    const typeList = [...new Set(cell.relationships.map((r) => humanizeType(r.type)))].join(', ');
                    const rowLabel = resolveEntityLabel(rowEntity, nameMap);
                    const colLabel = resolveEntityLabel(colEntity, nameMap);
                    title = `${rowLabel} ↔ ${colLabel}: ${typeList}`;
                  }

                  return (
                    <g key={colEntity}>
                      <rect
                        x={LABEL_WIDTH + colIdx * CELL_SIZE}
                        y={LABEL_HEIGHT + rowIdx * CELL_SIZE}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        fill={hasRels ? fillColor : (inSelectedLine ? 'var(--accent-weak, var(--surface-2))' : 'transparent')}
                        stroke={isSelectedCell ? 'var(--accent)' : 'var(--border)'}
                        strokeWidth={isSelectedCell ? 2 : 0.5}
                        opacity={isHovered ? 0.75 : (inSelectedLine && !hasRels ? 0.6 : 1)}
                        style={{ cursor: hasRels ? 'pointer' : 'default' }}
                        role={hasRels ? 'button' : undefined}
                        aria-label={hasRels ? title : undefined}
                        onMouseEnter={() => hasRels && setHoveredCell(cellKey)}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => hasRels && cell && handleCellClick(cell)}
                        onKeyDown={(e) => {
                          if (hasRels && cell && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleCellClick(cell);
                          }
                        }}
                        tabIndex={hasRels ? 0 : undefined}
                      />
                      {/* Multiple types indicator: small inset dot in the top-right */}
                      {hasRels && cell && cell.relationships.length > 1 && (
                        <rect
                          x={LABEL_WIDTH + colIdx * CELL_SIZE + CELL_SIZE - 4}
                          y={LABEL_HEIGHT + rowIdx * CELL_SIZE + 1}
                          width={3}
                          height={3}
                          fill="var(--surface)"
                          aria-hidden="true"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoveredCell !== null && (() => {
        const [rowIdxStr, colIdxStr] = hoveredCell.split('-');
        const rowIdx = parseInt(rowIdxStr, 10);
        const colIdx = parseInt(colIdxStr, 10);
        const rowEntity = entities[rowIdx];
        const colEntity = entities[colIdx];
        if (!rowEntity || !colEntity) return null;

        const key      = `${rowEntity}|${colEntity}`;
        const mirrorKey = `${colEntity}|${rowEntity}`;
        const cell     = cellMap.get(key) ?? cellMap.get(mirrorKey) ?? null;
        if (!cell || cell.relationships.length === 0) return null;

        return (
          <MatrixCellTooltip
            rowLabel={resolveEntityLabel(rowEntity, nameMap)}
            colLabel={resolveEntityLabel(colEntity, nameMap)}
            relationships={cell.relationships}
            theme={theme}
          />
        );
      })()}
    </div>
  );
}

// ── Tooltip sub-component ─────────────────────────────────────────────────────

interface MatrixCellTooltipProps {
  rowLabel:      string;
  colLabel:      string;
  relationships: ParsedRelationship[];
  theme:         string;
}

/**
 * Tooltip shown on matrix cell hover.
 * Lists entity pair and all relationship types active between them.
 */
function MatrixCellTooltip({ rowLabel, colLabel, relationships, theme }: MatrixCellTooltipProps) {
  return (
    <div
      className="relationship-matrix__tooltip"
      role="tooltip"
      aria-label={`${rowLabel} and ${colLabel} relationship details`}
    >
      <div className="relationship-matrix__tooltip-head">
        <span className="relationship-matrix__tooltip-pair">
          {truncateLabel(rowLabel, 20)} ↔ {truncateLabel(colLabel, 20)}
        </span>
      </div>
      <ul className="relationship-matrix__tooltip-rels">
        {relationships.map((rel) => {
          const color = relationshipColor(rel.type, theme) ?? 'var(--ink-mute)';
          return (
            <li
              key={rel.id}
              className="relationship-matrix__tooltip-rel"
              style={{ borderLeftColor: color }}
            >
              <span className="relationship-matrix__tooltip-type">{humanizeType(rel.type)}</span>
              <span className="relationship-matrix__tooltip-span">
                {rel.since}–{rel.until ?? 'ongoing'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="relationship-matrix__tooltip-hint">Click to open in Entity Dock</p>
    </div>
  );
}
