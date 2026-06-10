/**
 * selectionStore — FROZEN INTERFACE (docs/00 §1, docs/01 §2.2).
 *
 * Owns the current selection (record id + type) and inspector open state.
 * Consumed by record-panels, the map (highlights the selected feature), and
 * search-command (selecting a result writes here).
 *
 * Phase G2 change: `selectedType` widened from `RecordType | null` to
 * `string | null`. Entity kinds are now dataset-defined (open set); callers
 * pass the kind string from their Dataset's EntityKindDef.kind. Medieval
 * callers continue to pass the 9 medieval kind strings unchanged — the runtime
 * behavior is identical. The `RecordType` import is removed (unused after
 * the widening).
 */
import { create } from 'zustand';

export interface SelectionState {
  /** Id of the selected record, or null when nothing is selected. */
  selectedId: string | null;
  /**
   * Kind/type of the selected record, or null when nothing is selected.
   * Widened from `RecordType` to `string` so any dataset's entity kind can
   * be selected without needing a compile-time union update.
   */
  selectedType: string | null;
  /** Whether the inspector surface is open. */
  inspectorOpen: boolean;
  /**
   * Id of the currently hovered record, or null. Transient cross-view highlight
   * (Pass 1 linked views): map ↔ charts ↔ registers all read this to highlight the
   * same record. Additive and field-scoped — existing `selectedId` subscribers do
   * NOT re-render on hover because they don't select this slice.
   */
  hoverId: string | null;
  /** Kind/type of the hovered record, or null. */
  hoverType: string | null;
  /**
   * Select a record by id + kind string; opens the inspector.
   * Medieval callers pass one of the 9 RecordType strings (unchanged).
   * Non-medieval callers pass their dataset's EntityKindDef.kind value.
   */
  select: (id: string, type: string) => void;
  /** Clear the selection and close the inspector. */
  clear: () => void;
  /** Open or close the inspector without changing the selection. */
  setInspectorOpen: (open: boolean) => void;
  /**
   * Set or clear the hovered record (id + kind), or pass (null, null) to clear.
   * Hover is independent of selection; `clear()` does not touch it.
   */
  setHover: (id: string | null, type: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedId:    null,
  selectedType:  null,
  inspectorOpen: false,
  hoverId:       null,
  hoverType:     null,
  select: (id, type) => set({ selectedId: id, selectedType: type, inspectorOpen: true }),
  clear:  () => set({ selectedId: null, selectedType: null, inspectorOpen: false }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setHover: (id, type) => set({ hoverId: id, hoverType: type }),
}));
