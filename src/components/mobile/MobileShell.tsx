/**
 * MobileShell — the phone-native layout (≤600px).
 *
 * This is NOT the desktop grid scaled down. It is a purpose-built phone shell:
 *   • The map fills the whole screen (edge to edge, under everything).
 *   • A compact translucent top bar (brand + Layers + Menu) floats over the map.
 *   • The TimeRail is pinned to the bottom edge (above the home indicator).
 *   • ONE bottom drawer (MobileDrawer) shows, at a time, exactly one of:
 *       - the selected entity's info  (auto-opens to "peek" when you tap a polity)
 *       - the Layers panel
 *       - the Menu (the analysis/data/tools actions)
 *   So panels never stack or fight for space — there is only ever one.
 *
 * It reuses everything: the same MapCanvas, the same selectionStore, the same
 * LayerRail body, the same DockHeader/DockBody inspector, and the same heavy
 * overlays (passed through from AppShell, which still owns overlay state). Only
 * the layout/panel presentation is phone-specific.
 *
 * @module components/mobile/MobileShell
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { assetUrl } from '@/data/assetUrl';
import { MapCanvas } from '@/map/MapCanvas';
import { TimeRail } from '@/components/TimeRail';
import { LayerRail } from '@/components/LayerRail';
import { DockBody, findRecord } from '@/panels/EntityDock';
import { useSelectionStore } from '@/stores/selectionStore';
import { displayNameFromRecord, humanizeType } from '@/data/displayName';
import { MobileDrawer, type DrawerSnap } from './MobileDrawer';

/** Which content the single drawer is showing. */
type MobilePanel = 'entity' | 'layers' | 'menu' | null;

/** One Menu action surfaced in the mobile Menu panel. */
export interface MobileMenuAction {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

interface MobileShellProps {
  /** The analysis/data/tools actions to list in the Menu drawer. */
  menuActions: MobileMenuAction[];
  /** Heavy overlays + command bar etc., rendered above the shell unchanged. */
  children?: ReactNode;
}

export function MobileShell({ menuActions, children }: MobileShellProps) {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selectedType = useSelectionStore((s) => s.selectedType);
  const inspectorOpen = useSelectionStore((s) => s.inspectorOpen);
  const setInspectorOpen = useSelectionStore((s) => s.setInspectorOpen);
  const select = useSelectionStore((s) => s.select);

  const [panel, setPanel] = useState<MobilePanel>(null);
  const [snap, setSnap] = useState<DrawerSnap>('closed');

  const hasSelection = selectedId !== null && selectedType !== null;

  // ── Selection drives the drawer ──────────────────────────────────────────────
  // Tapping a polity on the map calls selectionStore.select(), which sets
  // inspectorOpen=true. React to that: show the entity panel at a PEEK height so
  // the map stays visible. We only auto-open (never auto-collapse a user's full
  // drawer) and we don't fight a user who switched to Layers/Menu.
  useEffect(() => {
    if (inspectorOpen && hasSelection) {
      setPanel('entity');
      setSnap((s) => (s === 'closed' ? 'peek' : s));
    }
  }, [inspectorOpen, hasSelection, selectedId]);

  // If the selection is cleared while showing the entity panel, close the drawer.
  useEffect(() => {
    if (!hasSelection && panel === 'entity') {
      setPanel(null);
      setSnap('closed');
    }
  }, [hasSelection, panel]);

  /** Open a non-entity panel (Layers / Menu). Strictly replaces whatever's up. */
  const openPanel = useCallback((p: Exclude<MobilePanel, null | 'entity'>) => {
    setPanel(p);
    setSnap('full'); // Layers/Menu open at full — they're lists, not map overlays.
  }, []);

  /** Close the drawer entirely. The snap→'closed' effect clears the panel after
      the slide-down so content doesn't vanish mid-animation. */
  const closeDrawer = useCallback(() => {
    setSnap('closed');
    if (panel === 'entity') {
      // Closing the entity drawer also drops the selection's inspector flag (the
      // selection itself stays, so the map highlight persists if you reopen).
      setInspectorOpen(false);
    }
  }, [panel, setInspectorOpen]);

  // When the drawer reaches 'closed' via drag/snap, drop the panel content once
  // the slide-down animation has finished.
  useEffect(() => {
    if (snap === 'closed') {
      const t = window.setTimeout(() => setPanel(null), 280);
      return () => window.clearTimeout(t);
    }
  }, [snap]);

  const onNavigate = useCallback(
    (id: string, type: string) => { select(id, type); },
    [select],
  );

  // ── Drawer header text per panel ─────────────────────────────────────────────
  const entityName = useMemo(
    () => (hasSelection ? displayNameFromRecord(findRecord(selectedId!, selectedType!)) : ''),
    [hasSelection, selectedId, selectedType],
  );
  // (findRecord takes id, kind — see EntityDock.)

  const drawerOpen = panel !== null && snap !== 'closed';

  let title: ReactNode = null;
  let eyebrow: ReactNode = null;
  let body: ReactNode = null;
  let ariaLabel = 'Details';

  if (panel === 'entity' && hasSelection) {
    ariaLabel = `Record: ${entityName}`;
    eyebrow = humanizeType(selectedType!);
    title = entityName;
    body = (
      <DockBody key={selectedId} id={selectedId!} kind={selectedType!} onNavigate={onNavigate} />
    );
  } else if (panel === 'layers') {
    ariaLabel = 'Layers';
    title = 'Layers';
    body = <LayerRail />;
  } else if (panel === 'menu') {
    ariaLabel = 'Menu';
    title = 'Menu';
    body = (
      <div className="m-menu">
        {menuActions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`m-menu__item${a.active ? ' is-active' : ''}`}
            onClick={() => { a.onSelect(); closeDrawer(); }}
          >
            {a.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="m-shell">
      {/* Full-bleed map under everything. */}
      <div className="m-shell__map">
        <MapCanvas />
      </div>

      {/* Floating compact top bar. */}
      <header className="m-topbar" role="banner">
        <div className="m-topbar__brand" aria-label="InvaderGIS">
          <img
            src={assetUrl('/hdv-logo.svg')}
            alt="InvaderGIS"
            width={24}
            height={24}
            className="m-topbar__logo"
          />
          <span className="m-topbar__wordmark">InvaderGIS</span>
        </div>
        <div className="m-topbar__actions">
          <button
            type="button"
            className={`m-topbar__btn${panel === 'layers' ? ' is-active' : ''}`}
            onClick={() => (panel === 'layers' ? closeDrawer() : openPanel('layers'))}
            aria-pressed={panel === 'layers'}
          >
            Layers
          </button>
          <button
            type="button"
            className={`m-topbar__btn${panel === 'menu' ? ' is-active' : ''}`}
            onClick={() => (panel === 'menu' ? closeDrawer() : openPanel('menu'))}
            aria-pressed={panel === 'menu'}
            aria-label="Menu"
          >
            Menu
          </button>
        </div>
      </header>

      {/* TimeRail pinned to the bottom edge. Hidden while the drawer is at full
          so the year scrubber doesn't sit under the sheet. */}
      <div className={`m-shell__timerail${snap === 'full' && drawerOpen ? ' is-hidden' : ''}`}>
        <TimeRail />
      </div>

      {/* The one drawer. */}
      <MobileDrawer
        snap={drawerOpen ? snap : 'closed'}
        onSnapChange={setSnap}
        onClose={closeDrawer}
        title={title}
        eyebrow={eyebrow}
        ariaLabel={ariaLabel}
      >
        {body}
      </MobileDrawer>

      {/* Heavy overlays / command bar — rendered by AppShell, full-screen on mobile. */}
      {children}
    </div>
  );
}
