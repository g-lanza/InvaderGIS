/**
 * useSavedViewsOverlay — boolean toggle hook for the SavedViewsPanel open state.
 *
 * Mirrors useCompareOverlay / useSourcesOverlay exactly: a tiny useState +
 * useCallback module so AppShell can import the hook eagerly while lazy-loading
 * the heavier SavedViewsPanel component on first open.
 *
 * Purely local UI state — no frozen-store impact, no serialization need.
 *
 * @returns - open flag, toggle function, close function.
 */
import { useState, useCallback } from 'react';

export function useSavedViewsOverlay(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
