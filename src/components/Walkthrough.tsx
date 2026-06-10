/**
 * Walkthrough.tsx — first-open guided spotlight tour (Quick Start guide).
 *
 * A multi-step overlay that highlights each of the six real shell regions one at
 * a time (TopBar / LayerRail / Map / TimeRail / EntityDock / StatusBar) plus the
 * Settings entry point, with a tooltip card and Next / Back / Skip controls.
 *
 * ── How it anchors ──────────────────────────────────────────────────────────────
 * Each step names a CSS selector for a real DOM element already mounted by
 * AppShell. On each step we measure that element with getBoundingClientRect() and
 * paint a "spotlight" — a darkened backdrop with a transparent cut-out over the
 * target (via a 4-rect mask, since box-shadow spread would violate the no-shadow
 * design law on chrome — we use plain dim panels around the cut-out instead).
 * The tooltip card is placed on the open side of the target and clamped to the
 * viewport. ResizeObserver + a window resize listener re-measure live.
 *
 * ── Lifecycle / persistence ─────────────────────────────────────────────────────
 * AppShell shows this on first visit (localStorage flag) and lets the Settings
 * Guides page replay it. The component itself is controlled: `open` + `onClose`.
 * It writes the "seen" flag when it finishes or is skipped (via onClose) — the
 * persistence policy lives in the hook (useWalkthrough), not here, so this stays
 * a pure presentational controlled component.
 *
 * ── Design contract (DESIGN.md) ─────────────────────────────────────────────────
 * Square corners, hairline borders, NO panel shadows, tokens only, no italics,
 * correct in all four themes. Motion on transform/opacity only; respects
 * prefers-reduced-motion (the backdrop/card appear without the slide).
 * Keyboard: Esc skips, ←/→ navigate, Enter advances, focus trapped in the card.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/components/useFocusTrap';
import './Walkthrough.css';

// ── Step model ──────────────────────────────────────────────────────────────────

/** Where the tooltip card prefers to sit relative to the highlighted target. */
type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** One walkthrough step: a real DOM target + explanatory copy. */
interface WalkStep {
  /** Stable id (React key + analytics-friendly). */
  id: string;
  /** Short eyebrow label (mono caps). */
  eyebrow: string;
  /** Card title. */
  title: string;
  /** One or two sentences explaining the region in plain language. */
  body: string;
  /**
   * CSS selector for the real element to highlight. When the selector resolves
   * to nothing (e.g. a control that only exists on some viewports), the step
   * falls back to a centered card with no cut-out.
   */
  selector: string;
  /** Preferred card placement relative to the target. */
  placement: Placement;
}

/**
 * The seven tour stops. Selectors target elements AppShell mounts unconditionally
 * (the six grid regions) plus the Settings button in the TopBar. Copy is written
 * to be true to what each region actually does — no invented features.
 */
const STEPS: readonly WalkStep[] = [
  {
    id: 'welcome',
    eyebrow: 'Welcome',
    title: 'InvaderGIS',
    body:
      'A custom GIS for exploring historical data across time and space, covering 500–1500 CE. ' +
      'This quick tour points out each part of the workspace. Use Next / Back, or press ← →. Press Esc to skip.',
    selector: '.msa-app',
    placement: 'center',
  },
  {
    id: 'topbar',
    eyebrow: 'Top bar',
    title: 'Views & tools',
    body:
      'The brand sits at the left; the buttons on the right open analytical views — Network, Compare, Lineage, ' +
      'Sources, Registers, Story, Search, Filter — and Settings. Each opens over the map and remembers its state.',
    selector: '.msa-topbar',
    placement: 'bottom',
  },
  {
    id: 'layerrail',
    eyebrow: 'Left rail',
    title: 'Layers & legend',
    body:
      'Toggle map layers (polities, capitals, events, journeys, relationships and more), set per-layer opacity, ' +
      'and read the colour legend. Grouped and collapsible; hide the whole rail with the “Hide” control.',
    selector: '.msa-layerrail',
    placement: 'right',
  },
  {
    id: 'map',
    eyebrow: 'Map',
    title: 'The map canvas',
    body:
      'Real polygons, points and routes, time-scoped to the active year. Hover for a tip, click a feature to inspect it. ' +
      'Zoom controls, a scale bar and a live coordinate read-out sit in the corners.',
    selector: '.msa-map',
    placement: 'center',
  },
  {
    id: 'timerail',
    eyebrow: 'Time rail',
    title: 'Scrub through time',
    body:
      'Drag the year scrubber to move through 500–1500 CE — the map and every view update live. ' +
      'The histogram shows record density per period; press Play to auto-advance.',
    selector: '.msa-timerail',
    placement: 'top',
  },
  {
    id: 'dock',
    eyebrow: 'Right dock',
    title: 'Inspector',
    body:
      'Select any record and its full detail opens here: a tabbed profile for polities (overview, demographics, ' +
      'economy, lifecycle, connections, sources). Every claim shows its provenance and citations.',
    selector: '.msa-dock',
    placement: 'left',
  },
  {
    id: 'settings',
    eyebrow: 'Settings',
    title: 'Themes, guides & sources',
    body:
      'Open Settings to switch theme and map style, and to read the Guides tab — a manual, the data sources, ' +
      'attribution and licences. You can replay this tour from there any time.',
    selector: '[data-tour="settings-btn"]',
    placement: 'bottom',
  },
];

// ── Geometry helpers ─────────────────────────────────────────────────────────────

/** A measured target rectangle in viewport coordinates, plus whether it resolved. */
interface TargetRect {
  found: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Padding (px) around the target inside the spotlight cut-out. */
const SPOTLIGHT_PAD = 4;

/** Tooltip card width (px) — clamped on narrow viewports via CSS max-width. */
const CARD_W = 320;
/** Estimated card height for clamping; the real card may be shorter. */
const CARD_H_EST = 210;
/** Gap (px) between the target and the card. */
const CARD_GAP = 12;

/** Measure a selector; returns found:false when it resolves to nothing. */
function measure(selector: string): TargetRect {
  if (typeof document === 'undefined') {
    return { found: false, top: 0, left: 0, width: 0, height: 0 };
  }
  const el = document.querySelector(selector);
  if (!el) return { found: false, top: 0, left: 0, width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    return { found: false, top: 0, left: 0, width: 0, height: 0 };
  }
  return { found: true, top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Clamp a value into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Compute the card's top/left for a placement, clamped to the viewport so it never
 * runs off-screen. Falls back to centering when the target was not found.
 */
function placeCard(rect: TargetRect, placement: Placement): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  if (!rect.found || placement === 'center') {
    return {
      top: clamp(vh / 2 - CARD_H_EST / 2, margin, vh - CARD_H_EST - margin),
      left: clamp(vw / 2 - CARD_W / 2, margin, vw - CARD_W - margin),
    };
  }

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  let top: number;
  let left: number;
  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + CARD_GAP;
      left = cx - CARD_W / 2;
      break;
    case 'top':
      top = rect.top - CARD_H_EST - CARD_GAP;
      left = cx - CARD_W / 2;
      break;
    case 'right':
      top = cy - CARD_H_EST / 2;
      left = rect.left + rect.width + CARD_GAP;
      break;
    case 'left':
      top = cy - CARD_H_EST / 2;
      left = rect.left - CARD_W - CARD_GAP;
      break;
    default:
      top = vh / 2 - CARD_H_EST / 2;
      left = vw / 2 - CARD_W / 2;
  }

  return {
    top: clamp(top, margin, vh - CARD_H_EST - margin),
    left: clamp(left, margin, vw - CARD_W - margin),
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for the Walkthrough overlay. Controlled by the parent. */
export interface WalkthroughProps {
  /** Whether the tour is visible. */
  open: boolean;
  /**
   * Called when the tour ends — whether by finishing the last step, clicking
   * Skip/close, or pressing Esc. The parent persists the "seen" flag.
   */
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The guided spotlight tour. Renders nothing until `open` is true (the parent
 * gates the mount behind a hasOpened flag, so it costs nothing when unused).
 *
 * @param open    - Whether the tour is visible.
 * @param onClose - Callback fired when the tour ends.
 */
export function Walkthrough({ open, onClose }: WalkthroughProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<TargetRect>({ found: false, top: 0, left: 0, width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  // Re-measure the active step's target on step change, open, and viewport change.
  // useLayoutEffect so the spotlight is positioned before the browser paints.
  useLayoutEffect(() => {
    if (!open) return;
    const remeasure = () => setRect(measure(step.selector));
    remeasure();

    const ro = new ResizeObserver(remeasure);
    const target = document.querySelector(step.selector);
    if (target) ro.observe(target);
    // The whole app can resize (collapsing rails) — observe the root too.
    const root = document.querySelector('.msa-app');
    if (root) ro.observe(root);

    window.addEventListener('resize', remeasure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [open, step.selector]);

  // Focus the primary action on each step so keyboard users land on Next/Done.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => nextRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, stepIdx]);

  // Keep Tab focus within the card while the tour is open.
  useFocusTrap(cardRef, open);

  // Lock body scroll while the tour is open so the page can't be scrolled
  // beneath the backdrop. Restored exactly on close/unmount.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const goNext = useCallback(() => {
    setStepIdx((i) => {
      if (i >= STEPS.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [onClose]);

  const goBack = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  // Global keyboard controls while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goNext, goBack, onClose]);

  if (!open) return null;

  const cardPos = placeCard(rect, step.placement);

  // Spotlight cut-out geometry (only when the target resolved). The four dim
  // panels surround the transparent target window; we never use box-shadow.
  const hole = rect.found
    ? {
        top: Math.max(0, rect.top - SPOTLIGHT_PAD),
        left: Math.max(0, rect.left - SPOTLIGHT_PAD),
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  return (
    <div
      className="walkthrough"
      role="dialog"
      aria-modal="true"
      aria-label="Quick start tour"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Dim backdrop with a transparent spotlight cut-out ── */}
      {hole ? (
        <>
          {/* Top band */}
          <div className="walkthrough__scrim" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          {/* Bottom band */}
          <div
            className="walkthrough__scrim"
            style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }}
          />
          {/* Left band (between top and bottom) */}
          <div
            className="walkthrough__scrim"
            style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }}
          />
          {/* Right band */}
          <div
            className="walkthrough__scrim"
            style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }}
          />
          {/* Hairline ring around the spotlight (border, not shadow) */}
          <div
            className="walkthrough__ring"
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            aria-hidden="true"
          />
          {/* Transparent click-blocker over the spotlight hole — prevents
              accidental interaction with the highlighted region during the tour. */}
          <div
            style={{
              position: 'fixed',
              top: hole.top, left: hole.left,
              width: hole.width, height: hole.height,
              pointerEvents: 'auto',
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        // No target resolved → a single full-viewport scrim (centered card).
        <div className="walkthrough__scrim walkthrough__scrim--full" style={{ inset: 0 }} />
      )}

      {/* ── Tooltip card ── */}
      <div
        ref={cardRef}
        className="walkthrough__card"
        style={{ top: cardPos.top, left: cardPos.left, width: CARD_W }}
      >
        <div className="walkthrough__head">
          <span className="walkthrough__eyebrow">{step.eyebrow}</span>
          <span className="walkthrough__count" aria-hidden="true">
            {stepIdx + 1} / {STEPS.length}
          </span>
        </div>

        <h2 className="walkthrough__title">{step.title}</h2>
        <p className="walkthrough__body">{step.body}</p>

        {/* Progress dots */}
        <div className="walkthrough__dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`walkthrough__dot${i === stepIdx ? ' is-active' : ''}${i < stepIdx ? ' is-done' : ''}`}
            />
          ))}
        </div>

        <div className="walkthrough__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            title="Skip the tour"
          >
            Skip
          </button>
          <div className="walkthrough__nav">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={goBack}
              disabled={isFirst}
              aria-disabled={isFirst}
              title="Previous step"
            >
              Back
            </button>
            <button
              ref={nextRef}
              type="button"
              className="btn is-active"
              onClick={goNext}
              title={isLast ? 'Finish the tour' : 'Next step'}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
