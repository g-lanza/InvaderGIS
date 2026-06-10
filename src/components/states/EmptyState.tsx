/**
 * EmptyState — honest "nothing here yet" surface (artboard 17, part 1/3).
 *
 * Used anywhere data has not yet been loaded or a surface has no records.
 * Never shows fake rows or a fake map — if there's nothing real, this renders.
 * Fully theme-correct via CSS tokens; no hard-coded colours.
 */

/** Props for the EmptyState component. */
export interface EmptyStateProps {
  /** Short heading, e.g. "No data loaded yet". */
  title: string;
  /** One or two sentence explanation of why this is empty and what to expect. */
  body: string;
  /** Optional action element (a button, link, etc.) rendered below the body. */
  action?: React.ReactNode;
  /** Extra CSS class on the root element. */
  className?: string;
}

/** Square "empty box" icon — 24×24 hairline, token-driven stroke. */
function EmptyIcon() {
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
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  );
}

/**
 * Renders an honest empty state using `.msa-empty` token classes.
 * Shows a hairline icon, heading, and explanation — never fake content.
 */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div className={`msa-empty${className ? ` ${className}` : ''}`} role="status">
      <EmptyIcon />
      <p className="msa-empty__title">{title}</p>
      <p className="msa-empty__body">{body}</p>
      {action && <div className="msa-empty__action">{action}</div>}
    </div>
  );
}
