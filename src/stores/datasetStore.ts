/**
 * datasetStore — active dataset registry (Phase G2).
 *
 * Owns the currently active Dataset profile and its identifier. This is the
 * single authoritative source for which dataset the application is displaying.
 * All other stores that need dataset parameters (time bounds, era bands, layer
 * defaults) should read from this store or be seeded from it at boot.
 *
 * Design decisions:
 *   - settingsStore is LEFT UNTOUCHED (per G2 constraint).
 *   - timeStore does NOT import this store (avoids circular deps). Instead,
 *     timeStore owns its own default constants (500/1500) and exposes
 *     `setTimeBounds` / `setEraBands` actions. A future app-bootstrap sequence
 *     calls those after calling `setDataset` here.
 *   - The medieval dataset is Dataset #1. Its MEDIEVAL_DATASET constant encodes
 *     today's hardcoded behavior as data, so with no explicit dataset loaded the
 *     app falls back to the exact same bounds, eras, and layers as before G2.
 *   - MEDIEVAL_LAYER_IDS is imported from layersStore (the canonical home of
 *     layer config) to avoid duplication. Dependency direction: datasetStore →
 *     layersStore (one-way, no cycle).
 *
 * Import-cycle note: datasetStore imports from layersStore (layer id list) and
 * data/vocab (for the medieval vocab bundle). Neither of those imports back into
 * datasetStore → no cycle. timeStore is fully independent.
 */
import { create } from 'zustand';
import type { Dataset } from '@/types/dataset';
import { activeVocab } from '@/data/vocab';
import { MEDIEVAL_LAYER_IDS } from '@/stores/layersStore';

// ── Medieval dataset #1 ─────────────────────────────────────────────────────

/**
 * The medieval dataset profile — encodes the hardcoded behavior of the original
 * Medieval Systems Atlas as a Dataset value. This is dataset #1.
 *
 * Time window: 500–1500 CE (inclusive), matching the original YEAR_MIN/YEAR_MAX.
 * Era bands: early (500–999) / high (1000–1299) / late (1300–1500), matching
 *   the original eraForYear thresholds (<1000 → early, <1300 → high, else late).
 * Default layers: the same 3 that were on by default (polities, capitals, events).
 *
 * `vocab` is populated from the active medieval VocabBundle (loaded by data/vocab.ts
 * from data/vocab/medieval.json). This avoids a second import of the raw JSON.
 */
export const MEDIEVAL_DATASET: Dataset = {
  id: 'medieval-europe-500-1500',
  title: 'Medieval Systems Atlas',
  version: '1.0.0',
  time: {
    start: 500,
    end: 1500,
    eraBands: [
      { id: 'early', label: 'Early', start: 500,  end: 999  },
      { id: 'high',  label: 'High',  start: 1000, end: 1299 },
      { id: 'late',  label: 'Late',  start: 1300, end: 1500 },
    ],
  },
  space: [
    [-10, -30],  // [minLat, minLon] — western Europe + MENA bounding box
    [70,   60],  // [maxLat, maxLon]
  ],
  kinds: [
    { kind: 'polity',       dir: 'entities',      label: 'Polity',       temporal: 'snapshots', spatial: 'polygonSnapshots' },
    { kind: 'event',        dir: 'events',        label: 'Event',        temporal: 'instant',   spatial: 'point'            },
    { kind: 'journey',      dir: 'journeys',      label: 'Journey',      temporal: 'interval',  spatial: 'track'            },
    { kind: 'relationship', dir: 'relationships', label: 'Relationship', temporal: 'periods',   spatial: 'none'             },
    { kind: 'ruler',        dir: 'rulers',        label: 'Ruler',        temporal: 'interval',  spatial: 'none'             },
    { kind: 'source',       dir: 'sources',       label: 'Source',       temporal: 'instant',   spatial: 'none'             },
    { kind: 'institution',  dir: 'institutions',  label: 'Institution',  temporal: 'interval',  spatial: 'none'             },
    { kind: 'technology',   dir: 'technologies',  label: 'Technology',   temporal: 'instant',   spatial: 'none'             },
    { kind: 'text',         dir: 'texts',         label: 'Text',         temporal: 'instant',   spatial: 'none'             },
  ],
  vocab: activeVocab(),
  /** Default-on layers: polities, capitals, events — matches original layersStore. */
  defaultLayers: ['polities', 'capitals', 'events'],
};

/** Re-export MEDIEVAL_LAYER_IDS from layersStore for consumers that import from
 *  datasetStore. This keeps the canonical list in layersStore while giving
 *  datasetStore callers a single import location. */
export { MEDIEVAL_LAYER_IDS };

// ── Store shape ──────────────────────────────────────────────────────────────

export interface DatasetState {
  /**
   * Stable identifier of the active dataset. Matches `dataset.id` when a
   * Dataset is loaded; defaults to the medieval id at boot.
   */
  activeDatasetId: string;
  /**
   * The fully loaded Dataset profile, or `null` when no dataset has been
   * explicitly loaded yet. The rest of the application falls back to medieval
   * constants when this is null (or when it equals MEDIEVAL_DATASET).
   */
  dataset: Dataset | null;
  /**
   * Load a Dataset profile and update the active id atomically.
   * Call `timeStore.setTimeBounds` / `timeStore.setEraBands` after this
   * to propagate the new time window to the temporal cursor.
   */
  setDataset: (d: Dataset) => void;
  /**
   * Update the active dataset id without loading a full profile.
   * Used during async loading flows where the id is known before the
   * profile object is resolved.
   */
  setActiveDatasetId: (id: string) => void;
}

// ── Store instance ───────────────────────────────────────────────────────────

/**
 * useDatasetStore — Zustand store for the active dataset.
 *
 * Default state: medieval dataset id, `dataset: null`. The absence of an
 * explicit Dataset object signals all other stores to use their built-in
 * medieval defaults, preserving today's behavior exactly.
 */
export const useDatasetStore = create<DatasetState>((set) => ({
  activeDatasetId: 'medieval-europe-500-1500',
  dataset: null,
  setDataset: (d) => set({ dataset: d, activeDatasetId: d.id }),
  setActiveDatasetId: (id) => set({ activeDatasetId: id }),
}));
