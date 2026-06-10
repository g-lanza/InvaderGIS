/**
 * useMobileSheet — bottom-sheet toggle controller for ≤600 px viewports.
 *
 * Adds the mobile sheet chrome to the DOM imperatively:
 *   • A `.msa-sheet-bar` strip (three trigger buttons — Layers / Entity / Menu —
 *     with separators) inserted into `.msa-app` as a grid child for the
 *     "sheetbar" area.
 *   • A `.msa-sheet-backdrop` overlay (click to close) inserted into `.msa-app`.
 *   • A `.msa-sheet-handle` handle bar prepended into `.msa-layerrail`,
 *     `.msa-dock`, and the injected `.msa-menu-sheet` so users can tap (or swipe
 *     down) to close an open sheet.
 *   • A `.msa-menu-sheet` bottom sheet that mirrors the TopBar action buttons
 *     (Network / Compare / Lineage / Sources / Registers / Views / My Data /
 *     Search / Filter / Settings). On a phone the TopBar can't show ten controls,
 *     so the Menu sheet surfaces them at thumb height. Each row PROXY-CLICKS the
 *     corresponding hidden TopBar `<button data-mobile-menu="…">` — this keeps the
 *     hook store-free and additive (no new props threaded through AppShell, no
 *     Zustand coupling).
 *
 * Toggle behaviour:
 *   • Opening a sheet closes any other open sheet first (only one sheet open at a
 *     time avoids overlapping overlays on narrow viewports).
 *   • Clicking the backdrop closes the active sheet.
 *   • Clicking the handle of an open sheet closes it.
 *   • Swiping the handle (or sheet) down past a threshold closes the active sheet.
 *   • Clicking the trigger button for the already-open sheet closes it
 *     (.is-open acts as a toggle).
 *
 * Class protocol (matches atlas-shell.css):
 *   • `.is-open` on `.msa-layerrail` / `.msa-dock` / `.msa-menu-sheet` → translateY(0) reveal.
 *   • `.is-open` on the corresponding `.msa-sheet-trigger` → accent border + dot fill.
 *   • `.is-visible` on `.msa-sheet-backdrop` → semi-opaque backdrop, pointer-events on.
 *
 * This hook is self-contained:
 *   • It reads nothing from Zustand stores (no frozen-store touch).
 *   • All DOM manipulation is additive (no edits to AppShell, TopBar, LayerRail,
 *     EntityDock, or any existing element's markup — the Menu sheet only reads
 *     the TopBar's existing buttons and clicks them).
 *   • It cleans up all inserted nodes and listeners on unmount.
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

/** Vertical drag (px) past which a swipe-down dismisses the active sheet. */
const SWIPE_CLOSE_THRESHOLD = 64;

/** Which sheet is currently open. */
type SheetKind = 'rail' | 'dock' | 'menu';

/** Inject mobile chrome into an already-resolved app element. Returns cleanup. */
function setupMobileChrome(app: HTMLElement): () => void {
  const railEl = app.querySelector<HTMLElement>('.msa-layerrail');
  const dockEl = app.querySelector<HTMLElement>('.msa-dock');
  if (!railEl || !dockEl) return (): void => { /* no-op */ };

  // Capture as non-nullable locals so nested closure references stay narrowed.
  const rail: HTMLElement = railEl;
  const dock: HTMLElement = dockEl;

  /* ── State ─────────────────────────────────────────────────────────────── */

  let activeSheet: SheetKind | null = null;

  /* ── DOM nodes ──────────────────────────────────────────────────────────── */

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'msa-sheet-backdrop';

  // Menu sheet — a third bottom sheet that mirrors the TopBar action buttons.
  const menuSheet = document.createElement('div');
  menuSheet.className = 'msa-menu-sheet';
  menuSheet.setAttribute('role', 'dialog');
  menuSheet.setAttribute('aria-label', 'Menu');

  // Sheet bar
  const bar = document.createElement('div');
  bar.className = 'msa-sheet-bar';

  /** Build a labelled trigger button with a leading dot indicator. */
  function makeTrigger(label: string, ariaLabel: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'msa-sheet-trigger';
    btn.type = 'button';
    btn.setAttribute('aria-label', ariaLabel);
    const dot = document.createElement('span');
    dot.className = 'msa-sheet-trigger__dot';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(label));
    return btn;
  }

  /** Vertical separator between trigger buttons. */
  function makeSep(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.className = 'msa-sheet-bar__sep';
    sep.setAttribute('aria-hidden', 'true');
    return sep;
  }

  const triggerLayers = makeTrigger('Layers', 'Toggle layers panel');
  const triggerEntity = makeTrigger('Entity', 'Toggle entity panel');
  const triggerMenu = makeTrigger('Menu', 'Toggle menu');

  bar.appendChild(triggerLayers);
  bar.appendChild(makeSep());
  bar.appendChild(triggerEntity);
  bar.appendChild(makeSep());
  bar.appendChild(triggerMenu);

  /** Build a sheet handle (tap or swipe-down to close). */
  function makeHandle(ariaLabel: string): HTMLDivElement {
    const handle = document.createElement('div');
    handle.className = 'msa-sheet-handle';
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', ariaLabel);
    handle.tabIndex = 0;
    return handle;
  }

  const handleRail = makeHandle('Close layers panel');
  const handleDock = makeHandle('Close entity panel');
  const handleMenu = makeHandle('Close menu');

  /* ── Menu sheet content (proxy buttons over the TopBar actions) ──────────── */

  // Title row inside the menu sheet (handle is prepended separately below).
  const menuList = document.createElement('div');
  menuList.className = 'msa-menu-sheet__list';
  menuSheet.appendChild(menuList);

  /**
   * Populate the menu list from the live TopBar's `[data-mobile-menu]` buttons.
   * Each proxy row clicks its source button, so all toggle behaviour and store
   * state stays owned by TopBar/AppShell. Rebuilt on every open so the rows
   * reflect which overlays are currently active (mirrors `.is-active`).
   */
  function buildMenu(): void {
    menuList.replaceChildren();
    const sources = app.querySelectorAll<HTMLButtonElement>(
      '.msa-topbar [data-mobile-menu]',
    );
    sources.forEach((source) => {
      const label = source.getAttribute('data-mobile-menu') ?? source.textContent ?? '';
      const row = document.createElement('button');
      row.className = 'msa-menu-sheet__item';
      row.type = 'button';
      // Mirror the active state so the open overlay is visibly marked.
      if (source.classList.contains('is-active')) row.classList.add('is-active');
      row.setAttribute('aria-pressed', String(source.getAttribute('aria-pressed') === 'true'));
      row.textContent = label;
      row.addEventListener('click', () => {
        // Proxy the real control, then close the menu sheet.
        source.click();
        closeAll();
      });
      menuList.appendChild(row);
    });
  }

  /* ── State helpers ──────────────────────────────────────────────────────── */

  const sheetEl: Record<SheetKind, HTMLElement> = { rail, dock, menu: menuSheet };
  const triggerEl: Record<SheetKind, HTMLButtonElement> = {
    rail: triggerLayers,
    dock: triggerEntity,
    menu: triggerMenu,
  };
  const ALL_KINDS: SheetKind[] = ['rail', 'dock', 'menu'];

  function openSheet(sheet: SheetKind): void {
    // Close every other sheet first.
    for (const k of ALL_KINDS) {
      if (k === sheet) continue;
      sheetEl[k].classList.remove('is-open');
      triggerEl[k].classList.remove('is-open');
    }

    activeSheet = sheet;

    if (sheet === 'menu') buildMenu();

    sheetEl[sheet].classList.add('is-open');
    triggerEl[sheet].classList.add('is-open');
    backdrop.classList.add('is-visible');
  }

  function closeAll(): void {
    activeSheet = null;
    for (const k of ALL_KINDS) {
      sheetEl[k].classList.remove('is-open');
      triggerEl[k].classList.remove('is-open');
      // Clear any in-flight swipe transform.
      sheetEl[k].style.transform = '';
    }
    backdrop.classList.remove('is-visible');
  }

  function toggleSheet(sheet: SheetKind): void {
    if (activeSheet === sheet) {
      closeAll();
    } else {
      openSheet(sheet);
    }
  }

  /* ── Swipe-to-close (pointer drag on a handle) ──────────────────────────── */

  /**
   * Wire pointer-drag dismissal onto a handle. Dragging down translates the
   * sheet with the finger; releasing past the threshold closes it, otherwise it
   * springs back. Compositor-only (transform), pointer-capture so the drag
   * survives leaving the handle. Returns a disposer for cleanup.
   */
  function wireSwipe(handle: HTMLElement, sheet: SheetKind): () => void {
    let dragging = false;
    let startY = 0;
    let dy = 0;

    const onDown = (e: PointerEvent): void => {
      if (activeSheet !== sheet) return;
      dragging = true;
      startY = e.clientY;
      dy = 0;
      handle.setPointerCapture(e.pointerId);
      // Suspend the slide transition during the drag for 1:1 finger tracking.
      sheetEl[sheet].style.transition = 'none';
    };

    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY); // down-only
      sheetEl[sheet].style.transform = `translateY(${dy}px)`;
    };

    const finish = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      // Restore transition (CSS class-driven) and decide open/closed.
      sheetEl[sheet].style.transition = '';
      if (dy > SWIPE_CLOSE_THRESHOLD) {
        closeAll();
      } else {
        // Spring back to fully open.
        sheetEl[sheet].style.transform = '';
      }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);

    return (): void => {
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    };
  }

  /* ── Event handlers ─────────────────────────────────────────────────────── */

  const onLayersTrigger = (): void => toggleSheet('rail');
  const onEntityTrigger = (): void => toggleSheet('dock');
  const onMenuTrigger = (): void => toggleSheet('menu');
  const onBackdrop = (): void => closeAll();
  const onHandleClick = (): void => closeAll();

  // Keyboard support for handles (Enter / Space → close).
  const onHandleKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeAll(); }
  };

  triggerLayers.addEventListener('click', onLayersTrigger);
  triggerEntity.addEventListener('click', onEntityTrigger);
  triggerMenu.addEventListener('click', onMenuTrigger);
  backdrop.addEventListener('click', onBackdrop);
  for (const h of [handleRail, handleDock, handleMenu]) {
    h.addEventListener('click', onHandleClick);
    h.addEventListener('keydown', onHandleKey);
  }

  const disposeSwipes = [
    wireSwipe(handleRail, 'rail'),
    wireSwipe(handleDock, 'dock'),
    wireSwipe(handleMenu, 'menu'),
  ];

  /* ── Mount ──────────────────────────────────────────────────────────────── */

  app.appendChild(backdrop);
  app.appendChild(menuSheet);
  app.appendChild(bar);
  rail.prepend(handleRail);
  dock.prepend(handleDock);
  menuSheet.prepend(handleMenu);

  /* ── Cleanup ────────────────────────────────────────────────────────────── */

  return (): void => {
    closeAll();
    triggerLayers.removeEventListener('click', onLayersTrigger);
    triggerEntity.removeEventListener('click', onEntityTrigger);
    triggerMenu.removeEventListener('click', onMenuTrigger);
    backdrop.removeEventListener('click', onBackdrop);
    for (const h of [handleRail, handleDock, handleMenu]) {
      h.removeEventListener('click', onHandleClick);
      h.removeEventListener('keydown', onHandleKey);
    }
    for (const dispose of disposeSwipes) dispose();
    backdrop.remove();
    bar.remove();
    menuSheet.remove();
    handleRail.remove();
    handleDock.remove();
    handleMenu.remove();
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
