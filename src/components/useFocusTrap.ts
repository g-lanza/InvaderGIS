/**
 * useFocusTrap — keyboard focus-trap for modal overlays (Wave 4B).
 *
 * When `active` is true, Tab and Shift+Tab cycle only within focusable
 * descendants of `containerRef`. Focus is also moved into the container
 * on activation and returned to `returnFocusRef` (the trigger element) on
 * deactivation.
 *
 * Design decisions:
 *   - Only runs when `active` is true — zero cost when the overlay is closed.
 *   - Uses a keydown listener on the container (`capture: false`) so native
 *     browser Tab ordering within the container is preserved; we only
 *     intercept at the boundary (first/last focusable element).
 *   - Focus restore is deferred by one rAF so CSS transitions have started
 *     before focus leaves the overlay (prevents flash of wrong outline).
 *
 * Focusable selector follows WICG/inert draft + browser compat:
 *   a[href], button:not(:disabled), input:not(:disabled),
 *   select:not(:disabled), textarea:not(:disabled),
 *   [tabindex]:not([tabindex="-1"]), details > summary
 *
 * @module useFocusTrap
 */

import { useEffect, useRef } from 'react';

/** CSS selector for all natively focusable elements. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"]), details > summary';

/**
 * Return a sorted array of all focusable descendants of `root`,
 * filtered by visibility (offsetParent !== null or display check).
 */
function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.closest('[aria-hidden="true"]') &&
      (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement),
  );
}

/**
 * Activate a keyboard focus trap for a modal overlay.
 *
 * @param containerRef  - Ref to the overlay's root DOM element.
 * @param active        - Whether the overlay is currently open/visible.
 * @param returnFocusTo - Optional ref to the element that triggered the overlay;
 *                        focus returns here when `active` becomes false.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  returnFocusTo?: React.RefObject<HTMLElement | null>,
): void {
  // Track the element that had focus when the trap activated, so we can
  // return focus there even when no returnFocusTo ref is provided.
  const savedFocusRef = useRef<HTMLElement | null>(null);

  // ── Capture + restore focus ─────────────────────────────────────────────

  useEffect(() => {
    if (!active) {
      // Restore focus when deactivated
      const target = returnFocusTo?.current ?? savedFocusRef.current;
      if (target) {
        // Defer by one frame so CSS transitions have started
        const id = requestAnimationFrame(() => target.focus());
        return () => cancelAnimationFrame(id);
      }
      return;
    }

    // Capture current focus before we move into the trap
    savedFocusRef.current = document.activeElement as HTMLElement | null;
  }, [active, returnFocusTo]);

  // ── Tab cycling ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = getFocusable(container!);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (active === first || !container!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (active === last || !container!.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [active, containerRef]);
}
