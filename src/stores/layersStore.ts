/**
 * layersStore — FROZEN INTERFACE (docs/00 §1, docs/01 §2.2).
 *
 * Owns per-layer visibility, opacity, and draw order. Consumed by map-rendering
 * (each layer module reads its own entry), the LayerRail (shell-chrome), and the
 * Legend. Layer ids are now an open string type so any dataset can declare its
 * own layer set. The medieval 10-layer set remains the default.
 *
 * Phase G2 changes (schema-generalization handoff):
 *   - `LayerId` widened from a fixed union to `string`. The 10 medieval layer
 *     ids are preserved in `MEDIEVAL_LAYER_IDS` and `LAYER_ORDER` (exported),
 *     so LayerRail and other consumers can import the list rather than
 *     re-declaring it (removes the earlier duplication finding).
 *   - Default config (polities/capitals/events visible, the rest off) is
 *     unchanged — today's app behavior is identical to pre-G2.
 *   - `toggle`, `setVisible`, `setOpacity` accept `string` ids; callers that
 *     already pass medieval string literals continue to compile unchanged.
 */
import { create } from 'zustand';

// ── Layer id registry ────────────────────────────────────────────────────────

/**
 * The canonical map layer identifier type. Widened from the medieval union to
 * `string` so datasets can declare their own layer ids without a store handoff.
 *
 * Back-compat: callers that were passing the 10 medieval string literals
 * continue to work — `string` accepts every prior value.
 */
export type LayerId = string;

/**
 * The medieval map layer ids, in draw order (bottom → top).
 * Exported so LayerRail and datasetStore can import the canonical list
 * instead of re-declaring it. This resolves the earlier LAYER_ORDER duplication.
 *
 * NOTE: the 'heatmap' (Event Density) layer was removed from the layer set
 * (product decision) — events are already shown as point studs, so the density
 * heatmap was redundant. The heatmapLayer.ts code is dormant (never added).
 */
export const MEDIEVAL_LAYER_IDS = [
  'polities',
  'trade',
  'relationships',
  'journeys',
  'settlements',
  'military',
  'capitals',
  'events',
  'cartogram', // alternate analytical view: proportional symbols by metric (defaults off)
] as const;

/**
 * Draw order for the medieval layer set: lower index draws first (beneath).
 * Imported by LayerRail to ensure rail order matches store order exactly.
 * Identical to the pre-G2 `ORDER` constant — only now exported.
 */
export const LAYER_ORDER: LayerId[] = [...MEDIEVAL_LAYER_IDS];

// ── Layer config ─────────────────────────────────────────────────────────────

export interface LayerConfig {
  /** Whether the layer is drawn. */
  visible: boolean;
  /** Layer opacity 0..1. */
  opacity: number;
  /** Draw order; lower draws first (beneath). */
  order: number;
}

// ── Store shape ──────────────────────────────────────────────────────────────

export interface LayersState {
  /** Config per layer id. */
  layers: Record<LayerId, LayerConfig>;
  /** Toggle a layer's visibility. */
  toggle: (id: LayerId) => void;
  /** Set a layer's visibility explicitly. */
  setVisible: (id: LayerId, visible: boolean) => void;
  /** Set a layer's opacity (clamped 0..1). */
  setOpacity: (id: LayerId, opacity: number) => void;
}

// ── Default layer factory ─────────────────────────────────────────────────────

/**
 * Default-on layer ids. Only `polities` has a rendering layer today (Spine 2c-ii),
 * so only it defaults on — a toggle that does nothing yet would mislead the user
 * (QA bug, 2026-05-27). capitals/events/etc. default on as their render layers land.
 */
const DEFAULT_ON = new Set<LayerId>(['polities']);

/** Default layer config — polities + capitals + events on, the rest off. */
function defaultLayers(): Record<LayerId, LayerConfig> {
  return LAYER_ORDER.reduce<Record<LayerId, LayerConfig>>((acc, id, i) => {
    acc[id] = { visible: DEFAULT_ON.has(id), opacity: 1, order: i };
    return acc;
  }, {});
}

// ── Store instance ─────────────────────────────────────────────────────────────

export const useLayersStore = create<LayersState>((set) => ({
  layers: defaultLayers(),
  toggle: (id) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], visible: !s.layers[id].visible } },
    })),
  setVisible: (id, visible) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], visible } } })),
  setOpacity: (id, opacity) =>
    set((s) => ({
      layers: {
        ...s.layers,
        [id]: { ...s.layers[id], opacity: Math.max(0, Math.min(1, opacity)) },
      },
    })),
}));
