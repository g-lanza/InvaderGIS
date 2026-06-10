/**
 * eventFilterStore — additive store for per-event-layer filtering.
 *
 * Owns two facets that are specific to the Events layer and have no overlap
 * with the global filterStore (which handles cross-layer kinds/regions/year/
 * confidence). Kept separate so the frozen filterStore interface is not touched
 * and so callers that only care about event filtering do not pull in the
 * broader facet machinery.
 *
 * Facets:
 *   eventCategory — string | null. When non-null, only events whose
 *                   `category` property matches this value are shown on the
 *                   map. null = "all categories" (no restriction).
 *   eventSearch   — string. Free-text query matched against the event `name`
 *                   property (case-insensitive substring). Empty string = no
 *                   restriction. Applied client-side in the LayerRail legend
 *                   for UI feedback; the map applies a MapLibre `in` filter
 *                   expression when a category is active (search narrows the
 *                   visible category rows in the legend only — a full name
 *                   filter on 2,914 features via MapLibre `match` is deferred).
 *
 * Both facets default to "no restriction".
 *
 * Not a frozen store — additive only.
 */
import { create } from 'zustand';

/**
 * How the events layer maps the scrubber year onto event visibility.
 *   'exact' — show only events whose `year` equals the scrubber year (the field
 *             turns over completely on every scrub step — the original model).
 *   'span'  — show events within ±`eventYearSpan` years of the scrubber year
 *             (a sliding window, e.g. a 50-year span = ±25). Lets a user read a
 *             generation of events at once instead of a single year.
 */
export type EventTimeMode = 'exact' | 'span';

/** Default half-width (years) of the span window. ±5 = an 11-year window so an
 *  event reads for a few years around the scrubber rather than only its exact year. */
export const DEFAULT_EVENT_YEAR_SPAN = 5;

/** Clamp bounds for the span half-width stepper. */
export const EVENT_YEAR_SPAN_MIN = 5;
export const EVENT_YEAR_SPAN_MAX = 200;
export const EVENT_YEAR_SPAN_STEP = 5;

export interface EventFilterState {
  /**
   * Whether the events layer matches the scrubber year exactly or over a span.
   * Default 'exact' (preserves the original point-in-time behavior).
   */
  eventTimeMode: EventTimeMode;

  /**
   * Half-width (in years) of the span window used when eventTimeMode === 'span'.
   * The window is [year - span, year + span]. Default DEFAULT_EVENT_YEAR_SPAN.
   */
  eventYearSpan: number;

  /**
   * The solo'd event category id, or null when all categories are shown.
   * Matches the `category` property on EventFeature (e.g. 'war', 'religion').
   */
  eventCategory: string | null;

  /**
   * Free-text search string for filtering the event category legend rows
   * (case-insensitive substring match against category label or id).
   * Empty string = no filter.
   */
  eventSearch: string;

  /** Set the solo'd category. Pass null to reset to "all". */
  setEventCategory: (category: string | null) => void;

  /**
   * Toggle solo: if the given category is already the solo'd one, reset to
   * null (all). Otherwise solo this category. This is the primary click
   * handler for the legend category rows.
   */
  toggleEventCategory: (category: string) => void;

  /** Update the event search string. */
  setEventSearch: (query: string) => void;

  /** Switch between exact-year and span time matching. */
  setEventTimeMode: (mode: EventTimeMode) => void;

  /**
   * Set the span half-width in years, clamped to [EVENT_YEAR_SPAN_MIN,
   * EVENT_YEAR_SPAN_MAX]. Non-finite input is ignored.
   */
  setEventYearSpan: (span: number) => void;

  /** Clear both facets (search + category). Does NOT reset the time mode/span,
   *  which are viewing preferences rather than filter restrictions. */
  clearEventFilters: () => void;
}

export const useEventFilterStore = create<EventFilterState>((set, get) => ({
  eventCategory: null,
  eventSearch:   '',
  // Default to a ±5yr span (not exact) so events read for a few years around the
  // scrubber rather than flickering on only their precise year.
  eventTimeMode: 'span',
  eventYearSpan: DEFAULT_EVENT_YEAR_SPAN,

  setEventCategory: (category) => set({ eventCategory: category }),

  toggleEventCategory: (category) => {
    const current = get().eventCategory;
    set({ eventCategory: current === category ? null : category });
  },

  setEventSearch: (query) => set({ eventSearch: query }),

  setEventTimeMode: (mode) => set({ eventTimeMode: mode }),

  setEventYearSpan: (span) => {
    if (!Number.isFinite(span)) return;
    const clamped = Math.max(EVENT_YEAR_SPAN_MIN, Math.min(EVENT_YEAR_SPAN_MAX, Math.round(span)));
    set({ eventYearSpan: clamped });
  },

  clearEventFilters: () => set({ eventCategory: null, eventSearch: '' }),
}));
