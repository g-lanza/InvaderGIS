/**
 * mapStabilityGuards.ts — map resize + WebGL context-loss guards (extracted from
 * useMapLifecycle.ts to keep that file under the 800-line cap).
 *
 * `installMapStabilityGuards` owns ALL of its own state (the ResizeObserver and the
 * canvas event listeners) and returns a single teardown function — so the lifecycle
 * hook no longer threads a `resizeObserver` ref through its closure. Call the returned
 * teardown in the hook's cleanup.
 *
 * Two concerns, both fixes for real crashes seen when the CSS grid the canvas lives
 * in reflows rapidly (inspector hide / fullscreen toggles):
 *
 *  1. Debounced, size-guarded resize. Resizing a 0×0 / display:none MapLibre canvas
 *     is what can drop the GL context, so we coalesce bursts into one rAF and skip
 *     resizing when the container has zero size or the map/style is gone.
 *
 *  2. WebGL context-loss recovery. A dropped context surfaces as a permanently blank
 *     white canvas with NO JS exception — neither React error boundaries nor
 *     window.onerror can catch it. We intercept the canvas events directly:
 *       · webglcontextlost   → preventDefault() so the browser will restore it.
 *       · webglcontextrestored → resize() so MapLibre repaints into the new context.
 *     This converts a fatal white screen into a brief, self-healing flicker.
 */

/** Minimal shape of the bits of a MapLibre map we touch here. */
interface GuardableMap {
  getCanvas(): HTMLCanvasElement | null | undefined;
  isStyleLoaded?: () => boolean;
  resize(): void;
  /** Force a repaint of the GL drawing buffer (MapLibre public API). */
  triggerRepaint?: () => void;
}

/** Options for installMapStabilityGuards. */
export interface MapStabilityGuardOptions {
  /** The container element the map canvas lives in (observed for resize). */
  container: HTMLElement;
  /** Returns the live map instance (may become null after teardown elsewhere). */
  getMap: () => GuardableMap | null;
  /** Returns true once the surrounding lifecycle has been cancelled/unmounted. */
  isCancelled: () => boolean;
}

/**
 * Install the resize observer + WebGL context-loss/restore handlers on `map`.
 * Returns a teardown function that disconnects the observer and removes the
 * canvas listeners. Safe to call teardown more than once.
 */
export function installMapStabilityGuards(
  map: GuardableMap,
  opts: MapStabilityGuardOptions,
): () => void {
  const { container, getMap, isCancelled } = opts;

  // ── Debounced, size-guarded resize ──────────────────────────────────────────
  let resizeRaf = 0;
  let styleRetryTimer = 0;
  const safeResize = () => {
    resizeRaf = 0;
    const m = getMap();
    if (!m || isCancelled()) return;
    // Bail if the map was removed or its style torn down — calling resize() then
    // makes MapLibre touch an undefined internal style (the crash we are fixing).
    // `_removed` is MapLibre-internal; guarded access, falls back safely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((m as any)._removed) return;
    let styleReady = false;
    try {
      styleReady = typeof m.isStyleLoaded === 'function' ? m.isStyleLoaded() : true;
    } catch {
      styleReady = false;
    }
    if (!styleReady) {
      // Style is mid-tear during a panel reflow. Schedule one retry after a short
      // delay — the fallback timer at 300ms covers most cases, but an early bail
      // here (before the fallback was scheduled) would leave the canvas blank.
      // Cap to one pending retry so we never queue a burst.
      if (styleRetryTimer === 0) {
        styleRetryTimer = window.setTimeout(() => {
          styleRetryTimer = 0;
          const mr = getMap();
          if (!mr || isCancelled()) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((mr as any)._removed) return;
          try { mr.resize(); mr.triggerRepaint?.(); } catch { /* ignore */ }
        }, 80);
      }
      return;
    }
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return; // hidden/transitioning — do not resize
    try {
      m.resize();
      // CRITICAL: resize() alone does not always repaint the GL drawing buffer
      // after a CSS grid-width transition — the buffer can be left blank, which
      // surfaces as a white map (the panel hide/fullscreen "white screen" bug).
      // Force a repaint into the freshly-sized buffer.
      m.triggerRepaint?.();
    } catch {
      /* transitional container can still throw inside MapLibre; swallow safely */
    }
  };

  // ── Fallback repaint timer ────────────────────────────────────────────────────
  // Guarantees one authoritative resize+repaint after the panel animation fully
  // settles, regardless of what happened during intermediate ResizeObserver firings.
  // Rescheduled on every ResizeObserver entry so it fires 300ms after the LAST
  // size change — well past the 200ms grid-template-columns transition.
  let fallbackTimer = 0;
  const scheduleFallback = () => {
    if (fallbackTimer !== 0) clearTimeout(fallbackTimer);
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = 0;
      // Force resize even if a previous safeResize bailed on an intermediate size.
      // At this point the transition is done; the container has its final size.
      const m = getMap();
      if (!m || isCancelled()) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((m as any)._removed) return;
      try {
        m.resize();
        m.triggerRepaint?.();
      } catch {
        /* ignore — map may have been removed */
      }
    }, 300);
  };

  const resizeObserver = new ResizeObserver(() => {
    // Always reschedule the fallback — even mid-animation — so it fires
    // 260ms after the LAST resize event (i.e. after the panel fully settles).
    scheduleFallback();
    // Coalesce rapid mid-animation firings into one rAF to avoid GL storms,
    // but still run safeResize on each rAF so the map updates during the slide.
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(safeResize);
  });
  resizeObserver.observe(container);
  // Also observe the grid-cell parent (.msa-map) — that is the element whose
  // size actually changes when a panel is hidden or fullscreened. The inner
  // container has width/height:100% so it follows, but the ResizeObserver fires
  // on the element being observed; observing only the child can miss the initial
  // size change if the child hasn't reflowed yet when the first callback fires.
  const gridCell = container.parentElement;
  if (gridCell) resizeObserver.observe(gridCell);

  // ── Final repaint after the CSS column-width transition completes ────────────
  // The grid columns (--layerrail-w / --dock-w) ANIMATE on collapse / fullscreen.
  // The ResizeObserver fires at intermediate widths DURING the transition; the
  // last rAF resize can land before the final width settles, leaving a stale or
  // blank buffer. A transitionend on the map container (or its ancestor grid)
  // guarantees one authoritative resize+repaint at the true final size.
  const onTransitionEnd = (e: TransitionEvent) => {
    // Pass through layout-affecting transitions. The shell collapses panels by
    // animating CSS custom properties (--dock-w, --layerrail-w) which fire
    // transitionend with propertyName === '--dock-w' or '' (browser-dependent).
    // The previous filter only matched 'width|grid|columns|transform|inline-size'
    // and silently dropped custom-property transitions, so the post-transition
    // repaint never happened — leaving the MapLibre buffer blank.
    const p = e.propertyName ?? '';
    if (p && !/width|grid|columns|transform|inline-size|--/.test(p)) return;
    if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(safeResize);
  };
  // Listen on the .msa-app ancestor (capture) so transitions on the grid element
  // — not just the map container itself — trigger the settle repaint.
  const transitionTarget: HTMLElement = container.closest('.msa-app') ?? container;
  transitionTarget.addEventListener('transitionend', onTransitionEnd, true);

  // ── WebGL context-loss guard ────────────────────────────────────────────────
  let canvas: HTMLCanvasElement | null = null;
  const onContextLost = (e: Event) => {
    e.preventDefault(); // tell the browser we will recover → it fires restored
    console.warn(
      '[mapStabilityGuards] WebGL context lost (likely a rapid container resize). ' +
        'Prevented default so the browser can restore it.',
    );
  };
  const onContextRestored = () => {
    console.warn('[mapStabilityGuards] WebGL context restored — repainting map.');
    try {
      const m = getMap();
      m?.resize();
      m?.triggerRepaint?.();
    } catch {
      /* resize on a transitional container can throw; safe to ignore */
    }
  };
  try {
    canvas = map.getCanvas() ?? null;
    if (canvas) {
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    }
  } catch {
    /* getCanvas() before first paint can throw on some builds; non-fatal */
  }

  // ── Teardown ────────────────────────────────────────────────────────────────
  return () => {
    if (resizeRaf !== 0) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
    }
    if (fallbackTimer !== 0) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    if (styleRetryTimer !== 0) {
      clearTimeout(styleRetryTimer);
      styleRetryTimer = 0;
    }
    try {
      resizeObserver.disconnect();
    } catch {
      /* ignore */
    }
    try {
      transitionTarget.removeEventListener('transitionend', onTransitionEnd, true);
    } catch {
      /* ignore */
    }
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      canvas = null;
    }
  };
}
