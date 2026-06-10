/**
 * UploadOverlay.tsx — full-screen overlay hosting ImportDialog + UploadPanel.
 *
 * Mirrors SourcesOverlay / NetworkOverlay exactly:
 *   · position: fixed over the map area (TopBar/TimeRail/StatusBar stay visible).
 *   · z-index 50 — same layer as the other overlays.
 *   · Hidden via opacity + pointer-events when closed; stays mounted so import
 *     preview / list scroll state persist across open/close cycles.
 *   · Focuses the close button on open; Escape closes.
 *
 * On first open it triggers uploadStore.hydrate() so persisted datasets load
 * from IndexedDB lazily (no IndexedDB read in the initial app boot path).
 *
 * Phase: Wave2-A (additive).
 */

import { useEffect, useRef } from 'react';
import { ImportDialog } from './ImportDialog';
import { UploadPanel } from './UploadPanel';
import { useUploadStore } from './uploadStore';
import { useFocusTrap } from '@/components/useFocusTrap';

/** Props consumed by AppShell to wire the TopBar "My Data" toggle. */
export interface UploadOverlayProps {
  /** Whether the overlay is currently open (controlled by AppShell). */
  open: boolean;
  /** Called when the user closes the overlay (close button or Escape). */
  onClose: () => void;
}

/**
 * Full-screen overlay containing the import dialog (left) and the dataset list
 * (right). Two-column on wide viewports; stacks on narrow ones via CSS.
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to close the overlay.
 */
export function UploadOverlay({ open, onClose }: UploadOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hydrate = useUploadStore((s) => s.hydrate);

  // Lazily read persisted datasets from IndexedDB the first time the user opens
  // the overlay. hydrate() is idempotent (guards on the hydrated flag).
  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  // Focus the close button on open (keyboard accessibility) — mirrors siblings.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape closes — mirrors SourcesOverlay.
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
      className={`upload-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="My data — upload and manage your datasets"
      role="dialog"
      aria-modal="true"
    >
      <div className="upload-overlay__bar">
        <span className="upload-overlay__title">My Data</span>
        <span className="upload-overlay__hint" aria-hidden="true">
          your data stays in this browser · never uploaded
        </span>
        <button
          ref={closeRef}
          className="btn btn--ghost btn--icon upload-overlay__close"
          onClick={onClose}
          aria-label="Close my data view"
          title="Close (Escape)"
        >
          ✕
        </button>
      </div>

      <div className="upload-overlay__body">
        <div className="upload-overlay__col upload-overlay__col--import">
          <h2 className="upload-overlay__heading">Import</h2>
          <ImportDialog />
        </div>
        <div className="upload-overlay__col upload-overlay__col--list">
          <h2 className="upload-overlay__heading">Datasets</h2>
          <UploadPanel />
        </div>
      </div>
    </div>
  );
}
