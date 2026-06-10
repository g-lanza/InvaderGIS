/**
 * useCompareOverlay — simple boolean toggle hook for the CompareOverlay open/close state.
 *
 * Extracted from CompareOverlay.tsx so AppShell can import this tiny hook eagerly
 * while lazy-loading the heavy CompareOverlay component (+ CompareTable, Storyline)
 * on demand.
 *
 * Mirrors useNetworkOverlay exactly. Returns `{ open, toggle, close }`.
 * AppShell passes `open`/`close` to `<CompareOverlay/>` and `toggle` to TopBar.
 *
 * Purely local UI state — no frozen store impact, no serialization need.
 */
import { useState, useCallback } from 'react';

export function useCompareOverlay(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close  = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}
