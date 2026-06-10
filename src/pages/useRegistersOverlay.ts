/**
 * useRegistersOverlay — boolean toggle hook for the RegistersOverlay open/close state.
 *
 * Extracted into its OWN module (mirrors useSourcesOverlay / useNetworkOverlay) so
 * AppShell can import this tiny hook eagerly while lazy-loading the heavier
 * RegistersOverlay component (+ AttributeTable + registerSchemas) on first open.
 *
 * Returns `{ open, toggle, close }` so TopBar can call `toggle()` on button click
 * and AppShell can pass `open` and `close` to `<RegistersOverlay />`.
 *
 * Kept outside any global store — purely local UI state, no frozen interface
 * impact, no serialization need.
 *
 * @returns - open flag, toggle function, close function.
 *
 * Phase Wave2-B — Attribute Table registers (ArcGIS FeatureTable convention).
 */
import { useState, useCallback } from 'react';

export function useRegistersOverlay(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
