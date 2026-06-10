/**
 * useUploadOverlay — boolean toggle hook for the Upload / My Data overlay.
 *
 * Mirrors useCompareOverlay / useSourcesOverlay exactly so AppShell can import
 * this tiny hook eagerly while lazy-loading the heavy UploadOverlay component on
 * first open. Purely local UI state — no frozen store impact.
 *
 * Returns `{ open, toggle, close }`. AppShell passes `open`/`close` to the
 * overlay and `toggle` to TopBar's "My Data" button.
 *
 * Phase: Wave2-A (additive).
 */
import { useState, useCallback } from 'react';

export function useUploadOverlay(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
