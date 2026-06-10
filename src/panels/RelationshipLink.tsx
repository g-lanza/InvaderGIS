/**
 * RelationshipLink — navigable link to another record in the dock.
 *
 * Clicking calls selectionStore.select(id, inferredKind) which updates the
 * dock to show the linked record. The kind is inferred via inferKindFromId()
 * (best-effort from id prefix patterns) or supplied explicitly.
 *
 * Renders as an inline button styled to fit inside a .dl dd cell.
 * No new hex or radius — all via token CSS.
 *
 * Phase 3 — record-panels agent.
 */

import { inferKindFromId } from '@/panels/types';
import { humanizeId } from '@/data/displayName';

/** Props for RelationshipLink. */
export interface RelationshipLinkProps {
  /** The id of the record to navigate to. */
  targetId: string;
  /**
   * Optional explicit kind. When absent, inferred from id prefix via inferKindFromId().
   * Callers who know the kind (e.g. ruler.polity → 'polity') should supply it.
   */
  targetKind?: string;
  /**
   * Display label. Defaults to targetId if absent — always shows real data,
   * never a fabricated label.
   */
  label?: string;
  /** Navigation callback (from EntityDock, calls selectionStore.select). */
  onNavigate: (id: string, type: string) => void;
}

/**
 * An inline button that navigates the dock to another record when clicked.
 * Styled like a hyperlink using token colors; no underline in chrome (DESIGN.md rule).
 */
export function RelationshipLink({
  targetId, targetKind, label, onNavigate,
}: RelationshipLinkProps) {
  const kind = targetKind ?? inferKindFromId(targetId);
  // When no explicit label is supplied, humanize the id (strip kind prefix +
  // underscores) so the link never shows a raw slug like "rel_amalfi_byzantine".
  const displayLabel = label ?? humanizeId(targetId);

  function handleClick() {
    onNavigate(targetId, kind);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate(targetId, kind);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--accent)',
        fontFamily: 'var(--font-body)',
        fontSize: '12px',
        textAlign: 'left',
        wordBreak: 'break-all',
        lineHeight: 1.4,
      }}
      title={`Navigate to ${kind}: ${targetId}`}
      aria-label={`Go to ${displayLabel} (${kind})`}
    >
      {displayLabel}
    </button>
  );
}
