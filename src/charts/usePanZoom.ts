/**
 * usePanZoom — touch + pointer pan/pinch for an SVG content group.
 *
 * Returns an SVG `transform` string (`translate(x y) scale(k)`) plus a set of
 * pointer-event handlers to spread onto the SVG element. One finger pans; two
 * fingers pinch-zoom around their midpoint. A mouse can pan by drag and zoom via
 * the wheel. The transform is applied to a wrapper `<g>` so the chart content is
 * moved/scaled without re-laying-out anything — the SVG already fits its
 * container via viewBox + preserveAspectRatio; this only adds an interactive
 * transform layer on top.
 *
 * Compositor-friendly (transform only). Desktop click/hover handlers on child
 * nodes keep working because a click without movement produces no pan.
 *
 * Usage:
 *   const { transform, handlers, reset } = usePanZoom();
 *   <svg {...handlers} style={{ touchAction: 'none' }}>
 *     <g transform={transform}>… chart content …</g>
 *   </svg>
 *
 * @module charts/usePanZoom
 */

import { useCallback, useRef, useState } from 'react';

/** Clamp the zoom factor to a sane range. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

interface PanZoomState {
  x: number;
  y: number;
  k: number;
}

interface ActivePointer {
  x: number;
  y: number;
}

export interface PanZoomApi {
  /** SVG transform string for the content `<g>`. */
  transform: string;
  /** Pointer/wheel handlers to spread onto the SVG element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
  /** Reset to the identity transform. */
  reset: () => void;
}

const IDENTITY: PanZoomState = { x: 0, y: 0, k: 1 };

function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

export function usePanZoom(): PanZoomApi {
  const [state, setState] = useState<PanZoomState>(IDENTITY);

  // Live pointer map (id → position) for multi-touch tracking.
  const pointers = useRef<Map<number, ActivePointer>>(new Map());
  // Distance between the two pointers at the start of a pinch.
  const pinchStart = useRef<{ dist: number; k: number } | null>(null);
  // Last single-pointer position for panning.
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  // Where a single-pointer gesture began, used to detect a real drag vs a tap.
  const downAt = useRef<{ x: number; y: number; id: number } | null>(null);
  // Whether the current single-pointer gesture has crossed the drag threshold.
  const dragging = useRef(false);

  /** Movement (px) before a single-pointer drag counts as a pan (not a tap).
      Below this, the pointer is NOT captured so child node clicks still fire. */
  const DRAG_THRESHOLD = 6;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      downAt.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      lastPan.current = { x: e.clientX, y: e.clientY };
      dragging.current = false;
      // NOTE: no pointer capture here — a tap must reach the node beneath.
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setState((s) => {
        pinchStart.current = { dist, k: s.k };
        return s;
      });
      // Pinch supersedes panning; capture both pointers to the SVG.
      for (const id of pointers.current.keys()) {
        (e.currentTarget as Element).setPointerCapture?.(id);
      }
      lastPan.current = null;
      dragging.current = false;
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      // Pinch: scale by the ratio of current to starting finger distance.
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / (pinchStart.current.dist || 1);
      const nextK = clampScale(pinchStart.current.k * ratio);
      setState((s) => ({ ...s, k: nextK }));
      return;
    }

    if (pointers.current.size === 1 && lastPan.current) {
      // Defer real panning (and pointer capture) until the drag threshold is
      // crossed, so a tap-without-movement still reaches the node beneath.
      if (!dragging.current && downAt.current) {
        const moved = Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y);
        if (moved < DRAG_THRESHOLD) return;
        dragging.current = true;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      lastPan.current = { x: e.clientX, y: e.clientY };
      setState((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
    }
  }, []);

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      lastPan.current = { x: only.x, y: only.y };
    } else if (pointers.current.size === 0) {
      lastPan.current = null;
      downAt.current = null;
      dragging.current = false;
    }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Mouse-wheel zoom (desktop). Trackpad pinch arrives here too (ctrlKey).
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setState((s) => ({ ...s, k: clampScale(s.k * factor) }));
  }, []);

  const reset = useCallback(() => setState(IDENTITY), []);

  const transform = `translate(${state.x} ${state.y}) scale(${state.k})`;

  return {
    transform,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onWheel,
    },
    reset,
  };
}
