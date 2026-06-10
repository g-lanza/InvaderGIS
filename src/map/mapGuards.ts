/**
 * mapGuards.ts — shared safety guards for MapLibre layer mutations.
 *
 * THE CRASH THIS FIXES (panel hide / fullscreen "white screen"):
 *   Layer setters across src/map/*.ts call `map.getLayer(id)` directly. During a
 *   CSS grid-width transition (collapse / fullscreen of a side panel) the map's
 *   container reflows and MapLibre can transiently tear its internal style down.
 *   A setter invoked in that window — from a map event handler, a store
 *   subscription, or the async layer re-assert — calls `map.getLayer(...)` when
 *   `map` is undefined or `map.style` is gone, throwing
 *     "Cannot read properties of undefined (reading 'getLayer')"
 *   which the Map RegionErrorBoundary catches and blanks the map region (the
 *   white screen). Guarding `getLayer` itself converts that into a safe no-op.
 *
 * `layerReady(map, id)` is the single safe replacement for `map.getLayer(id)`:
 * it returns true ONLY when the map exists, is not removed, its style is loaded,
 * AND the layer is present — so the subsequent setFilter/setPaintProperty/
 * setLayoutProperty call can never touch an undefined style.
 */

/** Minimal shape of the MapLibre map bits these guards touch. */
interface GuardableMap {
  _removed?: boolean;
  getStyle?: () => unknown;
  isStyleLoaded?: () => boolean;
  getLayer?: (id: string) => unknown;
}

/**
 * True only when it is safe to mutate `id` on `map`.
 * Replaces a bare `if (map.getLayer(id))` guard so a torn-down style or an
 * undefined map can never throw inside the setter.
 *
 * @param map - the MapLibre map (may be null/undefined mid-teardown)
 * @param id  - the layer id to mutate
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function layerReady(map: any, id: string): boolean {
  const m = map as GuardableMap | null | undefined;
  if (!m) return false;
  try {
    if (m._removed) return false;
    if (typeof m.getStyle !== 'function' || !m.getStyle()) return false;
    if (typeof m.isStyleLoaded === 'function' && !m.isStyleLoaded()) return false;
    return typeof m.getLayer === 'function' && !!m.getLayer(id);
  } catch {
    return false;
  }
}

/**
 * True when `id` exists on a live (non-removed) map — WITHOUT requiring
 * `isStyleLoaded()`. Use this to guard `map.setFilter(id, …)` calls that must run
 * during interaction (e.g. the year scrubber's per-layer time filters).
 *
 * WHY THIS EXISTS (the "everything but polities is frozen in time" bug, 2026-06-07):
 *   `layerReady()` additionally requires `map.isStyleLoaded() === true`. A heavy
 *   GeoJSON source (e.g. ~3,000 events) keeps `isStyleLoaded()` FALSE while it
 *   reprocesses, so every scrub-time `setFilter` guarded by `layerReady` was
 *   silently skipped — the layer's filter stayed frozen at the load year while the
 *   polity layers (guarded by a bare `getLayer`) updated correctly.
 *   `map.setFilter(id, …)` is safe whenever the layer object exists; it does not
 *   touch the not-yet-loaded style internals that `layerReady`'s strict check
 *   protects paint/layout setters against. So filter setters use this looser guard.
 *
 * Still teardown-safe: returns false when the map is null/removed or its style
 * object is gone, and never throws (the original white-screen protection).
 *
 * @param map - the MapLibre map (may be null/undefined mid-teardown)
 * @param id  - the layer id to mutate
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function layerExists(map: any, id: string): boolean {
  const m = map as GuardableMap | null | undefined;
  if (!m) return false;
  try {
    if (m._removed) return false;
    if (typeof m.getStyle !== 'function' || !m.getStyle()) return false;
    return typeof m.getLayer === 'function' && !!m.getLayer(id);
  } catch {
    return false;
  }
}

/**
 * True when the map is alive and its style is loaded (no specific layer needed).
 * For setters that call non-layer-scoped APIs (e.g. setPaintProperty on the
 * background, or source operations).
 *
 * @param map - the MapLibre map (may be null/undefined)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAlive(map: any): boolean {
  const m = map as GuardableMap | null | undefined;
  if (!m) return false;
  try {
    if (m._removed) return false;
    if (typeof m.getStyle !== 'function' || !m.getStyle()) return false;
    return typeof m.isStyleLoaded !== 'function' || m.isStyleLoaded();
  } catch {
    return false;
  }
}
