/**
 * uploadStore.ts — NEW Zustand store for the user's imported datasets (Wave2-A).
 *
 * This is an ADDITIVE store — it is NOT one of the four frozen stores
 * (timeStore / selectionStore / layersStore / settingsStore) and shares no state
 * with them. It owns the user's own uploaded data, which lives ONLY in the
 * browser (IndexedDB via idbStore) and is never transmitted.
 *
 * ── State ───────────────────────────────────────────────────────────────────────
 *   datasets         — every imported UserDataset (newest first).
 *   visibleIds       — the set of dataset ids currently drawn on the map.
 *   activeDatasetId  — the dataset focused in the panel (for future inspector use).
 *   hydrated         — true once IndexedDB has been read at startup.
 *   persisted        — whether storage is durable (false ⇒ in-memory fallback).
 *
 * ── Persistence model ───────────────────────────────────────────────────────────
 * Mutations update React state synchronously (immutable updates) and fire-and-
 * forget the matching IndexedDB write through the repository seam. Reads happen
 * once at `hydrate()`. The repository is the future-backend seam: swapping it for
 * an account-based implementation needs no change here or in the UI.
 *
 * ── Map sync ────────────────────────────────────────────────────────────────────
 * The store does NOT touch MapLibre. MapCanvas subscribes to `datasets` +
 * `visibleIds` and repaints its single user source — keeping the store pure and
 * the map wiring minimal/guarded.
 */

import { create } from 'zustand';
import type { UserDataset } from './types';
import { getUserDatasetRepository } from './idbStore';

/** Public shape of the upload store. */
export interface UploadState {
  /** All imported datasets, newest first. */
  datasets: UserDataset[];
  /** Ids of datasets currently visible on the map. */
  visibleIds: string[];
  /** The dataset id focused in the panel, or null. */
  activeDatasetId: string | null;
  /** True once the initial IndexedDB read has completed. */
  hydrated: boolean;
  /** Whether persistence is durable (false ⇒ in-memory fallback active). */
  persisted: boolean;

  /** Read persisted datasets from storage into state (idempotent). */
  hydrate: () => Promise<void>;
  /** Add a freshly imported dataset (persists + makes it visible + active). */
  addDataset: (dataset: UserDataset) => Promise<void>;
  /** Remove a dataset by id (persists the deletion). */
  removeDataset: (id: string) => Promise<void>;
  /** Toggle a dataset's map visibility. */
  toggleVisibility: (id: string) => void;
  /** Set the active (focused) dataset, or clear with null. */
  setActiveDataset: (id: string | null) => void;
}

/**
 * The upload store hook. Created with Zustand's `create` exactly like the other
 * additive stores in src/stores, but kept in src/upload to honor write-scope.
 */
export const useUploadStore = create<UploadState>((set, get) => ({
  datasets: [],
  visibleIds: [],
  activeDatasetId: null,
  hydrated: false,
  persisted: true,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const repo = await getUserDatasetRepository();
      const loaded = await repo.loadAll();
      // Newest first by import time.
      const sorted = [...loaded].sort((a, b) => b.importedAt - a.importedAt);
      set({
        datasets: sorted,
        // Persisted datasets start visible so the map reflects stored work.
        visibleIds: sorted.map((d) => d.id),
        hydrated: true,
        persisted: repo.durable,
      });
    } catch (err) {
       
      console.warn(
        '[uploadStore] Failed to hydrate user datasets — starting empty.' +
          ` Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
      set({ hydrated: true });
    }
  },

  addDataset: async (dataset) => {
    set((s) => ({
      datasets: [dataset, ...s.datasets],
      visibleIds: [...s.visibleIds, dataset.id],
      activeDatasetId: dataset.id,
    }));
    try {
      const repo = await getUserDatasetRepository();
      await repo.put(dataset);
    } catch (err) {
       
      console.warn(
        '[uploadStore] Failed to persist dataset — it remains for this session only.' +
          ` Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  removeDataset: async (id) => {
    set((s) => ({
      datasets: s.datasets.filter((d) => d.id !== id),
      visibleIds: s.visibleIds.filter((v) => v !== id),
      activeDatasetId: s.activeDatasetId === id ? null : s.activeDatasetId,
    }));
    try {
      const repo = await getUserDatasetRepository();
      await repo.remove(id);
    } catch (err) {
       
      console.warn(
        '[uploadStore] Failed to delete dataset from storage.' +
          ` Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toggleVisibility: (id) =>
    set((s) => ({
      visibleIds: s.visibleIds.includes(id)
        ? s.visibleIds.filter((v) => v !== id)
        : [...s.visibleIds, id],
    })),

  setActiveDataset: (id) => set({ activeDatasetId: id }),
}));
