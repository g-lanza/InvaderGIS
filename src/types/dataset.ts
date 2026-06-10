/**
 * dataset.ts — Dataset and EntityKindDef type definitions.
 *
 * These types form the generalized envelope above the 9 medieval record
 * interfaces in record.ts. They are ADDITIVE: the medieval interfaces remain
 * unchanged and intact as the `payload` type of dataset #1's entity kinds.
 *
 * Architecture (from docs/08_SCHEMA_GENERALIZATION.md):
 *   Dataset → declares its time window, spatial extent, entity kinds, and vocab.
 *   EntityKindDef → one entry per entity kind (polity, event, journey, …).
 *   EntityRecord → thin generic envelope: { id, kind, name, temporal?, spatial?,
 *                  category?, payload, provenance? }.
 *   TemporalRef / SpatialRef → discriminated union shapes for time and space.
 *
 * The medieval corpus maps to this schema as follows (no field is lost):
 *   polity       → kind:"polity",       temporal:TemporalShape.snapshots,    spatial:SpatialShape.polygonSnapshots
 *   event        → kind:"event",        temporal:TemporalShape.instant,      spatial:SpatialShape.point
 *   journey      → kind:"journey",      temporal:TemporalShape.interval,     spatial:SpatialShape.track
 *   relationship → kind:"relationship", temporal:TemporalShape.periods,      spatial:SpatialShape.none
 *   ruler        → kind:"ruler",        temporal:TemporalShape.interval,     spatial:SpatialShape.none
 *   source       → kind:"source",       temporal:TemporalShape.instant,      spatial:SpatialShape.none
 *   institution  → kind:"institution",  temporal:TemporalShape.interval,     spatial:SpatialShape.none
 *   technology   → kind:"technology",   temporal:TemporalShape.instant,      spatial:SpatialShape.none
 *   text         → kind:"text",         temporal:TemporalShape.instant,      spatial:SpatialShape.none
 *
 * Phase: G1 (additive — no frozen stores touched).
 *
 * Imports `Provenance` from ./record — that interface is domain-neutral and
 * does not need to be duplicated.
 */

import type { Provenance, Year } from './record';
import type { VocabBundle } from './vocab';

// ── Temporal primitives ─────────────────────────────────────────────────────

/**
 * A calendar year. Negative values are BCE (if the dataset window allows).
 * Re-exported from record.ts (single definition; avoids type divergence between
 * the two modules). G1 nit applied in G2.
 */
export type { Year };

/**
 * The discriminant tags for how a kind's entities sit in time.
 *
 * - `instant`   — a single year (events, discoveries, texts).
 * - `interval`  — a start/end span (rulers, journeys, institutions).
 * - `snapshots` — a series of discrete yearly snapshots (polities, territories).
 * - `periods`   — a set of active sub-periods (relationships with gaps).
 */
export type TemporalShape = 'instant' | 'interval' | 'snapshots' | 'periods';

/**
 * The resolved temporal position of ONE entity instance.
 *
 * Discriminated on `shape` — consumers switch on this field to extract the
 * concrete data without guessing.
 *
 * `instant`   → `{ shape: "instant",   year: Year }`
 * `interval`  → `{ shape: "interval",  start: Year; end: Year }`
 * `snapshots` → `{ shape: "snapshots", years: Year[] }`
 * `periods`   → `{ shape: "periods",   spans: [Year, Year][] }`
 */
export type TemporalRef =
  | { shape: 'instant';   year: Year }
  | { shape: 'interval';  start: Year; end: Year }
  | { shape: 'snapshots'; years: Year[] }
  | { shape: 'periods';   spans: [Year, Year][] };

// ── Spatial primitives ──────────────────────────────────────────────────────

/**
 * The discriminant tags for how a kind's entities sit in space.
 *
 * - `point`             — a single [lat, lon] coordinate (events).
 * - `track`             — an ordered sequence of waypoints (journeys).
 * - `polygonSnapshots`  — year-keyed polygon arrays (polities).
 * - `none`              — no spatial geometry (rulers, sources, texts, …).
 */
export type SpatialShape = 'point' | 'track' | 'polygonSnapshots' | 'none';

/**
 * The resolved spatial geometry of ONE entity instance.
 *
 * Discriminated on `shape`.
 *
 * `point`            → `{ shape: "point",            coords: [lat, lon] }`
 * `track`            → `{ shape: "track",            waypoints: [lat, lon, label][] }`
 * `polygonSnapshots` → `{ shape: "polygonSnapshots", snapshots: { year, polygon }[] }`
 * `none`             → `{ shape: "none" }`
 */
export type SpatialRef =
  | { shape: 'point';            coords: [number, number] }
  | { shape: 'track';            waypoints: [number, number, string][] }
  | { shape: 'polygonSnapshots'; snapshots: { year: Year; polygon: [number, number][] }[] }
  | { shape: 'none' };

// ── Relationship primitive ──────────────────────────────────────────────────

/**
 * A typed tie between two or more participants in a dataset.
 *
 * Mirrors the real Relationship record shape (schema.md §Relationship) but
 * expressed as a general reference usable in EntityRecord metadata.
 *
 * `participants` — list of entity ids with optional role labels.
 * `directed`     — whether the relationship is asymmetric (A→B not B→A).
 * `type`         — relationship type key (must be in vocab.relationships).
 * `active_periods` — optional list of [start, end] year spans when active.
 */
export interface RelationRef {
  /** Participating entity ids, each with an optional asymmetric role label. */
  participants: { entity_id: string; role?: string }[];
  /** True if the relationship is directional (participants[0] → participants[1]). */
  directed: boolean;
  /** Relationship type key — must exist in the dataset's VocabBundle.relationships. */
  type: string;
  /** Optional sub-periods when this relationship was active. */
  active_periods?: [Year, Year][];
}

// ── Dataset structure ───────────────────────────────────────────────────────

/**
 * The time window a dataset covers.
 *
 * `start` and `end` are inclusive years (negative = BCE).
 * `eraBands` optionally divides the window into named sub-periods for
 * the time rail and era axis labels.
 *
 * Medieval dataset #1: { start: 500, end: 1500 } + early/high/late era bands.
 */
export interface TimeWindow {
  /** Inclusive start year of the dataset (negative = BCE). */
  start: Year;
  /** Inclusive end year of the dataset. */
  end: Year;
  /** Optional named sub-period bands within the window (e.g. early/high/late medieval). */
  eraBands?: EraBand[];
}

/**
 * A named sub-period band within a TimeWindow.
 *
 * Used to render era labels on the time rail and to group records for
 * era-level filtering. `start` and `end` must lie within the parent TimeWindow.
 */
export interface EraBand {
  /** Machine-readable era identifier, e.g. `"early_medieval"`. */
  id: string;
  /** Display label, e.g. `"Early Medieval"`. */
  label: string;
  /** Inclusive start year of this era band. */
  start: Year;
  /** Inclusive end year of this era band. */
  end: Year;
}

/**
 * Declaration of one entity kind within a Dataset.
 *
 * Each `EntityKindDef` describes a family of records that share the same
 * temporal shape, spatial shape, and field body (payload). For the medieval
 * dataset, there are 9 kinds corresponding to the 9 record interfaces in record.ts.
 *
 * `kind`     — the stable machine key, matches RecordType strings.
 * `dir`      — the data folder name (matches TYPE_DIR in record.ts).
 * `label`    — human display name.
 * `temporal` — how entities of this kind are positioned in time.
 * `spatial`  — how entities of this kind are positioned in space (optional — defaults to none).
 * `fields`   — optional list of notable field names (documentation / tooling only).
 */
export interface EntityKindDef {
  /** Stable machine key, e.g. `"polity"`. Matches RecordType in record.ts. */
  kind: string;
  /** Data directory name, e.g. `"entities"`. Matches TYPE_DIR in record.ts. */
  dir: string;
  /** Human-readable label for UI, e.g. `"Polity"`. */
  label: string;
  /** How entities of this kind are positioned in time. */
  temporal: TemporalShape;
  /** How entities of this kind are positioned in space. Defaults to `"none"`. */
  spatial?: SpatialShape;
  /**
   * Optional list of notable field names for documentation and tooling.
   * Does not constrain the payload shape — the full TypeScript type does that.
   */
  fields?: string[];
}

/**
 * The top-level descriptor for one historical dataset.
 *
 * A Dataset declares everything the application needs to load and render a
 * corpus: its identifier, time window, spatial bounds, entity kinds, vocabulary,
 * and optional default layer configuration.
 *
 * Medieval dataset #1 uses id `"medieval-europe-500-1500"`.
 */
export interface Dataset {
  /** Stable unique identifier, e.g. `"medieval-europe-500-1500"`. */
  id: string;
  /** Human-readable dataset title. */
  title: string;
  /** Semantic version string, e.g. `"1.0.0"`. */
  version: string;
  /** The time window this dataset covers. */
  time: TimeWindow;
  /**
   * Optional spatial bounding box: [[minLat, minLon], [maxLat, maxLon]].
   * When absent the map fits to entity geometry.
   */
  space?: [[number, number], [number, number]];
  /** Entity kind definitions — one per record family (polity, event, …). */
  kinds: EntityKindDef[];
  /** The vocabulary bundle for this dataset (categories, colors, glyphs, …). */
  vocab: VocabBundle;
  /** Optional default visible layer ids. When absent all layers start visible. */
  defaultLayers?: string[];
}

// ── Generic record envelope ─────────────────────────────────────────────────

/**
 * A generic record envelope that can wrap any dataset entity.
 *
 * The `payload` field carries the full original record (Polity, AtlasEvent,
 * Journey, etc.) without any field loss. The outer envelope adds only the
 * cross-dataset fields needed for generic pipeline operations.
 *
 * This is the type future-phase consumers work with when they need to handle
 * records from multiple datasets uniformly. Dataset #1 consumers may continue
 * using the concrete interfaces from record.ts directly.
 *
 * @template P - The payload type (e.g. `Polity`, `AtlasEvent`, `Journey`).
 */
export interface EntityRecord<P = unknown> {
  /** Globally unique record id (matches the payload's `id` field). */
  id: string;
  /** Entity kind key — matches `EntityKindDef.kind` (e.g. `"polity"`). */
  kind: string;
  /** Display name for this entity (copied from payload for quick access). */
  name: string;
  /**
   * Resolved temporal position for this entity instance.
   * Computed from payload fields; not stored in raw JSON.
   */
  temporal?: TemporalRef;
  /**
   * Resolved spatial geometry for this entity instance.
   * Computed from payload fields; not stored in raw JSON.
   */
  spatial?: SpatialRef;
  /**
   * Resolved category id for this entity (e.g. `"violence"`).
   * For events: computed via VocabBundle.subtypeToCategory[payload.type].
   * For other kinds: may be statically assigned or absent.
   */
  category?: string;
  /** The original full record — no fields removed. */
  payload: P;
  /**
   * Provenance metadata (optional at the envelope level — always present
   * on the payload for medieval records that require it).
   */
  provenance?: Provenance;
}
