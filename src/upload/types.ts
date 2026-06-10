/**
 * types.ts — type model for the user-data upload feature (Wave2-A).
 *
 * Users visualize THEIR OWN data. A `UserDataset` is a thin, self-contained
 * envelope around an array of generic `EntityRecord`s (from src/types/dataset.ts)
 * produced by parsing an uploaded GeoJSON FeatureCollection or a lat/lon CSV.
 *
 * ── Realness / data-safety law ──────────────────────────────────────────────────
 * Everything here lives ONLY in the browser. Datasets are persisted to IndexedDB
 * (see idbStore.ts) and never transmitted. The shape is intentionally serializable
 * (plain JSON — no class instances, no functions) so a dataset can be:
 *   1. round-tripped through IndexedDB structured-clone, and
 *   2. exported to a `.json` file and re-imported losslessly (UploadPanel export).
 *
 * ── Future account backend (abstraction seam) ───────────────────────────────────
 * `UserDatasetRepository` (idbStore.ts) is the persistence seam. Today the only
 * implementation is IndexedDB-backed; a future account-based backend can implement
 * the same interface (load/saveAll/clear) without touching the store or UI.
 *
 * Phase: Wave2-A (additive — no frozen stores or types touched).
 */

import type { EntityRecord } from '@/types/dataset';

/**
 * The user-supplied payload carried by an imported `EntityRecord`.
 *
 * For every feature, `payload` holds the raw property bag from the source file
 * (GeoJSON feature `properties`, or the CSV row minus the recognized lat/lon/name
 * columns). No field is lost. Values are kept as parsed (string for CSV cells,
 * arbitrary JSON for GeoJSON properties).
 */
export type UserPayload = Record<string, unknown>;

/**
 * One imported user record: a generic `EntityRecord` whose `kind` is always
 * `'user'` and whose payload is the original property bag.
 *
 * `spatial` is always a `point` (CSV) or derived from the feature geometry's
 * representative coordinate (GeoJSON) — see importParse.ts. Records without a
 * resolvable coordinate are rejected at the boundary, never silently dropped
 * into a broken state.
 */
export type UserRecord = EntityRecord<UserPayload>;

/**
 * The source format a dataset was imported from. Recorded for display and for
 * choosing the right re-export note; the in-memory model is identical regardless.
 */
export type UserDatasetFormat = 'geojson' | 'csv';

/**
 * A single user-imported dataset, fully self-contained and serializable.
 *
 * Persisted verbatim to IndexedDB and re-exportable as a `.json` file. The
 * `records` array is the rendered payload; everything else is metadata for the
 * UploadPanel list and the map source.
 */
export interface UserDataset {
  /** Stable unique id (crypto.randomUUID at import time). */
  id: string;
  /** Human-readable name (derived from filename, editable is a future add-on). */
  name: string;
  /** Source format the dataset was parsed from. */
  format: UserDatasetFormat;
  /** Epoch milliseconds when the dataset was imported. */
  importedAt: number;
  /**
   * The property key chosen as each record's display name (or null if the user
   * left it on the synthetic "feature N" fallback).
   */
  nameField: string | null;
  /**
   * The property key chosen as each record's time year (optional). When set,
   * the value was coerced to a finite integer year at parse time and stored on
   * each record's `temporal` ref.
   */
  timeField: string | null;
  /** The full set of property keys observed across the source features. */
  propertyKeys: string[];
  /** The parsed records — the payload that renders on the map. */
  records: UserRecord[];
}

/**
 * The serializable file shape written by UploadPanel "Export" and accepted by
 * ImportDialog re-import. A small envelope around one `UserDataset` plus a format
 * marker so a stale/foreign file can be rejected with a clear message.
 */
export interface UserDatasetExport {
  /** Discriminator so re-import can validate the file is one of ours. */
  kind: 'invadergis.userDataset';
  /** Export schema version (bumped if the on-disk shape ever changes). */
  version: 1;
  /** The exported dataset. */
  dataset: UserDataset;
}

/** The export `kind` marker constant (single source of truth). */
export const USER_DATASET_EXPORT_KIND = 'invadergis.userDataset' as const;

/** The current export schema version. */
export const USER_DATASET_EXPORT_VERSION = 1 as const;
