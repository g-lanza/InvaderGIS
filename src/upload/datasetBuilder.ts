/**
 * datasetBuilder.ts — assemble a persistable UserDataset and (re-)serialize it.
 *
 * Bridges the parser output (importParse.ParseSuccess) and the user's field
 * choices into a complete `UserDataset`, and provides the export / re-import
 * helpers used by UploadPanel ("Export" → .json) and ImportDialog (re-import of
 * a previously exported file).
 *
 * Phase: Wave2-A (additive — pure helpers, no side effects beyond id/time gen).
 */

import { applyFieldChoices, type ParseSuccess } from './importParse';
import {
  USER_DATASET_EXPORT_KIND,
  USER_DATASET_EXPORT_VERSION,
  type UserDataset,
  type UserDatasetExport,
} from './types';

/**
 * Generate a reasonably unique id. Prefers `crypto.randomUUID` (all modern
 * browsers), falling back to a timestamp+random string when unavailable.
 */
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip a path/extension from a filename to derive a default dataset name. */
function deriveName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.trim() === '' ? 'Untitled dataset' : base;
}

/**
 * Build a complete `UserDataset` from a successful parse plus the user's choices.
 * Applies the chosen name/time fields to produce the final records (immutably).
 *
 * @param parse     - A successful parse result.
 * @param fileName  - Original filename (used for the default dataset name).
 * @param nameField - Property key chosen as display name, or null.
 * @param timeField - Property key chosen as the year, or null.
 */
export function buildDataset(
  parse: ParseSuccess,
  fileName: string,
  nameField: string | null,
  timeField: string | null,
): UserDataset {
  const records = applyFieldChoices(parse.records, nameField, timeField);
  return {
    id: makeId(),
    name: deriveName(fileName),
    format: parse.format,
    importedAt: Date.now(),
    nameField,
    timeField,
    propertyKeys: parse.propertyKeys,
    records,
  };
}

/** Serialize a dataset into the on-disk export envelope. */
export function toExport(dataset: UserDataset): UserDatasetExport {
  return {
    kind: USER_DATASET_EXPORT_KIND,
    version: USER_DATASET_EXPORT_VERSION,
    dataset,
  };
}

/** Result of attempting to read an exported dataset file. */
export type ImportExportResult =
  | { ok: true; dataset: UserDataset }
  | { ok: false; error: string };

/**
 * Validate and unwrap a previously exported `.json` file's parsed JSON.
 * Reassigns a fresh id and import time so re-importing a file never collides
 * with an existing copy. Fails fast on any shape mismatch.
 *
 * @param json - The parsed JSON value from the file.
 */
export function fromExport(json: unknown): ImportExportResult {
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'Export file root must be an object.' };
  }
  const env = json as Partial<UserDatasetExport>;
  if (env.kind !== USER_DATASET_EXPORT_KIND) {
    return {
      ok: false,
      error: 'This is not an InvaderGIS dataset export file.',
    };
  }
  if (env.version !== USER_DATASET_EXPORT_VERSION) {
    return {
      ok: false,
      error: `Unsupported export version (${String(env.version)}).`,
    };
  }
  const ds = env.dataset;
  if (!ds || typeof ds !== 'object' || !Array.isArray((ds as UserDataset).records)) {
    return { ok: false, error: 'Export file is missing a valid dataset.' };
  }
  // Fresh identity so a re-imported file is treated as a new dataset.
  return {
    ok: true,
    dataset: { ...(ds as UserDataset), id: makeId(), importedAt: Date.now() },
  };
}
