/**
 * src/data/bootstrap.ts — Dataset bootstrap coordinator (Spine 2c-i).
 *
 * `initDataset()` is the ONE call that wires the medieval dataset into the
 * running application. Call it once at startup (main.tsx), before or alongside
 * React mounting.
 *
 * What it does:
 *   1. Registers the medieval dataset profile (id, title, window, vocab) via
 *      `datasetStore.setDataset(MEDIEVAL_DATASET)` — synchronous, fires immediately.
 *   2. Wires time bounds (500–1500) and era bands into timeStore — synchronous.
 *   3. Awaits `loadDataset()` which fetches all 4,032 real records from
 *      public/data/records/<type>.json in parallel (Spine 2c-i bake+fetch arch).
 *   4. Caches the DatasetResult in `_loadedDataset`.
 *   5. Publishes real counts into recordsStore so the StatusBar updates.
 *
 * During the async load window the UI shows "— loading —" (recordsStore starts
 * at zero counts — this is the documented pre-2c-i behaviour, now honest about
 * the async nature of the load).
 *
 * Idempotent: `initDataset()` is safe to call multiple times. Subsequent calls
 * return the cached promise; the fetch runs only once.
 *
 * Dependency graph (no cycles):
 *   bootstrap → datasetStore (write via setDataset)
 *   bootstrap → timeStore    (write via setTimeBounds / setEraBands)
 *   bootstrap → loaders      (async fetch → public/data/records/)
 *   bootstrap → MEDIEVAL_DATASET (from datasetStore — pure constant)
 *   Neither datasetStore nor timeStore imports bootstrap → no cycle.
 *
 * Phase: Spine 2c-i (was sync in 2b; now async to match fetch-based loaders).
 */

import { MEDIEVAL_DATASET } from '@/stores/datasetStore';
import { useDatasetStore }  from '@/stores/datasetStore';
import { useTimeStore }     from '@/stores/timeStore';
import { useRecordsStore }  from '@/stores/recordsStore';
import { loadDataset }      from '@/data/loaders';
import type { DatasetResult } from '@/data/loaders';

// ── Module-level cache ────────────────────────────────────────────────────────

/** Cached dataset result — set after the first successful load. */
let _loadedDataset: DatasetResult | null = null;

/**
 * In-flight or resolved promise — ensures only one fetch cycle runs
 * even if initDataset() is called multiple times concurrently.
 */
let _initPromise: Promise<DatasetResult> | null = null;

// ── Synchronous store wiring (fires before await) ─────────────────────────────

function _wireStores(): void {
  // Register the medieval dataset profile in datasetStore.
  useDatasetStore.getState().setDataset(MEDIEVAL_DATASET);

  // Confirm the medieval time bounds in timeStore.
  useTimeStore.getState().setTimeBounds(
    MEDIEVAL_DATASET.time.start,
    MEDIEVAL_DATASET.time.end,
  );

  // Wire the three era bands (early/high/late) so eraForYear is data-driven.
  const eraBands = MEDIEVAL_DATASET.time.eraBands ?? [];
  useTimeStore.getState().setEraBands(eraBands);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Initialise the medieval dataset: wire stores and fetch all real records.
 *
 * Returns a promise that resolves with the DatasetResult once all 9 per-type
 * record bundles have been fetched from public/data/records/. If `npm run bake`
 * has not been run, the fetch will fail with a clear error.
 *
 * Safe to call multiple times — subsequent calls return the same promise
 * (or the already-resolved value if the load completed).
 *
 * Call site: `src/main.tsx`. Fire-and-forget is acceptable (the UI handles
 * the loading window via recordsStore zero counts). Attach a `.catch` handler
 * if you want to surface load failures in the UI.
 *
 * @returns Promise<DatasetResult> — resolves with all loaded records + counts.
 */
export function initDataset(): Promise<DatasetResult> {
  // Return cached promise (or wrap cached result) on repeated calls.
  if (_initPromise !== null) return _initPromise;

  // Wire stores synchronously before the async fetch so the React tree sees
  // the correct dataset profile and time bounds from the very first render.
  _wireStores();

  _initPromise = loadDataset().then((result) => {
    _loadedDataset = result;

    // Publish real counts into recordsStore — StatusBar updates here.
    useRecordsStore.getState().setRecordCounts(result.counts);

    return result;
  });

  return _initPromise;
}

/**
 * Return the cached DatasetResult loaded during `initDataset()`.
 *
 * Returns `null` if `initDataset()` has not yet resolved. Consumers should
 * call `initDataset()` at bootstrap and use this for subsequent synchronous
 * access (e.g. rendering components that need the full record list).
 *
 * @returns The loaded DatasetResult, or null before bootstrap resolves.
 */
export function getLoadedDataset(): DatasetResult | null {
  return _loadedDataset;
}
