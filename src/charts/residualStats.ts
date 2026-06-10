/**
 * residualMatrix — the "compared to what?" engine (audit finding #2).
 *
 * Builds a category × century contingency table from event records and computes,
 * per cell, the deviation from statistical independence — the core method of
 * Friendly, *Visualizing Categorical Data* (mosaic / association plots):
 *
 *   expected_ij = (rowTotal_i × colTotal_j) / grandTotal
 *   residual_ij = (observed_ij − expected_ij) / √expected_ij     (Pearson residual)
 *
 * A positive residual = this (category, century) cell occurs MORE than independence
 * predicts (shade blue); negative = LESS (shade red). |residual| > 2 ≈ individually
 * significant at .05, > 4 at .0001 — the VCD shading cutoffs. The sum of squared
 * residuals IS the Pearson χ² for the table.
 *
 * This answers a question no raw-count chart can: not "how many violent events were
 * there in the 11th century?" but "were violent events OVER- or UNDER-represented in
 * the 11th century relative to the baseline rate across the whole window?"
 *
 * Pure module — no React, no DOM. Effect-orders rows by their dominant century
 * (DDAR §1.4.3: order by the data so the pattern reads, not alphabetically).
 */
import { loadRecords } from '@/data/loaders';
import { EVENT_CATEGORIES, SUBTYPE_TO_CATEGORY } from '@/design/tokens';
import type { EventCategory } from '@/design/tokens';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';

/** The dataset window (matches loaders.ts / vocab). */
const WINDOW_START = 500;
const WINDOW_END = 1500;

/** One column of the matrix — a century bucket. */
export interface CenturyBucket {
  /** Start year of the century, e.g. 1000 for the 11th century (1000–1099). */
  start: number;
  /** Short axis label, e.g. "11th" or the century start year. */
  label: string;
}

/** One cell of the residual matrix. */
export interface ResidualCell {
  category: EventCategory;
  centuryStart: number;
  /** Observed count of events in this (category, century). */
  observed: number;
  /** Expected count under independence. */
  expected: number;
  /** Pearson residual: (observed − expected) / √expected. 0 when expected is 0. */
  residual: number;
}

/** The full computed matrix plus its margins and fit statistic. */
export interface ResidualMatrixData {
  /** Row order (effect-ordered categories that actually occur). */
  categories: EventCategory[];
  /** Column order (century buckets spanning the data's range). */
  centuries: CenturyBucket[];
  /** Cells keyed `${category}|${centuryStart}` for O(1) lookup by the renderer. */
  cells: Map<string, ResidualCell>;
  /** Grand total of events in the table. */
  total: number;
  /** Pearson χ² = Σ residual². A scalar summary of overall departure from independence. */
  chiSquare: number;
}

/** Century start for a year, e.g. 1066 → 1000. */
function centuryStartOf(year: number): number {
  return Math.floor(year / 100) * 100;
}

/** Resolve an event's category: prefer the explicit `category` field, else map `type`. */
function eventCategory(ev: Record<string, unknown>): EventCategory | null {
  const cat = ev['category'];
  if (typeof cat === 'string' && CATEGORY_IDS.has(cat)) return cat as EventCategory;
  const type = typeof ev['type'] === 'string' ? ev['type'] : '';
  return (SUBTYPE_TO_CATEGORY[type] ?? null) as EventCategory | null;
}

const CATEGORY_IDS = new Set<string>(EVENT_CATEGORIES.map((c) => c.id));

/**
 * Build the category × century residual matrix from the event corpus, honoring the
 * shared filter facets (Pass 1 linked views — confidence / region / kind / year all
 * narrow the events counted). Returns effect-ordered rows and the χ² summary.
 */
export function buildResidualMatrix(facets: FilterFacets): ResidualMatrixData {
  const events = loadRecords('event');

  // 1. Tally the contingency table: counts[category][centuryStart].
  const counts = new Map<EventCategory, Map<number, number>>();
  const colTotals = new Map<number, number>();
  const rowTotals = new Map<EventCategory, number>();
  let total = 0;

  for (const ev of events) {
    if (!passesFilter(ev, facets)) continue;
    const year = typeof ev['year'] === 'number' ? ev['year'] : null;
    if (year === null || year < WINDOW_START || year > WINDOW_END) continue;
    const category = eventCategory(ev);
    if (category === null) continue;
    const c = centuryStartOf(year);

    let row = counts.get(category);
    if (!row) { row = new Map(); counts.set(category, row); }
    row.set(c, (row.get(c) ?? 0) + 1);
    colTotals.set(c, (colTotals.get(c) ?? 0) + 1);
    rowTotals.set(category, (rowTotals.get(category) ?? 0) + 1);
    total++;
  }

  // 2. Column axis: every century in the data's range, ascending (a real ordered
  //    scale — never reordered; time is the one axis that must stay chronological).
  const centuryStarts = [...colTotals.keys()].sort((a, b) => a - b);
  const centuries: CenturyBucket[] = centuryStarts.map((start) => ({
    start,
    label: ordinalCentury(start),
  }));

  // 3. Compute residuals per occupied cell; accumulate χ².
  const cells = new Map<string, ResidualCell>();
  let chiSquare = 0;
  for (const [category, row] of counts) {
    const rowTotal = rowTotals.get(category) ?? 0;
    for (const start of centuryStarts) {
      const observed = row.get(start) ?? 0;
      const colTotal = colTotals.get(start) ?? 0;
      const expected = total > 0 ? (rowTotal * colTotal) / total : 0;
      const residual = expected > 0 ? (observed - expected) / Math.sqrt(expected) : 0;
      chiSquare += residual * residual;
      cells.set(`${category}|${start}`, { category, centuryStart: start, observed, expected, residual });
    }
  }

  // 4. Effect-order rows: by the century where each category peaks (DDAR §1.4.3).
  //    Categories trending early sort above those trending late, so the matrix reads
  //    as a diagonal "when was each kind of event happening?" — pattern, not lookup.
  const categories = [...counts.keys()].sort((a, b) => {
    const peakA = peakCentury(counts.get(a)!);
    const peakB = peakCentury(counts.get(b)!);
    if (peakA !== peakB) return peakA - peakB;
    return (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0); // tie → larger row first
  });

  return { categories, centuries, cells, total, chiSquare };
}

/** The century (start year) with the most events for a row. */
function peakCentury(row: Map<number, number>): number {
  let best = Infinity;
  let bestCount = -1;
  for (const [start, count] of row) {
    if (count > bestCount) { bestCount = count; best = start; }
  }
  return best;
}

/** "1000" → "11th", "500" → "6th". Human-readable century axis label. */
export function ordinalCentury(start: number): string {
  const n = start / 100 + 1; // 1000 → 11
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st'
    : n % 10 === 2 ? 'nd'
    : n % 10 === 3 ? 'rd'
    : 'th';
  return `${n}${suffix}`;
}
