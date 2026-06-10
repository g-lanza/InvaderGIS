/**
 * useLineageOverlay — simple boolean toggle hook for the LineageOverlay open/close state.
 *
 * Extracted from LineageOverlay.tsx so AppShell can import this tiny hook eagerly
 * while lazy-loading the heavy LineageOverlay component (+ LineageGantt) on demand.
 *
 * Returns `{ open, setOpen, toggle, close }` so TopBar can call `toggle()` on
 * button click and AppShell can pass `open` and `close` to `<LineageOverlay />`.
 *
 * Kept outside any global store — purely local UI state, no frozen interface
 * impact, no serialization need. Mirrors useNetworkOverlay exactly.
 *
 * @returns - open flag, setOpen setter, toggle function, close function.
 */
import { useState, useCallback } from 'react';

export function useLineageOverlay(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close  = useCallback(() => setOpen(false), []);
  return { open, setOpen, toggle, close };
}
