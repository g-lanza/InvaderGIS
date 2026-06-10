/**
 * RootErrorBoundary — the app-wide last line of defence against a white screen.
 *
 * `RegionErrorBoundary` isolates the three grid regions (Map / Time rail /
 * Inspector). But `TopBar`, `LayerRail`, `StatusBar`, `AppShell` itself, and every
 * lazy overlay are mounted OUTSIDE those region boundaries — so a render throw in
 * any of them used to unmount the whole React tree to a blank white page.
 *
 * This boundary wraps the ENTIRE app. On catch it renders a full-screen, themed,
 * recoverable `ErrorState` (with a Reload button) instead of a white void, and
 * logs the error + component stack to the console so the underlying bug is visible
 * and diagnosable rather than silent.
 *
 * It is intentionally NOT auto-reset by a layout key (that is the region
 * boundaries' job for transient reflow errors). If a crash reaches the root, the
 * safest recovery is an explicit reload — but the user always sees a usable screen.
 *
 * Class component because React error boundaries require `componentDidCatch` /
 * `getDerivedStateFromError` (no hook equivalent). Mirrors RegionErrorBoundary.
 *
 * Design contract (DESIGN.md): reuses the honest `ErrorState` idiom — square
 * corners, hairline borders, no shadows, tokens only, correct in all four themes.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/states/ErrorState';

/** Props for RootErrorBoundary. */
export interface RootErrorBoundaryProps {
  /** The whole application subtree. */
  children: ReactNode;
}

/** Internal error state. */
interface RootErrorBoundaryState {
  /** The caught error, or null when healthy. */
  error: Error | null;
}

/**
 * App-wide error boundary. See the module doc for rationale.
 */
export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  /** React calls this on a descendant render throw; store it to show the fallback. */
  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  /**
   * Log the crash with its full component stack. This is the diagnostic that
   * surfaces the real root cause (instead of a silent white screen), so the
   * underlying throw can be located and fixed.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {

    console.error(
      '[RootErrorBoundary] The app hit an unrecoverable render error and was caught ' +
        'at the root (no white screen). Underlying error + component stack follow:',
      error,
      info.componentStack,
    );
    // Unblock the boot splash so this error fallback is visible immediately,
    // rather than hidden behind the splash until its 20s safety timeout.
    (window as unknown as { __splashMapReady?: () => void }).__splashMapReady?.();
    (window as unknown as { __splashRecordsReady?: () => void }).__splashRecordsReady?.();
  }

  /** Reload the app — the safe recovery from a root-level crash. */
  private readonly handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  /** Clear the error and attempt to re-render the tree without a full reload. */
  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;

    if (error !== null) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface, #fff)',
            color: 'var(--ink, #111)',
            zIndex: 9999,
            padding: 'var(--space-4, 16px)',
          }}
        >
          <div style={{ maxWidth: 600, width: '100%' }}>
            <ErrorState
              title="Something went wrong"
              body="The app caught a display error before it could blank the screen. Try again, or reload if it persists."
              action={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)', width: '100%' }}>
                  <pre style={{
                    background: '#1a1a1a',
                    color: '#ff6b6b',
                    padding: '12px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    border: '1px solid #ff6b6b',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    textAlign: 'left',
                  }}>
                    {error.name}: {error.message}
                    {error.stack ? '\n\n' + error.stack : ''}
                  </pre>
                  <div style={{ display: 'flex', gap: 'var(--space-2, 8px)' }}>
                    <button type="button" className="btn" onClick={this.handleRetry}>
                      Try again
                    </button>
                    <button type="button" className="btn" onClick={this.handleReload}>
                      Reload
                    </button>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
