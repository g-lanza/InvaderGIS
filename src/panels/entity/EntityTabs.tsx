/**
 * EntityTabs — token-driven tab strip for the polity inspector.
 *
 * Renders six tabs: Overview / Demographics / Economy / Lifecycle /
 * Connections / Sources.
 *
 * Square corners, hairline underline on active tab, no panel shadows.
 * Keyboard-accessible: role=tablist/tab/tabpanel, arrow-key navigation,
 * aria-selected, correct focus management.
 *
 * Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 * Zero hardcoded hex — tokens only.
 *
 * Usage:
 *   <EntityTabs record={record} onNavigate={onNavigate} />
 *
 * The component owns its own `activeTab` state and renders the relevant
 * tab panel directly. Callers only need to mount it and pass CardProps.
 */

import { useState, useRef, useCallback, type JSX, type KeyboardEvent } from 'react';
import type { CardProps } from '@/panels/types';
import { displayNameFromRecord } from '@/data/displayName';
import { OverviewTab }      from '@/panels/entity/OverviewTab';
import { DemographicsTab }  from '@/panels/entity/DemographicsTab';
import { EconomyTab }       from '@/panels/entity/EconomyTab';
import { LifecycleTab }     from '@/panels/entity/LifecycleTab';
import { ConnectionsTab }   from '@/panels/entity/ConnectionsTab';
import { SourcesTab }       from '@/panels/entity/SourcesTab';

// ── Tab definitions ───────────────────────────────────────────────────────────

/** A single tab descriptor. */
interface TabDef {
  /** Stable id used for aria-controls / aria-labelledby. */
  id: string;
  /** Display label rendered in the strip. */
  label: string;
}

const TABS: readonly TabDef[] = [
  { id: 'overview',      label: 'Overview'      },
  { id: 'demographics',  label: 'Demographics'  },
  { id: 'economy',       label: 'Economy'       },
  { id: 'lifecycle',     label: 'Lifecycle'     },
  { id: 'connections',   label: 'Connections'   },
  { id: 'sources',       label: 'Sources'       },
] as const;

type TabId = 'overview' | 'demographics' | 'economy' | 'lifecycle' | 'connections' | 'sources';

// ── Tab strip ─────────────────────────────────────────────────────────────────

interface TabStripProps {
  activeId: TabId;
  onSelect: (id: TabId) => void;
  tabRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  /** Record name, woven into the tablist aria-label for screen readers. */
  recordName: string;
}

/**
 * Horizontal tab strip. Implements the ARIA tabs pattern with arrow-key nav.
 */
function TabStrip({ activeId, onSelect, tabRefs, recordName }: TabStripProps): JSX.Element {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIdx = TABS.findIndex((t) => t.id === activeId);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % TABS.length;
        onSelect(TABS[nextIdx].id as TabId);
        tabRefs.current[nextIdx]?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx = (currentIdx - 1 + TABS.length) % TABS.length;
        onSelect(TABS[prevIdx].id as TabId);
        tabRefs.current[prevIdx]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        onSelect(TABS[0].id as TabId);
        tabRefs.current[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = TABS.length - 1;
        onSelect(TABS[last].id as TabId);
        tabRefs.current[last]?.focus();
      }
    },
    [activeId, onSelect, tabRefs],
  );

  return (
    <div
      role="tablist"
      aria-label={recordName ? `${recordName} inspector tabs` : 'Entity inspector tabs'}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        borderBottom: '0.5px solid var(--border-mid)',
        background: 'var(--surface)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {TABS.map((tab, i) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            id={`tab-btn-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => onSelect(tab.id as TabId)}
            title={tab.label}
            style={{
              // Layout
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              // Clip long labels cleanly (ellipsis) instead of wrapping mid-word
              // when 6 tabs share the ~280px docked column. Hover shows the full
              // label via the title attribute above.
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              padding: '7px var(--space-2)',
              // Type
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: isActive ? 'var(--ink)' : 'var(--ink-mute)',
              // Chrome
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              // Active indicator: solid bottom line using box-shadow (compositor-safe)
              // 0.5px border is too thin to see reliably; use 2px accent underline.
              boxShadow: isActive ? 'inset 0 -2px 0 var(--accent)' : 'none',
              // No border-radius
              borderRadius: 0,
              // Transition on opacity only (DESIGN.md)
              transition: 'color 120ms ease-out, box-shadow 120ms ease-out',
              outline: 'none',
              position: 'relative',
            }}
            onFocus={(e) => {
              // Visible focus ring via outline (keyboard navigation)
              (e.currentTarget as HTMLButtonElement).style.outline =
                '1.5px solid var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.outlineOffset = '-1.5px';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLButtonElement).style.outline = 'none';
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Tabbed entity inspector for polity records.
 *
 * Mounts Overview / Demographics / Economy / Lifecycle / Connections / Sources tabs.
 * Keyboard-accessible. Token-only, 4 themes, square corners, no shadows.
 *
 * @param record     - The raw polity RawRecord to inspect.
 * @param onNavigate - Callback to navigate to a linked record in the dock.
 */
export function EntityTabs({ record, onNavigate }: CardProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null, null, null, null]);
  const recordName = displayNameFromRecord(record);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TabStrip activeId={activeTab} onSelect={setActiveTab} tabRefs={tabRefs} recordName={recordName} />

      {/* Tab panels — only the active panel is rendered; others are hidden via
          display:none to preserve DOM state if we later switch to keep-alive. */}

      {/* Overview */}
      <div
        id="tabpanel-overview"
        role="tabpanel"
        aria-labelledby="tab-btn-overview"
        hidden={activeTab !== 'overview'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'overview' ? 'block' : 'none',
        }}
      >
        {activeTab === 'overview' && (
          <OverviewTab record={record} onNavigate={onNavigate} />
        )}
      </div>

      {/* Demographics */}
      <div
        id="tabpanel-demographics"
        role="tabpanel"
        aria-labelledby="tab-btn-demographics"
        hidden={activeTab !== 'demographics'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'demographics' ? 'block' : 'none',
        }}
      >
        {activeTab === 'demographics' && (
          <DemographicsTab record={record} onNavigate={onNavigate} />
        )}
      </div>

      {/* Economy */}
      <div
        id="tabpanel-economy"
        role="tabpanel"
        aria-labelledby="tab-btn-economy"
        hidden={activeTab !== 'economy'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'economy' ? 'block' : 'none',
        }}
      >
        {activeTab === 'economy' && (
          <EconomyTab record={record} onNavigate={onNavigate} />
        )}
      </div>

      {/* Lifecycle */}
      <div
        id="tabpanel-lifecycle"
        role="tabpanel"
        aria-labelledby="tab-btn-lifecycle"
        hidden={activeTab !== 'lifecycle'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'lifecycle' ? 'block' : 'none',
        }}
      >
        {activeTab === 'lifecycle' && (
          <LifecycleTab record={record} onNavigate={onNavigate} />
        )}
      </div>

      {/* Connections */}
      <div
        id="tabpanel-connections"
        role="tabpanel"
        aria-labelledby="tab-btn-connections"
        hidden={activeTab !== 'connections'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'connections' ? 'block' : 'none',
        }}
      >
        {activeTab === 'connections' && (
          <ConnectionsTab record={record} onNavigate={onNavigate} />
        )}
      </div>

      {/* Sources */}
      <div
        id="tabpanel-sources"
        role="tabpanel"
        aria-labelledby="tab-btn-sources"
        hidden={activeTab !== 'sources'}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: activeTab === 'sources' ? 'block' : 'none',
        }}
      >
        {activeTab === 'sources' && (
          <SourcesTab record={record} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
