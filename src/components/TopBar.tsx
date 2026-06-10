/**
 * TopBar — brand strip + live settings controls (the `.msa-topbar` region).
 *
 * Renders the Historical Data Visualizer wordmark and subtitle, then control groups:
 *   1. Theme switcher — wired to `settingsStore.setTheme`; switches `<html data-theme>` live.
 *   2. Map-type selector — wired to `settingsStore.setMapType`.
 *   3. Projection selector — wired to `settingsStore.setProjection`.
 *   4. Network toggle — opens/closes the NetworkOverlay (P4-A).
 *   5. Compare toggle — opens/closes the CompareOverlay (P4-C).
 *   6. Lineage toggle — opens/closes the LineageOverlay (P4-B).
 *   7. Sources toggle — opens/closes the SourcesOverlay (P5-C).
 *
 * All three settings groups are required features. Active state is shown
 * with the `.is-active` class on `.btn` (atlas-tokens.css).
 *
 * The Network/Compare/Lineage toggles call their respective callback props. AppShell
 * owns the open/close state (via useNetworkOverlay/useCompareOverlay/useLineageOverlay)
 * so overlays stay mounted and their internal state is preserved across open/close cycles.
 */
import { useSettingsStore } from '@/stores/settingsStore';
import type { Projection } from '@/stores/settingsStore';
import { assetUrl } from '@/data/assetUrl';

/** Human-readable label for each projection. */
const PROJECTION_LABELS: Record<Projection, string> = {
  mercator: 'Mercator',
  globe: 'Globe',
};

/**
 * Projections offered in the UI. Mercator-only: a globe projection was
 * intentionally removed per product decision (this is a flat historical atlas).
 * The Projection type retains 'globe' for store compatibility, but it is never
 * presented as a choice. With a single entry the projection group renders nothing
 * (see the guard in the Projection control below).
 */
const PROJECTIONS: Projection[] = ['mercator'];

/** Props for TopBar. */
export interface TopBarProps {
  /**
   * Called when the user clicks the "Network" toggle button.
   * AppShell wires this to `useNetworkOverlay().toggle`.
   * Optional: if not provided, the Network button is not rendered.
   */
  onNetworkToggle?: () => void;
  /**
   * Whether the Network overlay is currently open.
   * Controls the `.is-active` class on the Network button.
   */
  networkOpen?: boolean;
  /**
   * Called when the user clicks the "Compare" toggle button.
   * AppShell wires this to `useCompareOverlay().toggle`.
   * Optional: if not provided, the Compare button is not rendered.
   * P4-C addition — same pattern as onNetworkToggle.
   */
  onCompareToggle?: () => void;
  /**
   * Whether the Compare overlay is currently open.
   * Controls the `.is-active` class on the Compare button.
   * P4-C addition.
   */
  compareOpen?: boolean;
  /**
   * Called when the user clicks the "Lineage" toggle button.
   * AppShell wires this to `useLineageOverlay().toggle`.
   * Optional: if not provided, the Lineage button is not rendered.
   * P4-B addition — same pattern as onNetworkToggle and onCompareToggle.
   */
  onLineageToggle?: () => void;
  /**
   * Whether the Lineage overlay is currently open.
   * Controls the `.is-active` class on the Lineage button.
   * P4-B addition.
   */
  lineageOpen?: boolean;
  /**
   * Called when the user clicks the "Sources" toggle button.
   * AppShell wires this to `useSourcesOverlay().toggle`.
   * Optional: if not provided, the Sources button is not rendered.
   * P5-C addition — same pattern as onNetworkToggle, onCompareToggle, onLineageToggle.
   */
  onSourcesToggle?: () => void;
  /**
   * Whether the Sources overlay is currently open.
   * Controls the `.is-active` class on the Sources button.
   * P5-C addition.
   */
  sourcesOpen?: boolean;
  /**
   * Called when the user clicks the "Views" toggle button.
   * AppShell wires this to `useSavedViewsOverlay().toggle`.
   * Optional: if not provided, the Views button is not rendered.
   * Wave2-D addition — same pattern as the other view toggles.
   */
  onViewsToggle?: () => void;
  /**
   * Whether the Saved Views drawer is currently open.
   * Controls the `.is-active` class on the Views button.
   * Wave2-D addition.
   */
  viewsOpen?: boolean;
  /**
   * Called when the user clicks the "Registers" toggle button.
   * AppShell wires this to `useRegistersOverlay().toggle`.
   * Optional: if not provided, the Registers button is not rendered.
   * Wave2-B addition — opens the attribute-table registers overlay.
   */
  onRegistersToggle?: () => void;
  /**
   * Whether the Registers overlay is currently open.
   * Controls the `.is-active` class on the Registers button.
   * Wave2-B addition.
   */
  registersOpen?: boolean;
  /**
   * Called when the user clicks the "My Data" toggle button.
   * AppShell wires this to `useUploadOverlay().toggle`.
   * Optional: if not provided, the My Data button is not rendered.
   * Wave2-A addition — opens the user-data upload overlay.
   */
  onUploadToggle?: () => void;
  /**
   * Whether the Upload / My Data overlay is currently open.
   * Controls the `.is-active` class on the My Data button.
   * Wave2-A addition.
   */
  uploadOpen?: boolean;
  /** Wave1-B: open/close the faceted Filter panel. */
  onFilterToggle?: () => void;
  /** Wave1-B: whether the Filter panel is open. */
  filterOpen?: boolean;
  /** Wave1-B: open/close the semantic (local TF-IDF) search overlay. */
  onSearchToggle?: () => void;
  /** Wave1-B: whether the search overlay is open. */
  searchOpen?: boolean;
  /** Toggle the Settings panel (Theme + Map-base selectors live there now). */
  onSettingsToggle?: () => void;
  /** Whether the Settings panel is open — controls the Settings button state. */
  settingsOpen?: boolean;
}

/**
 * Horizontal top bar: brand + live theme / map-type / projection switchers
 * + Network view toggle (P4-A).
 *
 * Consumes `settingsStore`; calling `setTheme` triggers `applyTheme` (in the
 * store action) which sets `<html data-theme>` on the document element.
 *
 * @param onNetworkToggle - Callback to open/close the relationship network overlay.
 * @param networkOpen     - Whether the network overlay is currently open.
 */
export function TopBar({
  onNetworkToggle,
  networkOpen = false,
  onCompareToggle,
  compareOpen = false,
  onLineageToggle,
  lineageOpen = false,
  onSourcesToggle,
  sourcesOpen = false,
  onViewsToggle,
  viewsOpen = false,
  onRegistersToggle,
  registersOpen = false,
  onUploadToggle,
  uploadOpen = false,
  onFilterToggle,
  filterOpen = false,
  onSearchToggle,
  searchOpen = false,
  onSettingsToggle,
  settingsOpen = false,
}: TopBarProps) {
  const projection = useSettingsStore((s) => s.projection);
  const setProjection = useSettingsStore((s) => s.setProjection);

  return (
    <header className="msa-topbar" role="banner">
      {/* Brand ───────────────────────────────────────────────────────── */}
      {/*
        Logo mark sits to the LEFT of the wordmark. The artwork (public/hdv-logo.svg)
        is the original "InvaderGIS" badge — we keep the mark as the app icon while the
        wordmark text remains "Historical Data Visualizer". Sized ~20px and hairline-
        aligned to the wordmark baseline; presentational, so it is aria-hidden.
      */}
      <div className="msa-topbar__brand" aria-label="InvaderGIS">
        <img
          src={assetUrl('/hdv-logo.svg')}
          alt="InvaderGIS"
          width={28}
          height={28}
          className="msa-topbar__logo"
          style={{ display: 'block', flex: '0 0 auto' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="msa-topbar__wordmark">InvaderGIS</span>
          <span className="msa-topbar__sub">Historical Data Visualizer</span>
        </div>
      </div>

      {/* Projection ──────────────────────────────────────────────────────
          Rendered only when more than one projection is offered. The app is a
          flat Mercator atlas (globe removed per product decision), so this group
          is currently hidden — no dead single-option switcher. When shown it
          keeps its own leading divider so the brand/controls stay separated. */}
      {PROJECTIONS.length > 1 && (
        <>
          <div className="msa-topbar__divider" aria-hidden="true" />
          <div className="msa-topbar__group" role="group" aria-label="Projection">
            <span className="msa-topbar__label">Proj</span>
            <div className="tab-row" role="radiogroup" aria-label="Select projection">
              {PROJECTIONS.map((p) => (
                <button
                  key={p}
                  className={`btn${p === projection ? ' is-active' : ''}`}
                  role="radio"
                  aria-checked={p === projection}
                  onClick={() => setProjection(p)}
                  title={`Projection: ${PROJECTION_LABELS[p]}`}
                >
                  {PROJECTION_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── ANALYSIS cluster ─────────────────────────────────────────────── */}
      {(onNetworkToggle !== undefined || onCompareToggle !== undefined || onLineageToggle !== undefined || onSourcesToggle !== undefined || onRegistersToggle !== undefined) && (
        <>
          <div className="msa-topbar__divider" aria-hidden="true" />
          <div className="msa-topbar__cluster" role="group" aria-label="Analysis views">
            <span className="msa-topbar__cluster-label" aria-hidden="true">Analysis</span>
            <div className="msa-topbar__cluster-btns">
              {onNetworkToggle !== undefined && (
                <button
                  className={`btn${networkOpen ? ' is-active' : ''}`}
                  onClick={onNetworkToggle}
                  aria-pressed={networkOpen}
                  title={networkOpen ? 'Close relationship network' : 'Open relationship network'}
                  data-mobile-menu="Network"
                >
                  Network
                </button>
              )}
              {onCompareToggle !== undefined && (
                <button
                  className={`btn${compareOpen ? ' is-active' : ''}`}
                  onClick={onCompareToggle}
                  aria-pressed={compareOpen}
                  title={compareOpen ? 'Close compare view' : 'Open compare / storyline view'}
                  data-mobile-menu="Compare"
                >
                  Compare
                </button>
              )}
              {onLineageToggle !== undefined && (
                <button
                  className={`btn${lineageOpen ? ' is-active' : ''}`}
                  onClick={onLineageToggle}
                  aria-pressed={lineageOpen}
                  title={lineageOpen ? 'Close ruler lineage' : 'Open ruler lineage chart'}
                  data-mobile-menu="Lineage"
                >
                  Lineage
                </button>
              )}
              {onSourcesToggle !== undefined && (
                <button
                  className={`btn${sourcesOpen ? ' is-active' : ''}`}
                  onClick={onSourcesToggle}
                  aria-pressed={sourcesOpen}
                  title={sourcesOpen ? 'Close sources library' : 'Open sources library'}
                  data-mobile-menu="Sources"
                >
                  Sources
                </button>
              )}
              {onRegistersToggle !== undefined && (
                <button
                  className={`btn${registersOpen ? ' is-active' : ''}`}
                  onClick={onRegistersToggle}
                  aria-pressed={registersOpen}
                  title={registersOpen ? 'Close registers' : 'Open attribute table registers'}
                  data-mobile-menu="Registers"
                >
                  Registers
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── DATA cluster ──────────────────────────────────────────────────── */}
      {(onViewsToggle !== undefined || onUploadToggle !== undefined) && (
        <>
          <div className="msa-topbar__divider" aria-hidden="true" />
          <div className="msa-topbar__cluster" role="group" aria-label="Data management">
            <span className="msa-topbar__cluster-label" aria-hidden="true">Data</span>
            <div className="msa-topbar__cluster-btns">
              {onViewsToggle !== undefined && (
                <button
                  className={`btn${viewsOpen ? ' is-active' : ''}`}
                  onClick={onViewsToggle}
                  aria-pressed={viewsOpen}
                  title={viewsOpen ? 'Close saved views' : 'Open saved views'}
                  data-mobile-menu="Views"
                >
                  Views
                </button>
              )}
              {onUploadToggle !== undefined && (
                <button
                  className={`btn${uploadOpen ? ' is-active' : ''}`}
                  onClick={onUploadToggle}
                  aria-pressed={uploadOpen}
                  title={uploadOpen ? 'Close my data' : 'Upload and manage your own data'}
                  data-mobile-menu="My Data"
                >
                  My Data
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TOOLS cluster ─────────────────────────────────────────────────── */}
      {(onSearchToggle !== undefined || onFilterToggle !== undefined) && (
        <>
          <div className="msa-topbar__divider" aria-hidden="true" />
          <div className="msa-topbar__cluster" role="group" aria-label="Search and filter">
            <span className="msa-topbar__cluster-label" aria-hidden="true">Tools</span>
            <div className="msa-topbar__cluster-btns">
              {onSearchToggle !== undefined && (
                <button
                  className={`btn${searchOpen ? ' is-active' : ''}`}
                  onClick={onSearchToggle}
                  aria-pressed={searchOpen}
                  title={searchOpen ? 'Close search' : 'Search records (semantic)'}
                  data-mobile-menu="Search"
                >
                  Search
                </button>
              )}
              {onFilterToggle !== undefined && (
                <button
                  className={`btn${filterOpen ? ' is-active' : ''}`}
                  onClick={onFilterToggle}
                  aria-pressed={filterOpen}
                  title={filterOpen ? 'Close filters' : 'Filter records'}
                  data-mobile-menu="Filter"
                >
                  Filter
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── APP cluster ───────────────────────────────────────────────────── */}
      {onSettingsToggle !== undefined && (
        <>
          <div className="msa-topbar__divider" aria-hidden="true" />
          <div className="msa-topbar__cluster" role="group" aria-label="Application settings">
            <span className="msa-topbar__cluster-label" aria-hidden="true">App</span>
            <div className="msa-topbar__cluster-btns">
              <button
                className={`btn${settingsOpen ? ' is-active' : ''}`}
                onClick={onSettingsToggle}
                aria-pressed={settingsOpen}
                title={settingsOpen ? 'Close settings' : 'Theme, map base, guides & data sources'}
                data-tour="settings-btn"
                data-mobile-menu="Settings"
              >
                Settings
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
