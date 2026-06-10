/**
 * useNetworkOverlay — simple boolean toggle hook for the NetworkOverlay open/close state.
 *
 * Extracted from NetworkOverlay.tsx so AppShell can import this tiny hook eagerly
 * while lazy-loading the heavy NetworkOverlay component (+ NetworkGraph) on demand.
 *
 * Returns `{ open, toggle, close }` so TopBar can call `toggle()` on button click
 * and AppShell can pass `open` and `close` to `<NetworkOverlay />`.
 *
 * Kept outside any global store — purely local UI state, no frozen interface
 * impact, no serialization need.
 *
 * @returns - open flag, toggle function, close function.
 */
import { useState, useCallback } from 'react';

export function useNetworkOverlay(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle  = useCallback(() => setOpen((prev) => !prev), []);
  const close   = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
