/**
 * SettingsPanel — the app settings + guides dialog (the "Settings" button in the TopBar).
 *
 * Two tabs:
 *   · Settings — display preferences: the Theme switcher (Atlas / Manuscript / Dark /
 *     Contrast) and the Map-type selector (Parchment / Plain / Relief). Every control
 *     reflects and drives live `settingsStore` state; `setTheme` repaints
 *     `<html data-theme>` immediately.
 *   · Guides — a scrollable reference (GuidesPanel): quick-start, manual, data sources,
 *     attribution, licences, and a "Replay tour" button for the first-open walkthrough.
 *     This is where the data-source credits that used to sit on the map now live.
 *
 * Open/close is controlled by the parent (AppShell) via `open`/`onClose`, matching
 * the FilterPanel / SemanticSearchBar overlay pattern (fixed overlay, focus trap,
 * Escape to close, z-index 55). The panel is widened versus the old single-column
 * version so the Guides content reads comfortably, and its body scrolls.
 *
 * Design: square corners, hairline borders, no shadows, tokens only; correct in
 * all four themes.
 */

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/components/useFocusTrap';
import { useSettingsStore, THEMES } from '@/stores/settingsStore';
import type { MapType, ThemeId } from '@/stores/settingsStore';
import { GuidesPanel } from '@/components/GuidesPanel';

/** Human-readable theme labels. */
const THEME_LABELS: Record<ThemeId, string> = {
  atlas: 'Atlas',
  manuscript: 'Manuscript',
  dark: 'Dark',
  contrast: 'Contrast',
};

/** Human-readable map-type labels. */
const MAP_TYPE_LABELS: Record<MapType, string> = {
  parchment: 'Parchment',
  plain: 'Plain',
  relief: 'Relief',
};

/** Map types in stable display order. */
const MAP_TYPES: MapType[] = ['parchment', 'plain', 'relief'];

/** The two tabs of the panel. */
type SettingsTab = 'settings' | 'guides';

export interface SettingsPanelProps {
  /** Whether the panel is open. Controlled by parent. */
  open: boolean;
  /** Close the panel. */
  onClose: () => void;
  /**
   * Which tab to show when the panel opens. Defaults to 'settings'.
   * (Reserved for a future "open straight to Guides" entry point.)
   */
  initialTab?: SettingsTab;
}

/**
 * A labelled radiogroup row used for both Theme and Map-type selections.
 */
function SettingRow<T extends string>(props: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onSelect: (v: T) => void;
  titleFor: (v: T) => string;
  ariaLabel: string;
}) {
  const { label, options, labels, value, onSelect, titleFor, ariaLabel } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="cap-sm" style={{ color: 'var(--ink-mute)' }}>{label}</span>
      <div className="tab-row" role="radiogroup" aria-label={ariaLabel} style={{ flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`btn${opt === value ? ' is-active' : ''}`}
            role="radio"
            aria-checked={opt === value}
            onClick={() => onSelect(opt)}
            title={titleFor(opt)}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings dialog. Renders nothing until `open` is true (parent gates the mount
 * behind a hasOpened flag, so the panel is cheap when never used).
 */
export function SettingsPanel({ open, onClose, initialTab = 'settings' }: SettingsPanelProps) {
  const theme      = useSettingsStore((s) => s.theme);
  const mapType    = useSettingsStore((s) => s.mapType);
  const setTheme   = useSettingsStore((s) => s.setTheme);
  const setMapType = useSettingsStore((s) => s.setMapType);

  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const panelRef = useRef<HTMLDivElement>(null);

  // Reset to the requested tab each time the panel opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep Tab focus within the panel while open; restore focus on close.
  useFocusTrap(panelRef, open);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Settings and guides"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        width: 380,
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'calc(100vh - 28px - 40px)',
        background: 'var(--surface)',
        border: '0.5px solid var(--border-strong)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px var(--space-3)',
          background: 'var(--surface-3)',
          borderBottom: '0.5px solid var(--border-mid)',
          flexShrink: 0,
        }}
      >
        <span className="cap-sm">Settings</span>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          aria-label="Close settings"
          title="Close settings"
          style={{ lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Tab strip */}
      <div
        className="tab-row"
        role="tablist"
        aria-label="Settings sections"
        style={{ flexShrink: 0 }}
      >
        <button
          role="tab"
          aria-selected={tab === 'settings'}
          className={`btn${tab === 'settings' ? ' is-active' : ''}`}
          style={{ flex: 1, borderRadius: 0 }}
          onClick={() => setTab('settings')}
        >
          Display
        </button>
        <button
          role="tab"
          aria-selected={tab === 'guides'}
          className={`btn${tab === 'guides' ? ' is-active' : ''}`}
          style={{ flex: 1, borderRadius: 0 }}
          onClick={() => setTab('guides')}
        >
          Guides
        </button>
      </div>

      {/* Body (scrolls) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-3)',
          overflowY: 'auto',
        }}
      >
        {tab === 'settings' ? (
          <>
            <SettingRow<ThemeId>
              label="Theme"
              options={THEMES}
              labels={THEME_LABELS}
              value={theme}
              onSelect={setTheme}
              titleFor={(t) => `Switch to ${THEME_LABELS[t]} theme`}
              ariaLabel="Select theme"
            />
            <SettingRow<MapType>
              label="Map base"
              options={MAP_TYPES}
              labels={MAP_TYPE_LABELS}
              value={mapType}
              onSelect={setMapType}
              titleFor={(mt) => `Map style: ${MAP_TYPE_LABELS[mt]}`}
              ariaLabel="Select map type"
            />
            <p
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--ink-mute)',
                margin: 0,
                paddingTop: 'var(--space-1)',
                borderTop: '0.5px solid var(--border)',
              }}
            >
              New here? Open the <strong style={{ color: 'var(--ink-mid)', fontWeight: 600 }}>Guides</strong> tab
              for a quick-start tour, a manual, and the data sources & attribution.
            </p>
          </>
        ) : (
          <GuidesPanel />
        )}
      </div>
    </div>
  );
}
