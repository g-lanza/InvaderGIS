/**
 * CompareOverlay — full-screen overlay for the P4-C compare/storyline view.
 *
 * Mount pattern: mirrors P4-A's NetworkOverlay exactly.
 *   - `position: fixed` over the map area (same inset formula).
 *   - Controlled by `open` / `onClose` props — AppShell owns state via
 *     `useCompareOverlay()` exported below (same shape as useNetworkOverlay).
 *   - Stays mounted when closed so compare-set state persists without
 *     unmounting (compareStore is module-level Zustand, but the tab UI
 *     state also needs to survive close/reopen).
 *   - Escape key + close button both call onClose.
 *
 * Two tabs:
 *   "Table"     — CompareTable (enabled whenever the set has ≥ 1 record).
 *   "Storyline" — Storyline    (enabled only when set has exactly 2 records).
 *
 * Empty state: when compare set is empty, honest copy explains how to add records.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Works in all 4 themes.
 *
 * Phase 4-C — compare/storyline agent.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useFocusTrap } from '@/components/useFocusTrap';

// useCompareOverlay() lives in './useCompareOverlay' (own module for React.lazy).
// No re-export — hook + component co-export breaks React Fast Refresh.
import { useCompareStore, MAX_COMPARE } from '@/stores/compareStore';
import { useSelectionStore }            from '@/stores/selectionStore';
import { loadRecords }                  from '@/data/loaders';
import type { RawRecord }               from '@/data/loaders';
import { CompareTable }                 from '@/panels/CompareTable';
import { Storyline }                    from '@/panels/Storyline';
import { humanizeId }                   from '@/data/displayName';

// ── Searchable kinds (polities first — most common use case) ──────────────────

const SEARCH_KINDS: Array<{ kind: string; label: string }> = [
  { kind: 'polity',       label: 'Polities'      },
  { kind: 'ruler',        label: 'Rulers'        },
  { kind: 'event',        label: 'Events'        },
  { kind: 'journey',      label: 'Journeys'      },
  { kind: 'institution',  label: 'Institutions'  },
];

/** Max search results shown at once. */
const SEARCH_LIMIT = 8;

/** Read the display name from a raw record — tries common name fields. */
function recordName(r: RawRecord): string {
  const n = r['name'] ?? r['name_primary'] ?? r['title'];
  // Last resort: humanize the id so a record with no name never shows a raw slug.
  return typeof n === 'string' && n ? n : humanizeId(String(r.id));
}

// ── AddSearch sub-component ───────────────────────────────────────────────────

interface AddSearchProps {
  /** Called to close the search panel (user pressed Escape or clicked away). */
  onClose: () => void;
}

/**
 * Inline search panel inside the CompareOverlay.
 * Searches across SEARCH_KINDS by name substring (case-insensitive).
 * Results show + / ✓ buttons that write directly to compareStore.
 * Renders nothing when the compare set is already full.
 */
function AddSearch({ onClose }: AddSearchProps) {
  const [query, setQuery]         = useState('');
  const [activeKind, setActiveKind] = useState<string>('polity');
  const inputRef = useRef<HTMLInputElement>(null);

  const add      = useCompareStore((s) => s.add);
  const remove   = useCompareStore((s) => s.remove);
  const items    = useCompareStore((s) => s.items);
  const isFull   = items.length >= MAX_COMPARE;

  // Focus the input as soon as the panel mounts.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Escape closes the add panel (bubbles to overlay Escape handler — stop it here).
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  const results: RawRecord[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const records = loadRecords(activeKind as Parameters<typeof loadRecords>[0]);
    const matches: RawRecord[] = [];
    for (const r of records) {
      if (recordName(r).toLowerCase().includes(q)) {
        matches.push(r);
        if (matches.length >= SEARCH_LIMIT) break;
      }
    }
    return matches;
  }, [query, activeKind]);

  return (
    <div className="cmp-addsearch" onKeyDown={handleKeyDown}>
      {/* Kind selector tabs */}
      <div className="cmp-addsearch__kinds" role="tablist" aria-label="Record kind to search">
        {SEARCH_KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={activeKind === kind}
            className={`cmp-addsearch__kind-btn${activeKind === kind ? ' is-active' : ''}`}
            onClick={() => { setActiveKind(kind); setQuery(''); }}
            title={`Search ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="cmp-addsearch__inputrow">
        <input
          ref={inputRef}
          type="search"
          className="cmp-addsearch__input"
          placeholder={`Search ${SEARCH_KINDS.find(k => k.kind === activeKind)?.label ?? activeKind} by name…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search records to add to compare"
          disabled={isFull}
        />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onClose}
          title="Close search"
          aria-label="Close search"
          style={{ flexShrink: 0 }}
        >
          ✕
        </button>
      </div>

      {/* Results list */}
      {results.length > 0 && (
        <ul className="cmp-addsearch__results" role="list" aria-label="Search results">
          {results.map((r) => {
            const inSet = items.some((e) => e.id === r.id);
            const name  = recordName(r);
            return (
              <li key={r.id} className="cmp-addsearch__result">
                <span className="cmp-addsearch__result-name" title={name}>{name}</span>
                <span className="cmp-addsearch__result-id mono" title={String(r.id)}>{humanizeId(String(r.id))}</span>
                <button
                  type="button"
                  className={`at-cmp-btn${inSet ? ' is-active' : ''}`}
                  disabled={!inSet && isFull}
                  title={inSet ? 'Remove from compare' : isFull ? `Set full (${MAX_COMPARE} max)` : 'Add to compare'}
                  aria-pressed={inSet}
                  aria-label={inSet ? `Remove ${name}` : `Add ${name} to compare`}
                  onClick={() => inSet ? remove(r.id) : add(r.id, activeKind)}
                >
                  {inSet ? '✓' : '+'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {query.trim().length > 0 && results.length === 0 && (
        <div className="cmp-addsearch__empty">No matches</div>
      )}

      {isFull && (
        <div className="cmp-addsearch__full">
          Set full ({MAX_COMPARE}/{MAX_COMPARE}) — remove a record to add another.
        </div>
      )}
    </div>
  );
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type OverlayTab = 'table' | 'storyline';

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props consumed by AppShell to wire the TopBar toggle. */
export interface CompareOverlayProps {
  /** Whether the overlay is currently visible. */
  open: boolean;
  /** Called when the user closes the overlay. */
  onClose: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Full-screen compare/storyline overlay.
 *
 * Rendered unconditionally by AppShell; hidden via CSS when `open` is false
 * (same pattern as NetworkOverlay — component stays mounted, compare set
 * persists, no state lost on toggle).
 *
 * @param open    - Whether the overlay is visible.
 * @param onClose - Callback to invoke when the user closes the overlay.
 */
export function CompareOverlay({ open, onClose }: CompareOverlayProps) {
  const [activeTab, setActiveTab] = useState<OverlayTab>('table');
  const [searchOpen, setSearchOpen] = useState(false);

  const items   = useCompareStore((s) => s.items);
  const clear   = useCompareStore((s) => s.clear);
  const select  = useSelectionStore((s) => s.select);
  const isFull  = items.length >= MAX_COMPARE;

  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus close button on open for keyboard accessibility
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape closes the overlay
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

  // Auto-switch to table when set drops below 2 and storyline is active
  useEffect(() => {
    if (items.length < 2 && activeTab === 'storyline') {
      setActiveTab('table');
    }
  }, [items.length, activeTab]);

  const handleNavigate = useCallback(
    (id: string, type: string) => select(id, type),
    [select],
  );

  const storylineEnabled = items.length === 2;

  return (
    <div
      ref={overlayRef}
      className={`compare-overlay${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Compare records view"
      role="dialog"
      aria-modal="true"
    >
      {/* Header bar */}
      <div className="compare-overlay__bar">
        <span className="compare-overlay__title">Compare</span>

        {/* Item count badge */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--ink-mute)',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
          aria-live="polite"
        >
          {items.length} / {MAX_COMPARE}
        </span>

        {/* + Add button — opens inline search panel */}
        <button
          type="button"
          className={`btn${searchOpen ? ' is-active' : ''}`}
          onClick={() => setSearchOpen((v) => !v)}
          disabled={isFull && !searchOpen}
          title={
            isFull
              ? `Set full (${MAX_COMPARE} max) — remove a record to add another`
              : searchOpen
              ? 'Close search'
              : 'Search and add records to compare'
          }
          aria-expanded={searchOpen}
          aria-controls="cmp-addsearch-panel"
          style={{ flexShrink: 0 }}
        >
          {searchOpen ? '– Search' : '+ Add'}
        </button>

        {/* Tab switcher */}
        <div
          className="tab-row"
          role="tablist"
          aria-label="Compare view tabs"
          style={{ flexShrink: 0 }}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'table'}
            className={`btn${activeTab === 'table' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('table')}
            title="Side-by-side field comparison"
          >
            Table
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'storyline'}
            aria-disabled={!storylineEnabled}
            className={`btn${activeTab === 'storyline' ? ' is-active' : ''}${!storylineEnabled ? ' is-disabled' : ''}`}
            onClick={() => storylineEnabled && setActiveTab('storyline')}
            title={
              storylineEnabled
                ? 'Interleaved event chronicle'
                : 'Storyline requires exactly 2 records'
            }
            style={{
              opacity: storylineEnabled ? 1 : 0.4,
              cursor: storylineEnabled ? 'pointer' : 'not-allowed',
            }}
          >
            Storyline
          </button>
        </div>

        {/* Clear button */}
        {items.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              if (items.length < 2 || window.confirm(`Clear all ${items.length} records from the compare set?`)) clear();
            }}
            title="Clear all records from compare set"
            style={{ flexShrink: 0 }}
          >
            Clear all
          </button>
        )}

        {/* Close button */}
        <button
          ref={closeRef}
          type="button"
          className="btn btn--ghost btn--icon compare-overlay__close"
          onClick={onClose}
          aria-label="Close compare view"
          title="Close compare (Escape)"
        >
          ✕
        </button>
      </div>

      {/* Inline search-to-add panel — slides in below the header bar */}
      {searchOpen && (
        <div id="cmp-addsearch-panel">
          <AddSearch onClose={() => setSearchOpen(false)} />
        </div>
      )}

      {/* Content area */}
      <div className="compare-overlay__content">
        {items.length === 0 ? (
          <EmptyCompareState onOpenSearch={() => setSearchOpen(true)} />
        ) : (
          <>
            {activeTab === 'table' && (
              <div
                role="tabpanel"
                aria-label="Compare table"
                style={{ height: '100%', overflow: 'hidden' }}
              >
                <CompareTable onNavigate={handleNavigate} />
              </div>
            )}
            {activeTab === 'storyline' && (
              <div
                role="tabpanel"
                aria-label="Storyline chronicle"
                style={{ height: '100%', overflow: 'hidden' }}
              >
                <Storyline />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyCompareState({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 'var(--space-3)',
        padding: 'var(--space-8)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-mute)',
        }}
      >
        Compare set empty
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--ink-mid)',
          lineHeight: 1.6,
          maxWidth: '400px',
        }}
      >
        Add records using{' '}
        <button
          type="button"
          onClick={onOpenSearch}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 600,
            color: 'var(--accent)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
          }}
        >
          + Add
        </button>{' '}
        above, via the Registers table, or via the dock's{' '}
        <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>Compare</strong> action.
      </div>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--ink-mute)',
          lineHeight: 1.5,
          maxWidth: '360px',
        }}
      >
        Hold up to {MAX_COMPARE} records. Table view shows side-by-side fields;
        Storyline (2 records only) shows an interleaved event chronicle with
        a shared year axis.
      </div>
    </div>
  );
}

// ── Controller hook ───────────────────────────────────────────────────────────
// useCompareOverlay is defined in ./useCompareOverlay.ts and re-exported above
// for back-compat. Nothing to define here.
