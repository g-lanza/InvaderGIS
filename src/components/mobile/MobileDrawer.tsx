/**
 * MobileDrawer — the one bottom drawer for the phone shell.
 *
 * A single draggable bottom sheet with three snap states:
 *   • closed — fully off-screen (translated down by its own height, in PIXELS).
 *   • peek   — a short card at the bottom (~PEEK_VH of the viewport) so most of
 *              the map stays visible and tappable behind it.
 *   • full   — nearly the whole screen (~FULL_VH) for reading long records.
 *
 * Why pixels, not `translateY(100%)`: on real iOS Safari a fixed element sized
 * with vh/dvh and hidden via `translateY(100%)` does not reliably clear the
 * visual viewport as the URL bar shows/hides — the old sheets piled up at the
 * bottom. Here the drawer is anchored `bottom: 0`, its height is measured from
 * the live viewport, and it is hidden by translating DOWN by that measured
 * height in px. That always clears the screen regardless of the URL-bar state.
 *
 * Interaction:
 *   • Drag the grabber (or the header) up/down; release snaps to the nearest of
 *     closed / peek / full by velocity + position.
 *   • A backdrop appears only at `full` (so `peek` keeps the map interactive).
 *   • Tap the grabber to toggle peek↔full; swipe down past closed dismisses.
 *
 * The drawer is presentation-only: the caller supplies the title, body, and the
 * open state. Selection wiring lives in MobileShell.
 *
 * @module components/mobile/MobileDrawer
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type DrawerSnap = 'closed' | 'peek' | 'full';

/** Snap heights as a fraction of the live viewport height. */
const PEEK_VH = 0.42;
const FULL_VH = 0.9;
/** Drag distance (px) past a snap before it commits to the next one. */
const COMMIT_PX = 56;
/** Flick velocity (px/ms) that forces a direction regardless of position. */
const FLICK_V = 0.5;

interface MobileDrawerProps {
  snap: DrawerSnap;
  onSnapChange: (next: DrawerSnap) => void;
  /** Title shown in the drawer header (left of the close button). */
  title?: ReactNode;
  /** Optional eyebrow/kind label above the title. */
  eyebrow?: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
  /** Called when the user fully dismisses the drawer (drag below closed / close button). */
  onClose: () => void;
  /** aria-label for the dialog. */
  ariaLabel?: string;
}

/** Live viewport height in CSS px (visualViewport is the most iOS-accurate). */
function viewportHeight(): number {
  if (typeof window === 'undefined') return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

export function MobileDrawer({
  snap,
  onSnapChange,
  title,
  eyebrow,
  children,
  onClose,
  ariaLabel = 'Details',
}: MobileDrawerProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState<number>(viewportHeight);

  // Track the live viewport height (URL bar show/hide, rotation, keyboard).
  useEffect(() => {
    const onResize = (): void => setVh(viewportHeight());
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  const fullPx = Math.round(vh * FULL_VH);
  const peekPx = Math.round(vh * PEEK_VH);

  /** translateY (px, down-positive) for a given snap. Drawer height === fullPx. */
  const translateForSnap = useCallback(
    (s: DrawerSnap): number => {
      switch (s) {
        case 'full': return 0;            // fully up
        case 'peek': return fullPx - peekPx; // only the peek portion shows
        case 'closed': return fullPx;     // fully off-screen (down by its height)
      }
    },
    [fullPx, peekPx],
  );

  // ── Drag state ─────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    startY: number;
    startTranslate: number;
    lastY: number;
    lastT: number;
    velocity: number;
    pointerId: number;
    dragging: boolean;
  } | null>(null);
  // The live translate while dragging (null → use the snap's resting translate).
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);

  const currentTranslate = dragTranslate ?? translateForSnap(snap);

  const beginDrag = useCallback(
    (clientY: number, pointerId: number, target: Element) => {
      target.setPointerCapture?.(pointerId);
      dragRef.current = {
        startY: clientY,
        startTranslate: translateForSnap(snap),
        lastY: clientY,
        lastT: performance.now ? performance.now() : 0,
        velocity: 0,
        pointerId,
        dragging: true,
      };
      setDragTranslate(translateForSnap(snap));
    },
    [snap, translateForSnap],
  );

  const moveDrag = useCallback((clientY: number) => {
    const d = dragRef.current;
    if (!d || !d.dragging) return;
    const dy = clientY - d.startY;
    // Clamp between fully-up (0) and a little past closed (so a downward flick
    // can dismiss). Rubber-band above full.
    let next = d.startTranslate + dy;
    if (next < 0) next = next / 3; // resist over-pull above full
    const now = performance.now ? performance.now() : d.lastT + 16;
    const dt = Math.max(1, now - d.lastT);
    d.velocity = (clientY - d.lastY) / dt; // px per ms, down-positive
    d.lastY = clientY;
    d.lastT = now;
    setDragTranslate(next);
  }, []);

  const endDrag = useCallback(
    (target: Element) => {
      const d = dragRef.current;
      if (!d) return;
      try { target.releasePointerCapture?.(d.pointerId); } catch { /* released */ }
      const t = dragTranslate ?? translateForSnap(snap);
      const v = d.velocity;
      dragRef.current = null;

      // Decide the target snap by velocity first, then nearest position.
      let target_snap: DrawerSnap;
      if (v > FLICK_V) {
        // Flicking down → one step toward closed.
        target_snap = snap === 'full' ? 'peek' : 'closed';
      } else if (v < -FLICK_V) {
        // Flicking up → one step toward full.
        target_snap = snap === 'closed' ? 'peek' : 'full';
      } else {
        // Position-based: snap to nearest of the three rest translates.
        const candidates: DrawerSnap[] = ['full', 'peek', 'closed'];
        target_snap = candidates.reduce((best, s) =>
          Math.abs(t - translateForSnap(s)) < Math.abs(t - translateForSnap(best)) ? s : best,
        'peek');
        // Require a minimum displacement to leave the current snap.
        if (Math.abs(t - translateForSnap(snap)) < COMMIT_PX) target_snap = snap;
      }

      setDragTranslate(null);
      if (target_snap === 'closed') {
        onClose();
      } else if (target_snap !== snap) {
        onSnapChange(target_snap);
      }
    },
    [dragTranslate, onClose, onSnapChange, snap, translateForSnap],
  );

  // ── Pointer handlers (on the grabber + header) ───────────────────────────────
  const onPointerDown = (e: React.PointerEvent): void => {
    beginDrag(e.clientY, e.pointerId, e.currentTarget);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (dragRef.current?.dragging) moveDrag(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    if (dragRef.current) endDrag(e.currentTarget);
  };

  const isClosed = snap === 'closed' && dragTranslate === null;

  return (
    <>
      {/* Backdrop — only interactive/visible near full so peek keeps the map live. */}
      <div
        className={`m-drawer__backdrop${snap === 'full' ? ' is-visible' : ''}`}
        onClick={() => onSnapChange('peek')}
        aria-hidden="true"
      />

      <section
        ref={sheetRef}
        className={`m-drawer m-drawer--${snap}`}
        role="dialog"
        aria-label={ariaLabel}
        aria-hidden={isClosed}
        style={{
          height: `${fullPx}px`,
          transform: `translateY(${currentTranslate}px)`,
          // No transition while actively dragging (1:1 finger tracking).
          transition: dragTranslate === null
            ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
            : 'none',
          // Closed drawers must not eat taps meant for the map.
          pointerEvents: isClosed ? 'none' : 'auto',
        }}
      >
        {/* Grabber + header are the drag surface. */}
        <div
          className="m-drawer__grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="button"
          tabIndex={0}
          aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
          onClick={() => {
            // A tap (no drag) toggles peek↔full.
            if (dragRef.current) return;
            onSnapChange(snap === 'full' ? 'peek' : 'full');
          }}
        >
          <span className="m-drawer__grabber" aria-hidden="true" />
        </div>

        <header className="m-drawer__head">
          <div className="m-drawer__titlewrap">
            {eyebrow && <div className="m-drawer__eyebrow">{eyebrow}</div>}
            {title && <div className="m-drawer__title">{title}</div>}
          </div>
          <button
            type="button"
            className="m-drawer__close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="m-drawer__body">{children}</div>
      </section>
    </>
  );
}
