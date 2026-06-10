/**
 * useUrlState — two-way bind the compact view state to the URL hash.
 *
 * On mount (once): if the hash carries view keys (year/theme/map/proj/sel), hydrate
 * the stores from it via applyCapturedState — so a shared/bookmarked link restores
 * that view. Then continuously: write the live view state back to the hash
 * (rAF-coalesced) as the user scrubs the year, switches theme/map/projection, or
 * pins a record — so the URL is always a shareable permalink of the current view.
 *
 * Reuses captureCurrentState/applyCapturedState from savedViewsStore (the same
 * frozen-store orchestration Saved Views uses) and composeHash() so the sources
 * footnote deep-link (#page=sources&item=…) is never clobbered.
 *
 * Subscribes via each store's vanilla `.subscribe` (zustand) — no extra renders.
 */

import { useEffect } from 'react';
import {
  captureCurrentState,
  applyCapturedState,
} from '@/stores/savedViewsStore';
import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSelectionStore } from '@/stores/selectionStore';
import {
  decodeHashToView,
  mergeViewIntoCaptured,
  composeHash,
  type UrlViewState,
} from './urlState';

/** Page-load-scoped guard: hydrate the view from the URL hash exactly once,
 *  surviving React StrictMode's dev double-mount (a component ref would not). */
let hydratedOnce = false;

function currentUrlView(): UrlViewState {
  const c = captureCurrentState();
  return {
    year: c.year,
    theme: c.theme,
    mapType: c.mapType,
    projection: c.projection,
    selectedId: c.selectedId,
    selectedType: c.selectedType,
  };
}

/**
 * Bind view state <-> URL hash. Call once, high in the tree (AppShell).
 * @param enabled - gate hydration until the dataset has loaded, so applyCapturedState
 *   has real bounds to clamp the year against (pass recordsReady).
 */
export function useUrlState(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    // 1) Hydrate from the hash ONCE per page load, synchronously, before arming the
    //    writer — so the writer never persists the pre-hydration state. The guard is
    //    MODULE-scoped (not a ref) so React 18 StrictMode's dev double-mount can't
    //    run hydration twice or, worse, let the throwaway remount skip the real one.
    if (!hydratedOnce) {
      hydratedOnce = true;
      const partial = decodeHashToView(window.location.hash);
      if (partial) {
        applyCapturedState(mergeViewIntoCaptured(captureCurrentState(), partial));
      }
    }

    // 2) Write live view state back to the hash, coalesced to one rAF per burst.
    let frame = 0;
    const write = () => {
      frame = 0;
      const next = composeHash(window.location.hash, currentUrlView());
      const target = `${window.location.pathname}${window.location.search}#${next}`;
      if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        history.replaceState(null, '', target);
      }
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };

    const unsubs = [
      useTimeStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
      useSelectionStore.subscribe(schedule),
    ];
    // Write once so a fresh load with no hash still gets a shareable URL.
    schedule();

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      for (const u of unsubs) u();
    };
  }, [enabled]);
}
