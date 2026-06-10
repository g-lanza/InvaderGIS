/**
 * useIsMobile — reactive phone-viewport detector.
 *
 * Returns true when the viewport is at or below the mobile breakpoint
 * (matches atlas-shell.css `--bp-mobile: 600px`). Backed by matchMedia so it
 * updates on rotation / resize / the browser entering or leaving the breakpoint,
 * and it is SSR-safe (defaults to false when `window` is unavailable).
 *
 * The app branches its entire shell on this: desktop renders the six-region
 * grid (AppShell), phones render a purpose-built full-bleed map + bottom drawer
 * (MobileShell). The two are genuinely different layouts, not one scaled down.
 *
 * @module useIsMobile
 */

import { useEffect, useState } from 'react';

/** Matches atlas-shell.css `--bp-mobile`. */
export const MOBILE_QUERY = '(max-width: 600px)';

function readMatch(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(readMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (): void => setIsMobile(mql.matches);
    // Sync once in case the breakpoint changed between initial state and mount.
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
