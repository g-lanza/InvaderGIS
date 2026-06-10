/**
 * SourcesOverlay.tsx — full-screen overlay container for SourcesLibrary.
 *
 * Mirrors NetworkOverlay / LineageOverlay / CompareOverlay exactly:
 *   - position: fixed over the map area, leaving TopBar/TimeRail/StatusBar visible.
 *   - z-index 50 — same layer as the other three overlays.
 *   - Hidden via opacity + pointer-events when closed; stays mounted so sort/filter
 *     state is preserved across open/close cycles.
 *   - Focuses the close button on open (keyboard accessibility).
 *   - Escape key closes.
 *
 * Exports:
 *   SourcesOverlay      — the overlay component (props: open, onClose)
 *   useSourcesOverlay   — boolean toggle hook returning { open, toggle, close }
 *
 * Phase 5-c — Sources Library (registers builder).
 */

import { useRef, useEffect } from 'react';
import { useFocusTrap } from '@/components/useFocusTrap';

// useSourcesOverlay() lives in './useSourcesOverlay' (own module for React.lazy).
// No re-export — hook + component co-export breaks React Fast Refresh.
import { SourcesLibrary } from './SourcesLibrary';

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props consumed by AppShell to wire the TopBar sources toggle. */
export interface SourcesOverlayProps {
  /**
   * Whether the overlay is currently open. Controlled by the parent
   * (AppShell passes the value; TopBar mutates it via the toggle callback).
   */
  open: boolean;
  /** Called when the user closes the overlay (close button or Escape). */
  onClose: () => void;
  /**
   * Source id to focus when opened via a claim-citation deep link
   * (`#page=sources&item=<id>`). SourcesLibrary selects + scrolls to it. Null = none.
   */
  focusId?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Full-screen overlay containing the SourcesLibrary table.
 *
 * Renders at all times but is hidden via CSS (`aria-hidden`, `opacity: 0`,
 * `pointer-events: none`) when `open` is false. This keeps the SourcesLibrary
 * mounted so sort/filter state is preserved across open/close cycles.
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to invoke when the user closes the overlay.
 */
export function SourcesOverlay({ open, onClose, focusId = null }: SourcesOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when opening so keyboard users can Escape out.
  // Mirrors NetworkOverlay / LineageOverlay exactly.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape key closes the overlay — mirrors NetworkOverlay / LineageOverlay.
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
      className={`sources-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Sources library view"
      role="dialog"
      aria-modal="true"
    >
      {/* Header bar — mirrors network-overlay__bar / lineage-overlay__bar */}
      <div className="sources-overlay__bar">
        <span className="sources-overlay__title">Sources Library</span>
        <span className="sources-overlay__hint" aria-hidden="true">
          52 records · click row to inspect · click header to sort
        </span>
        <button
          ref={closeRef}
          className="btn btn--ghost btn--icon sources-overlay__close"
          onClick={onClose}
          aria-label="Close sources library view"
          title="Close sources (Escape)"
        >
          ✕
        </button>
      </div>

      {/* Library canvas — fills the remaining height */}
      <div className="sources-overlay__canvas">
        <SourcesLibrary focusId={focusId} />
      </div>
    </div>
  );
}

// ── Controller hook ───────────────────────────────────────────────────────────
// useSourcesOverlay is defined in ./useSourcesOverlay.ts and re-exported above
// for back-compat. Nothing to define here.
