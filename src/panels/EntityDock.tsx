/**
 * EntityDock — the record inspector dock panel mounted in the `.msa-dock` grid region.
 *
 * Subscribes to selectionStore (selectedId, selectedType, inspectorOpen).
 * When no record is selected: renders an honest empty state.
 * When a record is selected: resolves the record from the in-memory loader,
 * dispatches to the correct type-specific card via cardForKind(), and renders it.
 *
 * Data is read-only from loadRecords() — no mutations, no fabricated values.
 * The navigation callback (onNavigate) wires RelationshipLink clicks back through
 * selectionStore.select() so the user can traverse linked records.
 *
 * Design: square corners, hairline border on left edge, no shadows, token CSS only.
 * Works correctly in all 4 themes (atlas / manuscript / dark / contrast).
 *
 * Phase 3 — record-panels agent.
 */

import { useCallback, useMemo } from 'react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useCompareStore }   from '@/stores/compareStore';    // P4-C
import { findRecordByKindId } from '@/data/loaders';
import type { RawRecord }    from '@/data/loaders';
import type { RecordType }   from '@/types/record';
import { MEDIEVAL_KINDS }    from '@/panels/types';
import { cardForKind }       from '@/panels/cardForKind';
import { RelatedPanel }      from '@/panels/RelatedPanel';
import { humanizeType, displayNameFromRecord } from '@/data/displayName';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find a single record by kind + id. Resolves by the EXPLICIT selected kind so
 * cross-kind id collisions don't surface the wrong record — 230 capital ids
 * collide 1:1 with polity ids, and the id-only index resolves those to the polity
 * (polity precedence). The kind guard keeps the "unknown kind → Record not found"
 * contract: if the selected kind isn't a known kind, return null.
 */
function findRecord(id: string, kind: string): RawRecord | null {
  if (!MEDIEVAL_KINDS.has(kind as RecordType)) return null;
  return findRecordByKindId(kind as RecordType, id);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Shown when nothing is selected. */
function EmptyDock() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--space-6)',
        textAlign: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--ink-mute)' }}>Inspector</div>
      <div style={{ fontSize: '13px', color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        Select a record on the map to inspect it here.
      </div>
    </div>
  );
}

/** Shown when a record id is selected but cannot be found in the loaded data. */
function NotFoundDock({ id, kind }: { id: string; kind: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--space-6)',
        textAlign: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--ink-mute)' }}>Not found</div>
      <div style={{ fontSize: '12px', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
        {kind} / {id}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        Record not in loaded dataset — run{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>npm run bake</span> and reload.
      </div>
    </div>
  );
}

/** Header bar with the record id, a Compare action, and a close button. */
function DockHeader({ id, kind, onClose }: { id: string; kind: string; onClose: () => void }) {
  // P4-C: compareStore access for the "Compare" action button
  const addToCompare = useCompareStore((s) => s.add);
  const alreadyIn    = useCompareStore((s) => s.hasId(id));

  // Memoize the id-index lookup + name so compareStore re-renders (and any other
  // parent re-render) don't re-resolve the record each time.
  const name     = useMemo(() => displayNameFromRecord(findRecord(id, kind)), [id, kind]);
  const kindText = useMemo(() => humanizeType(kind), [kind]);

  return (
    <div className="dock-header">
      {/* Identity: humanized kind eyebrow over the real display name. The raw
          slug id is preserved only in the title tooltip for power users. */}
      <div className="dock-header__identity" title={id}>
        <span className="eyebrow dock-header__kind">{kindText}</span>
        <span className="dock-header__name">{name}</span>
      </div>
      {/* P4-C: Compare action — adds current record to compareStore */}
      <button
        type="button"
        onClick={() => addToCompare(id, kind)}
        disabled={alreadyIn}
        className={`dock-header__compare${alreadyIn ? ' is-active' : ''}`}
        aria-label={alreadyIn ? 'Already in compare set' : 'Add to compare set'}
        title={alreadyIn ? 'Already in compare set — open Compare view' : 'Add to compare'}
      >
        {alreadyIn ? '✓ Compare' : '+ Compare'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="dock-header__close"
        aria-label="Close inspector"
      >
        ×
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface EntityDockProps {
  /** Whether the dock is collapsed to a thin re-open strip. */
  collapsed?: boolean;
  /** Toggle the collapsed state (owned by AppShell so the grid column narrows). */
  onToggleCollapse?: () => void;
  /** Whether the dock is expanded to fill the map area. */
  fullscreen?: boolean;
  /** Toggle the fullscreen state (owned by AppShell). */
  onToggleFullscreen?: () => void;
}

/**
 * EntityDock — the right-hand record inspector in the `.msa-dock` grid area.
 *
 * Selection state comes from selectionStore. The whole dock collapses to a thin
 * re-open strip via `collapsed`/`onToggleCollapse` (user request: everything hideable).
 */
export function EntityDock({ collapsed = false, onToggleCollapse, fullscreen = false, onToggleFullscreen }: EntityDockProps) {
  const selectedId   = useSelectionStore((s) => s.selectedId);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const clear        = useSelectionStore((s) => s.clear);
  const select       = useSelectionStore((s) => s.select);

  /** Navigate to a linked record — passed to card RelationshipLink instances. */
  const handleNavigate = useCallback(
    (id: string, type: string) => {
      select(id, type);
    },
    [select],
  );

  const hasSelection = selectedId !== null && selectedType !== null;

  // Humanized name for the landmark aria-label (announced to screen readers when
  // the dock gains content) — never the raw slug.
  const selectionLabel = useMemo(
    () =>
      hasSelection
        ? `Record inspector — ${humanizeType(selectedType)}: ${displayNameFromRecord(findRecord(selectedId, selectedType))}`
        : 'Entity dock — no record selected',
    [hasSelection, selectedId, selectedType],
  );

  // Collapsed: thin re-open strip only (grid column narrowed via CSS).
  if (collapsed) {
    return (
      <aside className="msa-dock msa-dock--collapsed" role="complementary" aria-label="Inspector (collapsed)">
        <button
          type="button"
          className="msa-rail-reopen"
          onClick={onToggleCollapse}
          title="Show inspector panel"
          aria-label="Show inspector panel"
        >
          <span className="msa-rail-reopen__chevron" aria-hidden="true">‹</span>
          <span className="msa-rail-reopen__label">Inspector</span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="msa-dock"
      role="complementary"
      aria-label={selectionLabel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border-mid)',
        overflow: 'hidden',
      }}
    >
      {/* Collapse / fullscreen controls */}
      {(onToggleCollapse || onToggleFullscreen) && (
        <div className="msa-rail-collapsehead msa-rail-collapsehead--dock">
          {onToggleFullscreen && (
            <button
              type="button"
              className="msa-rail-collapse-btn"
              onClick={onToggleFullscreen}
              title={fullscreen ? 'Exit fullscreen inspector' : 'Expand inspector to full width'}
              aria-label={fullscreen ? 'Exit fullscreen inspector' : 'Expand inspector to full width'}
              aria-pressed={fullscreen}
            >
              {fullscreen ? (
                <>Exit full <span aria-hidden="true">⊡</span></>
              ) : (
                <>Full <span aria-hidden="true">⊞</span></>
              )}
            </button>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              className="msa-rail-collapse-btn"
              onClick={onToggleCollapse}
              title="Hide inspector panel"
              aria-label="Hide inspector panel"
            >
              Hide <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      )}

      {!hasSelection ? (
        <EmptyDock />
      ) : (
        <>
          <DockHeader id={selectedId} kind={selectedType} onClose={clear} />
          <div
            className="msa-dock-scroll"
            style={{
              flex: 1,
              minWidth: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              background: 'var(--surface-2)',
            }}
          >
            {/* key={selectedId} remounts the card on every selection change so
                per-card state (active tab, scroll position) never carries over
                from the previously-inspected record. */}
            <DockBody
              key={selectedId}
              id={selectedId}
              kind={selectedType}
              onNavigate={handleNavigate}
            />
          </div>
        </>
      )}
    </aside>
  );
}

// ── DockBody: record resolution + card dispatch ───────────────────────────────

/** Props for DockBody. */
interface DockBodyProps {
  id: string;
  kind: string;
  onNavigate: (id: string, type: string) => void;
}

/**
 * Geo kinds whose card has no built-in relationships view. For these we append
 * the full RelatedPanel (Directly related + Similar), keyed on the parent polity:
 * a capital's id IS its polity id; settlements/military link via `entity_id`.
 * RelatedPanel self-hides when the resolved id has no adjacency entries.
 */
const GEO_KINDS_WITH_RELATED = new Set(['capital', 'settlement', 'military']);

/** Best polity id to drive RelatedPanel for a geo record. */
function polityIdForGeo(record: RawRecord): string {
  const entityId = record['entity_id'];
  return typeof entityId === 'string' && entityId ? entityId : record.id;
}

/**
 * Resolves the record from the in-memory loader and renders the correct card.
 * Shown as "not found" if the record cannot be located.
 */
function DockBody({ id, kind, onNavigate }: DockBodyProps) {
  const record        = useMemo(() => findRecord(id, kind), [id, kind]);
  const CardComponent = useMemo(() => cardForKind(kind), [kind]);

  if (!record) {
    return <NotFoundDock id={id} kind={kind} />;
  }

  return (
    <>
      <CardComponent record={record} onNavigate={onNavigate} />
      {GEO_KINDS_WITH_RELATED.has(kind) && (
        <RelatedPanel id={polityIdForGeo(record)} onNavigate={onNavigate} variant="full" />
      )}
    </>
  );
}
