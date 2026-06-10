/**
 * compareStore — Compare-set state for P4-C Compare / Storyline view.
 *
 * Owns the ordered list of record ids that the user has pinned into the
 * compare panel. Each entry carries the id and its kind so the compare
 * panel can load the right record without re-inferring from the id prefix.
 *
 * Design choices:
 *   (a) NEW Zustand store — not an edit to any frozen store.
 *   (b) Persists across overlay open/close so the user can toggle between the
 *       Network and Compare overlays without losing their compare set.
 *   (c) Capped at MAX_COMPARE (4) items — the table columns stay readable.
 *   (d) No frozen store is imported — this module is fully self-contained.
 *
 * TSDoc shape:
 *   items    — ordered array of { id, kind } pairs (2..MAX_COMPARE is ideal).
 *   add      — append if not already present and under the cap; no-op otherwise.
 *   remove   — remove a single entry by id.
 *   clear    — empty the set.
 *   hasId    — predicate: true if `id` is already in the set.
 *
 * Lifecycle:
 *   Populated by the "Compare" action in EntityDock (or any future entry point).
 *   Read by CompareTable + Storyline inside CompareOverlay.
 *   Cleared when the user clicks "Clear" in the overlay header.
 *   Not persisted to localStorage — intentionally ephemeral per session.
 *
 * Phase 4-C — compare/storyline agent.
 */

import { create } from 'zustand';

/** Maximum number of records that may be held in the compare set. */
export const MAX_COMPARE = 4;

/** A single entry in the compare set. */
export interface CompareEntry {
  /** Stable slug id matching RawRecord.id. */
  id: string;
  /** Kind string matching RawRecord.kind (e.g. 'polity', 'event'). */
  kind: string;
}

/** Shape of the compareStore. */
export interface CompareState {
  /**
   * Ordered list of compare entries. Empty until the user adds records.
   * Length is bounded by MAX_COMPARE.
   */
  items: CompareEntry[];

  /**
   * Add a record to the compare set.
   * No-op if the id is already present or the cap (MAX_COMPARE) is reached.
   *
   * @param id   - Stable slug id of the record.
   * @param kind - Kind string of the record.
   */
  add: (id: string, kind: string) => void;

  /**
   * Remove a record from the compare set by id.
   * No-op if the id is not present.
   *
   * @param id - Stable slug id to remove.
   */
  remove: (id: string) => void;

  /** Empty the compare set entirely. */
  clear: () => void;

  /**
   * Return true if a given id is already in the compare set.
   * Safe to call in render — reads from current state snapshot.
   *
   * @param id - Stable slug id to check.
   */
  hasId: (id: string) => boolean;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  items: [],

  add: (id, kind) => {
    const { items } = get();
    if (items.some((e) => e.id === id)) return;
    if (items.length >= MAX_COMPARE) return;
    set({ items: [...items, { id, kind }] });
  },

  remove: (id) => {
    set((prev) => ({ items: prev.items.filter((e) => e.id !== id) }));
  },

  clear: () => set({ items: [] }),

  hasId: (id) => get().items.some((e) => e.id === id),
}));
