/**
 * featureStatePop — shared MapLibre expressions for the hover/select "pop" on
 * marker circle layers.
 *
 * A marker grows + its rim thickens while hovered (and while selected), then
 * reverts. Driven by MapLibre `feature-state` (set by useMapInteractions on
 * mousemove), so it repaints natively with no React re-render.
 *
 * IMPORTANT (MapLibre expression law): a `zoom` interpolate MUST be the
 * top-level value of a paint property — it may NOT be wrapped in arithmetic
 * (`['+', interpolate(zoom), …]` throws "zoom may only be top-level"). So the
 * radius pop is added INSIDE each zoom stop output via `popRadiusStop(base)`,
 * keeping the `interpolate` at top level. The feature-state `case` has no zoom
 * input, so it is legal as a stop output.
 *
 * Resting delta is 0 / the base value, so a non-hovered marker is byte-for-byte
 * unchanged — this is interaction polish only, not a resting-look change.
 */

/**
 * Pixels added to a marker radius on interaction: 0 at rest. The bump is
 * deliberately generous (+4 hover / +6 select) so the pop reads clearly even on
 * the SMALL dot layers (settlements/languages ~2–5px) — a flat +2 was only
 * noticeable on the large capital discs. Combined with the thicker rim from
 * popStrokeWidth(), every marker visibly "lifts" on hover regardless of size.
 */
export const POP_RADIUS_DELTA: unknown = [
  'case',
  ['boolean', ['feature-state', 'selected'], false], 6,
  ['boolean', ['feature-state', 'hover'], false], 4,
  0,
];

/**
 * Wrap a single zoom-stop radius value with the pop delta.
 * Use as the OUTPUT of each stop in a top-level `interpolate`:
 *   ['interpolate', ['linear'], ['zoom'], 2, popRadiusStop(6), 12, popRadiusStop(20)]
 */
export function popRadiusStop(base: number): unknown {
  return ['+', base, POP_RADIUS_DELTA];
}

/**
 * A `circle-stroke-width` value that thickens on hover/select. The rim is the
 * most size-independent pop signal — a small dot that suddenly gains a crisp
 * 2px-thicker ring reads as "active" even when its radius barely changed. So the
 * bump is generous and uniform: resting `base` (unchanged), +2px on hover,
 * +3px on select.
 *
 * @param base  resting stroke width (unchanged when not hovered/selected)
 * @param hover optional explicit hover width (defaults to base + 2)
 * @param sel   optional explicit select width (defaults to base + 3)
 */
export function popStrokeWidth(base: number, hover = base + 2, sel = base + 3): unknown {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false], sel,
    ['boolean', ['feature-state', 'hover'], false], hover,
    base,
  ];
}

// NOTE: there is intentionally NO icon-size pop helper. icon-size is a MapLibre
// LAYOUT property and feature-state is not permitted in layout props (it throws
// "feature-state data expressions are not supported with layout properties" and
// drops the whole symbol layer). Symbol layers that want a hover pop use a circle
// hit/halo layer in PAINT instead — see EVENTS_HIT_ID in eventsLayer.ts.
