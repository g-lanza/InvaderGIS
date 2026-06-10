/**
 * LineageOverlay.tsx — full-screen-over-map overlay container for LineageGantt.
 *
 * Mirror of NetworkOverlay.tsx (P4-A) — same layout strategy, same hook shape,
 * same accessibility pattern. See NetworkOverlay.tsx for the architecture rationale.
 *
 * Layout: `position: fixed` over the `.msa-map` grid area, leaving TopBar,
 * TimeRail, and StatusBar visible. z-index 50 — same as NetworkOverlay; only
 * one overlay is open at a time (enforced by separate toggle buttons in TopBar).
 *
 * The Gantt stays mounted and hidden when closed so the layout (useMemo) does not
 * recompute on reopen. Closing the overlay does not clear the selection store.
 */

import { useRef, useEffect } from 'react';
import { LineageGantt } from './LineageGantt';
import { useFocusTrap } from '@/components/useFocusTrap';

// useLineageOverlay() lives in './useLineageOverlay' (own module for React.lazy).
// No re-export — hook + component co-export breaks React Fast Refresh.

/** Props consumed by AppShell to wire the TopBar lineage toggle. */
export interface LineageOverlayProps {
  /**
   * Whether the overlay is currently open. Controlled by the parent
   * (AppShell passes the value; TopBar mutates it via the toggle callback).
   */
  open: boolean;
  /** Called when the user closes the overlay (close button or Escape). */
  onClose: () => void;
}

/**
 * Full-screen overlay containing the LineageGantt.
 *
 * Renders at all times but is hidden via CSS (`aria-hidden`, `opacity: 0`,
 * `pointer-events: none`) when `open` is false. This keeps the Gantt mounted
 * so its layout memo is preserved across open/close cycles.
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to invoke when the user closes the overlay.
 */
export function LineageOverlay({ open, onClose }: LineageOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus close button when opening (mirrors NetworkOverlay)
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape key closes the overlay (mirrors NetworkOverlay)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap: keep Tab within the overlay while open; restore on close
  useFocusTrap(overlayRef, open);

  return (
    <div
      ref={overlayRef}
      className={`lineage-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Ruler lineage view"
      role="dialog"
      aria-modal="true"
    >
      {/* Header bar */}
      <div className="lineage-overlay__bar">
        <span className="lineage-overlay__title">Ruler Lineage</span>
        <div className="lineage-overlay__meta" aria-label="Chart statistics">
          <span className="lineage-overlay__hint" aria-hidden="true">
            ── solid bar = fixed reign · dashed = open-ended · line = succession
          </span>
        </div>
        <button
          ref={closeRef}
          className="btn btn--ghost btn--icon lineage-overlay__close"
          onClick={onClose}
          aria-label="Close ruler lineage view"
          title="Close lineage (Escape)"
        >
          ✕
        </button>
      </div>

      {/* Gantt canvas */}
      <div className="lineage-overlay__canvas">
        <LineageGantt />
      </div>
    </div>
  );
}

// ── Controller hook ───────────────────────────────────────────────────────────
// useLineageOverlay is defined in ./useLineageOverlay.ts and re-exported above
// for back-compat. Nothing to define here.
