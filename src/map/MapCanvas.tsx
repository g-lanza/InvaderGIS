/**
 * MapCanvas — the real MapLibre map renderer for InvaderGIS (Spine 2c-ii).
 *
 * Renders the baked medieval polity polygons on screen, time-scoped and
 * region-tinted, for the first time. Built fresh — not ported from any other app.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * 1. MapLibre GL is dynamically imported via useMapLifecycle (lazy chunk).
 *    The initial bundle contains only this thin React wrapper.
 * 2. Base style: background layer only (--map-sea token). No external tile
 *    provider — docs/03 tile licensing is unresolved (DESIGN.md law).
 * 3. Polity polygons come from /data/layers/polities.geojson (baked, read-only).
 *    Two layers are added:
 *      - polities-fill   : region-tinted fill via data-driven match expression
 *      - polities-outline: hairline border ("hand-drawn coastline weight", DESIGN.md)
 * 4. Time-scoping: filter updated on year change via throttled effect.
 *    Computes the "closest snapshot ≤ year within formed..dissolved" per polity.
 * 5. Theme reactivity: paint properties updated on theme change by re-reading
 *    the live --map-* CSS tokens and rebuilding the region match expression.
 * 6. Layer toggle: respects layersStore.layers.polities.visible.
 * 7. Click → selectionStore.select(id, 'polity').
 *
 * ── Stores (frozen, read-only) ────────────────────────────────────────────────
 *   timeStore      → year
 *   settingsStore  → theme
 *   layersStore    → layers.polities.visible
 *   selectionStore → select()
 *
 * ── Write scope ───────────────────────────────────────────────────────────────
 *   src/map/ only. AppShell minimally edited (import swap). main.tsx has the
 *   eager maplibre import removed. No store edits, no style edits.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLayersStore, type LayerId } from '@/stores/layersStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useFilterStore } from '@/stores/filterStore';
import { buildFilterMapExpression } from '@/data/filterPredicate';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { readMapTokens } from './mapTokens';
import { buildRegionMatchExpression } from './regionExpression';
import { computeActiveSnapshotYears, buildTimeFilter, activeSnapshotYearForPolity } from './timeFilter';
import type { PolityFilterProps } from './timeFilter';
import { useMapLifecycle } from './useMapLifecycle';
import { useMapInteractions } from './useMapInteractions';
import {
  setEventsCategoryFilter,
  setEventsVisibility,
  setEventsOpacity,
  setEventsCategoryColors,
} from './eventsLayer'; // P3-B/C: events layer time-filter + visibility (click wiring → useMapInteractions)
import { useEventFilterStore } from '@/stores/eventFilterStore';
import {
  setJourneysTimeFilter,
  setJourneysVisibility,
  setJourneysKindColors,
  setJourneysOpacity,
} from './journeysLayer'; // Wave1-A: journeys layer time-filter + visibility + theme
import {
  setCapitalsTimeFilter,
  setCapitalsVisibility,
  setCapitalsColors,
  setCapitalsOpacity,
} from './capitalsLayer';
import {
  setSettlementsTimeFilter,
  setSettlementsVisibility,
  setSettlementsColors,
  setSettlementsOpacity,
} from './settlementsLayer';
import { setMilitaryTimeFilter, setMilitaryVisibility, setMilitaryColors, setMilitaryOpacity } from './militaryLayer';
import { setTradeTimeFilter, setTradeVisibility, setTradeColors, setTradeOpacity } from './tradeLayer';
import { setCartogramTimeFilter, setCartogramVisibility, setCartogramOpacity, setCartogramColors } from './cartogramLayer';
import {
  setRelationshipsTimeFilter,
  setRelationshipsVisibility,
  setRelationshipsOpacity,
  setRelationshipsColors,
} from './relationshipsLayer';
import {
  setHeatmapTimeFilter,
  setHeatmapVisibility,
  setHeatmapOpacity,
} from './heatmapLayer';
import { MapControls } from './MapControls'; // Phase 5-g: GIS chrome overlay
import { HoverAnnotation } from './HoverAnnotation';
// Wave2-A: user-uploaded datasets layer. This hook owns ALL its own MapLibre
// wiring and no-ops when the user has uploaded nothing — a single guarded
// addition that never affects the medieval layers.
import { useUserLayer } from '@/upload/useUserLayer';

// ── Constants ──────────────────────────────────────────────────────────────────

const FILL_LAYER_ID = 'polities-fill';
const HATCH_LAYER_ID = 'polities-hatch';
const OUTLINE_LAYER_ID = 'polities-outline';
const SELECTED_LAYER_ID = 'polities-selected';

/** Minimum ms between time-filter re-applications on year scrub.
 *  Keeps filter computation cheap with 3,149 features while staying
 *  at the ≤100 ms chronoscope repaint budget (docs/00 §3). Matched to the
 *  REG playback step rate (one year / 100 ms = 10 yr/s) so each played year
 *  gets its own throttle window and none are collapsed away. */
const FILTER_THROTTLE_MS = 100;

/**
 * Safe readiness check for a MapLibre map before calling any style/layer method.
 *
 * THE WHITE-SCREEN FIX. During a panel hide/fullscreen reflow (or a WebGL context
 * blip) the map can momentarily have no style. In that window MapLibre's own
 * `isStyleLoaded()` / `getLayer()` THROW internally ("There is no style added to
 * the map" → "Cannot read properties of undefined (reading 'getLayer')"). Those
 * throws fire from React effects and escaped to a blank white screen.
 *
 * The previous guard `if (!map || !map.isStyleLoaded()) return;` was itself the
 * throw site, because isStyleLoaded() throws on a torn-down map. This helper wraps
 * every check in try/catch and also tests `_removed` and `getStyle()`, so a
 * transient bad state becomes a safe `false` (the effect no-ops and re-runs later)
 * instead of an uncaught exception.
 *
 * @param map - the MapLibre map instance (or null)
 * @returns true only when it is safe to call getLayer/setFilter/setPaintProperty
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMapReady(map: any): boolean {
  if (!map) return false;
  try {
    if (map._removed) return false;
    if (typeof map.getStyle !== 'function' || !map.getStyle()) return false;
    return map.isStyleLoaded();
  } catch {
    return false;
  }
}

/**
 * Looser liveness check: map exists, isn't removed, and its style OBJECT is
 * present — but does NOT require isStyleLoaded() to be true. Mirrors
 * mapGuards.layerExists: a heavy GeoJSON source (events 5061, settlements 4077,
 * …) keeps isStyleLoaded() FALSE while it reprocesses, and toggling such a layer
 * on triggers exactly that reprocessing. The per-layer setFilter/visibility
 * setters are themselves teardown-safe (they guard with layerExists internally),
 * so a setter called in that window is safe — only the STRICT isMapReady gate was
 * wrongly skipping it, which left a freshly-toggled layer frozen at its boot-year
 * filter (invisible until a second toggle once the style settled). Use this guard
 * for the toggle-on re-apply path so the layer shows the first time. Callers must
 * still wrap mutations in try/catch for the reflow teardown race (runMapMutation
 * / the applyTimeFilter try block do this).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMapAlive(map: any): boolean {
  if (!map) return false;
  try {
    if (map._removed) return false;
    return typeof map.getStyle === 'function' && !!map.getStyle();
  } catch {
    return false;
  }
}

/**
 * Run a batch of map mutations safely. Combines the isMapReady() pre-check with a
 * try/catch around the WHOLE batch — closing the check-then-use RACE that causes
 * the panel-reflow "white screen": isStyleLoaded() can return true, then a CSS
 * grid-width transition tears MapLibre's style down BETWEEN the check and the
 * mutation, so the mutation throws "Cannot read properties of undefined (reading
 * 'getLayer')" deep inside MapLibre — which the Map error boundary catches and
 * blanks the region. Swallowing the transient throw makes it a no-op; the effect
 * re-runs and reapplies once the style settles (resetKey / next dep change).
 *
 * @param map - the MapLibre map (or null)
 * @param fn  - the mutation batch, called only when the map is currently ready
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runMapMutation(map: any, fn: (m: any) => void): void {
  if (!isMapReady(map)) return;
  try {
    fn(map);
  } catch {
    /* style torn down mid-mutation (panel reflow race) — safe no-op, reapplied next tick */
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * MapCanvas — renders real medieval polity polygons in the .msa-map region.
 *
 * MapLibre is lazily loaded; shows LoadingState while booting.
 * Shows ErrorState if loading fails (honest, never faked).
 */
export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { state, mapRef, geojsonRef } = useMapLifecycle(containerRef);

  // ── Store subscriptions ────────────────────────────────────────────────────

  const year = useTimeStore((s) => s.year);
  const theme = useSettingsStore((s) => s.theme);
  // P1-3: subscribe to mapType for parchment/plain/relief differentiation.
  const mapType = useSettingsStore((s) => s.mapType);

  // ── Visibility subscriptions ───────────────────────────────────────────────
  // Raw LayerRail visibility, then gated by the kinds facet below (Pass 1). When
  // the kinds facet is non-empty, a record-kind layer only shows if its kind is in
  // the facet — a layer IS one kind, so the kinds facet is enforced here, not in a
  // MapLibre expression. Derived views (trade, heatmap) are NOT record kinds and are
  // therefore not gated by the kinds facet.
  const politiesVisibleRaw      = useLayersStore((s) => s.layers['polities']?.visible ?? true);
  const eventsVisibleRaw        = useLayersStore((s) => s.layers['events']?.visible ?? false);
  const journeysVisibleRaw      = useLayersStore((s) => s.layers['journeys']?.visible ?? false);
  const capitalsVisibleRaw      = useLayersStore((s) => s.layers['capitals']?.visible ?? false);
  const settlementsVisibleRaw   = useLayersStore((s) => s.layers['settlements']?.visible ?? false);
  const militaryVisibleRaw      = useLayersStore((s) => s.layers['military']?.visible ?? false);
  const tradeVisible            = useLayersStore((s) => s.layers['trade']?.visible ?? false);
  const relationshipsVisibleRaw = useLayersStore((s) => s.layers['relationships']?.visible ?? false);
  const heatmapVisible          = useLayersStore((s) => s.layers['heatmap']?.visible ?? false);
  const cartogramVisible        = useLayersStore((s) => s.layers['cartogram']?.visible ?? false);

  const filterKinds = useFilterStore((s) => s.kinds);
  const kindAllowed = (kind: string): boolean => filterKinds.size === 0 || filterKinds.has(kind);
  const politiesVisible      = politiesVisibleRaw      && kindAllowed('polity');
  const eventsVisible        = eventsVisibleRaw        && kindAllowed('event');
  const journeysVisible      = journeysVisibleRaw      && kindAllowed('journey');
  const capitalsVisible      = capitalsVisibleRaw      && kindAllowed('capital');
  const settlementsVisible   = settlementsVisibleRaw   && kindAllowed('settlement');
  const militaryVisible      = militaryVisibleRaw      && kindAllowed('military');
  const relationshipsVisible = relationshipsVisibleRaw && kindAllowed('relationship');

  // ── Opacity subscriptions (P1-4) ──────────────────────────────────────────
  // Per-layer opacity from layersStore drives setPaintProperty on the map so the
  // LayerRail opacity slider has live effect. Each defaults to 1 (fully opaque).
  const politiesOpacity      = useLayersStore((s) => s.layers['polities']?.opacity ?? 1);
  const eventsOpacity        = useLayersStore((s) => s.layers['events']?.opacity ?? 1);
  const journeysOpacity      = useLayersStore((s) => s.layers['journeys']?.opacity ?? 1);
  const capitalsOpacity      = useLayersStore((s) => s.layers['capitals']?.opacity ?? 1);
  const settlementsOpacity   = useLayersStore((s) => s.layers['settlements']?.opacity ?? 1);
  const militaryOpacity      = useLayersStore((s) => s.layers['military']?.opacity ?? 1);
  const tradeOpacity         = useLayersStore((s) => s.layers['trade']?.opacity ?? 1);
  const relationshipsOpacity = useLayersStore((s) => s.layers['relationships']?.opacity ?? 1);
  const heatmapOpacity       = useLayersStore((s) => s.layers['heatmap']?.opacity ?? 1);
  const cartogramOpacity     = useLayersStore((s) => s.layers['cartogram']?.opacity ?? 1);

  const select = useSelectionStore((s) => s.select);
  const setHover = useSelectionStore((s) => s.setHover);
  // Coordinated-selection READ (the other half of the spine): when a polity is
  // selected anywhere — network graph, registers, dock — its polygon gets an
  // accent ring on the map via the dedicated polities-selected highlight layer.
  const selectedPolityId = useSelectionStore((s) =>
    s.selectedType === 'polity' ? s.selectedId : null,
  );

  // Pass 1 (linked views): the faceted filter is now honored by the map, not just
  // the FilterPanel count. Region/confidence/year-range compose into the polity
  // setFilter (see applyTimeFilter); the kinds facet toggles whole layers above.
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);

  // Event category solo filter (eventFilterStore — additive, not frozen).
  // When non-null only events of this category are shown on the map.
  const eventCategory = useEventFilterStore((s) => s.eventCategory);

  // Event time mode (exact vs span) + span half-width (eventFilterStore).
  // Threaded into the events time/category filter so a mode change re-applies
  // immediately (the solo effect lists these in its deps).
  const eventTimeMode = useEventFilterStore((s) => s.eventTimeMode);
  const eventYearSpan = useEventFilterStore((s) => s.eventYearSpan);

  // Wave2-A: paint the user's uploaded datasets (if any). Guarded internally:
  // when no datasets are present the source stays empty and no layers draw.
  useUserLayer(mapRef.current, state.phase === 'ready');

  // ── Hover-tip (MapTip — the lightest tier of hover→inspector→dock, docs/01 §5) ──
  // Shows the hovered feature's real name + kind at the cursor. Reads real feature
  // properties; never fabricates. Cleared on mouseleave.
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number; label: string; kind: string } | null>(null);

  // ── Filter throttle ────────────────────────────────────────────────────────

  const filterThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastYearRef = useRef<number | null>(null);
  // Trailing-call ref: the most recent year requested while the throttle window is
  // active. A leading+trailing throttle (see scheduleFilter below) ensures the last
  // value of a rapid RAF playback burst is always applied within FILTER_THROTTLE_MS.
  const pendingYearRef = useRef<number | null>(null);
  const selectedPolityIdRef = useRef<string | null>(null);

  /**
   * Apply the selection ring filter so it outlines ONLY the selected polity's
   * single active snapshot at the current year.
   *
   * A polity has ~100+ snapshot polygons (one per year). The previous filter
   * combined the selected id with the composed polity time filter, whose
   * snapshotYear test is an `in [globalActiveYears]` set — a union across ALL
   * polities. Because many of the selected polity's historical snapshotYears
   * coincide with other polities' active years, several of its old outlines
   * passed at once, drawing internal criss-cross lines instead of one border.
   *
   * Fix: resolve the selected polity's OWN active snapshot year and match
   * `id == sel AND snapshotYear == thatYear` — exactly one polygon, one border.
   */
  const applySelectionHighlight = useCallback(() => {
    const map = mapRef.current;
    if (!isMapReady(map) || !map.getLayer(SELECTED_LAYER_ID)) return;
    const sel = selectedPolityIdRef.current;
    if (!sel) {
      map.setFilter(SELECTED_LAYER_ID, ['==', ['get', 'id'], '__none__'] as never);
      return;
    }
    const features = geojsonRef.current?.features as
      | Array<{ properties: PolityFilterProps }>
      | undefined;
    // The actually-applied year during playback (lastYearRef) is the truth; fall
    // back to the live store year before the first time-filter pass.
    const activeYear = lastYearRef.current ?? useTimeStore.getState().year;
    const snapYear = features
      ? activeSnapshotYearForPolity(features, sel, activeYear)
      : null;

    if (snapYear === null) {
      // Selected polity has no active snapshot at this year → ring nothing
      // (honest: the polity isn't on the map now).
      map.setFilter(SELECTED_LAYER_ID, ['==', ['get', 'id'], '__none__'] as never);
      return;
    }
    map.setFilter(
      SELECTED_LAYER_ID,
      ['all', ['==', ['get', 'id'], sel], ['==', ['get', 'snapshotYear'], snapYear]] as never,
    );
  }, [mapRef, geojsonRef]);

  const applyTimeFilter = useCallback(
    (targetYear: number) => {
      const map = mapRef.current;
      const geojson = geojsonRef.current;
      // isMapAlive (NOT isMapReady): every per-layer setFilter here is guarded
      // internally by layerExists, which is safe while a heavy source keeps
      // isStyleLoaded() false. The strict isStyleLoaded() gate made the toggle-on
      // re-apply (the visibility→time-filter effect) bail for exactly the heavy
      // layer being toggled — so it kept its stale boot-year filter and rendered
      // empty until a second off→on. The whole body is already try/catch-wrapped
      // for the reflow teardown race, so dropping the strict gate is safe.
      if (!geojson || !isMapAlive(map)) return;

      // Whole body wrapped: even with the style present, a panel reflow can tear it
      // down between calls, making a per-layer getLayer/setFilter throw inside
      // MapLibre. That must never reach a white screen — on a transient failure we
      // no-op and the scrubber re-applies on the next tick.
      try {
      const t0 = performance.now();

      const activeSnapshots = computeActiveSnapshotYears(
        geojson.features as Array<{ properties: { id: string; formed: number; dissolved: number | null; snapshotYear: number } }>,
        targetYear,
      );
      const timeFilter = buildTimeFilter(targetYear, activeSnapshots);

      // Pass 1: compose the active region/confidence/year-range facets onto the polity
      // layers. Read from the store at apply-time (not via deps) so facet keystrokes
      // don't re-create the callback; the year effect re-runs this on facet change.
      const facets = useFilterStore.getState();
      const polityFacetExpr = buildFilterMapExpression(facets, {
        layerKind: 'polity',
        hasConfidence: false, // polity features don't carry a confidence property in the bake
      });
      const filter = polityFacetExpr ? ['all', timeFilter, polityFacetExpr] : timeFilter;

      if (map.getLayer(FILL_LAYER_ID)) {
        map.setFilter(FILL_LAYER_ID, filter as never);
      }
      if (map.getLayer(HATCH_LAYER_ID)) {
        map.setFilter(HATCH_LAYER_ID, filter as never);
      }
      if (map.getLayer(OUTLINE_LAYER_ID)) {
        map.setFilter(OUTLINE_LAYER_ID, filter as never);
      }
      // Keep the selection ring in lockstep with the time/facet filter.
      applySelectionHighlight();

      // PERF: only re-filter layers that are actually VISIBLE. Every setFilter forces
      // MapLibre to re-evaluate the expression over all features in that source; the
      // optional layers (events 5061, settlements 4077, military 2055, …) are OFF by
      // default, so filtering them each play tick was pure wasted work that the phone
      // GPU/CPU couldn't sustain at 10 fps (the desktop could). A hidden layer's
      // filter is re-applied for the current year the moment it's toggled on (see the
      // visibility→time-filter effect below), so skipping it while hidden is safe.
      // Polities always filter — they're the always-on base layer.
      const vis = useLayersStore.getState().layers;
      const isVis = (id: LayerId): boolean => vis[id]?.visible ?? false;

      if (isVis('events')) {
        const ef = useEventFilterStore.getState();
        setEventsCategoryFilter(map, targetYear, ef.eventCategory, ef.eventTimeMode, ef.eventYearSpan);
      }
      if (isVis('journeys'))      setJourneysTimeFilter(map, targetYear);
      if (isVis('capitals'))      setCapitalsTimeFilter(map, targetYear);
      if (isVis('settlements'))   setSettlementsTimeFilter(map, targetYear);
      if (isVis('military'))      setMilitaryTimeFilter(map, targetYear);
      if (isVis('trade'))         setTradeTimeFilter(map, targetYear);
      if (isVis('relationships')) setRelationshipsTimeFilter(map, targetYear);
      if (isVis('cartogram'))     setCartogramTimeFilter(map, targetYear);
      if (isVis('heatmap'))       setHeatmapTimeFilter(map, targetYear);
      // capitals-tower rides with the capitals layer's visibility.
      if (isVis('capitals') && map.getLayer('capitals-tower')) {
        map.setFilter('capitals-tower', [
          'all',
          ['<=', ['coalesce', ['get', 'start_year'], 500], targetYear],
          ['>=', ['coalesce', ['get', 'end_year'], 1500], targetYear],
        ]);
      }

      lastYearRef.current = targetYear;

      const elapsed = performance.now() - t0;
      if (elapsed > 80) {

        console.warn(
          `[MapCanvas] Time filter took ${elapsed.toFixed(1)} ms — approaching 100 ms budget`,
        );
      }
      } catch {
        // Map was torn down / re-styled mid-apply (e.g. during a panel reflow).
        // Safe no-op: the scrubber re-applies the filter on the next tick once the
        // style is back. Never let this surface as a white-screen render error.
      }
    },
    [mapRef, geojsonRef, applySelectionHighlight],
  );

  // Leading + trailing throttle for the time filter.
  //
  // Pure debounce (the previous implementation) cancels and reschedules on every
  // call, so a tight stream of year changes from the RAF play loop — where new years
  // arrive every ~16 ms — means the filter is perpetually reset and never actually
  // fires. This converts it to a leading+trailing throttle:
  //
  //   1. First call in a window fires applyTimeFilter immediately (leading edge).
  //   2. Further calls inside the FILTER_THROTTLE_MS window are accumulated in
  //      pendingYearRef — they do NOT reset the timer.
  //   3. When the timer expires the trailing call fires with the most recent year,
  //      so no value is silently dropped and the map stays current.
  //
  // For manual scrubbing the behaviour is unchanged: each drag tick fires leading
  // and the trailing call applies the final thumb position.
  const scheduleFilter = useCallback(
    (targetYear: number) => {
      if (filterThrottleRef.current === null) {
        // Leading edge: no active window — fire immediately and open a window.
        applyTimeFilter(targetYear);
        pendingYearRef.current = null;
        filterThrottleRef.current = setTimeout(() => {
          filterThrottleRef.current = null;
          // Trailing edge: if a newer year arrived during the window, apply it now.
          if (pendingYearRef.current !== null) {
            const trailing = pendingYearRef.current;
            pendingYearRef.current = null;
            applyTimeFilter(trailing);
          }
        }, FILTER_THROTTLE_MS);
      } else {
        // Inside an active throttle window — accumulate the latest year for the
        // trailing call. Do NOT cancel or reset the existing timer.
        pendingYearRef.current = targetYear;
      }
    },
    [applyTimeFilter],
  );

  // ── Year effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== 'ready') return;
    if (lastYearRef.current === year) return;
    scheduleFilter(year);
    // NOTE: deliberately NO cleanup here. A per-year cleanup that cleared
    // filterThrottleRef/pendingYearRef ran on EVERY year change (because `year`
    // is a dep), tearing down the leading+trailing throttle window each tick.
    // During playback that dropped intermediate years and made the map repaint
    // only intermittently. The throttle is torn down once on unmount instead
    // (see the unmount-only effect below).
  }, [year, state.phase, scheduleFilter]);

  // Unmount-only teardown for the filter throttle. Empty dep array → runs the
  // cleanup exactly once when MapCanvas unmounts, never on year changes. This
  // preserves the original "don't leak a pending timer" safety without
  // sabotaging the throttle during playback.
  useEffect(() => {
    return () => {
      if (filterThrottleRef.current !== null) {
        clearTimeout(filterThrottleRef.current);
        filterThrottleRef.current = null;
      }
      pendingYearRef.current = null;
    };
  }, []);

  // ── Facet effect (Pass 1, linked views) ────────────────────────────────────
  // Re-apply the polity filter when the region/confidence/year-range facets change.
  // The year effect's `lastYearRef` guard would otherwise skip a facet-only change,
  // so we drive applyTimeFilter directly (throttled by FILTER_THROTTLE_MS). The
  // kinds facet is handled separately by the per-layer visibility effects below.
  const facetReapplyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.phase !== 'ready') return;
    if (facetReapplyRef.current !== null) clearTimeout(facetReapplyRef.current);
    facetReapplyRef.current = setTimeout(() => {
      facetReapplyRef.current = null;
      // Force a re-apply even if the year is unchanged: reset the guard, then apply.
      lastYearRef.current = -1;
      applyTimeFilter(year);
    }, FILTER_THROTTLE_MS);
    return () => {
      if (facetReapplyRef.current !== null) {
        clearTimeout(facetReapplyRef.current);
        facetReapplyRef.current = null;
      }
    };
  }, [filterYearRange, filterRegions, filterConfidence, year, state.phase, applyTimeFilter]);

  // ── Visibility → time-filter re-apply ───────────────────────────────────────
  // applyTimeFilter now SKIPS hidden layers (perf — see the isVis() guards), so a
  // layer that was off while the year moved is stale when it's toggled on. Re-apply
  // the current year whenever any optional layer's visibility changes, so a freshly
  // shown layer immediately matches the current year. Cheap: runs only on toggle,
  // not per play tick.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    lastYearRef.current = -1;
    applyTimeFilter(useTimeStore.getState().year);
  }, [
    eventsVisible, journeysVisible, capitalsVisible, settlementsVisible,
    militaryVisible, tradeVisible, relationshipsVisible, heatmapVisible, cartogramVisible,
    state.phase, applyTimeFilter,
  ]);

  // ── Theme effect ───────────────────────────────────────────────────────────
  // Re-reads CSS tokens and rebuilds the polity fill (region tint) plus every
  // dataset-layer color whenever the theme changes. The map is region-tinted
  // ("political") only — the EU4-style multi-mode switcher was removed.

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (map) => {
    const tokens = readMapTokens();

    // P0-B / P1-2: repaint ALL base geography layers on theme change.
    // 'ocean' is the background layer (renamed from 'background' in buildBaseStyle).
    if (map.getLayer('ocean')) {
      map.setPaintProperty('ocean', 'background-color', tokens.sea);
    }
    // Back-compat: in case the old 'background' id still exists in a cached style.
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', tokens.sea);
    }
    if (map.getLayer('land-fill')) {
      map.setPaintProperty('land-fill', 'fill-color', tokens.land);
    }
    if (map.getLayer('lakes')) {
      map.setPaintProperty('lakes', 'fill-color', tokens.sea);
    }
    if (map.getLayer('rivers')) {
      map.setPaintProperty('rivers', 'line-color', tokens.graticule);
    }
    if (map.getLayer('land-outline')) {
      map.setPaintProperty('land-outline', 'line-color', tokens.graticule);
    }

    // Rebuild the region-tint fill expression for the new theme. LIVE — no remount.
    const fillExpr = buildRegionMatchExpression(theme, tokens.land);
    if (map.getLayer(FILL_LAYER_ID)) {
      map.setPaintProperty(FILL_LAYER_ID, 'fill-color', fillExpr);
    }

    // Wave1-A: rebuild journey kind colors for the new theme (dark-lightened).
    setJourneysKindColors(map, theme);
    // Geo-layers: re-tint for the new theme (each guards internally if absent).
    setCapitalsColors(map, theme);
    setSettlementsColors(map, theme);
    setMilitaryColors(map, theme);
    setTradeColors(map, theme);
    setRelationshipsColors(map, theme);
    setEventsCategoryColors(map, theme);
    setCartogramColors(map, theme);
    });
  }, [theme, state.phase, mapRef]);

  // ── MapType effect (P1-1) ──────────────────────────────────────────────────
  // Parchment / Plain / Relief toggle. Implemented via setPaintProperty /
  // setLayoutProperty — no style reload. Keeps all layers live.
  //
  //   Parchment: warm land, rivers visible, glaciers at full opacity — default look.
  //   Plain:     flat land, rivers hidden, glaciers subtle (opacity 0.3), lakes subtle.
  //   Relief:    land unchanged, glaciers emphasized (opacity 1.0), rivers thicker.

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (map) => {
    if (mapType === 'parchment') {
      // Default parchment look — rivers on, glaciers moderate.
      if (map.getLayer('rivers')) {
        map.setLayoutProperty('rivers', 'visibility', 'visible');
        map.setPaintProperty('rivers', 'line-opacity', 0.6);
      }
      if (map.getLayer('glaciers')) {
        map.setLayoutProperty('glaciers', 'visibility', 'visible');
        map.setPaintProperty('glaciers', 'fill-opacity', 0.85);
      }
      if (map.getLayer('lakes')) {
        map.setPaintProperty('lakes', 'fill-opacity', 0.85);
      }
    } else if (mapType === 'plain') {
      // Flat / minimal: rivers hidden, glaciers and lakes de-emphasized.
      if (map.getLayer('rivers')) {
        map.setLayoutProperty('rivers', 'visibility', 'none');
      }
      if (map.getLayer('glaciers')) {
        map.setPaintProperty('glaciers', 'fill-opacity', 0.30);
      }
      if (map.getLayer('lakes')) {
        map.setPaintProperty('lakes', 'fill-opacity', 0.50);
      }
    } else if (mapType === 'relief') {
      // Relief emphasis: rivers visible + thicker, glaciers fully opaque + bright.
      if (map.getLayer('rivers')) {
        map.setLayoutProperty('rivers', 'visibility', 'visible');
        map.setPaintProperty('rivers', 'line-opacity', 0.9);
      }
      if (map.getLayer('glaciers')) {
        map.setLayoutProperty('glaciers', 'visibility', 'visible');
        map.setPaintProperty('glaciers', 'fill-opacity', 1.0);
        map.setPaintProperty('glaciers', 'fill-color', '#ffffff');
      }
      if (map.getLayer('lakes')) {
        map.setPaintProperty('lakes', 'fill-opacity', 0.90);
      }
    }
    });
  }, [mapType, state.phase, mapRef]);

  // ── Visibility effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (map) => {
      const visibility = politiesVisible ? 'visible' : 'none';
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setLayoutProperty(FILL_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(HATCH_LAYER_ID)) {
        map.setLayoutProperty(HATCH_LAYER_ID, 'visibility', visibility);
      }
      if (map.getLayer(OUTLINE_LAYER_ID)) {
        map.setLayoutProperty(OUTLINE_LAYER_ID, 'visibility', visibility);
      }
    });
  }, [politiesVisible, state.phase, mapRef]);

  // ── Shared layer-visibility applier ─────────────────────────────────────────
  // ROOT-CAUSE FIX (most layers stayed invisible despite their toggle being ON):
  // every async-loaded layer hit a placement/teardown race — a setXxxVisibility
  // called before the layer settled was a silent no-op, so the LayerRail toggle
  // appeared dead. This sets immediately AND retries once ~250ms later, re-reading
  // the CURRENT intent via fn. The effect re-runs on every toggle and cancels its
  // own pending retry on cleanup, so no stale retry can clobber a newer value.
  const applyLayerVisibility = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fn: (m: any) => void): (() => void) | void => {
      const map = mapRef.current;
      // isMapAlive (NOT isMapReady): the visibility setters guard each layer with
      // layerExists internally, so they are safe to call while a heavy source keeps
      // isStyleLoaded() false. Gating on the strict isStyleLoaded() check made the
      // FIRST toggle-on of a heavy layer a silent no-op (style busy reprocessing the
      // source), so the layer only appeared after a second off→on once the style
      // settled. Wrap in try/catch for the reflow teardown race.
      if (!isMapAlive(map)) { return; }
      try { fn(map); } catch { /* transient style teardown — retry below covers it */ }
      const t = setTimeout(() => {
        if (isMapAlive(mapRef.current)) {
          try { fn(mapRef.current); } catch { /* transient */ }
        }
      }, 250);
      return () => { clearTimeout(t); };
    },
    [mapRef],
  );

  // ── Events visibility effect (P3-B fix) ────────────────────────────────────
  // The events layer was added but its visibility wasn't reactive — toggling
  // the Events row in LayerRail did nothing. Now it subscribes and applies.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setEventsVisibility(m, eventsVisible));
  }, [eventsVisible, state.phase, applyLayerVisibility]);

  // ── Event category + time-mode effect ──────────────────────────────────────
  // Applies the category filter (or clears it) when the user solos a category
  // from the legend, AND re-applies when the time mode (exact↔span) or span width
  // changes so those take effect immediately. Uses setEventsCategoryFilter which
  // composes the current year so the time filter is never dropped. Runs on any of
  // eventCategory / year / eventTimeMode / eventYearSpan change so all stay in
  // sync. Guards with isMapReady for style reflows.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const map = mapRef.current;
    if (!isMapReady(map)) return;
    try {
      setEventsCategoryFilter(map, year, eventCategory, eventTimeMode, eventYearSpan);
    } catch {
      // Transient style reload — applyTimeFilter will reapply on next tick.
    }
  }, [eventCategory, year, eventTimeMode, eventYearSpan, state.phase, mapRef]);

  // ── Journeys visibility effect (Wave1-A) ───────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setJourneysVisibility(m, journeysVisible));
  }, [journeysVisible, state.phase, applyLayerVisibility]);

  // ── Geo-layers visibility effects (capitals/settlements/military/trade) ──────
  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setCapitalsVisibility(m, capitalsVisible));
  }, [capitalsVisible, state.phase, applyLayerVisibility]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setSettlementsVisibility(m, settlementsVisible));
  }, [settlementsVisible, state.phase, applyLayerVisibility]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setMilitaryVisibility(m, militaryVisible));
  }, [militaryVisible, state.phase, applyLayerVisibility]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setTradeVisibility(m, tradeVisible));
  }, [tradeVisible, state.phase, applyLayerVisibility]);

  // ── New layer visibility effects ───────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setRelationshipsVisibility(m, relationshipsVisible));
  }, [relationshipsVisible, state.phase, applyLayerVisibility]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    return applyLayerVisibility((m) => setHeatmapVisibility(m, heatmapVisible));
  }, [heatmapVisible, state.phase, applyLayerVisibility]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    // P6: the cartogram is an alternate analytical view (proportional symbols by
    // metric). Its render layer was built + loaded but never reactively toggled,
    // so it was unreachable. Now its LayerRail toggle drives visibility live.
    return applyLayerVisibility((m) => setCartogramVisibility(m, cartogramVisible));
  }, [cartogramVisible, state.phase, applyLayerVisibility]);

  // ── Opacity effects (P1-4) ─────────────────────────────────────────────────
  // Each layer subscribes to its own layersStore opacity and calls the
  // setXxxOpacity helper which guards internally if the layer is absent.

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (map) => {
      const clamped = Math.max(0, Math.min(1, politiesOpacity));
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(FILL_LAYER_ID,  'fill-opacity',    clamped * 0.55);
      }
      if (map.getLayer(HATCH_LAYER_ID)) {
        map.setPaintProperty(HATCH_LAYER_ID, 'fill-opacity',    clamped * 0.55);
      }
      if (map.getLayer(OUTLINE_LAYER_ID)) {
        map.setPaintProperty(OUTLINE_LAYER_ID, 'line-opacity',  clamped * 0.7);
      }
    });
  }, [politiesOpacity, state.phase, mapRef]);

  // ── Coordinated-selection highlight (the spine's map half) ──────────────────
  // A polity chosen in ANY view (network graph, registers, dock, or a map click)
  // gets an accent ring on the map. The ring filter = current time/facet filter ∧
  // selected id, so only the polity's current-year snapshot is ringed (each polity
  // has many snapshot features). Cleared to '__none__' when nothing is selected.
  useEffect(() => {
    selectedPolityIdRef.current = selectedPolityId;
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, () => applySelectionHighlight());
  }, [selectedPolityId, state.phase, mapRef, applySelectionHighlight]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setEventsOpacity(m, eventsOpacity));
  }, [eventsOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setJourneysOpacity(m, journeysOpacity));
  }, [journeysOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setCapitalsOpacity(m, capitalsOpacity));
  }, [capitalsOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setSettlementsOpacity(m, settlementsOpacity));
  }, [settlementsOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setMilitaryOpacity(m, militaryOpacity));
  }, [militaryOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setTradeOpacity(m, tradeOpacity));
  }, [tradeOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setRelationshipsOpacity(m, relationshipsOpacity));
  }, [relationshipsOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setHeatmapOpacity(m, heatmapOpacity));
  }, [heatmapOpacity, state.phase, mapRef]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    runMapMutation(mapRef.current, (m) => setCartogramOpacity(m, cartogramOpacity));
  }, [cartogramOpacity, state.phase, mapRef]);

  // ── Click + hover wiring (extracted to useMapInteractions) ──────────────────
  // All interactive layers' click → selection + hover → MapTip/linked-views id
  // live in one hook. FILL_LAYER_ID is private to this file, so it's passed in.
  useMapInteractions(mapRef, FILL_LAYER_ID, {
    phase: state.phase,
    select,
    setHover,
    setHoverTip,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.phase === 'error') {
    return (
      <main className="msa-map" role="region" aria-label="Map canvas — error">
        <ErrorState
          title="Map failed to load"
          body={state.error ?? 'An unexpected error occurred while initialising the map.'}
        />
      </main>
    );
  }

  return (
    <main className="msa-map" role="region" aria-label="Map canvas">
      {/* The MapLibre canvas fills this container by MapLibre's own init logic. */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        aria-label="Interactive map"
        role="application"
      />

{/* Loading overlay — shown during 'loading-lib' and 'loading-data' phases.
          Sits on top of the (empty) container until 'ready'. */}
      {state.phase !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            // Subtle parchment backdrop matching .msa-map background.
            background: 'var(--paper)',
          }}
        >
          <LoadingState
            label={
              state.phase === 'loading-data'
                ? 'Loading polity polygons…'
                : 'Initialising map…'
            }
          />
        </div>
      )}

      {/* Hover annotation — right-edge margin note showing the hovered feature.
          Fixed position (not cursor-following), fades in/out via CSS transition.
          Shown at all phases so the fade-out works when map transitions to ready. */}
      <HoverAnnotation tip={state.phase === 'ready' ? hoverTip : null} />

      {/* Phase 5-g: GIS chrome overlay — scale bar, coord readout, zoom, attribution.
          Rendered always so the scaleContainerRef DOM node is available for the
          MapLibre ScaleControl relocation effect. Controls are hidden internally
          until ready=true. */}
      <MapControls map={mapRef.current} ready={state.phase === 'ready'} />
    </main>
  );
}
