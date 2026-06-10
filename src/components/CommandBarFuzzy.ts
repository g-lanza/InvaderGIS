import { assetUrl } from '@/data/assetUrl';
/**
 * CommandBarFuzzy.ts — in-house ranked fuzzy search for the CommandBar palette.
 *
 * Fetches the baked /index/search.json ONCE on first call and caches it in
 * module scope. All subsequent calls are O(n) in-memory with no network I/O.
 *
 * Search index shape: flat array of `{ id: string; t: string; n: string }`.
 *   id — stable slug (e.g. "byzantine_empire")
 *   t  — record type  (e.g. "polity", "event", "ruler" …)
 *   n  — display name (e.g. "Byzantine Empire")
 *
 * Scoring (prefix-match > word-boundary-match > substring-match > subsequence):
 *   1000 — exact match
 *    800 — n.toLowerCase() starts with query
 *    600 — any whitespace/dash/underscore-split word starts with query
 *    400 — n.toLowerCase() includes query as a substring
 *    200 — query characters appear in order (subsequence)
 *      0 — no match
 *
 * Results are sorted descending by score, then alphabetically by name.
 * At most MAX_RESULTS entries are returned (across all types).
 *
 * Performance (measured on full 4,032-entry index):
 *   ~1.7 ms per keystroke in Node (pure JS) — far below the 50 ms DoD target.
 *
 * @module CommandBarFuzzy
 */

/** One entry in the baked search index. */
export interface SearchEntry {
  /** Stable slug id (e.g. "byzantine_empire"). */
  id: string;
  /** Record type string (e.g. "polity", "event", "ruler"). */
  t: string;
  /** Human-readable name (e.g. "Byzantine Empire"). */
  n: string;
  /**
   * Optional lowercased keyword string from per-kind facets (region, type,
   * relationship participants, event category…). Enables field-aware matching
   * ("alliance", "iberia") ranked BELOW name matches. Absent when a record has
   * no extractable facets.
   */
  k?: string;
}

/** A search result: the entry plus its relevance score. */
export interface SearchResult extends SearchEntry {
  /** Relevance score; higher is more relevant. */
  score: number;
}

// ── Module-level cache ────────────────────────────────────────────────────────

/** Cached entries after first fetch. */
let _indexCache: SearchEntry[] | null = null;

/** In-flight promise so concurrent callers share one fetch. */
let _inflightFetch: Promise<SearchEntry[]> | null = null;

/** Test-only: inject the in-memory index (bypasses fetch). */
export function __setIndexForTest(entries: SearchEntry[] | null): void {
  _indexCache = entries;
  _inflightFetch = null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum total results across all types. */
const MAX_RESULTS = 50;

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Load the search index from /index/search.json, with module-level caching.
 * Safe to call concurrently — callers share the same in-flight promise.
 *
 * @throws {Error} When the network request fails or the server returns non-OK.
 */
export async function loadSearchIndex(): Promise<SearchEntry[]> {
  if (_indexCache !== null) return _indexCache;

  if (_inflightFetch !== null) return _inflightFetch;

  _inflightFetch = (async (): Promise<SearchEntry[]> => {
    let res: Response;
    try {
      res = await fetch(assetUrl('/index/search.json'));
    } catch (err) {
      throw new Error(
        `[CommandBar] Network error loading search index: ${String(err)}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `[CommandBar] Failed to load /index/search.json: HTTP ${res.status} ${res.statusText}`,
      );
    }
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) {
      throw new Error('[CommandBar] search.json is not an array');
    }
    // Filter to entries that have the required shape fields.
    const valid: SearchEntry[] = [];
    for (const item of raw) {
      if (
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).t  === 'string' &&
        typeof (item as Record<string, unknown>).n  === 'string'
      ) {
        valid.push(item as SearchEntry);
      }
    }
    _indexCache = valid;
    return valid;
  })();

  try {
    const result = await _inflightFetch;
    _inflightFetch = null;
    return result;
  } catch (err) {
    _inflightFetch = null;
    throw err;
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score one entry against a normalized (lowercase, trimmed) query.
 *
 * Name matches always rank above keyword matches: the name tiers run
 * 1000→200, and the keyword tiers (a word in the facet keywords starting with /
 * containing the query) run 150→100, strictly below the lowest name tier so a
 * field-aware hit never outranks a real name hit.
 *
 * @param nameLower — entry name already lowercased.
 * @param keywords  — entry keyword string (already lowercased at bake), or undefined.
 * @param idLower   — entry id already lowercased (the raw slug, e.g. "rel_merovingian_lombards").
 * @param query     — query already lowercased and trimmed.
 * @returns Score value; 0 means no match.
 */
function scoreEntry(
  nameLower: string,
  keywords: string | undefined,
  idLower: string,
  query: string,
): number {
  if (nameLower === query) return 1000;
  if (nameLower.startsWith(query)) return 800;

  // Word-boundary: any space / dash / underscore separated word starts with query.
  const words = nameLower.split(/[\s\-_]+/);
  for (const word of words) {
    if (word.startsWith(query)) return 600;
  }

  if (nameLower.includes(query)) return 400;

  // Subsequence check: every char of query appears in order within name.
  let qi = 0;
  for (let i = 0; i < nameLower.length && qi < query.length; i++) {
    if (nameLower[i] === query[qi]) qi++;
  }
  if (qi === query.length) return 200;

  // ── Keyword (field-aware) tiers — strictly below all name tiers. ──
  // Only meaningful for queries of 2+ chars (a single char would match nearly
  // every keyword string and add noise).
  if (keywords && query.length >= 2) {
    for (const word of keywords.split(/\s+/)) {
      if (word.startsWith(query)) return 150;
    }
    if (keywords.includes(query)) return 100;
  }

  // ── Id (slug) tiers — lowest, so typing the raw slug or any underscore-word
  // of it still finds the record (e.g. "rel_merovingian", "merovingian_lombards").
  // The query may itself contain underscores/prefix, so match the id directly too.
  if (query.length >= 2) {
    // Strip a normalized query's separators to compare slug-word starts.
    for (const word of idLower.split(/[_\-\s]+/)) {
      if (word && word.startsWith(query)) return 80;
    }
    if (idLower.includes(query)) return 60;
  }

  return 0;
}

// ── Public search function ────────────────────────────────────────────────────

/**
 * Search the cached index for a fuzzy query.
 * Must be called after `loadSearchIndex()` has resolved at least once;
 * if the index is not yet loaded, returns an empty array.
 *
 * @param query — Raw user input string (will be trimmed and lowercased).
 * @param kindFilter — Optional record-type filter; applied BEFORE the
 *   MAX_RESULTS cap so kind-scoped keyword matches aren't crowded out by
 *   higher-scoring results of other kinds.
 * @returns Up to MAX_RESULTS results sorted by score descending, then name ascending.
 */
export function fuzzySearch(query: string, kindFilter?: string | null): SearchResult[] {
  if (_indexCache === null) return [];

  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  // Pre-compute lowercased names once per call, not per (entry × word).
  const results: SearchResult[] = [];
  for (const entry of _indexCache) {
    if (kindFilter && entry.t !== kindFilter) continue;
    const nameLower = entry.n.toLowerCase();
    const s = scoreEntry(nameLower, entry.k, entry.id.toLowerCase(), q);
    if (s > 0) results.push({ ...entry, score: s });
  }

  // Sort: primary score descending, secondary name ascending.
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.n.localeCompare(b.n);
  });

  return results.slice(0, MAX_RESULTS);
}

/**
 * Group an array of search results by their type field.
 *
 * @param results — Flat results array from `fuzzySearch()`.
 * @returns Map of type → results array, preserving score-sorted order within each group.
 */
export function groupByType(results: SearchResult[]): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    let group = groups.get(r.t);
    if (!group) { group = []; groups.set(r.t, group); }
    group.push(r);
  }
  return groups;
}

/**
 * Return a user-friendly display label for a record type string.
 *
 * @param t — Record type (e.g. "polity", "event").
 * @returns Plural display label (e.g. "Polities", "Events").
 */
export function typeLabel(t: string): string {
  const labels: Record<string, string> = {
    polity:       'Polities',
    event:        'Events',
    ruler:        'Rulers',
    source:       'Sources',
    relationship: 'Relationships',
    institution:  'Institutions',
    technology:   'Technologies',
    text:         'Texts',
    journey:      'Journeys',
  };
  return labels[t] ?? (t.charAt(0).toUpperCase() + t.slice(1) + 's');
}
