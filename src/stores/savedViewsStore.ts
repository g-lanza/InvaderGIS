/**
 * savedViewsStore — NEW additive Zustand store (Wave2-D).
 *
 * A "saved view" is a snapshot of the current app state across four FROZEN
 * stores, captured at save time and re-applied on demand:
 *
 *   · timeStore      — the active `year`
 *   · settingsStore  — `theme`, `mapType`, `projection`
 *   · layersStore    — per-layer `{ visible, opacity }` for every layer id
 *   · selectionStore — the current `{ selectedId, selectedType }` (may be null)
 *
 * IMPORTANT — frozen-store discipline:
 *   This store NEVER edits the shape of any frozen store and NEVER imports their
 *   `set` internals. It reads current state via `useXStore.getState()` (public
 *   read) and writes back exclusively through public actions:
 *     setYear, setTheme, setMapType, setProjection, setVisible, setOpacity,
 *     select, clear. No shape changes, fully reversible, additive only.
 *
 * Persistence:
 *   The list of views is persisted to localStorage via zustand's `persist`
 *   middleware (same pattern family as other stores in this app). Only the
 *   `views` array is persisted — actions are re-created on load. The captured
 *   values are plain serializable data (numbers, strings, a small map), so the
 *   round-trip is lossless.
 *
 * Realness:
 *   `save(name)` reads the ACTUAL live values from the four stores at call time
 *   — there are no mocks or placeholders. Applying a view writes those captured
 *   values straight back through the stores' real actions, so the map, time
 *   rail, theme, and inspector all update exactly as if the user had set them
 *   by hand.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { MapType, Projection, ThemeId } from '@/stores/settingsStore';
import { useLayersStore } from '@/stores/layersStore';
import type { LayerId } from '@/stores/layersStore';
import { useSelectionStore } from '@/stores/selectionStore';

// ── Captured-state shape ───────────────────────────────────────────────────────

/**
 * The per-layer slice we capture: visibility + opacity for one layer id.
 * Draw `order` is intentionally NOT captured — it is structural to the dataset,
 * not a user-facing view preference, and applying it could fight the layer set.
 */
export interface CapturedLayer {
  /** Whether the layer was drawn when the view was saved. */
  visible: boolean;
  /** Layer opacity (0..1) when the view was saved. */
  opacity: number;
}

/**
 * The full serializable snapshot held by a saved view. Every field maps 1:1 to a
 * public action used on restore.
 */
export interface CapturedState {
  /** timeStore.year at save time. */
  year: number;
  /** settingsStore.theme at save time. */
  theme: ThemeId;
  /** settingsStore.mapType at save time. */
  mapType: MapType;
  /** settingsStore.projection at save time. */
  projection: Projection;
  /** layersStore: visible + opacity per layer id at save time. */
  layers: Record<LayerId, CapturedLayer>;
  /** selectionStore.selectedId at save time, or null when nothing was selected. */
  selectedId: string | null;
  /** selectionStore.selectedType at save time, or null when nothing was selected. */
  selectedType: string | null;
}

/** One persisted saved view: identity + label + timestamp + captured state. */
export interface SavedView {
  /** Stable unique id (timestamp + random suffix). */
  id: string;
  /** User-supplied label. Trimmed; falls back to a timestamped default. */
  name: string;
  /** Epoch milliseconds when the view was saved (for "Nm ago" + sort). */
  savedAt: number;
  /** The captured store snapshot re-applied on restore. */
  state: CapturedState;
}

// ── Store shape ────────────────────────────────────────────────────────────────

/** Public contract of the saved-views store. */
export interface SavedViewsState {
  /** All saved views, newest first is NOT guaranteed — sort in the view layer. */
  views: SavedView[];
  /**
   * Capture the current state of the four frozen stores into a new saved view
   * and prepend it to the list. Returns the created view (so the UI can toast it).
   *
   * @param name - User label; blank/whitespace falls back to a timestamped name.
   */
  save: (name: string) => SavedView;
  /**
   * Re-apply a saved view's captured state through the frozen stores' public
   * actions. Restores year, theme, map type, projection, every layer's
   * visibility + opacity, and the selection (or clears it if none was saved).
   *
   * @param view - The view to apply.
   */
  apply: (view: SavedView) => void;
  /**
   * Remove a saved view by id. No-op if the id is not present.
   *
   * @param id - The view id to remove.
   */
  remove: (id: string) => void;
  /**
   * Return a shallow copy of the current views array. Provided for callers that
   * want the list without subscribing to the store.
   */
  list: () => SavedView[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a stable-enough unique id without pulling in a uuid dependency. */
function makeId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Snapshot the four frozen stores into a CapturedState.
 * Reads are via `getState()` — public, non-mutating, no shape dependency.
 * Exported so the URL-state codec (urlState.ts) can reuse the same snapshot.
 */
export function captureCurrentState(): CapturedState {
  const time = useTimeStore.getState();
  const settings = useSettingsStore.getState();
  const layersState = useLayersStore.getState();
  const selection = useSelectionStore.getState();

  // Deep-copy only the fields we re-apply (visible + opacity), so the snapshot
  // is immutable relative to later store mutations.
  const layers: Record<LayerId, CapturedLayer> = {};
  for (const [id, cfg] of Object.entries(layersState.layers)) {
    layers[id] = { visible: cfg.visible, opacity: cfg.opacity };
  }

  return {
    year: time.year,
    theme: settings.theme,
    mapType: settings.mapType,
    projection: settings.projection,
    layers,
    selectedId: selection.selectedId,
    selectedType: selection.selectedType,
  };
}

/**
 * Apply a CapturedState back through the frozen stores' public actions.
 * Pure orchestration — no direct state mutation, no shape access.
 * Exported so the URL-state codec (urlState.ts) can hydrate from a shared link.
 */
export function applyCapturedState(state: CapturedState): void {
  const settings = useSettingsStore.getState();
  const time = useTimeStore.getState();
  const layersState = useLayersStore.getState();
  const selection = useSelectionStore.getState();

  // Settings first — theme swap is the most visible change.
  settings.setTheme(state.theme);
  settings.setMapType(state.mapType);
  settings.setProjection(state.projection);

  // Year (clamped internally by setYear to the active bounds).
  time.setYear(state.year);

  // Layers: only apply ids that still exist in the current layer set, so a view
  // saved against a different dataset cannot create phantom entries.
  for (const [id, cap] of Object.entries(state.layers)) {
    if (id in layersState.layers) {
      layersState.setVisible(id, cap.visible);
      layersState.setOpacity(id, cap.opacity);
    }
  }

  // Selection last: restore the pinned record, or clear if none was saved.
  if (state.selectedId !== null && state.selectedType !== null) {
    selection.select(state.selectedId, state.selectedType);
  } else {
    selection.clear();
  }
}

// ── Store instance ─────────────────────────────────────────────────────────────

/** localStorage key for the persisted views array. */
const PERSIST_KEY = 'hdv-saved-views';

export const useSavedViewsStore = create<SavedViewsState>()(
  persist(
    (set, get) => ({
      views: [],

      save: (name) => {
        const trimmed = name.trim();
        const view: SavedView = {
          id: makeId(),
          name:
            trimmed.length > 0
              ? trimmed
              : `View ${new Date().toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`,
          savedAt: Date.now(),
          state: captureCurrentState(),
        };
        set((s) => ({ views: [view, ...s.views] }));
        return view;
      },

      apply: (view) => {
        applyCapturedState(view.state);
      },

      remove: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),

      list: () => [...get().views],
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persist only the data — actions are re-created on hydration.
      partialize: (s) => ({ views: s.views }),
    },
  ),
);
