/**
 * HoverAnnotation — margin-note hover panel pinned to the right edge of the map.
 *
 * Replaces the cursor-following tooltip. The panel is fixed at the top-right of
 * the map stage so it reads like a margin note in an atlas, not a floating UI bubble.
 * It fades in when a feature is hovered and fades out on mouseleave.
 *
 * Design laws: square corners, 0.5px hairline border, no shadow, token colors only.
 * pointer-events: none so it never intercepts map interaction.
 */
import './HoverAnnotation.css';

export interface HoverTip {
  x: number;
  y: number;
  label: string;
  kind: string;
}

interface HoverAnnotationProps {
  tip: HoverTip | null;
}

/** Fixed right-edge margin note showing the hovered map feature. */
export function HoverAnnotation({ tip }: HoverAnnotationProps) {
  return (
    <div
      className={`map-hover-annotation${tip ? ' is-visible' : ''}`}
      role="tooltip"
      aria-hidden={!tip}
    >
      {tip && (
        <>
          <div className="map-hover-annotation__kind eyebrow">{tip.kind}</div>
          <div className="map-hover-annotation__label">{tip.label}</div>
        </>
      )}
    </div>
  );
}
