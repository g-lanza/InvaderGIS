/**
 * filterStore — ADDITIVE faceted-filter store (Wave 1B).
 *
 * Holds the active facets for the FilterPanel: year range, record kinds,
 * region, and confidence level. Intentionally additive — no frozen store
 * is touched. The FilterPanel reads + writes this store; derived components
 * can read it to cross-filter any surface.
 *
 * Facets:
 *   yearRange   — [lo, hi] pair or null (no range filter)
 *   kinds       — set of record kind strings (empty = all)
 *   regions     — set of region strings (empty = all)
 *   confidence  — set of confidence strings (empty = all)
 *   attestation — set of attestation strings (empty = all); evidence strength
 *                 (strong/weak/inferred). Records with NO attestation always pass
 *                 even when this facet is active — see filterPredicate (honest:
 *                 attestation is sparsely populated, absent ≠ excluded).
 *
 * All facets default to "show everything" (null / empty sets).
 */
import { create } from 'zustand';

/** Active facet state. Null/empty-set means "no restriction". */
export interface FilterState {
  /** Year range filter [lo, hi] or null when not active. */
  yearRange: [number, number] | null;
  /** Selected record kinds (empty = all kinds shown). */
  kinds: ReadonlySet<string>;
  /** Selected region keys (empty = all regions). */
  regions: ReadonlySet<string>;
  /** Selected confidence levels (empty = all levels). */
  confidence: ReadonlySet<string>;
  /** Selected attestation levels (empty = all). Records lacking attestation pass. */
  attestation: ReadonlySet<string>;

  /** Set or clear the year range filter. */
  setYearRange: (range: [number, number] | null) => void;
  /** Toggle a record kind in/out of the kinds facet. */
  toggleKind: (kind: string) => void;
  /** Toggle a region key in/out of the regions facet. */
  toggleRegion: (region: string) => void;
  /** Toggle a confidence level in/out of the confidence facet. */
  toggleConfidence: (level: string) => void;
  /** Toggle an attestation level in/out of the attestation facet. */
  toggleAttestation: (level: string) => void;
  /** Reset all facets to "show everything". */
  clearAll: () => void;
}

/** Total number of active facets — convenience for badge count. */
export function countActiveFilters(s: FilterState): number {
  return (
    (s.yearRange !== null ? 1 : 0) +
    (s.kinds.size > 0 ? 1 : 0) +
    (s.regions.size > 0 ? 1 : 0) +
    (s.confidence.size > 0 ? 1 : 0) +
    (s.attestation.size > 0 ? 1 : 0)
  );
}

/**
 * useFilterStore — Zustand store for faceted filter state.
 *
 * Default: all facets inactive (no restrictions). FilterPanel writes here;
 * any surface can read to cross-filter its list. Not a frozen store.
 */
export const useFilterStore = create<FilterState>((set) => ({
  yearRange:   null,
  kinds:       new Set<string>(),
  regions:     new Set<string>(),
  confidence:  new Set<string>(),
  attestation: new Set<string>(),

  setYearRange: (range) => set({ yearRange: range }),

  toggleKind: (kind) =>
    set((s) => {
      const next = new Set(s.kinds);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return { kinds: next };
    }),

  toggleRegion: (region) =>
    set((s) => {
      const next = new Set(s.regions);
      if (next.has(region)) next.delete(region); else next.add(region);
      return { regions: next };
    }),

  toggleConfidence: (level) =>
    set((s) => {
      const next = new Set(s.confidence);
      if (next.has(level)) next.delete(level); else next.add(level);
      return { confidence: next };
    }),

  toggleAttestation: (level) =>
    set((s) => {
      const next = new Set(s.attestation);
      if (next.has(level)) next.delete(level); else next.add(level);
      return { attestation: next };
    }),

  clearAll: () => set({
    yearRange:   null,
    kinds:       new Set<string>(),
    regions:     new Set<string>(),
    confidence:  new Set<string>(),
    attestation: new Set<string>(),
  }),
}));
