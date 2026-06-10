/**
 * RegionErrorBoundary — isolates a render crash to one shell region.
 *
 * React error boundaries must be class components (there is no hook equivalent for
 * `componentDidCatch`). This one wraps a single shell region (TimeRail, MapCanvas,
 * EntityDock, LayerRail) so that a transient render throw in that region — e.g. a
 * brief NaN/zero geometry while a panel is collapsing or expanding, or a stale
 * module during dev HMR — shows a small recoverable inline message instead of
 * unmounting the whole app to a white screen.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────
 * Hiding or full-screening a side panel resizes the grid (and the MapLibre canvas)
 * mid‑transition. If a region's render briefly computes an invalid value during
 * that reflow, React tears down the entire tree without a boundary — taking down
 * neighbours that were perfectly fine. React itself flags this in the console:
 * "Consider adding an error boundary to your tree." This is that boundary.
 *
 * ── Self‑recovery ───────────────────────────────────────────────────────────────
 * The boundary auto‑resets its error state whenever its `resetKey` prop changes
 * (the parent passes the layout state that triggered the transition), and also
 * offers a manual "Try again" button. So a one‑off transient error clears itself on
 * the very next layout change — the region re-mounts and renders normally — rather
 * than staying broken until a full reload.
 *
 * ── Design contract (DESIGN.md) ─────────────────────────────────────────────────
 * The fallback uses the existing honest error idiom (ErrorState): square corners,
 * hairline borders, no shadows, tokens only, correct in all four themes.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/states/ErrorState';

/** Props for RegionErrorBoundary. */
export interface RegionErrorBoundaryProps {
  /** Human label for the region, used in the fallback copy (e.g. "Time rail"). */
  region: string;
  /**
   * When this value changes, the boundary clears any caught error and re-renders
   * its children. Pass the layout/transition state that may have caused the crash
   * (e.g. a string of the collapse/fullscreen flags) so a transient error
   * self-recovers on the next toggle.
   */
  resetKey?: string | number;
  /**
   * CSS class for the wrapper that hosts the fallback when an error is caught.
   * Pass the region's grid-area class (e.g. "msa-map", "msa-timerail", "msa-dock")
   * so the fallback lands in the correct grid cell. When healthy the boundary is
   * layout-transparent and this class is unused — the child owns its own element.
   */
  fallbackClassName?: string;
  /** The region's real content. */
  children: ReactNode;
}

/** Internal error state. */
interface RegionErrorBoundaryState {
  /** The caught error, or null when healthy. */
  error: Error | null;
  /** How many times this boundary has auto-retried (caps the self-heal loop). */
  autoRetries: number;
}

/**
 * Error boundary scoped to one shell region. See the module doc for rationale.
 */
export class RegionErrorBoundary extends Component<
  RegionErrorBoundaryProps,
  RegionErrorBoundaryState
> {
  /** Pending auto-retry timer, cleared on unmount. */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Max auto-retries before we stop and show the manual fallback (avoid a hot loop). */
  private static readonly MAX_AUTO_RETRIES = 3;

  constructor(props: RegionErrorBoundaryProps) {
    super(props);
    this.state = { error: null, autoRetries: 0 };
  }

  /** React calls this on a child render throw; we store the error to show the fallback. */
  static getDerivedStateFromError(error: Error): Partial<RegionErrorBoundaryState> {
    return { error };
  }

  /** Log the crash (with the region name) so it is visible in dev without a white screen. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[RegionErrorBoundary] "${this.props.region}" region crashed and was isolated. ` +
        'The rest of the app keeps running; the region will recover on the next layout change.',
      error,
      info.componentStack,
    );

    // SELF-HEAL: a transient throw (e.g. the MapLibre style-teardown race during a
    // panel reflow — "Cannot read properties of undefined (reading 'getLayer')")
    // would otherwise leave the region blank until the next layout change. Schedule
    // a delayed auto-retry so the user never sees a persistent white region.
    // Capped to avoid a hot crash loop for a genuine, repeatable bug.
    //
    // 220ms: the grid-template-columns transition on .msa-app is 200ms. Retrying
    // before it settles (the old 16ms) races against the still-animating MapLibre
    // resize and reliably throws again. 220ms gives the transition and the
    // mapStabilityGuards post-transition repaint time to fully complete first.
    if (this.state.autoRetries < RegionErrorBoundary.MAX_AUTO_RETRIES) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState((s) => ({ error: null, autoRetries: s.autoRetries + 1 }));
      }, 220);
    }
  }

  /** Clear any pending auto-retry timer on unmount. */
  componentWillUnmount(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Auto-recover: when the parent's resetKey changes (e.g. a panel finished its
   * collapse/expand transition), clear the error so the region re-mounts cleanly.
   */
  componentDidUpdate(prev: RegionErrorBoundaryProps): void {
    if (prev.resetKey !== this.props.resetKey) {
      // A real layout change happened — cancel any pending auto-retry timer so
      // it cannot burn a budget slot after we've already reset, then clear any
      // error and reset the budget so a future transient gets a fresh set of heals.
      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.state.error !== null || this.state.autoRetries !== 0) {
        this.setState({ error: null, autoRetries: 0 });
      }
    }
  }

  /** Manual recovery handler for the "Try again" button. */
  private readonly handleRetry = (): void => {
    this.setState({ error: null, autoRetries: 0 });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { region, children, fallbackClassName } = this.props;

    if (error !== null) {
      const fallback = (
        <ErrorState
          title={`${region} hit a snag`}
          body="This panel recovered from a display error. It will refresh on the next change, or use the button below."
          action={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <pre style={{
                background: '#1a1a1a',
                color: '#ff6b6b',
                padding: '8px',
                fontSize: '10px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                border: '1px solid #ff6b6b',
                maxHeight: '120px',
                overflowY: 'auto',
                textAlign: 'left',
              }}>
                {error.name}: {error.message}
              </pre>
              <button type="button" className="btn" onClick={this.handleRetry}>
                Try again
              </button>
            </div>
          }
        />
      );
      // Host the fallback in the region's grid-area element so it lands in the
      // correct cell; otherwise it would fall outside the named grid areas.
      return fallbackClassName ? (
        <div className={fallbackClassName}>{fallback}</div>
      ) : (
        fallback
      );
    }

    return children;
  }
}
