/**
 * useWalkthrough — controller for the first-open guided tour.
 *
 * Owns the tour's open/close state plus the persistence policy:
 *   · On first ever visit (no localStorage "seen" flag) the tour auto-opens once,
 *     deferred a frame after mount so the shell regions exist to be measured.
 *   · Finishing or skipping the tour writes the "seen" flag so it never auto-shows
 *     again — but it stays replayable.
 *   · Any other surface (the Settings Guides page) can replay the tour by
 *     dispatching a `window` CustomEvent named WALKTHROUGH_REPLAY_EVENT. This hook
 *     listens for it and re-opens, so Settings needs no shared store — it just
 *     fires the event (see startWalkthrough()).
 *
 * Kept outside any Zustand store: purely local UI state, no frozen-interface
 * impact, no serialization beyond the single localStorage flag.
 */
import { useCallback, useEffect, useState } from 'react';

/** localStorage key recording that the user has seen (or skipped) the tour. */
const SEEN_KEY = 'hdv-walkthrough-seen';

/** Custom window event other surfaces dispatch to replay the tour. */
export const WALKTHROUGH_REPLAY_EVENT = 'hdv:walkthrough-replay';

/** Read the "seen" flag, guarded for environments without localStorage. */
function hasSeen(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true; // SSR/blocked → don't auto-pop
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

/** Persist the "seen" flag (best-effort; private-mode failures are swallowed). */
function markSeen(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore — the tour simply re-shows next session if storage is blocked
  }
}

/**
 * Imperatively (re)start the walkthrough from anywhere in the app by dispatching
 * the replay event. Used by the Settings Guides "Replay tour" button so it does
 * not need a direct handle to the hook's setter.
 */
export function startWalkthrough(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_REPLAY_EVENT));
  }
}

/** Return shape of the walkthrough controller. */
export interface WalkthroughController {
  /** Whether the tour is currently open. */
  open: boolean;
  /** Close the tour and record that it has been seen. */
  close: () => void;
  /** True once the tour has opened at least once (mount-gating for AppShell). */
  hasOpened: boolean;
  /**
   * True when the current open/close cycle is the first-ever visit auto-show
   * (as opposed to a replay triggered from Settings). AppShell uses this to
   * collapse the dock and rail after the first-visit tour closes.
   */
  isFirstVisit: boolean;
}

/**
 * Controller hook for the walkthrough. Auto-opens once on first visit and
 * listens for replay events.
 *
 * @returns The open flag, a close handler, and a hasOpened mount-gate flag.
 */
export function useWalkthrough(): WalkthroughController {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  // True only while the first-ever auto-show cycle is active.
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // First-visit auto-show: defer to the next frame so AppShell's regions are
  // mounted and measurable before the spotlight tries to anchor to them.
  useEffect(() => {
    if (hasSeen()) return;
    const id = requestAnimationFrame(() => {
      setOpen(true);
      setHasOpened(true);
      setIsFirstVisit(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Replay-on-demand: Settings (or any surface) dispatches the event.
  useEffect(() => {
    const onReplay = () => {
      setOpen(true);
      setHasOpened(true);
      setIsFirstVisit(false); // replays don't trigger the first-visit collapse
    };
    window.addEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, onReplay);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setIsFirstVisit(false);
    markSeen();
  }, []);

  return { open, close, hasOpened, isFirstVisit };
}
