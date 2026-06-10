/**
 * vocab.ts — VocabBundle type definitions for the Historical Data Visualizer.
 *
 * A VocabBundle is the per-dataset vocabulary manifest: every lookup table that
 * drives category resolution, color coding, glyph selection, region tinting, and
 * relationship styling. For dataset #1 (medieval-europe-500-1500) the bundle is
 * loaded verbatim from data/vocab/medieval.json.
 *
 * These are PURE type declarations — no runtime values here. The resolver lives
 * in src/data/vocab.ts; the medieval data lives in data/vocab/medieval.json.
 *
 * Phase: G1 (additive — no frozen stores touched).
 */

/**
 * A single entry in the `categories` array of a VocabBundle.
 *
 * `id`    — stable machine key (e.g. `"violence"`). Used as the lookup key in
 *           subtypeToCategory and as the argument to categoryColor().
 * `code`  — single uppercase letter for monochrome/compact legend rendering.
 * `label` — human-readable display name.
 * `color` — hex color constant (theme-invariant data meaning; lighten() is
 *           applied at render time for dark theme via domainColor()).
 * `glyph` — default map mark name for this category.
 */
export interface VocabEntry {
  /** Stable machine identifier, e.g. `"violence"`. */
  id: string;
  /** Single-character legend code, e.g. `"V"`. */
  code: string;
  /** Display label, e.g. `"Violence"`. */
  label: string;
  /** Data-meaning hex color, theme-invariant, e.g. `"#9c1c1c"`. */
  color: string;
  /** Default glyph/mark name for this category, e.g. `"blade"`. */
  glyph: string;
}

/**
 * The complete vocabulary manifest for one dataset.
 *
 * All lookup tables that were previously hardcoded in design/tokens.ts are now
 * expressed as data here, one bundle per dataset. The resolver in src/data/vocab.ts
 * loads the active bundle and exposes selector helpers that replicate the old API.
 *
 * Field notes:
 * - `categories`        — ordered array of event/entity categories (VocabEntry[]).
 * - `subtypeToCategory` — maps every raw event type string to a category id.
 *                         Fallback when key is absent: `fallbackCategory`.
 * - `subtypeGlyphs`     — optional per-subtype glyph override map. When a subtype
 *                         key matches, use this mark instead of the category default.
 * - `regions`           — maps region key → hex color for polity fill and legend.
 * - `relationships`     — maps relationship type key → hex color for graph/map lines.
 * - `journeys`          — optional map of journey kind → hex color for track lines.
 * - `polityTypes`       — optional map of polity entity type → display label or color.
 *                         Reserved for future use (not used in G1).
 * - `fallbackCategory`  — category id used when an event type is absent from
 *                         subtypeToCategory. Medieval default: `"power"`.
 */
export interface VocabBundle {
  /**
   * Optional dataset identifier that this bundle belongs to.
   * Matches Dataset.id when collocated as data/vocab/<datasetId>.json.
   */
  datasetId?: string;

  /** Ordered list of all event/entity categories for this dataset. */
  categories: VocabEntry[];

  /**
   * Maps every raw event subtype string to one of the category ids in `categories`.
   * Example: `{ "battle": "violence", "treaty": "diplomacy" }`.
   * Any key absent here resolves to `fallbackCategory`.
   */
  subtypeToCategory: Record<string, string>;

  /**
   * Optional per-subtype glyph override.
   * When an event's `type` matches a key here, use this glyph mark on the map
   * instead of the category-default glyph.
   * Example: `{ "siege": "shield", "treaty": "scroll" }`.
   */
  subtypeGlyphs?: Record<string, string>;

  /**
   * Region key → hex color for polity fill and region legend.
   * Keys are snake_case geographic identifiers (e.g. `"western_europe"`).
   */
  regions: Record<string, string>;

  /**
   * Relationship type key → hex color for network graph edges and map line layer.
   * Keys match the `type` field of Relationship records.
   */
  relationships: Record<string, string>;

  /**
   * Optional journey kind → hex color for track line rendering.
   * Keys match the `kind` field of Journey records.
   */
  journeys?: Record<string, string>;

  /**
   * Optional polity entity type → metadata (label, color, etc.).
   * Reserved for future dataset-specific polity type vocabularies.
   * Not consumed in G1.
   */
  polityTypes?: Record<string, string>;

  /**
   * Category id to use when `subtypeToCategory` has no entry for a given subtype.
   * Medieval default is `"power"` (mirrors the `?? 'power'` fallback in tokens.ts).
   */
  fallbackCategory: string;
}
