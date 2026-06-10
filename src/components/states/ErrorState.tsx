/**
 * ErrorState — surface displayed when an operation fails (artboard 17, part 2/3).
 *
 * Used by data loaders, map init, and any async surface that can error.
 * The error message is shown directly so the user has actionable information.
 * Never silently swallows failures.
 */

/** Props for the ErrorState component. */
export interface ErrorStateProps {
  /** Short heading, e.g. "Failed to load records". */
  title: string;
  /** Human-readable description of the failure. May include the error message. */
  body: string;
  /** Optional retry / dismiss action element. */
  action?: React.ReactNode;
  /** Extra CSS class on the root element. */
  className?: string;
}

/** Hairline X-mark in a square — error signal without aggressive colour. */
function ErrorIcon() {
  return (
    <svg
      className="msa-empty__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" />
      <line x1="8" y1="8" x2="16" y2="16" />
      <line x1="16" y1="8" x2="8" y2="16" />
    </svg>
  );
}

/**
 * Renders an honest error state using `.msa-empty.msa-empty--error` token classes.
 * Shows the failure clearly; never hides or mocks over it.
 */
export function ErrorState({ title, body, action, className }: ErrorStateProps) {
  return (
    <div
      className={`msa-empty msa-empty--error${className ? ` ${className}` : ''}`}
      role="alert"
    >
      <ErrorIcon />
      <p className="msa-empty__title">{title}</p>
      <p className="msa-empty__body">{body}</p>
      {action && <div className="msa-empty__action">{action}</div>}
    </div>
  );
}
