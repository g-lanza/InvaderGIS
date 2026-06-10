/**
 * mapInstance.ts — module-level singleton that holds the live MapLibre map.
 *
 * This exists so AppShell can call map.resize() directly when a panel is
 * hidden or fullscreened, without threading props or context through the
 * component tree. The ResizeObserver in mapStabilityGuards fires too late
 * (after the CSS transition has already shifted layout) causing MapLibre to
 * render at the wrong size and show a white canvas.
 *
 * useMapLifecycle sets this on boot and clears it on teardown.
 * AppShell reads it via resizeMap() at the moment of each panel toggle.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _map: any = null;

/** Called by useMapLifecycle once the map is ready. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setMapInstance(map: any): void {
  _map = map;
}

/** Called by useMapLifecycle on teardown. */
export function clearMapInstance(): void {
  _map = null;
}

/**
 * Force MapLibre to measure its container and repaint.
 * Safe to call at any time — no-ops if the map isn't ready.
 * Call this immediately after any layout change (panel hide/fullscreen).
 */
export function resizeMap(): void {
  if (!_map) return;
  try {
    if (_map._removed) return;
    _map.resize();
    _map.triggerRepaint?.();
  } catch {
    /* map may be mid-teardown — safe to ignore */
  }
}
