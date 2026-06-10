/**
 * useMapLifecycle — the async lifecycle that boots MapLibre and feeds it data.
 *
 * Separated from MapCanvas.tsx so the main renderer stays readable and the
 * boot sequence is testable in isolation.
 *
 * Phases:
 *   'loading-lib'  — MapLibre dynamic import in flight
 *   'loading-data' — MapLibre ready; fetching polities.geojson + events.geojson
 *   'ready'        — map + data fully loaded; time filter applied; layers live
 *   'error'        — irrecoverable failure (import failed or fetch failed)
 *
 * Timing: performance.mark stamps are placed at mount and at ready so the
 * measured mount→first-paint latency is logged to the console (Task 3 budget
 * measurement per docs/00 §3).
 *
 * Cleanup: map.remove() is called on unmount so the WebGL context is freed.
 *
 * Circular-import guard: this module imports from timeFilter.ts (pure) and
 * eventsLayer.ts (pure), NOT from MapCanvas.tsx.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { assetUrl } from '@/data/assetUrl';
import { mapLog } from './mapLog';
import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLayersStore } from '@/stores/layersStore';
import { readMapTokens } from './mapTokens';
import { buildBaseStyle } from './buildBaseStyle';
import { buildRegionMatchExpression } from './regionExpression';
import { computeActiveSnapshotYears, buildTimeFilter } from './timeFilter';
import {
  fetchEventsGeojson,
  addEventsLayer,
  setEventsVisibility,
  type EventFeatureCollection,
} from './eventsLayer';
import {
  fetchJourneysGeojson,
  addJourneysLayer,
  type JourneyFeatureCollection,
} from './journeysLayer';
import {
  fetchCapitalsGeojson,
  addCapitalsLayer,
  type CapitalFeatureCollection,
} from './capitalsLayer';
import {
  fetchSettlementsGeojson,
  addSettlementsLayer,
  type SettlementFeatureCollection,
} from './settlementsLayer';
import {
  fetchMilitaryGeojson,
  addMilitaryLayer,
  setMilitaryVisibility,
  setMilitaryOpacity,
  type MilitaryFeatureCollection,
} from './militaryLayer';
import {
  fetchTradeGeojson,
  addTradeLayer,
  type TradeFeatureCollection,
} from './tradeLayer';
import { logUnavailableLayers } from './unavailableLayers';
import { setMapInstance, clearMapInstance } from './mapInstance';
import {
  registerHatchPatterns,
  registerEntityHatchTiles,
  buildEntityHatchFillExpression,
} from './hatchPatterns';
import { registerEventIcons } from './eventIcons';
import { registerCapitalTowerIcon, CAPITAL_TOWER_IMAGE_ID } from './capitalTowerIcon';
// Sea-labels layer removed (user request) — the ambient Latin sea names
// ("MARE NOSTRVM", etc.) are no longer fetched or registered. seaLabelsLayer.ts
// is retained for easy re-enablement but is no longer imported here.
import {
  fetchRelationshipsGeojson,
  addRelationshipsLayer,
  setRelationshipsVisibility,
  setRelationshipsOpacity,
  type RelationshipsBuild,
} from './relationshipsLayer';
import {
  addHeatmapLayer,
  setHeatmapVisibility,
  setHeatmapOpacity,
} from './heatmapLayer';
import {
  fetchCartogramGeojson,
  addCartogramLayer,
  setCartogramVisibility,
  setCartogramOpacity,
  type CartogramFeatureCollection,
} from './cartogramLayer';
import { installMapStabilityGuards } from './mapStabilityGuards';

/** How long (ms) to wait for the map 'load' event before declaring failure. */
const MAP_LOAD_TIMEOUT_MS = 15_000;

/**
 * Signal the boot splash (index.html) that the map phase is settled — fired on
 * BOTH the success and every error path. The splash only hides once it has heard
 * from both records and map; if the map errors without signalling, the splash
 * hangs over the (already-rendered) error screen until its 20s safety timeout.
 * Idempotent: the splash ignores repeat calls.
 */
function signalSplashMapReady(): void {
  (window as unknown as { __splashMapReady?: () => void }).__splashMapReady?.();
}

// ── Layer constants (local copies — avoids importing from MapCanvas) ───────────

const SOURCE_ID = 'polities-source';
const FILL_LAYER_ID = 'polities-fill';
const HATCH_LAYER_ID = 'polities-hatch';
const OUTLINE_LAYER_ID = 'polities-outline';
const SELECTED_LAYER_ID = 'polities-selected';
const POLITY_FILL_OPACITY = 0.55;
const POLITY_OUTLINE_WIDTH = 0.8;
const POLITY_OUTLINE_OPACITY = 0.7;
const POLITY_OUTLINE_COLOR = 'rgba(13, 9, 7, 0.55)';
const SELECTED_OUTLINE_WIDTH = 2.4;
const POLITIES_URL = assetUrl('/data/layers/polities.geojson');

/**
 * Selection-ring color. Deliberately BLUE (not the gold/amber --accent) so the
 * selected-feature outline reads clearly against the parchment map and the
 * gold-toned theme. Prefers a --select-ring token if a theme defines one, else
 * falls back to a fixed, high-contrast blue.
 */
const SELECTED_RING_BLUE = '#1d6fb5';
function resolveSelectionRingColor(): string {
  if (typeof document === 'undefined') return SELECTED_RING_BLUE;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--select-ring').trim();
  return v || SELECTED_RING_BLUE;
}
const SELECTED_OUTLINE_COLOR = resolveSelectionRingColor();

// ── Lifecycle phase ────────────────────────────────────────────────────────────

export type MapPhase = 'loading-lib' | 'loading-data' | 'ready' | 'error';

export interface MapLifecycleState {
  phase: MapPhase;
  error?: string;
}

/** Minimal typed GeoJSON structures for the polity layer. */
interface PolityFeature {
  type: 'Feature';
  geometry: unknown;
  properties: {
    id: string;
    name: string;
    region: string;
    formed: number;
    dissolved: number | null;
    snapshotYear: number;
  };
}

export interface PolityFeatureCollection {
  type: 'FeatureCollection';
  features: PolityFeature[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Boots the MapLibre map and loads polity GeoJSON.
 *
 * Returns:
 *   state     — current lifecycle phase + optional error message
 *   mapRef    — ref to the live MapLibre Map instance (null until 'ready')
 *   geojsonRef — ref to the loaded GeoJSON (null until 'ready')
 */
export function useMapLifecycle(containerRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<MapLifecycleState>({ phase: 'loading-lib' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const geojsonRef = useRef<PolityFeatureCollection | null>(null);
  const eventsGeojsonRef    = useRef<EventFeatureCollection | null>(null);
  const journeysGeojsonRef  = useRef<JourneyFeatureCollection | null>(null);
  const capitalsGeojsonRef  = useRef<CapitalFeatureCollection | null>(null);
  const settlementsGeojsonRef = useRef<SettlementFeatureCollection | null>(null);
  const militaryGeojsonRef  = useRef<MilitaryFeatureCollection | null>(null);
  const tradeGeojsonRef     = useRef<TradeFeatureCollection | null>(null);
  const relationshipsGeojsonRef = useRef<RelationshipsBuild | null>(null);
  const cartogramGeojsonRef     = useRef<CartogramFeatureCollection | null>(null);

  // Capture initial store values — these are only needed at boot time.
  // Subsequent changes are handled by effects in MapCanvas.tsx.
  const initialYear = useTimeStore.getState().year;
  const initialTheme = useSettingsStore.getState().theme;
  const initialEventsVisible        = useLayersStore.getState().layers['events']?.visible ?? false;
  const initialJourneysVisible      = useLayersStore.getState().layers['journeys']?.visible ?? false;
  const initialCapitalsVisible      = useLayersStore.getState().layers['capitals']?.visible ?? false;
  const initialSettlementsVisible   = useLayersStore.getState().layers['settlements']?.visible ?? false;
  const initialMilitaryVisible      = useLayersStore.getState().layers['military']?.visible ?? false;
  const initialTradeVisible         = useLayersStore.getState().layers['trade']?.visible ?? false;
  const initialRelationshipsVisible = useLayersStore.getState().layers['relationships']?.visible ?? false;
  const initialHeatmapVisible       = useLayersStore.getState().layers['heatmap']?.visible ?? false;
  const initialCartogramVisible     = useLayersStore.getState().layers['cartogram']?.visible ?? false;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mapInstance: any = null;
    let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // Resize + WebGL context-loss guards (own their own observer/listeners and
    // return a single teardown — see mapStabilityGuards.ts).
    let teardownGuards: (() => void) | null = null;

    performance.mark('mapcanvas-mount-start');

    async function boot() {
      // ── Step 1: Dynamic import — keeps MapLibre out of the initial bundle ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let maplibregl: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let Protocol: any;

      try {
        const [mlModule, pmModule] = await Promise.all([
          import('maplibre-gl'),
          import('pmtiles'),
        ]);
        maplibregl = mlModule.default;
        Protocol = pmModule.Protocol;
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: 'error',
            error: `Failed to load MapLibre: ${err instanceof Error ? err.message : String(err)}`,
          });
          signalSplashMapReady();
        }
        return;
      }

      if (cancelled) return;

      // Register the pmtiles:// protocol handler.
      // Moved from main.tsx so MapLibre stays out of the initial bundle.
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);

      // ── Step 2: Build base style and initialise map ────────────────────────

      const tokens = readMapTokens();
      const style = buildBaseStyle(tokens);

      let mapReadyFired = false;

      const map = new maplibregl.Map({
        container,
        style,
        center: [15, 48],   // Central Europe — appropriate default for medieval dataset
        zoom: 3.5,
        minZoom: 1,
        maxZoom: 12,
        attributionControl: false,
        // Cap the render resolution so the per-frame GPU cost stays sustainable.
        //
        // The phone shell is a FULL-BLEED retina map: at DPR 3 it rasterizes ~998k
        // backing-store pixels (vs ~508k for the desktop grid-cell map at DPR 1) — and
        // a phone GPU is several times weaker than a laptop's. That combination is why
        // the SAME play loop / loader (mobile and desktop run identical code) kept up on
        // the laptop but lagged on the phone. Measurement: mobile rasterizes ~2× the
        // pixels of desktop. Capping the phone at 1.5× brings its per-frame pixel load
        // (~562k) down to roughly desktop-equivalent, so playback tracks the year there
        // too — at a slight cost in retina crispness that is invisible in motion.
        //
        // Desktop (>600px) keeps the 2× cap (a no-op on its DPR 1–2 displays), so its
        // sharpness is unchanged. The cap is fixed at creation; a desktop↔mobile resize
        // is rare on a real device and a reload re-evaluates it.
        pixelRatio: Math.min(
          window.devicePixelRatio || 1,
          window.matchMedia('(max-width: 600px)').matches ? 1.5 : 2,
        ),
        // Disable MapLibre's built-in ResizeObserver. Its un-debounced resize()
        // on every observed size change — fired in a burst while the CSS grid
        // animates a panel collapse/fullscreen — is what storms the WebGL context
        // and white-screens the app. We drive resize ourselves below: debounced,
        // and skipped while the container is zero-sized/hidden (the unsafe case).
        trackResize: false,
      });

      mapInstance = map;
      mapRef.current = map;

      // Dev-only debug handle: expose the live map on window so e2e tests and
      // manual debugging can drive the real instance (project coords, toggle
      // layers, fire events). Guarded by import.meta.env.DEV — never in prod.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__map = map;
      }

      // ── White-screen crash hardening (panel hide / fullscreen reflow) ─────────
      // During a CSS-grid reflow MapLibre can transiently tear its internal style
      // down. A mutation/query in that window throws deep inside MapLibre
      // ("Cannot read properties of undefined (reading 'getLayer')"), which the
      // Map RegionErrorBoundary catches and blanks the region → the white screen.
      // We harden the map at the SOURCE: wrap the style-touching methods so a
      // teardown-window throw becomes a safe no-op (the next effect/idle reapplies
      // the intended state once the style is back). This cannot mask real logic
      // bugs — it only swallows the known transient teardown error.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hardenMap = (mp: any): void => {
        const guarded = ['setLayoutProperty', 'setPaintProperty', 'setFilter', 'getLayer', 'setLayerZoomRange'];
        for (const name of guarded) {
          const orig = mp[name];
          if (typeof orig !== 'function' || orig.__hardened) continue;
          const wrapped = function (this: unknown, ...args: unknown[]) {
            try {
              return orig.apply(this ?? mp, args);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (/getLayer|undefined|style/i.test(msg)) return undefined; // transient teardown
              throw err; // a real error — let it surface
            }
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (wrapped as any).__hardened = true;
          mp[name] = wrapped;
        }
      };
      hardenMap(map);

      // ── Resize + WebGL context-loss guards ────────────────────────────────
      // Debounced size-guarded resize + WebGL context-loss/restore recovery,
      // extracted to mapStabilityGuards.ts. The helper owns its observer and
      // listeners and returns a single teardown we call on cleanup.
      const resizeEl = containerRef.current;
      if (!resizeEl) return; // container gone (unmounted mid-boot) — nothing to observe
      teardownGuards = installMapStabilityGuards(map, {
        container: resizeEl,
        getMap: () => mapRef.current,
        isCancelled: () => cancelled,
      });

      // Safety timeout — if the style never loads, fail gracefully.
      loadTimeoutId = setTimeout(() => {
        if (!mapReadyFired && !cancelled) {
          setState({ phase: 'error', error: 'Map style failed to load within 15 s.' });
          signalSplashMapReady();
        }
      }, MAP_LOAD_TIMEOUT_MS);

      // ── Step 3: Fetch GeoJSON once the map style has loaded ───────────────

      map.once('load', async () => {
        mapReadyFired = true;
        if (loadTimeoutId) clearTimeout(loadTimeoutId);
        if (cancelled) return;

        setState({ phase: 'loading-data' });

        // ── Step 3b: Register raster images BEFORE adding any layers ──────
        // MapLibre needs all icon/pattern images present at addLayer() time to
        // avoid "missing-image" console warnings. Three synchronous registrations:
        //   1. Hatch patterns (region-level, 18 tiles) — for polity fill-pattern
        //   2. Capital tower icon — for capitals symbol layer
        //   3. Event stud icons (9 category glyphs) — for events symbol layer
        //
        // Event icons are async (SVG→Blob→Image pipeline); the others are sync.
        // We fire all three here, awaiting only eventIcons since that is the slow one.

        registerHatchPatterns(map, initialTheme);
        registerCapitalTowerIcon(map);
        // eventIcons are async — await so images are ready before events layer adds.
        await registerEventIcons(map, initialTheme);

        if (cancelled) return;

        let geojson: PolityFeatureCollection;
        try {
          const res = await fetch(POLITIES_URL);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${POLITIES_URL}`);
          }
          geojson = (await res.json()) as PolityFeatureCollection;
        } catch (err) {
          if (!cancelled) {
            setState({
              phase: 'error',
              error: `Failed to load polity polygons: ${err instanceof Error ? err.message : String(err)}`,
            });
            signalSplashMapReady();
          }
          return;
        }

        if (cancelled) return;

        geojsonRef.current = geojson;

        // ── Step 3c: Register per-entity jitter hatch tiles ────────────────
        // Done after polity geojson is loaded — needs feature ids + regions.
        // Also builds the entity-level fill-pattern match expression for use below.
        registerEntityHatchTiles(map, initialTheme, geojson.features);
        const entityHatchExpr  = buildEntityHatchFillExpression(geojson.features, 'hatch-western_europe');

        // ── Step 4: Add GeoJSON source ─────────────────────────────────────

        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: geojson,
          // generateId: true prepares feature-state for Phase 3 hover/selection.
          generateId: true,
        });

        // ── Step 5: Add fill layer (region-tinted + hatch pattern) ─────────
        //
        // Two paint properties work together for the "drawn atlas" look:
        //   fill-color: the region match expression (solid tint, used as the
        //               base color visible in gaps between hatch lines)
        //   fill-pattern: per-entity jitter tile (18% backdrop + 55% hairlines)
        //
        // fill-pattern takes priority over fill-color in MapLibre — the pattern
        // already bakes the tinted backdrop so fill-color becomes the fallback.
        // fill-opacity controls the whole fill stack.
        //
        // 120ms paint transitions (REVIVE §4.3 #2): compositor-friendly, matches
        // the design token --duration-fast (120ms) from atlas-tokens.css.

        const fillColor = buildRegionMatchExpression(initialTheme, tokens.land);

        // Base fill: SOLID region tint — always renders (fill-color cannot fail).
        // This guarantees polygons are never empty even if a hatch tile is missing.
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': fillColor,
            'fill-opacity': POLITY_FILL_OPACITY,
            'fill-opacity-transition': { duration: 120, delay: 0 },
          },
        });

        // Hatch OVERLAY: per-entity 45° jitter pattern drawn ON TOP of the solid
        // base (REVIVE §4.3 #1). Separated from the base so an unresolved pattern
        // degrades gracefully to the solid tint instead of a transparent polygon
        // (fill-pattern overrides fill-color when on the same layer — the Wave-1
        // outline-only regression). The pattern tiles already bake their own
        // tinted hairlines, so this reads as hatching over the tint.
        map.addLayer({
          id: HATCH_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-pattern': entityHatchExpr,
            'fill-opacity': POLITY_FILL_OPACITY,
            'fill-opacity-transition': { duration: 120, delay: 0 },
          },
        });

        // ── Step 6: Add hairline outline layer (DESIGN.md coastline weight) ─
        // 120ms transition on line-opacity for smooth hover/select feedback.

        map.addLayer({
          id: OUTLINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': POLITY_OUTLINE_COLOR,
            'line-width': POLITY_OUTLINE_WIDTH,
            'line-opacity': POLITY_OUTLINE_OPACITY,
            'line-opacity-transition': { duration: 120, delay: 0 },
          },
        });

        // ── Step 6b: Selected-polity highlight outline (coordinated selection) ─
        // A bold accent ring drawn on top, filtered to the selected polity id.
        // Driven by MapCanvas's selectedId effect; starts matching nothing so it's
        // invisible until something is selected here or in any other view.
        map.addLayer({
          id: SELECTED_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['==', ['get', 'id'], '__none__'],
          paint: {
            'line-color': SELECTED_OUTLINE_COLOR,
            'line-width': SELECTED_OUTLINE_WIDTH,
            'line-opacity': 1,
            'line-opacity-transition': { duration: 120, delay: 0 },
          },
        });

        // ── Step 7: Apply initial time filter ─────────────────────────────

        const activeSnapshots = computeActiveSnapshotYears(
          geojson.features as Array<{ properties: { id: string; formed: number; dissolved: number | null; snapshotYear: number } }>,
          initialYear,
        );
        const filter = buildTimeFilter(initialYear, activeSnapshots);
        map.setFilter(FILL_LAYER_ID, filter);
        map.setFilter(HATCH_LAYER_ID, filter);
        map.setFilter(OUTLINE_LAYER_ID, filter);

        // ── Step 7a: Kick off ALL standard-layer fetches concurrently ─────────
        // These eight files are independent and large (events ~3k, settlements ~4k,
        // languages ~2.5k, military ~2k). Previously each was awaited in turn, so
        // the loading overlay stayed up for the SUM of all eight round-trips before
        // 'ready' fired (~5–7 s). We start every fetch here so they overlap on the
        // network; the awaits below then resolve in Z-order for layered addLayer()
        // calls. Wall-clock collapses to the SLOWEST single fetch, not the sum.
        // Each fetchX() handles its own errors and resolves to null on failure.
        const eventsP      = fetchEventsGeojson();
        const journeysP    = fetchJourneysGeojson();
        const tradeP       = fetchTradeGeojson();
        const settlementsP = fetchSettlementsGeojson();
        const militaryP    = fetchMilitaryGeojson();
        const capitalsP    = fetchCapitalsGeojson();

        // ── Step 7b: Register events layer (non-blocking) ─────────────────────
        // Events fetch runs after polity layers are live. Failure is non-fatal:
        // polity layer stays up, a warning is logged.
        // fetchEventsGeojson() handles all error cases internally and returns null
        // on failure — addEventsLayer() is only called with a real collection.

        const eventsGeojson = await eventsP;
        if (!cancelled && eventsGeojson !== null) {
          eventsGeojsonRef.current = eventsGeojson;
          addEventsLayer(
            map,
            eventsGeojson,
            initialTheme,
            initialYear,
            initialEventsVisible,
          );
          // Re-assert events visibility from the live store once the map is idle.
          // FIX (event pins not showing): a symbol layer's visibility set can be a
          // no-op on the frame it is added (icons not yet placed), so a toggle made
          // before the layer settled left the PIN layer hidden while the circle
          // layer showed — events looked like circles, not markers. Re-applying on
          // 'idle' guarantees the pin layer honors the current toggle state.
          map.once('idle', () => {
            try {
              setEventsVisibility(map, useLayersStore.getState().layers['events']?.visible ?? false);
            } catch { /* transitional — the visibility effect will reapply */ }
          });
          mapLog(
            '[eventsLayer] Loaded ' + eventsGeojson.features.length + ' events' +
            ' | visible: ' + initialEventsVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7c: Fetch + register journeys layer (non-blocking) ──────────
        // Same pattern as events: failure is non-fatal (warning logged, polity +
        // events layers stay live). Defaults to curated-only journeys (hides the
        // conquest zigzags) — see journeysLayer.ts module doc.

        const journeysGeojson = await journeysP;
        if (!cancelled && journeysGeojson !== null) {
          journeysGeojsonRef.current = journeysGeojson;
          addJourneysLayer(
            map,
            journeysGeojson,
            initialTheme,
            initialYear,
            initialJourneysVisible,
          );
          const lineCount = journeysGeojson.features.filter(
            (f) => f.properties.geomKind === 'line',
          ).length;
          const curatedCount = journeysGeojson.features.filter(
            (f) => f.properties.geomKind === 'line' && f.properties.curated,
          ).length;
          mapLog(
            '[journeysLayer] Loaded ' + lineCount + ' journeys' +
            ' (' + curatedCount + ' curated, shown by default)' +
            ' | visible: ' + initialJourneysVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7d: Fetch + register trade routes layer (non-blocking) ─────────
        // Trade lines go first (Z-order: beneath all point layers).
        const tradeGeojson = await tradeP;
        if (!cancelled && tradeGeojson !== null) {
          tradeGeojsonRef.current = tradeGeojson;
          addTradeLayer(
            map,
            tradeGeojson,
            initialTheme,
            initialYear,
            initialTradeVisible,
          );
          mapLog(
            '[tradeLayer] Loaded ' + tradeGeojson.features.length + ' trade routes' +
            ' | visible: ' + initialTradeVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7e: Fetch + register settlements layer (non-blocking) ───────────
        // Settlements are a dense dot-mass (4,077 features) — added before capitals
        // so capitals render on top.
        const settlementsGeojson = await settlementsP;
        if (!cancelled && settlementsGeojson !== null) {
          settlementsGeojsonRef.current = settlementsGeojson;
          addSettlementsLayer(
            map,
            settlementsGeojson,
            initialTheme,
            initialYear,
            initialSettlementsVisible,
          );
          mapLog(
            '[settlementsLayer] Loaded ' + settlementsGeojson.features.length + ' settlements' +
            ' | visible: ' + initialSettlementsVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7f: Fetch + register military sites layer (non-blocking) ────────
        // Military sites sit above settlements and below capitals in Z-order.
        const militaryGeojson = await militaryP;
        if (!cancelled && militaryGeojson !== null) {
          militaryGeojsonRef.current = militaryGeojson;
          addMilitaryLayer(
            map,
            militaryGeojson,
            initialTheme,
            initialYear,
            initialMilitaryVisible,
          );
          // Re-assert live store values (may have changed during the async fetch)
          // — same pattern as relationships. Without this, a toggle made while the
          // military geojson was loading is lost once the layer exists.
          const liveMilVisible = useLayersStore.getState().layers['military']?.visible ?? false;
          const liveMilOpacity = useLayersStore.getState().layers['military']?.opacity ?? 1;
          setMilitaryVisibility(map, liveMilVisible);
          setMilitaryOpacity(map, liveMilOpacity);
          mapLog(
            '[militaryLayer] Loaded ' + militaryGeojson.features.length + ' military sites (forts)' +
            ' | visible: ' + liveMilVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7g: Fetch + register capitals layer (non-blocking) ──────────────
        // Capitals sit above settlements and military — added last among the new
        // point layers so they are always on top of the dot mass.
        const capitalsGeojson = await capitalsP;
        if (!cancelled && capitalsGeojson !== null) {
          capitalsGeojsonRef.current = capitalsGeojson;
          addCapitalsLayer(
            map,
            capitalsGeojson,
            initialTheme,
            initialYear,
            initialCapitalsVisible,
          );
          mapLog(
            '[capitalsLayer] Loaded ' + capitalsGeojson.features.length + ' capitals' +
            ' | visible: ' + initialCapitalsVisible +
            ' | initial year: ' + initialYear,
          );
        }

        // ── Step 7h: Sea-labels layer — REMOVED (user request) ───────────────────
        // The ambient Latin sea-labels ("MARE NOSTRVM", etc.) were removed at the
        // user's request: no fetch, no layer, nothing renders over the water.

        // ── Step 7i: Add tower-capital symbol layer (atop capitals-circle) ───────
        // A symbol layer using the CAPITAL_TOWER_IMAGE_ID registered at Step 3b.
        // Placed above the capitals circle layer so the icon overlays the disc.
        // Guards: only added if the capitals source is present (fetch may have failed).
        if (map.getSource('capitals-source')) {
          const capTowerLayerId = 'capitals-tower';
          if (!map.getLayer(capTowerLayerId)) {
            map.addLayer({
              id: capTowerLayerId,
              type: 'symbol',
              source: 'capitals-source',
              filter: ['all',
                ['<=', ['coalesce', ['get', 'start_year'], 500], initialYear],
                ['>=', ['coalesce', ['get', 'end_year'],   1500], initialYear],
              ],
              layout: {
                'icon-image': CAPITAL_TOWER_IMAGE_ID,
                'icon-size': [
                  'interpolate', ['linear'], ['zoom'],
                  2,  0.55,
                  5,  0.75,
                  8,  0.95,
                  12, 1.2,
                ],
                'icon-allow-overlap': true,
                'icon-ignore-placement': false,
                // Show capital name above tower at higher zoom
                'text-field': ['step', ['zoom'], '', 7, ['get', 'name']],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 10,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
                'text-allow-overlap': false,
                visibility: initialCapitalsVisible ? 'visible' : 'none',
              },
              paint: {
                'text-color': tokens.label,
                'text-halo-color': tokens.sea,
                'text-halo-width': 1,
                'text-opacity': 0.85,
              },
            });
          }
        }

        // ── Step 7j: Honest accounting of truly unavailable layers ─────────────
        logUnavailableLayers();

        // ── Step 8: Performance mark + log (Task 3 — budget measurement) ──
        // Core polity + standard dataset layers are now live. We mark first-paint
        // and flip to 'ready' HERE — the three optional ANALYTICAL layers
        // (relationships / heatmap / cartogram) load afterwards, non-blocking, so a
        // slow or failing analytical fetch can never hold the whole map hostage in
        // the loading overlay (regression fix: cartogram fetch previously gated ready).

        performance.mark('mapcanvas-first-paint');
        try {
          performance.measure(
            'mapcanvas-mount-to-first-paint',
            'mapcanvas-mount-start',
            'mapcanvas-first-paint',
          );
          const entries = performance.getEntriesByName('mapcanvas-mount-to-first-paint');
          const measure = entries[entries.length - 1];
          if (measure) {
            mapLog(
              `[MapCanvas] Mount → first paint: ${measure.duration.toFixed(1)} ms` +
              ` | ${geojson.features.length} features loaded` +
              ` | initial year: ${initialYear}`,
            );
          }
        } catch {
          // performance API may not be available in all test environments.
        }

        if (!cancelled) {
          setState({ phase: 'ready' });
          setMapInstance(map);
          // Signal the splash that the map is fully painted — polities + all
          // standard layers are live. Analytical layers load after this, non-blocking.
          signalSplashMapReady();
        }

        // ── Step 9: Analytical layers (heatmap / relationships) ──────────────────
        // Both run as independent detached tasks after 'ready'. Heatmap needs no
        // fetch (reuses the already-loaded events source) so it registers immediately.

        // 9a — heatmap: no fetch needed — events source is already loaded above.
        // Runs synchronously (no await) so it is guaranteed to register before the
        // user can even open the LayerRail.
        // Re-assert live store visibility after addHeatmapLayer: the React visibility
        // effect fires after setState({ phase: 'ready' }) above, but since the heatmap
        // is added in the same microtask continuation the effect may have already run
        // and no-op'd (layer absent). Re-applying here ensures the live store value wins.
        try {
          if (!cancelled) {
            addHeatmapLayer(map, initialYear, initialHeatmapVisible);
            const liveHeatmapVisible = useLayersStore.getState().layers['heatmap']?.visible ?? false;
            setHeatmapVisibility(map, liveHeatmapVisible);
            setHeatmapOpacity(map, useLayersStore.getState().layers['heatmap']?.opacity ?? 1);
            mapLog('[heatmapLayer] Added heatmap over events | visible: ' + liveHeatmapVisible);
          }
        } catch (err) {

          console.warn('[heatmapLayer] skipped:', err instanceof Error ? err.message : String(err));
        }

        // 9b — relationships arcs: async fetch, independent of 9c.
        // After addRelationshipsLayer succeeds, re-assert the live store visibility and
        // opacity. The React visibility effect in MapCanvas runs as soon as phase becomes
        // 'ready' (above), but the layers don't exist yet at that point — setLayoutProperty
        // no-ops on absent layers. A toggle made during the fetch window is silently lost.
        // Reading the store here (after the await) picks up any toggle made during the load.
        void (async () => {
          try {
            const relationshipsGeojson = await fetchRelationshipsGeojson();
            if (!cancelled && relationshipsGeojson !== null) {
              relationshipsGeojsonRef.current = relationshipsGeojson;
              addRelationshipsLayer(
                map,
                relationshipsGeojson,
                initialTheme,
                initialYear,
                initialRelationshipsVisible,
              );
              // Re-assert: read live store values (may have changed during the async fetch).
              const liveRelVisible = useLayersStore.getState().layers['relationships']?.visible ?? false;
              const liveRelOpacity = useLayersStore.getState().layers['relationships']?.opacity ?? 1;
              setRelationshipsVisibility(map, liveRelVisible);
              setRelationshipsOpacity(map, liveRelOpacity);
              mapLog(
                '[relationshipsLayer] Added ' + relationshipsGeojson.arcs.features.length + ' arcs + ' +
                relationshipsGeojson.studs.features.length + ' studs' +
                ' | visible: ' + liveRelVisible,
              );
            }
          } catch (err) {

            console.warn('[relationshipsLayer] skipped:', err instanceof Error ? err.message : String(err));
          }
        })();

        // 9c — proportional symbol layer: async fetch, independent of 9b.
        // Same re-assert pattern as 9b: read live store after the await so a toggle
        // made during the fetch window is honoured once the layer exists.
        void (async () => {
          try {
            const cartogramGeojson = await fetchCartogramGeojson();
            if (!cancelled && cartogramGeojson !== null) {
              cartogramGeojsonRef.current = cartogramGeojson;
              addCartogramLayer(
                map,
                cartogramGeojson,
                initialTheme,
                initialYear,
                initialCartogramVisible,
              );
              // Re-assert: read live store values (may have changed during the async fetch).
              const liveCartVisible = useLayersStore.getState().layers['cartogram']?.visible ?? false;
              const liveCartOpacity = useLayersStore.getState().layers['cartogram']?.opacity ?? 1;
              setCartogramVisibility(map, liveCartVisible);
              setCartogramOpacity(map, liveCartOpacity);
              mapLog(
                '[cartogramLayer] Added ' + cartogramGeojson.features.length + ' symbols' +
                ' | visible: ' + liveCartVisible,
              );
            }
          } catch (err) {

            console.warn('[cartogramLayer] skipped:', err instanceof Error ? err.message : String(err));
          }
        })();

      });

      // Surface MapLibre errors without crashing.
      map.on('error', (e: { error: Error }) => {
         
        console.error('[MapCanvas] MapLibre error:', e.error?.message ?? e.error);
      });
    }

    boot().catch((err: unknown) => {
      if (!cancelled) {
        setState({
          phase: 'error',
          error: `Unexpected boot error: ${err instanceof Error ? err.message : String(err)}`,
        });
        signalSplashMapReady();
      }
    });

    return () => {
      cancelled = true;
      clearMapInstance();
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (teardownGuards) {
        teardownGuards();
        teardownGuards = null;
      }
      if (mapInstance) {
        try { mapInstance.remove(); } catch { /* ignore — map may already be torn down */ }
        mapRef.current = null;
        geojsonRef.current = null;
        eventsGeojsonRef.current      = null;
        journeysGeojsonRef.current    = null;
        capitalsGeojsonRef.current    = null;
        settlementsGeojsonRef.current = null;
        militaryGeojsonRef.current    = null;
        tradeGeojsonRef.current       = null;
        relationshipsGeojsonRef.current = null;
        cartogramGeojsonRef.current     = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty: map is initialised once per mount lifecycle.

  return {
    state,
    mapRef,
    geojsonRef,
    eventsGeojsonRef,
    journeysGeojsonRef,
    capitalsGeojsonRef,
    settlementsGeojsonRef,
    militaryGeojsonRef,
    tradeGeojsonRef,
  };
}
