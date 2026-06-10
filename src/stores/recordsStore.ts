/**
 * recordsStore — lightweight store for loaded record counts (Spine 2b).
 *
 * Holds the RecordCounts summary populated by `initDataset()` at bootstrap.
 * This is the only Zustand mechanism needed to surface real counts in the UI
 * without prop-drilling or a Context wrapper.
 *
 * Shape is intentionally minimal: just the counts, not the full record arrays
 * (those live in the loaders module and are accessed via `loadRecords(kind)`).
 *
 * Dependency graph (no cycles):
 *   recordsStore   — standalone, imports only from loaders types.
 *   bootstrap.ts   — writes counts here via `setRecordCounts()` after loading.
 *   StatusBar.tsx  — reads counts via `useRecordsStore`.
 *
 * Phase: Spine 2b (new additive store — frozen stores untouched).
 */
import { create } from 'zustand';
import type { RecordCounts } from '@/data/loaders';

export interface RecordsState {
  /**
   * Per-kind record counts, or null before bootstrap completes.
   * Null signals the UI to show a neutral loading state — never a fake count.
   */
  counts: RecordCounts | null;
  /**
   * Store real counts after the dataset loads. Called once from bootstrap.ts.
   * @param counts - The RecordCounts from loadDataset().
   */
  setRecordCounts: (counts: RecordCounts) => void;
}

/**
 * useRecordsStore — Zustand store for loaded record counts.
 *
 * Default state: `counts: null` (before bootstrap). After `initDataset()` runs,
 * `counts` holds the real per-kind totals sourced from data/.
 */
export const useRecordsStore = create<RecordsState>((set) => ({
  counts: null,
  setRecordCounts: (counts) => set({ counts }),
}));
