/**
 * SavedViewsPanel — right-side drawer listing persisted "saved views".
 *
 * A saved view captures the live state of four frozen stores (year, theme,
 * map type, projection, every layer's visibility + opacity, and the current
 * selection) and re-applies it on click. See `savedViewsStore` for the capture
 * + restore logic; this component is presentation + interaction only.
 *
 * Layout (mirrors the app's overlay chrome — square corners, hairline borders,
 * no shadows, tokens only, works in all four themes):
 *   Header  — "Saved views · N" + Save current + close
 *   List    — one card per view: name · "Nm ago" · year/layer/theme summary chips
 *   Footer  — name input + Save current view button + hint
 *
 * Each card shows a thumbnail-less summary derived from the captured state:
 * the saved year (CE), the count of visible layers, the theme, and the
 * selected record id (if any). Clicking a card applies the view; the ✕ removes it.
 *
 * Honest empty state: when no views exist, the list explains how to create one
 * — no fake rows, no placeholder data.
 */
import { useState, useEffect, useMemo } from 'react';

import {
  useSavedViewsStore,
  type SavedView,
} from '@/stores/savedViewsStore';

// ── Props ───────────────────────────────────────────────────────────────────

/** Props consumed by AppShell to wire the TopBar "Views" toggle. */
export interface SavedViewsPanelProps {
  /** Whether the drawer is currently open (controlled by AppShell). */
  open: boolean;
  /** Called when the user closes the drawer (close button or Escape). */
  onClose: () => void;
}

// ── Relative-time formatter ───────────────────────────────────────────────────

/**
 * Compact "just now / Nm ago / Nh ago / Nd ago" label for a saved-at timestamp.
 *
 * @param ms  - Epoch milliseconds the view was saved.
 * @param now - Current epoch milliseconds (passed in so the panel can tick).
 */
function fmtRelative(ms: number, now: number): string {
  const dt = Math.max(0, Math.floor((now - ms) / 1000));
  if (dt < 60) return 'just now';
  const m = Math.floor(dt / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/** Count of layers marked visible in a captured state. */
function visibleLayerCount(view: SavedView): number {
  return Object.values(view.state.layers).filter((l) => l.visible).length;
}

// ── Tokenized style atoms (square corners, hairline borders, no shadow) ────────

const PANEL: React.CSSProperties = {
  position: 'fixed',
  top: 'calc(var(--topbar-h, 40px) + var(--space-3))',
  right: 'var(--space-3)',
  width: 320,
  maxHeight: 'calc(100dvh - var(--topbar-h, 40px) - var(--statusbar-h, 24px) - var(--space-6))',
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-body)',
  color: 'var(--ink)',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
};

const HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border-mid)',
};

const LIST: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
};

const FOOTER: React.CSSProperties = {
  padding: 'var(--space-3)',
  background: 'var(--surface-2)',
  borderTop: '1px solid var(--border-mid)',
};

const TEXT_INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 26,
  padding: '0 var(--space-2)',
  marginBottom: 'var(--space-2)',
  background: 'var(--surface)',
  border: '1px solid var(--border-mid)',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--ink)',
  outline: 'none',
};

const REMOVE_BTN: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--ink-mute)',
  padding: '0 var(--space-1)',
  fontSize: 13,
  lineHeight: 1,
};

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Saved-views drawer. Lazy-loaded by AppShell; stays mounted once first opened
 * so the draft name input is preserved across open/close cycles.
 *
 * @param open    - Whether the drawer is visible.
 * @param onClose - Callback to close the drawer.
 */
export function SavedViewsPanel({ open, onClose }: SavedViewsPanelProps) {
  const views = useSavedViewsStore((s) => s.views);
  const save = useSavedViewsStore((s) => s.save);
  const apply = useSavedViewsStore((s) => s.apply);
  const remove = useSavedViewsStore((s) => s.remove);

  const [draftName, setDraftName] = useState('');
  const [now, setNow] = useState<number>(() => Date.now());

  // Escape closes — mirrors the other overlays.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Tick the "Nm ago" labels every 30s while open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  // Newest first.
  const sorted = useMemo(
    () => [...views].sort((a, b) => b.savedAt - a.savedAt),
    [views],
  );

  if (!open) return null;

  const onSaveCurrent = (): void => {
    save(draftName);
    setDraftName('');
  };

  return (
    <div role="dialog" aria-label="Saved views" className="msa-panel-overlay" style={PANEL}>
      {/* Header */}
      <div style={HEADER}>
        <span className="cap-sm" style={{ color: 'var(--ink)' }}>
          Saved views · {views.length}
        </span>
        <button
          className="btn btn--ghost"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={onClose}
          aria-label="Close saved views (Escape)"
          title="Close (Escape)"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div style={LIST}>
        {sorted.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-5) var(--space-4)',
              color: 'var(--ink-mute)',
              fontSize: 12,
              lineHeight: 1.55,
              textAlign: 'center',
            }}
          >
            <div style={{ color: 'var(--ink-mid)', marginBottom: 'var(--space-2)' }}>
              No saved views yet.
            </div>
            <div>
              Use <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>Save current view</strong>{' '}
              below to capture the current year, theme, layers, and selection.
            </div>
          </div>
        ) : (
          sorted.map((v) => {
            const layerCount = visibleLayerCount(v);
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  apply(v);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    apply(v);
                    onClose();
                  }
                }}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                title="Apply this view"
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.name}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 9.5,
                      color: 'var(--ink-mute)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtRelative(v.savedAt, now)}
                  </span>
                </div>

                {/* Summary chips derived from the real captured state */}
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-1)',
                    marginTop: 'var(--space-2)',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span className="chip">{v.state.year} CE</span>
                  <span className="chip">{v.state.theme}</span>
                  <span className="chip">
                    {layerCount} {layerCount === 1 ? 'layer' : 'layers'}
                  </span>
                  {v.state.selectedId && (
                    <span
                      className="chip"
                      style={{
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={v.state.selectedId}
                    >
                      {v.state.selectedType ?? 'sel'}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete the saved view "${v.name}"?`)) remove(v.id);
                    }}
                    style={REMOVE_BTN}
                    aria-label={`Remove ${v.name}`}
                    title="Remove this view"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer — save current */}
      <div style={FOOTER}>
        <input
          type="text"
          placeholder="Name this view…"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveCurrent();
          }}
          style={TEXT_INPUT}
          aria-label="Name for the new saved view"
        />
        <button
          type="button"
          className="btn"
          style={{ width: '100%', padding: '5px 10px' }}
          onClick={onSaveCurrent}
        >
          Save current view
        </button>
      </div>
    </div>
  );
}
