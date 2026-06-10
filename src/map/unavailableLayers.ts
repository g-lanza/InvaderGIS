/**
 * unavailableLayers.ts — honest accounting of map layers whose source data is
 * NOT present in this dataset (Realness Law, ABSOLUTES §1).
 *
 * Wave2 update (2026-05-29): capitals, settlements, military, and trade now
 * have real baked GeoJSON in public/data/layers/ and are rendered by their
 * respective layer modules. This file is retained for future layers that may
 * be requested before their source data is available.
 *
 * If a future layer is requested without source data, add an entry to
 * UNAVAILABLE_LAYERS and call logUnavailableLayers() from useMapLifecycle.ts.
 */

import { mapLog } from './mapLog';

/** A layer whose source data is absent, with the reason for the honest skip. */
export interface UnavailableLayer {
  /** The layersStore layer id. */
  id: string;
  /** Why no geometry can be baked/rendered for this layer. */
  reason: string;
}

/** Layers with no real source data in this dataset. Currently empty — all
 *  medieval layers (capitals, settlements, military, trade, journeys, events)
 *  have been baked and wired. */
export const UNAVAILABLE_LAYERS: readonly UnavailableLayer[] = [] as const;

/**
 * Log, once, which requested layers have no source data and why. Called at map
 * boot so the absence is visible to developers without any user-facing fakery.
 * No-ops when UNAVAILABLE_LAYERS is empty.
 */
export function logUnavailableLayers(): void {
  for (const layer of UNAVAILABLE_LAYERS) {
    mapLog(
      `[mapLayers] Layer "${layer.id}" not rendered — ${layer.reason}.` +
      ' Toggle is inert until real source data is baked.',
    );
  }
}
