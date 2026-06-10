/**
 * LoadingState — in-progress indicator (artboard 17, part 3/3).
 *
 * Used during async data fetches, map tile loading, and index builds.
 * The spinner is a pure CSS rotation on an SVG arc — no third-party dependency.
 * Token-driven; correct in all four themes.
 */

/** Props for the LoadingState component. */
export interface LoadingStateProps {
  /** Short label, e.g. "Loading records…" or "Building index…". */
  label?: string;
  /** Extra CSS class on the root element. */
  className?: string;
}

/** Rotating arc — spins via the msa-spin keyframe defined in atlas-shell.css. */
function SpinIcon() {
  return (
    <svg
      className="msa-empty__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      {/* Full circle at low opacity */}
      <circle cx="12" cy="12" r="9" opacity="0.2" />
      {/* Partial arc that appears to spin */}
      <path d="M12 3 A9 9 0 0 1 21 12" strokeLinecap="square" />
    </svg>
  );
}

/**
 * Renders a loading indicator using `.msa-empty.msa-empty--loading` token classes.
 * The icon rotates via the `msa-spin` keyframe in atlas-shell.css.
 */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      className={`msa-empty msa-empty--loading${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={label}
    >
      <SpinIcon />
      <p className="msa-empty__body">{label}</p>
    </div>
  );
}
