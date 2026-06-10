/**
 * NetworkOverlay.tsx — full-screen-over-map overlay container for NetworkGraph
 * and RelationshipMatrix. (Wave-6 NETWORKS update.)
 *
 * Mount point: AppShell renders this unconditionally; it is only visible when
 * `open` is true (controlled by the "Network" button in TopBar via a simple
 * boolean flag in the overlay itself — no new store state needed since it is
 * purely UI-local: the overlay does not affect timeStore, selectionStore, or
 * any frozen interface).
 *
 * Layout strategy: `position: fixed` over the `.msa-map` grid area, covering
 * the map + layerrail + dock columns but leaving TopBar, TimeRail, and
 * StatusBar visible. z-index 50 puts it above the map (z-index 0) and
 * layer-rail (z-index 5) but below the TopBar (z-index 10) and any modals.
 *
 * Wave-6 additions (Phase G — cost-weighted networks + relationship matrix):
 *   1. Internal view toggle (force graph ↔ matrix) — rendered in the overlay
 *      header bar using the TopBar radiogroup toggle pattern (no new chrome).
 *   2. Cost-basis toggle (distance ↔ hops) — visible only when the force graph
 *      view is active. Passes the basis down to NetworkGraph so it can recompute
 *      edge stroke widths via edgeCost.ts.
 *   3. RelationshipMatrix rendered when the matrix view is active.
 *
 * The overlay is a pure UI shell; all data + simulation logic lives in
 * NetworkGraph.tsx and RelationshipMatrix.tsx. Closing the overlay does not
 * stop the simulation — the component stays mounted so re-opening is instant.
 */

import { useRef, useEffect, useState } from 'react';
import { NetworkGraph } from './NetworkGraph';
import { RelationshipMatrix } from './RelationshipMatrix';
import { ResidualMatrix } from './ResidualMatrix';
import { useFocusTrap } from '@/components/useFocusTrap';
import type { CostBasis } from './edgeCost';

// Note: useNetworkOverlay() now lives in './useNetworkOverlay' (its own module so
// this component can be React.lazy-loaded). Import the hook from there directly.
// No re-export here — a hook + component co-export breaks React Fast Refresh.

// ── View mode type ─────────────────────────────────────────────────────────────

/** The internal view modes for the overlay. */
type NetworkViewMode = 'graph' | 'matrix' | 'density';

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props consumed by AppShell to wire the TopBar toggle. */
export interface NetworkOverlayProps {
  /**
   * Whether the overlay is currently open. Controlled by the parent
   * (AppShell passes the value; TopBar mutates it via the toggle callback).
   */
  open: boolean;
  /** Called when the user closes the overlay (close button or Escape). */
  onClose: () => void;
}

/**
 * Full-screen overlay containing the NetworkGraph and RelationshipMatrix.
 *
 * The overlay renders at all times but is hidden via CSS (`aria-hidden`,
 * `pointer-events: none`, `opacity: 0`) when `open` is false. This keeps
 * the NetworkGraph mounted so the force simulation runs through to convergence
 * even if the user briefly closes and reopens the panel.
 *
 * Internal state (view mode + cost basis) is purely local UI state — no store
 * mutations, no frozen interface changes.
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to invoke when the user closes the overlay.
 */
export function NetworkOverlay({ open, onClose }: NetworkOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef   = useRef<HTMLButtonElement>(null);

  // ── Internal view state ──────────────────────────────────────────────────────
  /** Which sub-view is active: force graph or adjacency matrix. */
  const [viewMode, setViewMode] = useState<NetworkViewMode>('graph');
  /** Cost basis for the force graph's edge-width weighting. */
  const [costBasis, setCostBasis] = useState<CostBasis>('distance');
  /** Relationship types currently shown in the graph (click a legend row to toggle).
   *  Empty set is treated as "all shown" so the graph never goes blank by default. */
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(new Set());
  /** When true, hide the faint out-of-year backdrop — show only ties active in the
   *  scrubbed year, so a busy network declutters to just its live state. */
  const [activeYearOnly, setActiveYearOnly] = useState(false);

  const toggleType = (type: string) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  // Focus the close button when opening so keyboard users can Escape out
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape key closes the overlay
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap: keep Tab within the overlay while open; restore on close
  useFocusTrap(overlayRef, open);

  return (
    <div
      ref={overlayRef}
      className={`network-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Relationship network view"
      role="dialog"
      aria-modal="true"
    >
      {/* ── Header bar ── */}
      <div className="network-overlay__bar">
        <span className="network-overlay__title">Relationship Network</span>

        {/* ── Internal view toggle (graph / matrix) ── */}
        <div
          className="network-overlay__view-toggle"
          role="radiogroup"
          aria-label="Network view mode"
        >
          <ViewToggleButton
            label="Graph"
            value="graph"
            active={viewMode === 'graph'}
            onSelect={setViewMode}
          />
          <ViewToggleButton
            label="Matrix"
            value="matrix"
            active={viewMode === 'matrix'}
            onSelect={setViewMode}
          />
          <ViewToggleButton
            label="Emphasis"
            value="density"
            active={viewMode === 'density'}
            onSelect={setViewMode}
          />
        </div>

        {/* ── Cost-basis toggle — only shown in graph view ── */}
        {viewMode === 'graph' && (
          <div
            className="network-overlay__cost-toggle"
            role="radiogroup"
            aria-label="Edge cost basis"
          >
            <span className="network-overlay__cost-label" aria-hidden="true">edge weight</span>
            <CostBasisButton
              label="Distance"
              value="distance"
              active={costBasis === 'distance'}
              onSelect={setCostBasis}
            />
            <CostBasisButton
              label="Hops"
              value="hops"
              active={costBasis === 'hops'}
              onSelect={setCostBasis}
            />
          </div>
        )}

        {/* ── Legend + type filter (graph view only) — click a type to hide/show it ── */}
        {viewMode === 'graph' && (
          <div className="network-overlay__legend" role="group" aria-label="Filter by relationship type">
            <TypeFilterRow color="var(--ng-color-alliance)"   label="Alliance"   type="alliance"   hidden={hiddenTypes.has('alliance')}   onToggle={toggleType} />
            <TypeFilterRow color="var(--ng-color-rivalry)"    label="Rivalry"    type="rivalry"    hidden={hiddenTypes.has('rivalry')}    onToggle={toggleType} />
            <TypeFilterRow color="var(--ng-color-succession)" label="Succession" type="succession" hidden={hiddenTypes.has('succession')} onToggle={toggleType} />
            <TypeFilterRow color="var(--ng-color-vassalage)"  label="Vassalage"  type="vassalage"  hidden={hiddenTypes.has('vassalage')}  onToggle={toggleType} />
            <button
              type="button"
              className={`network-overlay__active-toggle${activeYearOnly ? ' is-active' : ''}`}
              aria-pressed={activeYearOnly}
              onClick={() => setActiveYearOnly((v) => !v)}
              title="Show only ties active in the scrubbed year (hide the faint historical backdrop)"
            >
              {activeYearOnly ? '✓ ' : ''}active year only
            </button>
          </div>
        )}

        {/* ── Matrix legend (matrix view only) ── */}
        {viewMode === 'matrix' && (
          <div className="network-overlay__legend" aria-label="Cell type legend">
            <LegendRow color="var(--ng-color-rivalry)"    label="Rivalry"    />
            <LegendRow color="var(--ng-color-succession)" label="Succession" />
            <LegendRow color="var(--ng-color-alliance)"   label="Alliance"   />
            <LegendRow color="var(--ng-color-vassalage)"  label="Vassalage"  />
            <span className="network-overlay__legend-dash" aria-label="Click cell to select relationship">
              click cell to select
            </span>
          </div>
        )}

        {/* ── Density (residual matrix) legend ── */}
        {viewMode === 'density' && (
          <div className="network-overlay__legend" aria-label="Residual shading legend">
            <LegendRow color="rgba(33, 102, 172, 0.92)" label="Over-represented" />
            <LegendRow color="rgba(178, 24, 43, 0.92)"  label="Under-represented" />
            <span className="network-overlay__legend-dash" aria-label="Deviation from independence">
              vs. chance · hover a cell for counts
            </span>
          </div>
        )}

        <button
          ref={closeRef}
          className="btn btn--ghost btn--icon network-overlay__close"
          onClick={onClose}
          aria-label="Close relationship network view"
          title="Close network (Escape)"
        >
          ✕
        </button>
      </div>

      {/* ── Content canvas ── */}
      <div className="network-overlay__canvas">
        {/*
          Both views stay mounted when the overlay is open so the force
          simulation never has to restart. Visibility is controlled via CSS
          display — the graph is hidden (not unmounted) when matrix is active.
        */}
        <div
          className="network-overlay__view"
          aria-hidden={viewMode !== 'graph'}
          style={{ display: viewMode === 'graph' ? 'flex' : 'none', flex: 1, minHeight: 0 }}
        >
          <NetworkGraph costBasis={costBasis} hiddenTypes={hiddenTypes} activeYearOnly={activeYearOnly} />
        </div>

        <div
          className="network-overlay__view"
          aria-hidden={viewMode !== 'matrix'}
          style={{ display: viewMode === 'matrix' ? 'flex' : 'none', flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          <RelationshipMatrix />
        </div>

        {/* Density: dataset-wide residual matrix (event category × century). Honors
            the shared filter; answers "compared to what?" (audit finding #2). */}
        <div
          className="network-overlay__view"
          aria-hidden={viewMode !== 'density'}
          style={{ display: viewMode === 'density' ? 'flex' : 'none', flex: 1, minHeight: 0, overflow: 'auto', padding: 'var(--space-3)' }}
        >
          {viewMode === 'density' && <ResidualMatrix />}
        </div>
      </div>
    </div>
  );
}

// ── Toggle button sub-components ───────────────────────────────────────────────

interface ViewToggleButtonProps {
  label:    string;
  value:    NetworkViewMode;
  active:   boolean;
  onSelect: (v: NetworkViewMode) => void;
}

/**
 * A radio-style view mode toggle button in the overlay header.
 * Matches the TopBar radiogroup pattern (projection switcher ~line 258).
 */
function ViewToggleButton({ label, value, active, onSelect }: ViewToggleButtonProps) {
  return (
    <button
      role="radio"
      aria-checked={active}
      className={`network-overlay__view-btn${active ? ' is-active' : ''}`}
      onClick={() => onSelect(value)}
      aria-label={`${label} view`}
    >
      {label}
    </button>
  );
}

interface CostBasisButtonProps {
  label:    string;
  value:    CostBasis;
  active:   boolean;
  onSelect: (v: CostBasis) => void;
}

/**
 * A radio-style cost-basis selector button in the overlay header.
 * Controls which metric is used to weight edge stroke widths.
 */
function CostBasisButton({ label, value, active, onSelect }: CostBasisButtonProps) {
  return (
    <button
      role="radio"
      aria-checked={active}
      className={`network-overlay__cost-btn${active ? ' is-active' : ''}`}
      onClick={() => onSelect(value)}
      aria-label={`Edge weight by ${label.toLowerCase()}`}
      title={
        value === 'distance'
          ? 'Thicker edge = longer great-circle route (km)'
          : 'Thicker edge = more waypoint legs'
      }
    >
      {label}
    </button>
  );
}

// ── Legend helper ──────────────────────────────────────────────────────────────

interface LegendRowProps {
  color: string;
  label: string;
}

/** A single colored swatch + label in the overlay legend strip. */
function LegendRow({ color, label }: LegendRowProps) {
  return (
    <span className="network-overlay__legend-item">
      <span
        className="network-overlay__legend-swatch"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="network-overlay__legend-label">{label}</span>
    </span>
  );
}

interface TypeFilterRowProps {
  color: string;
  label: string;
  type: string;
  hidden: boolean;
  onToggle: (type: string) => void;
}

/** A clickable legend row that doubles as a relationship-type filter toggle.
 *  Hidden types render struck-through + dimmed; aria-pressed reflects "shown". */
function TypeFilterRow({ color, label, type, hidden, onToggle }: TypeFilterRowProps) {
  return (
    <button
      type="button"
      className={`network-overlay__legend-item network-overlay__legend-item--toggle${hidden ? ' is-hidden' : ''}`}
      aria-pressed={!hidden}
      onClick={() => onToggle(type)}
      title={hidden ? `Show ${label} ties` : `Hide ${label} ties`}
    >
      <span
        className="network-overlay__legend-swatch"
        style={{ background: color, opacity: hidden ? 0.25 : 1 }}
        aria-hidden="true"
      />
      <span className="network-overlay__legend-label">{label}</span>
    </button>
  );
}

// ── Controller hook ────────────────────────────────────────────────────────────
// useNetworkOverlay is defined in ./useNetworkOverlay.ts and re-exported above
// for back-compat. Nothing to define here.
