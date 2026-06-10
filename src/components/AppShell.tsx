/**
 * AppShell — composes the six fixed regions of the Historical Data Visualizer into the `.msa-app` grid.
 *
 * The six regions (from atlas-shell.css `.msa-app` grid-template-areas):
 *   1. TopBar        — brand wordmark + live theme / map-type / projection switchers + view toggles
 *   2. LayerRail     — printer's-table layer toggles + legend stub (left)
 *   3. MapCanvas     — the primary map surface (center, grows)
 *   4. TimeRail      — year scrubber + chronoscope (below map)
 *   5. EntityDock    — hover-tip → inspector → dock card (right)
 *   6. StatusBar     — bottom strip: live year / era / theme / layer-count readout
 *
 * P4-A addition: NetworkOverlay renders as a fixed overlay above the map area
 * (z-index 50, below the TopBar). It is toggled by the "Network" button in TopBar.
 * `useNetworkOverlay` owns the open/close boolean so the simulation stays mounted.
 *
 * P4-B addition: LineageOverlay renders as a fixed overlay using the same pattern.
 * `useLineageOverlay` owns the open/close boolean. The "Lineage" button in TopBar
 * toggles it. The overlay stays mounted so the Gantt layout is preserved on close/reopen.
 *
 * P4-C addition: CompareOverlay renders as a fixed overlay using the same pattern.
 * `useCompareOverlay` owns the open/close boolean. The "Compare" button in TopBar
 * toggles it. The overlay stays mounted so the compare set persists on close/reopen.
 *
 * P5-C addition: SourcesOverlay renders as a fixed overlay using the same pattern.
 * `useSourcesOverlay` owns the open/close boolean. The "Sources" button in TopBar
 * toggles it. The overlay stays mounted so sort/filter state persists on close/reopen.
 *
 * Code-split (perf): the four heavy overlay components are lazy-loaded via
 * React.lazy so their JS chunks are NOT included in the initial app bundle.
 * Each overlay's hook (tiny useState+useCallback) is imported eagerly from its
 * own micro-module. The component chunk only loads the first time the user opens
 * that overlay (hasOpened gate: we only render the lazy component after `open`
 * has been true at least once, so Suspense never fetches the chunk until needed).
 *
 * Nothing floats. Grid owns all layout; regions do not overlap.
 * Every data surface shows an honest empty state — this is Cycle 1 (Frame)
 * and no records are loaded yet. The Spine cycle wires real data.
 *
 * CSS is imported once here so the shell loads as a single import.
 */
import '@/styles/atlas-shell.css';
import '@/styles/network-graph.css';
import '@/styles/compare-overlay.css';
import '@/styles/lineage-gantt.css';
import '@/styles/sources-library.css';
import '@/styles/registers.css';
import '@/upload/upload-overlay.css';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TopBar }                from '@/components/TopBar';
import { LayerRail }             from '@/components/LayerRail';
import { MapCanvas }             from '@/map/MapCanvas';           // Spine 2c-ii
import { TimeRail }              from '@/components/TimeRail';     // P3-D chronoscope
import { EntityDock }            from '@/panels/EntityDock';       // P3-C
import { StatusBar }             from '@/components/StatusBar';
import { CommandBar }            from '@/components/CommandBar';   // P4-D
import { useMobileSheet }        from '@/components/useMobileSheet'; // 4C mobile sheets

// ── Eager hook imports (tiny — just useState+useCallback) ──────────────────────
import { useNetworkOverlay } from '@/charts/useNetworkOverlay';   // P4-A hook
import { useCompareOverlay } from '@/panels/useCompareOverlay';   // P4-C hook
import { useLineageOverlay } from '@/charts/useLineageOverlay';   // P4-B hook
import { useSourcesOverlay } from '@/pages/useSourcesOverlay';    // P5-C hook
import { useSavedViewsOverlay } from '@/panels/useSavedViewsOverlay'; // Wave2-D hook
import { useRegistersOverlay } from '@/pages/useRegistersOverlay';    // Wave2-B hook
import { useUploadOverlay } from '@/upload/useUploadOverlay';         // Wave2-A hook
import { useWalkthrough, WALKTHROUGH_REPLAY_EVENT } from '@/components/useWalkthrough'; // first-open guided tour
import { RegionErrorBoundary } from '@/components/RegionErrorBoundary'; // per-region crash isolation
import { resizeMap } from '@/map/mapInstance';
import { useRecordsStore } from '@/stores/recordsStore';
import { useUrlState } from '@/data/useUrlState'; // shareable deep-link view state

// ── Lazy overlay component imports (chunks load on first open) ─────────────────
//
// Each lazy() call creates a split point. Vite emits a separate chunk for
// NetworkOverlay (+ NetworkGraph/forceLayout), CompareOverlay (+ CompareTable/
// Storyline), LineageOverlay (+ LineageGantt/lineageLayout), and SourcesOverlay
// (+ SourcesLibrary). None of these bytes appear in the initial app bundle.
//
// The `.then(m => ({ default: m.XOverlay }))` adapter converts the named export
// to the default shape that React.lazy requires.
const NetworkOverlay = lazy(() =>
  import('@/charts/NetworkOverlay').then((m) => ({ default: m.NetworkOverlay })),
);

const CompareOverlay = lazy(() =>
  import('@/panels/CompareOverlay').then((m) => ({ default: m.CompareOverlay })),
);

const LineageOverlay = lazy(() =>
  import('@/charts/LineageOverlay').then((m) => ({ default: m.LineageOverlay })),
);

const SourcesOverlay = lazy(() =>
  import('@/pages/SourcesOverlay').then((m) => ({ default: m.SourcesOverlay })),
);

// Wave2-D: Saved Views drawer — chunk loads on first open.
const SavedViewsPanel = lazy(() =>
  import('@/panels/SavedViewsPanel').then((m) => ({ default: m.SavedViewsPanel })),
);

// Wave2-B: Registers (attribute-table) overlay — chunk loads on first open.
const RegistersOverlay = lazy(() =>
  import('@/pages/RegistersOverlay').then((m) => ({ default: m.RegistersOverlay })),
);

// Wave2-A: User-data Upload / "My Data" overlay — chunk loads on first open.
const UploadOverlay = lazy(() =>
  import('@/upload/UploadOverlay').then((m) => ({ default: m.UploadOverlay })),
);

// Wave1-B: Faceted Filter panel — chunk loads on first open.
const FilterPanel = lazy(() =>
  import('@/components/FilterPanel').then((m) => ({ default: m.FilterPanel })),
);

// Wave1-B: Semantic (local TF-IDF) search overlay — chunk loads on first open.
const SemanticSearchBar = lazy(() =>
  import('@/components/SemanticSearchBar').then((m) => ({ default: m.SemanticSearchBar })),
);

// Settings panel (Theme + Map-base selectors + Guides) — chunk loads on first open.
const SettingsPanel = lazy(() =>
  import('@/components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);

// First-open guided tour — chunk loads only when the tour actually opens.
const Walkthrough = lazy(() =>
  import('@/components/Walkthrough').then((m) => ({ default: m.Walkthrough })),
);


/**
 * Root application shell. Renders the `.msa-app` six-region grid plus the
 * P4-A NetworkOverlay and P4-C CompareOverlay as fixed layers above the map area.
 *
 * Each overlay hook (useNetworkOverlay / useCompareOverlay / useLineageOverlay /
 * useSourcesOverlay) owns its own open/close boolean — no frozen store is modified,
 * no stores share state across overlays. All four are passed to TopBar as separate
 * toggle props so the "Network", "Compare", "Lineage", and "Sources" buttons live
 * in the same right-cluster group.
 *
 * hasOpened gating: each overlay is only rendered (and its chunk fetched) after
 * the user opens it for the first time. Once opened, the overlay stays in the
 * React tree permanently (same "stays mounted" semantics as before — compare set,
 * Gantt layout, sort/filter state all persist across close/reopen cycles).
 *
 * Consumed directly by `<App/>` in `src/App.tsx`.
 */
export function AppShell() {
  const { open: networkOpen, toggle: toggleNetwork, close: closeNetwork } =
    useNetworkOverlay();

  const { open: compareOpen, toggle: toggleCompare, close: closeCompare } =
    useCompareOverlay();

  const { open: lineageOpen, toggle: toggleLineage, close: closeLineage } =
    useLineageOverlay();

  const { open: sourcesOpen, targetId: sourcesTargetId, toggle: toggleSources, close: closeSources, openTo: openSourcesTo } =
    useSourcesOverlay();

  const { open: viewsOpen, toggle: toggleViews, close: closeViews } =
    useSavedViewsOverlay();

  const { open: registersOpen, toggle: toggleRegisters, close: closeRegisters } =
    useRegistersOverlay();

  const { open: uploadOpen, toggle: toggleUpload, close: closeUpload } =
    useUploadOverlay();

  // Deep-link router for claim citations: a footnote in ClaimCitations links to
  // `#page=sources&item=<sourceId>`. Parse the hash on load + on change, open the
  // Sources overlay, and pass the target id down so SourcesLibrary focuses that row.
  // (Only the sources route is wired today; the parser is structured to extend.)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      if (params.get('page') === 'sources') {
        const item = params.get('item');
        if (item) openSourcesTo(item);
        else toggleSources();
        // Strip ONLY the footnote keys so re-clicking re-triggers the handler,
        // while preserving the shareable view keys (year/theme/map/proj/sel) that
        // useUrlState writes to the same hash.
        params.delete('page');
        params.delete('item');
        const rest = params.toString();
        history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + (rest ? `#${rest}` : ''),
        );
      }
    };
    handleHash(); // handle a hash present on initial load
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [openSourcesTo, toggleSources]);

  // Shareable deep-link view state: hydrate from the hash once records are loaded
  // (so the year clamps to real bounds), then keep the hash in sync with the view.
  const recordsReady = useRecordsStore((s) => s.counts !== null);
  useUrlState(recordsReady);

  // Wave1-B: Filter + Semantic-search overlays use local open-state (simple
  // {open,onClose} components; same lazy + hasOpened pattern as the hook-backed overlays).
  const [filterOpen, setFilterOpen] = useState(false);
  const toggleFilter = () => setFilterOpen((v) => !v);
  const closeFilter = () => setFilterOpen(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = () => setSearchOpen((v) => !v);
  const closeSearch = () => setSearchOpen(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleSettings = () => setSettingsOpen((v) => !v);
  const closeSettings = () => setSettingsOpen(false);

  // Mutual exclusion: the overlays/panels are all position:fixed at the same
  // z-index, so two open at once visually collide (audit finding). Closing every
  // sibling before opening a target keeps exactly one surface up at a time.
  const closeAllSurfaces = useCallback(() => {
    closeNetwork(); closeCompare(); closeLineage(); closeSources();
    closeViews(); closeRegisters(); closeUpload();
    setFilterOpen(false); setSearchOpen(false); setSettingsOpen(false);
  }, [closeNetwork, closeCompare, closeLineage, closeSources, closeViews, closeRegisters, closeUpload]);

  /** Wrap a toggle so opening it first closes all other surfaces. */
  const exclusive = useCallback(
    (isOpen: boolean, toggle: () => void) => () => {
      if (isOpen) { toggle(); return; }   // closing the active one — no sibling churn
      closeAllSurfaces();
      toggle();
    },
    [closeAllSurfaces],
  );

  // The "Replay tour" button lives inside the Settings panel — but the tour
  // spotlights the workspace and the Settings panel would sit on top, freezing
  // interaction. So when a replay is requested, close all open surfaces (Settings
  // included) first, leaving a clean workspace for the tour to anchor to.
  useEffect(() => {
    const onReplay = () => closeAllSurfaces();
    window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
  }, [closeAllSurfaces]);

  // First-open guided tour: auto-shows once (localStorage flag), replayable from
  // Settings → Guides via a window event. hasOpened gates the lazy chunk so the
  // tour's JS only loads when it actually runs.
  const { open: walkthroughOpen, close: closeWalkthrough, hasOpened: walkthroughHasOpened, isFirstVisit } =
    useWalkthrough();

  // "All aspects collapsible/hidden" (user request): the LayerRail and EntityDock
  // each collapse to a thin re-open strip. State lives here so the grid columns
  // (--layerrail-w / --dock-w) can be narrowed via classes on .msa-app.
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  // Fullscreen dock: expands the inspector to fill the map + layerrail area.
  // Mutually exclusive with collapsed — expanding always un-collapses.
  const [dockFullscreen, setDockFullscreen] = useState(false);
  // Fullscreen layer rail: mirror of the dock — expands the rail to fill the
  // map area. Un-collapses on expand.
  const [railFullscreen, setRailFullscreen] = useState(false);

  // After any panel toggle the CSS grid column animates (200ms). MapLibre needs
  // map.resize() called AFTER the layout settles or it renders at the wrong size.
  // Fire four times: immediately (catches instant reflows), next rAF (catches the
  // first painted frame), after the full 220ms transition (definitive settle for
  // collapse/expand), and at 350ms (covers the fullscreen animation + fallback
  // repaint timer in mapStabilityGuards which fires at 300ms post-last-resize).
  const scheduleMapResize = useCallback(() => {
    resizeMap();
    const raf = requestAnimationFrame(() => { resizeMap(); });
    const timer1 = setTimeout(() => { resizeMap(); }, 220);
    const timer2 = setTimeout(() => { resizeMap(); }, 350);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  const toggleDockFullscreen = () => {
    setDockFullscreen((v) => {
      if (!v) setDockCollapsed(false); // un-collapse when expanding
      return !v;
    });
    scheduleMapResize();
  };

  const toggleRailFullscreen = () => {
    setRailFullscreen((v) => {
      if (!v) setRailCollapsed(false); // un-collapse when expanding
      return !v;
    });
    scheduleMapResize();
  };

  // After the first-visit tour closes, collapse both side panels so the user
  // lands on a clean full-map view. Replays don't trigger the collapse.
  const handleWalkthroughClose = useCallback(() => {
    closeWalkthrough();
    if (isFirstVisit) {
      setRailCollapsed(true);
      setDockCollapsed(true);
      setDockFullscreen(false);
      setRailFullscreen(false);
    }
  }, [closeWalkthrough, isFirstVisit]);

  // hasOpened flags: once true, the lazy overlay stays rendered permanently so
  // its internal state (simulation, Gantt layout, compare set, sort order) is
  // preserved across close/reopen cycles — identical to the previous eager behavior.
  const [networkHasOpened,  setNetworkHasOpened]  = useState(false);
  const [compareHasOpened,  setCompareHasOpened]  = useState(false);
  const [lineageHasOpened,  setLineageHasOpened]  = useState(false);
  const [sourcesHasOpened,  setSourcesHasOpened]  = useState(false);
  const [viewsHasOpened,    setViewsHasOpened]    = useState(false);
  const [registersHasOpened, setRegistersHasOpened] = useState(false);
  const [uploadHasOpened,    setUploadHasOpened]    = useState(false);
  const [filterHasOpened,    setFilterHasOpened]    = useState(false);
  const [searchHasOpened,    setSearchHasOpened]    = useState(false);
  const [settingsHasOpened,  setSettingsHasOpened]  = useState(false);

  // Flip hasOpened the moment each overlay transitions to open=true.
  useEffect(() => { if (networkOpen) setNetworkHasOpened(true); }, [networkOpen]);
  useEffect(() => { if (compareOpen) setCompareHasOpened(true); }, [compareOpen]);
  useEffect(() => { if (lineageOpen) setLineageHasOpened(true); }, [lineageOpen]);
  useEffect(() => { if (sourcesOpen) setSourcesHasOpened(true); }, [sourcesOpen]);
  useEffect(() => { if (viewsOpen)   setViewsHasOpened(true);   }, [viewsOpen]);
  useEffect(() => { if (registersOpen) setRegistersHasOpened(true); }, [registersOpen]);
  useEffect(() => { if (uploadOpen)  setUploadHasOpened(true);  }, [uploadOpen]);
  useEffect(() => { if (filterOpen)  setFilterHasOpened(true);  }, [filterOpen]);
  useEffect(() => { if (searchOpen)  setSearchHasOpened(true);  }, [searchOpen]);
  useEffect(() => { if (settingsOpen) setSettingsHasOpened(true); }, [settingsOpen]);

  // Entrance reveal: the six regions start at opacity:0 (atlas-shell.css guards
  // against a flash of unstyled frame). After mount we add `.is-ready` to trigger
  // the staggered reveal. Without this the whole shell stays invisible (bug fixed
  // 2026-05-29). A double-rAF ensures the browser paints the opacity:0 start state
  // before the transition begins, so the reveal animates rather than snapping.
  //
  // `isReady` is React state — NOT an imperative `classList.add` — and is folded
  // into the controlled `className` below. This is load-bearing: the `.msa-app`
  // className is fully React-controlled, so any later re-render (e.g. a panel
  // collapse flipping railCollapsed/dockCollapsed) reconciles the class attribute
  // back to exactly what the render returns. An imperatively-added class would be
  // wiped on the next toggle, dropping every region to opacity:0 — a white screen.
  // Keeping the reveal flag in render state makes React the single source of truth
  // for the class, so the reveal survives every subsequent toggle. (Bug fixed
  // 2026-06-07: "hiding any panel turns the screen white".)
  const appRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setIsReady(true);
      }),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  // 4C: Mobile bottom-sheet chrome — injects sheet-bar, handles, and backdrop
  // into the DOM when the viewport is ≤600 px. Self-contained; no store touch.
  useMobileSheet(appRef);

  // Layout-transition key for the region error boundaries: whenever a panel is
  // collapsed, expanded, or full-screened, this string changes — so if a region
  // briefly threw during the reflow, its boundary auto-recovers on the toggle.
  const layoutKey = `${railCollapsed}|${dockCollapsed}|${dockFullscreen}|${railFullscreen}`;

  return (
    <div
      className={`msa-app${isReady ? ' is-ready' : ''}${railCollapsed ? ' is-rail-collapsed' : ''}${dockCollapsed ? ' is-dock-collapsed' : ''}${dockFullscreen ? ' is-dock-fullscreen' : ''}${railFullscreen ? ' is-rail-fullscreen' : ''}`}
      ref={appRef}
    >
      <RegionErrorBoundary region="Top bar" resetKey={layoutKey} fallbackClassName="msa-topbar">
        <TopBar
          onNetworkToggle={exclusive(networkOpen, toggleNetwork)}
          networkOpen={networkOpen}
          onCompareToggle={exclusive(compareOpen, toggleCompare)}
          compareOpen={compareOpen}
          onLineageToggle={exclusive(lineageOpen, toggleLineage)}
          lineageOpen={lineageOpen}
          onSourcesToggle={exclusive(sourcesOpen, toggleSources)}
          sourcesOpen={sourcesOpen}
          onViewsToggle={exclusive(viewsOpen, toggleViews)}
          viewsOpen={viewsOpen}
          onRegistersToggle={exclusive(registersOpen, toggleRegisters)}
          registersOpen={registersOpen}
          onUploadToggle={exclusive(uploadOpen, toggleUpload)}
          uploadOpen={uploadOpen}
          onFilterToggle={exclusive(filterOpen, toggleFilter)}
          filterOpen={filterOpen}
          onSearchToggle={exclusive(searchOpen, toggleSearch)}
          searchOpen={searchOpen}
          onSettingsToggle={exclusive(settingsOpen, toggleSettings)}
          settingsOpen={settingsOpen}
        />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="Layers" resetKey={layoutKey} fallbackClassName="msa-layerrail">
        <LayerRail
          collapsed={railCollapsed}
          onToggleCollapse={() => { setRailCollapsed((v) => !v); setRailFullscreen(false); scheduleMapResize(); }}
          fullscreen={railFullscreen}
          onToggleFullscreen={toggleRailFullscreen}
        />
      </RegionErrorBoundary>
      {/*
        Each shell region is wrapped in a RegionErrorBoundary so a transient render
        error during a panel collapse / expand / fullscreen reflow is isolated to
        that region (the rest of the app keeps running) and auto-recovers on the
        next layout change via `resetKey={layoutKey}`. When healthy the boundary
        renders its child unchanged, so it is layout-transparent — each region still
        owns its own grid-area element.
      */}
      <RegionErrorBoundary region="Map" resetKey={layoutKey} fallbackClassName="msa-map">
        <MapCanvas />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="Time rail" resetKey={layoutKey} fallbackClassName="msa-timerail">
        <TimeRail />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="Inspector" resetKey={layoutKey} fallbackClassName="msa-dock">
        <EntityDock
          collapsed={dockCollapsed}
          onToggleCollapse={() => { setDockCollapsed((v) => !v); setDockFullscreen(false); scheduleMapResize(); }}
          fullscreen={dockFullscreen}
          onToggleFullscreen={toggleDockFullscreen}
        />
      </RegionErrorBoundary>
      <RegionErrorBoundary region="Status bar" resetKey={layoutKey} fallbackClassName="msa-statusbar">
        <StatusBar />
      </RegionErrorBoundary>

      {/*
        P4-A: Relationship network overlay — fixed above map, below TopBar.
        Chunk loads on first open; stays rendered once opened so the force
        simulation is preserved across close/reopen cycles.
      */}
      {networkHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Network" resetKey={layoutKey}>
            <NetworkOverlay open={networkOpen} onClose={closeNetwork} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        P4-B: Ruler lineage Gantt overlay — same fixed layer, same z-index.
        Chunk loads on first open; Gantt layout memo preserved across cycles.
      */}
      {lineageHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Lineage" resetKey={layoutKey}>
            <LineageOverlay open={lineageOpen} onClose={closeLineage} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        P4-C: Compare / Storyline overlay — same fixed layer, same z-index.
        Chunk loads on first open; compare set + tab state preserved across cycles.
      */}
      {compareHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Compare" resetKey={layoutKey}>
            <CompareOverlay open={compareOpen} onClose={closeCompare} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        P5-C: Sources Library overlay — same fixed layer, same z-index.
        Chunk loads on first open; sort/filter state preserved across cycles.
      */}
      {sourcesHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Sources" resetKey={layoutKey}>
            <SourcesOverlay open={sourcesOpen} onClose={closeSources} focusId={sourcesTargetId} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        Wave2-D: Saved Views drawer — fixed right-side drawer. Chunk loads on
        first open; stays mounted so the draft name input is preserved across
        close/reopen cycles. Captures/applies frozen-store state via public actions.
      */}
      {viewsHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Saved views" resetKey={layoutKey}>
            <SavedViewsPanel open={viewsOpen} onClose={closeViews} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        Wave2-B: Registers (attribute-table) overlay — same fixed layer, same
        z-index. Chunk loads on first open; stays mounted so the active register
        kind + per-table sort/filter state persist across close/reopen cycles.
      */}
      {registersHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Registers" resetKey={layoutKey}>
            <RegistersOverlay open={registersOpen} onClose={closeRegisters} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/*
        Wave2-A: User-data Upload / "My Data" overlay — same fixed layer, same
        z-index. Chunk loads on first open; stays mounted so import preview and
        list scroll state persist across close/reopen cycles. The user's data
        lives ONLY in the browser (IndexedDB) — never transmitted.
      */}
      {uploadHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="My Data" resetKey={layoutKey}>
            <UploadOverlay open={uploadOpen} onClose={closeUpload} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/* Wave1-B: Faceted Filter panel — chunk loads on first open. */}
      {filterHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Filter" resetKey={layoutKey}>
            <FilterPanel open={filterOpen} onClose={closeFilter} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/* Wave1-B: Semantic (local TF-IDF) search overlay — chunk loads on first open. */}
      {searchHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Search" resetKey={layoutKey}>
            <SemanticSearchBar open={searchOpen} onClose={closeSearch} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/* Settings panel (Theme + Map-base selectors) — chunk loads on first open. */}
      {settingsHasOpened && (
        <Suspense fallback={null}>
          <RegionErrorBoundary region="Settings" resetKey={layoutKey}>
            <SettingsPanel open={settingsOpen} onClose={closeSettings} />
          </RegionErrorBoundary>
        </Suspense>
      )}

      {/* P4-D: Command palette — fixed overlay, z-200, listens for Cmd-K globally */}
      <CommandBar />

      {/*
        First-open guided tour (z-300, above every overlay). Auto-shows once on
        first visit and replays from Settings → Guides. Mount-gated on hasOpened
        so its chunk only loads when the tour actually runs.
      */}
      {walkthroughHasOpened && (
        <Suspense fallback={null}>
          <Walkthrough open={walkthroughOpen} onClose={handleWalkthroughClose} />
        </Suspense>
      )}
    </div>
  );
}
