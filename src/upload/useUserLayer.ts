/**
 * useUserLayer.ts — registration hook that paints user datasets on the map.
 *
 * This is the ONE seam MapCanvas uses to render user-uploaded data. It owns all
 * the MapLibre wiring (add source/layer, setData on change, time + theme + the
 * single merged visibility) so MapCanvas only adds one guarded hook call. When
 * the user has uploaded nothing, the hook does nothing observable — the source
 * stays empty and no layers paint (honest no-op, per scope guard).
 *
 * ── Inputs ──────────────────────────────────────────────────────────────────────
 *   map   — the live MapLibre Map (or null while booting).
 *   ready — true once the map style has loaded (MapCanvas state.phase === 'ready').
 *
 * ── Stores read (no writes) ─────────────────────────────────────────────────────
 *   uploadStore  → datasets, visibleIds (additive store — not frozen).
 *   timeStore    → year (frozen, read-only).
 *   settingsStore→ theme (frozen, read-only).
 *
 * Theme reactivity reads the live `--accent` token via getComputedStyle, matching
 * MapCanvas's readMapTokens approach (no hardcoded hex).
 *
 * Phase: Wave2-A (additive — new hook, frozen stores read-only).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUploadStore } from './uploadStore';
import { mergeVisibleDatasets } from './userDatasetGeoJson';
import {
  addUserLayer,
  setUserAccent,
  setUserData,
  setUserTimeFilter,
  setUserVisibility,
} from './userLayer';

/** Read the live `--accent` CSS token; fallback keeps the layer paintable. */
function readAccent(): string {
  if (typeof window === 'undefined') return '#c19a3e';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  return v !== '' ? v : '#c19a3e';
}

/**
 * Wire the user-data layer into a live map. Safe to call every render; effects
 * guard on `ready` and on the presence of records.
 *
 * @param map   - The live MapLibre Map instance, or null while loading.
 * @param ready - Whether the map style has finished loading.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useUserLayer(map: any, ready: boolean): void {
  const datasets = useUploadStore((s) => s.datasets);
  const visibleIds = useUploadStore((s) => s.visibleIds);
  const year = useTimeStore((s) => s.year);
  const theme = useSettingsStore((s) => s.theme);

  // Whether the layers have been added to the current map yet.
  const addedRef = useRef(false);

  // Merge visible datasets into one FeatureCollection. Recomputed only when the
  // dataset set or visibility changes.
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const collection = useMemo(
    () => mergeVisibleDatasets(datasets, visibleSet),
    [datasets, visibleSet],
  );

  // If the map instance changes (style reload), reset the added flag so layers
  // are re-registered against the new style.
  useEffect(() => {
    addedRef.current = false;
  }, [map, ready]);

  // Add the source/layers once the map is ready, then keep their data in sync.
  useEffect(() => {
    if (!ready || !map || typeof map.isStyleLoaded !== 'function') return;
    if (!map.isStyleLoaded()) return;

    if (!addedRef.current) {
      // Add even when empty: an empty source is valid and lets later uploads
      // appear without a second registration path.
      addUserLayer(map, collection, readAccent(), year, true);
      addedRef.current = true;
    } else {
      setUserData(map, collection);
    }
    // The merged collection already reflects visibility, but keep the layer
    // itself visible whenever there is at least one feature.
    setUserVisibility(map, collection.features.length > 0);
  }, [map, ready, collection, year]);

  // Time scrub → update filter.
  useEffect(() => {
    if (!ready || !map) return;
    setUserTimeFilter(map, year);
  }, [map, ready, year]);

  // Theme change → refresh accent color.
  useEffect(() => {
    if (!ready || !map) return;
    setUserAccent(map, readAccent());
  }, [map, ready, theme]);
}
