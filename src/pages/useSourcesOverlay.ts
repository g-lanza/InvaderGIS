/**
 * useSourcesOverlay — simple boolean toggle hook for the SourcesOverlay open/close state.
 *
 * Extracted from SourcesOverlay.tsx so AppShell can import this tiny hook eagerly
 * while lazy-loading the heavy SourcesOverlay component (+ SourcesLibrary) on demand.
 *
 * Returns `{ open, toggle, close }` so TopBar can call `toggle()` on button click
 * and AppShell can pass `open` and `close` to `<SourcesOverlay />`.
 *
 * Kept outside any global store — purely local UI state, no frozen interface
 * impact, no serialization need. Mirrors useNetworkOverlay / useLineageOverlay.
 *
 * @returns - open flag, toggle function, close function.
 */
import { useState, useCallback } from 'react';

export function useSourcesOverlay(): {
  open: boolean;
  /** The source id a deep-link asked to focus (e.g. from a claim footnote), or null. */
  targetId: string | null;
  toggle: () => void;
  close: () => void;
  /** Open the overlay and focus a specific source record (footnote → Sources page). */
  openTo: (id: string) => void;
} {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close  = useCallback(() => { setOpen(false); setTargetId(null); }, []);
  const openTo = useCallback((id: string) => { setTargetId(id); setOpen(true); }, []);
  return { open, targetId, toggle, close, openTo };
}
