/**
 * useMobileSheet — bottom-sheet toggle controller for ≤600 px viewports.
 *
 * Adds the mobile sheet chrome to the DOM imperatively:
 *   • A `.msa-sheet-bar` strip (two trigger buttons + separator) inserted into
 *     `.msa-app` as a grid child for the "sheetbar" area.
 *   • A `.msa-sheet-backdrop` overlay (click to close) inserted into `.msa-app`.
 *   • A `.msa-sheet-handle` handle bar prepended into `.msa-layerrail` and
 *     `.msa-dock` so users can tap to close an open sheet.
 *
 * Toggle behaviour:
 *   • Opening a sheet closes the other sheet first (only one sheet open at
 *     a time avoids overlapping overlays on narrow viewports).
 *   • Clicking the backdrop closes the active sheet.
 *   • Clicking the handle of an open sheet closes it.
 *   • Clicking the trigger button for the already-open sheet closes it
 *     (.is-open acts as a toggle).
 *
 * Class protocol (matches atlas-shell.css):
 *   • `.is-open` on `.msa-layerrail` / `.msa-dock` → translateY(0) reveal.
 *   • `.is-open` on the corresponding `.msa-sheet-trigger` → accent border + dot fill.
 *   • `.is-visible` on `.msa-sheet-backdrop` → semi-opaque backdrop, pointer-events on.
 *
 * This hook is self-contained:
 *   • It reads nothing from Zustand stores (no frozen-store touch).
 *   • All DOM manipulation is additive (no edits to AppShell, TopBar, LayerRail,
 *     EntityDock, or any existing element's markup).
 *   • It cleans up all inserted nodes on unmount.
 *   • It watches a ResizeObserver so the mobile chrome is injected/removed
 *     automatically when the viewport crosses the 600 px breakpoint.
 *
 * Usage: import and call once inside AppShell (or wherever the .msa-app ref lives).
 *
 *   import { useMobileSheet } from '@/components/useMobileSheet';
 *   // Inside AppShell, after appRef is declared:
 *   useMobileSheet(appRef);
 *
 * @module useMobileSheet
 */

import { useEffect, useRef } from 'react';

/** Breakpoint that matches atlas-shell.css `--bp-mobile: 600px`. */
const MOBILE_BP = 600;

/** Inject mobile chrome into an already-resolved app element. Returns cleanup. */
function setupMobileChrome(app: HTMLElement): () => void {
  const railEl = app.querySelector<HTMLElement>('.msa-layerrail');
  const dockEl = app.querySelector<HTMLElement>('.msa-dock');
  if (!railEl || !dockEl) return (): void => { /* no-op */ };

  // Capture as non-nullable locals so nested closure references stay narrowed.
  const rail: HTMLElement = railEl;
  const dock: HTMLElement = dockEl;

  /* ── State ─────────────────────────────────────────────────────────────── */

  let activeSheet: 'rail' | 'dock' | null = null;

  /* ── DOM nodes ──────────────────────────────────────────────────────────── */

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'msa-sheet-backdrop';

  // Sheet bar
  const bar = document.createElement('div');
  bar.className = 'msa-sheet-bar';

  // Layers trigger button
  const triggerLayers = document.createElement('button');
  triggerLayers.className = 'msa-sheet-trigger';
  triggerLayers.type = 'button';
  triggerLayers.setAttribute('aria-label', 'Toggle layers panel');

  const dotLayers = document.createElement('span');
  dotLayers.className = 'msa-sheet-trigger__dot';
  triggerLayers.appendChild(dotLayers);
  triggerLayers.appendChild(document.createTextNode('Layers'));

  // Separator
  const sep = document.createElement('div');
  sep.className = 'msa-sheet-bar__sep';
  sep.setAttribute('aria-hidden', 'true');

  // Entity trigger button
  const triggerEntity = document.createElement('button');
  triggerEntity.className = 'msa-sheet-trigger';
  triggerEntity.type = 'button';
  triggerEntity.setAttribute('aria-label', 'Toggle entity panel');

  const dotEntity = document.createElement('span');
  dotEntity.className = 'msa-sheet-trigger__dot';
  triggerEntity.appendChild(dotEntity);
  triggerEntity.appendChild(document.createTextNode('Entity'));

  bar.appendChild(triggerLayers);
  bar.appendChild(sep);
  bar.appendChild(triggerEntity);

  // Sheet handles (prepended into each rail so they appear at the top)
  const handleRail = document.createElement('div');
  handleRail.className = 'msa-sheet-handle';
  handleRail.setAttribute('role', 'button');
  handleRail.setAttribute('aria-label', 'Close layers panel');
  handleRail.tabIndex = 0;

  const handleDock = document.createElement('div');
  handleDock.className = 'msa-sheet-handle';
  handleDock.setAttribute('role', 'button');
  handleDock.setAttribute('aria-label', 'Close entity panel');
  handleDock.tabIndex = 0;

  /* ── State helpers ──────────────────────────────────────────────────────── */

  function openSheet(sheet: 'rail' | 'dock'): void {
    // Close the other sheet first
    if (sheet === 'rail') {
      dock.classList.remove('is-open');
      triggerEntity.classList.remove('is-open');
    } else {
      rail.classList.remove('is-open');
      triggerLayers.classList.remove('is-open');
    }

    activeSheet = sheet;

    if (sheet === 'rail') {
      rail.classList.add('is-open');
      triggerLayers.classList.add('is-open');
    } else {
      dock.classList.add('is-open');
      triggerEntity.classList.add('is-open');
    }

    backdrop.classList.add('is-visible');
  }

  function closeAll(): void {
    activeSheet = null;
    rail.classList.remove('is-open');
    dock.classList.remove('is-open');
    triggerLayers.classList.remove('is-open');
    triggerEntity.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
  }

  function toggleSheet(sheet: 'rail' | 'dock'): void {
    if (activeSheet === sheet) {
      closeAll();
    } else {
      openSheet(sheet);
    }
  }

  /* ── Event handlers ─────────────────────────────────────────────────────── */

  const onLayersTrigger = (): void => toggleSheet('rail');
  const onEntityTrigger = (): void => toggleSheet('dock');
  const onBackdrop = (): void => closeAll();
  const onHandleRail = (): void => closeAll();
  const onHandleDock = (): void => closeAll();

  // Keyboard support for handles (Enter / Space)
  const onHandleRailKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeAll(); }
  };
  const onHandleDockKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeAll(); }
  };

  triggerLayers.addEventListener('click', onLayersTrigger);
  triggerEntity.addEventListener('click', onEntityTrigger);
  backdrop.addEventListener('click', onBackdrop);
  handleRail.addEventListener('click', onHandleRail);
  handleDock.addEventListener('click', onHandleDock);
  handleRail.addEventListener('keydown', onHandleRailKey);
  handleDock.addEventListener('keydown', onHandleDockKey);

  /* ── Mount ──────────────────────────────────────────────────────────────── */

  app.appendChild(backdrop);
  app.appendChild(bar);
  rail.prepend(handleRail);
  dock.prepend(handleDock);

  /* ── Cleanup ────────────────────────────────────────────────────────────── */

  return (): void => {
    closeAll();
    triggerLayers.removeEventListener('click', onLayersTrigger);
    triggerEntity.removeEventListener('click', onEntityTrigger);
    backdrop.removeEventListener('click', onBackdrop);
    handleRail.removeEventListener('click', onHandleRail);
    handleDock.removeEventListener('click', onHandleDock);
    handleRail.removeEventListener('keydown', onHandleRailKey);
    handleDock.removeEventListener('keydown', onHandleDockKey);
    backdrop.remove();
    bar.remove();
    handleRail.remove();
    handleDock.remove();
  };
}

/**
 * Injects mobile bottom-sheet chrome when the viewport is ≤600 px wide.
 * Cleans up all injected nodes on unmount or when the viewport widens.
 *
 * @param appRef - Ref to the `.msa-app` root element (provided by AppShell).
 */
export function useMobileSheet(appRef: React.RefObject<HTMLDivElement | null>): void {
  /**
   * We store the cleanup function in a ref so the ResizeObserver callback can
   * call it without stale-closure issues.
   */
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    /** Run cleanup if it exists, then null it. */
    function teardown(): void {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    }

    /* ── ResizeObserver: inject/remove chrome on breakpoint cross ─────────── */

    let isMobile = window.innerWidth <= MOBILE_BP;

    if (isMobile) {
      cleanupRef.current = setupMobileChrome(app);
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nowMobile = entry.contentRect.width <= MOBILE_BP;
        if (nowMobile !== isMobile) {
          isMobile = nowMobile;
          if (nowMobile) {
            cleanupRef.current = setupMobileChrome(app);
          } else {
            teardown();
          }
        }
      }
    });

    ro.observe(app);

    return (): void => {
      ro.disconnect();
      teardown();
    };
  // appRef.current is stable after mount; effect intentionally runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
