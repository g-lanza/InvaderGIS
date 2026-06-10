/**
 * RegistersOverlay.tsx — full-screen overlay hosting the attribute-table
 * registers, with a kind-picker that switches which register is shown.
 *
 * Mirrors NetworkOverlay / SourcesOverlay EXACTLY:
 *   - position: fixed over the map area, leaving TopBar/TimeRail/StatusBar visible.
 *   - z-index 50 — same layer as the other overlays.
 *   - Hidden via opacity + pointer-events when closed; stays mounted so the
 *     active kind + per-table sort/filter state are preserved across open/close.
 *   - Focuses the close button on open (keyboard accessibility).
 *   - Escape key closes.
 *
 * BOOTSTRAP-RACE GUARD (Realness Law):
 *   Gated on `useRecordsStore(s => s.counts) !== null`. Until the dataset has
 *   loaded, the body renders <LoadingState/> instead of an empty table — never
 *   a fabricated/zero state. This mirrors SourcesLibrary / LineageGantt.
 *
 * KIND PICKER (docs task Wave2-B):
 *   A tab row switches which register (polities / events / rulers / relationships
 *   / journeys / institutions / sources) the AttributeTable renders. The active
 *   kind is local UI state. Switching kinds remounts AttributeTable via a `key`
 *   so each register starts with a clean sort/filter (its own state lifetime).
 *
 * Exports:
 *   RegistersOverlay — the overlay component (props: open, onClose).
 *   (useRegistersOverlay lives in ./useRegistersOverlay so this component can be
 *    React.lazy-loaded; no co-export here — that would break Fast Refresh.)
 *
 * Phase Wave2-B — Attribute Table registers (ArcGIS FeatureTable convention).
 */

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/components/useFocusTrap';
import { useRecordsStore } from '@/stores/recordsStore';
import { LoadingState } from '@/components/states/LoadingState';
import { AttributeTable } from './AttributeTable';
import { GalleryGrid } from './GalleryGrid';
import { REGISTER_SCHEMAS } from './registerSchemas';
import type { RecordType } from '@/types/record';

/** Which presentation the canvas shows for the active register kind. */
type ViewMode = 'table' | 'gallery';

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props consumed by AppShell to wire the TopBar Registers toggle. */
export interface RegistersOverlayProps {
  /**
   * Whether the overlay is currently open. Controlled by the parent
   * (AppShell passes the value; TopBar mutates it via the toggle callback).
   */
  open: boolean;
  /** Called when the user closes the overlay (close button or Escape). */
  onClose: () => void;
}

// ── Per-kind record count lookup ────────────────────────────────────────────────

/**
 * Map a register kind to its field on the RecordCounts object so the picker tab
 * can show a real count badge (honest — sourced from recordsStore, never faked).
 */
const COUNT_FIELD: Record<RecordType, keyof Omit<import('@/data/loaders').RecordCounts, 'total'>> = {
  polity: 'polities',
  event: 'events',
  journey: 'journeys',
  relationship: 'relationships',
  ruler: 'rulers',
  source: 'sources',
  institution: 'institutions',
  technology: 'technologies',
  text: 'texts',
  // Wave 3 / Phase C
  settlement: 'settlements',
  military: 'militarySites',
  capital: 'capitals',
  // Wave 6 / research-first layer
  claim: 'claims',
  annotation: 'annotations',
  research_question: 'researchQuestions',
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Full-screen overlay containing the kind-picker + the active AttributeTable.
 *
 * Renders at all times but is hidden via CSS (`aria-hidden`, `opacity: 0`,
 * `pointer-events: none`) when `open` is false, so the active kind and the
 * table's sort/filter state survive close/reopen cycles.
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to invoke when the user closes the overlay.
 */
export function RegistersOverlay({ open, onClose }: RegistersOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Bootstrap-race guard — gate the body on counts !== null.
  const counts = useRecordsStore((s) => s.counts);

  // Active register kind (local UI state). Default: the first schema (polities).
  const [activeKind, setActiveKind] = useState<RecordType>(
    REGISTER_SCHEMAS[0].kind,
  );

  // Presentation: table (default) or gallery card-grid. The active kind is kept
  // when flipping, so it reads as "same register, different view".
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Focus the close button when opening so keyboard users can Escape out.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape key closes the overlay.
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

  const activeSchema =
    REGISTER_SCHEMAS.find((s) => s.kind === activeKind) ?? REGISTER_SCHEMAS[0];

  return (
    <div
      ref={overlayRef}
      className={`registers-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Attribute table registers"
      role="dialog"
      aria-modal="true"
    >
      {/* Header bar — mirrors sources-overlay__bar / network-overlay__bar */}
      <div className="registers-overlay__bar">
        <span className="registers-overlay__title">Registers</span>
        <span className="registers-overlay__hint" aria-hidden="true">
          {viewMode === 'table'
            ? 'attribute table · click row to select on map · click header to sort'
            : 'gallery · click a card to select on map · same filters as the table'}
        </span>
        {/* Table ⇄ Gallery view-mode toggle */}
        <div
          className="registers-overlay__viewmode"
          role="group"
          aria-label="Register view mode"
        >
          <button
            type="button"
            className={`btn${viewMode === 'table' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            title="Show as attribute table"
          >
            Table
          </button>
          <button
            type="button"
            className={`btn${viewMode === 'gallery' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'gallery'}
            onClick={() => setViewMode('gallery')}
            title="Show as gallery card grid"
          >
            Gallery
          </button>
        </div>
        <button
          ref={closeRef}
          className="btn btn--ghost btn--icon registers-overlay__close"
          onClick={onClose}
          aria-label="Close registers view"
          title="Close registers (Escape)"
        >
          ✕
        </button>
      </div>

      {/* Kind picker — tabs switch which register/table is shown */}
      <div
        className="registers-overlay__tabs"
        role="tablist"
        aria-label="Choose a register"
      >
        {REGISTER_SCHEMAS.map((schema) => {
          const isActive = schema.kind === activeKind;
          const n = counts ? counts[COUNT_FIELD[schema.kind]] : null;
          return (
            <button
              key={schema.kind}
              role="tab"
              aria-selected={isActive}
              className={`registers-tab${isActive ? ' is-active' : ''}`}
              onClick={() => setActiveKind(schema.kind)}
              title={`Show ${schema.label}`}
            >
              <span className="registers-tab__label">{schema.label}</span>
              {n !== null && (
                <span className="registers-tab__count" aria-hidden="true">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body — table / gallery, or loading guard */}
      <div className="registers-overlay__canvas">
        {counts === null ? (
          <LoadingState label="Loading registers…" className="at-loading" />
        ) : viewMode === 'table' ? (
          // key={activeKind}: remount on kind change so each register has its
          // own fresh sort/filter/scroll lifetime.
          <AttributeTable key={activeSchema.kind} schema={activeSchema} />
        ) : (
          <GalleryGrid key={activeSchema.kind} schema={activeSchema} />
        )}
      </div>
    </div>
  );
}
