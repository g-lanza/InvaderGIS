/**
 * filterPredicate — single source of truth for the faceted filter (Pass 1, linked views).
 *
 * The FilterPanel writes facets into `filterStore`; this module turns those facets
 * into the TWO forms every consumer needs, generated from the same logic so they
 * never drift:
 *
 *   · passesFilter(record, facets)            — JS predicate for registers + charts.
 *   · buildFilterMapExpression(facets, kind)  — MapLibre filter clause for map layers
 *                                               (GL can't run JS per feature).
 *
 * Temporal logic MIRRORS `buildYearIndex()` in loaders.ts exactly — do not invent new
 * rules here. Per kind:
 *   polity       — formed..dissolved (open end → window end)
 *   event        — instantaneous `year`
 *   journey      — year_start..year_end (open end → instant at year_start)
 *   relationship — active_periods[] spans, else since..until (open until → window end)
 *   ruler        — reign_start..reign_end (open end → instant at reign_start)
 *   settlement / military / capital — start_year..end_year (open end → window end)
 *   source / institution / technology / text — non-temporal → unaffected by yearRange
 *
 * Region is read from `_quarry.region`; confidence from `provenance.confidence`
 * (default `'unknown'`) — matching the existing FilterPanel polity logic, generalized.
 *
 * Attestation is read from `provenance.attestation` (strong/weak/inferred). Unlike
 * confidence, a MISSING attestation does NOT default to a value that can be excluded:
 * records lacking attestation always PASS the attestation facet, because attestation
 * is only populated on some kinds and an absent value must not silently hide records.
 */
import type { RawRecord } from './loaders';

/** End of the dataset window — matches loaders.ts INDEX_END. */
const WINDOW_END = 1500;

/**
 * A plain readonly snapshot of the four facets, decoupled from the store so callers
 * can pass `useFilterStore.getState()` or a `useFilterStore(selector)` result.
 */
export interface FilterFacets {
  /** Year range [lo, hi] or null when no range filter is active. */
  yearRange: [number, number] | null;
  /** Selected record kinds (empty = all kinds pass). */
  kinds: ReadonlySet<string>;
  /** Selected region keys (empty = all regions pass). */
  regions: ReadonlySet<string>;
  /** Selected confidence levels (empty = all levels pass). */
  confidence: ReadonlySet<string>;
  /**
   * Selected attestation levels (empty = all pass). Records that have NO
   * attestation always pass, even when this set is non-empty (absent ≠ excluded).
   */
  attestation: ReadonlySet<string>;
}

/** Read a numeric field or null. */
function num(record: RawRecord, key: string): number | null {
  const v = record[key];
  return typeof v === 'number' ? v : null;
}

/**
 * Does `record` overlap the [lo, hi] year range, using the same temporal model as
 * `buildYearIndex()`? Non-temporal kinds (source/institution/technology/text) always
 * pass — a year range never excludes them, exactly as the year index never indexes them.
 */
function overlapsYearRange(record: RawRecord, lo: number, hi: number): boolean {
  switch (record.kind) {
    case 'polity': {
      const formed = num(record, 'formed');
      if (formed === null) return false;
      const end = num(record, 'dissolved') ?? WINDOW_END;
      return formed <= hi && end >= lo;
    }
    case 'event': {
      const year = num(record, 'year');
      return year !== null && year >= lo && year <= hi;
    }
    case 'journey': {
      const ys = num(record, 'year_start');
      if (ys === null) return false;
      const ye = num(record, 'year_end') ?? ys;
      return ys <= hi && ye >= lo;
    }
    case 'ruler': {
      const rs = num(record, 'reign_start');
      if (rs === null) return false;
      const re = num(record, 'reign_end') ?? rs;
      return rs <= hi && re >= lo;
    }
    case 'relationship': {
      const periods = record.active_periods;
      if (Array.isArray(periods) && periods.length > 0) {
        for (const span of periods as unknown[]) {
          if (Array.isArray(span) && span.length === 2) {
            const [s, e] = span as [number, number];
            if (typeof s === 'number' && typeof e === 'number' && s <= hi && e >= lo) {
              return true;
            }
          }
        }
        return false;
      }
      const since = num(record, 'since');
      if (since === null) return false;
      const until = record.until === null ? WINDOW_END : num(record, 'until') ?? WINDOW_END;
      return since <= hi && until >= lo;
    }
    case 'settlement':
    case 'military':
    case 'capital': {
      const s = num(record, 'start_year');
      if (s === null) return false;
      const e = num(record, 'end_year') ?? WINDOW_END;
      return s <= hi && e >= lo;
    }
    default:
      return true; // source / institution / technology / text — non-temporal
  }
}

/**
 * JS predicate: does `record` pass ALL active facets? Empty/null facets impose no
 * restriction. Used by registers and charts (AND-composed with their local text search).
 */
export function passesFilter(record: RawRecord, facets: FilterFacets): boolean {
  if (facets.kinds.size > 0 && !facets.kinds.has(record.kind)) return false;

  if (facets.yearRange !== null) {
    if (!overlapsYearRange(record, facets.yearRange[0], facets.yearRange[1])) return false;
  }

  if (facets.regions.size > 0) {
    const region = typeof record._quarry?.region === 'string' ? record._quarry.region : '';
    if (!facets.regions.has(region)) return false;
  }

  if (facets.confidence.size > 0) {
    const prov = record.provenance as Record<string, unknown> | undefined;
    const conf = typeof prov?.confidence === 'string' ? prov.confidence : 'unknown';
    if (!facets.confidence.has(conf)) return false;
  }

  if (facets.attestation.size > 0) {
    const prov = record.provenance as Record<string, unknown> | undefined;
    const att = typeof prov?.attestation === 'string' ? prov.attestation : '';
    // Absent attestation always passes — only records that HAVE one are filtered.
    if (att !== '' && !facets.attestation.has(att)) return false;
  }

  return true;
}

/** MapLibre expression fragment (untyped array, per MapLibre GL convention). */
type MapExpr = unknown[];

/**
 * Build a MapLibre `['all', …]` clause for the facets that map to feature properties
 * on this layer, or `null` when nothing restricts the layer (caller can skip composing).
 *
 * `kinds` is intentionally NOT expressed here — a layer IS one kind, so the kinds facet
 * is enforced by toggling layer visibility (see MapCanvas), which is cheaper and correct.
 *
 * `regions` → matches the feature `region` property (present on polity features; the
 * same property `regionExpression.ts` reads via `['get','region']`). Other layers that
 * don't carry `region` simply won't be region-filtered — region is a polity-level facet.
 *
 * `confidence` → matches the feature `confidence` property only when the layer carries
 * it; pass `hasConfidence: false` for layers whose baked features omit it.
 *
 * `yearRange` → emitted only when the layer carries the property that holds its temporal
 * anchor (provided by the caller as `yearField`, e.g. `'year'` for events). Span-based
 * layers keep their own time filter; this adds a coarse lower/upper bound on the anchor.
 */
export function buildFilterMapExpression(
  facets: FilterFacets,
  opts: { layerKind: string; hasConfidence?: boolean; yearField?: string },
): MapExpr | null {
  const clauses: MapExpr[] = [];

  if (facets.regions.size > 0 && opts.layerKind === 'polity') {
    clauses.push(['in', ['get', 'region'], ['literal', [...facets.regions]]]);
  }

  if (facets.confidence.size > 0 && opts.hasConfidence) {
    clauses.push([
      'in',
      ['coalesce', ['get', 'confidence'], 'unknown'],
      ['literal', [...facets.confidence]],
    ]);
  }

  if (facets.yearRange !== null && opts.yearField) {
    const [lo, hi] = facets.yearRange;
    clauses.push(['>=', ['get', opts.yearField], lo]);
    clauses.push(['<=', ['get', opts.yearField], hi]);
  }

  if (clauses.length === 0) return null;
  return ['all', ...clauses];
}
