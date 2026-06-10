/**
 * design/glyphs.tsx — GLYPH LIBRARY (Phase 3, foundational)
 *
 * The soul of the map. Every event on the map surface gets a GlyphStud;
 * every stud needs a mark. Marks live here as real SVG geometry on the
 * 24×24 grid, 1.6 px stroke, currentColor so the caller sets color.
 *
 * ABSOLUTES (from the design rules):
 *  · 24×24 viewBox, ~1.6px stroke, square/geometric, no italics.
 *  · No hard-coded hex — marks use currentColor; GlyphStud receives
 *    a `color` prop from the caller (domain token, never a literal here).
 *  · Any glyph name not drawn for real falls back to a VISIBLE RING —
 *    a circle outline — never blank, never a placeholder rect.
 *
 * Usage:
 *   <Glyph name="blade" size={24} />                    — bare mark
 *   <GlyphStud category="violence" glyph="blade"
 *               size={26} color="#9c1c1c" />             — map form
 *
 * Registry (re-exported from glyphMarks.tsx):
 *   GLYPH_NAMES              — all names that have a real drawn path
 *   hasGlyph(name)           — boolean: is there a real mark for this name?
 *   resolveGlyph(name)       — name → rendered name (falls back to "ring")
 *   SUBTYPE_GLYPH_MAP        — static subtype → glyph name for all 33 medieval subtypes
 *   resolveSubtypeGlyph(sub) — subtype → rendered glyph name (falls back to "ring")
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Props for the bare Glyph mark component. */
export interface GlyphProps {
  /** The mark name. Unknown names fall back to the visible ring. */
  name: string;
  /** Rendered square size in px. Defaults to 24. */
  size?: number;
  /** SVG aria-label. If omitted, the SVG is presentational (aria-hidden). */
  label?: string;
  /** Additional className on the <svg> element. */
  className?: string;
}

/** Props for the GlyphStud map marker component. */
export interface GlyphStudProps {
  /** Event category id (e.g. "violence"). Used for the disc color. */
  category: string;
  /** Glyph name to draw inside the disc (e.g. "blade"). */
  glyph: string;
  /** Outer disc diameter in px. Defaults to 26. */
  size?: number;
  /**
   * Category color — pass the hex from EVENT_CATEGORIES[n].color or
   * a domainColor()-resolved value. Never hard-code a hex at the call site;
   * always read it from tokens.ts.
   */
  color: string;
  /** Additional className on the wrapping element. */
  className?: string;
  /** aria-label for accessibility. */
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK GEOMETRY + REGISTRY (extracted to glyphMarks.tsx to keep this file under
// the 800-line cap and so this module exports only the public Glyph / GlyphStud
// components — Fast Refresh requires component-only modules).
// GLYPH_NAMES / hasGlyph / resolveGlyph live in glyphMarks.tsx (no external
// consumers import them from here — verified — so no re-export is needed).
// ─────────────────────────────────────────────────────────────────────────────

import {
  MARK_ATTRS,
  MARK_REGISTRY,
  MarkRing,
  resolveGlyph,
} from './glyphMarks';

// Re-export the subtype resolver so consumers can import from this single entry
// point rather than reaching into glyphMarks directly.
export {
  GLYPH_NAMES,
  hasGlyph,
  resolveGlyph,
  SUBTYPE_GLYPH_MAP,
  resolveSubtypeGlyph,
} from './glyphMarks';

// ─────────────────────────────────────────────────────────────────────────────
// GLYPH — bare mark component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a named SVG mark on a 24×24 viewBox.
 *
 * Color comes from `currentColor` — set `color` on the parent element or
 * pass a `style={{ color: domainColor(hex, theme) }}` prop.
 *
 * Unknown glyph names render a visible ring fallback — never blank.
 *
 * @example
 *   <Glyph name="blade" size={24} />
 *   <Glyph name="nonexistent" size={16} />  // → ring
 */
export function Glyph({ name, size = 24, label, className }: GlyphProps) {
  const resolved = resolveGlyph(name);
  const renderMark = MARK_REGISTRY[resolved] ?? (() => <MarkRing />);
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      <g {...MARK_ATTRS}>
        {renderMark()}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLYPH STUD — the map form (disc + mark)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map event marker: a category-colored disc with the glyph mark inside.
 *
 * The disc fill comes from the `color` prop (caller passes the domain-token
 * hex, e.g. `EVENT_CATEGORIES.find(…)?.color`). The mark inside is white in
 * the Atlas/Manuscript/Contrast themes (light mark on colored disc) — rendered
 * via a hardcoded `#ffffff` stroke on the inner mark group.  This is the ONE
 * place a bare `#ffffff` is justified: the map stud's inner mark must be
 * legible on ANY category color disc, and white is the universal answer here.
 * All outer chrome and spacing still use tokens.
 *
 * Reads clearly at 16 px, 26 px, and 40 px (verified by the stud-parade block
 * in GlyphStudio artboard 08).
 *
 * @example
 *   // In the events-layer builder:
 *   import { EVENT_CATEGORIES } from '@/design/tokens';
 *   const cat = EVENT_CATEGORIES.find(c => c.id === 'violence');
 *   <GlyphStud category="violence" glyph="blade" size={26} color={cat.color} />
 */
export function GlyphStud({
  category: _category,
  glyph,
  size = 26,
  color,
  className,
  label,
}: GlyphStudProps) {
  // The mark is sized to fill ~60% of the disc — visually tested.
  const markSize = Math.round(size * 0.6);
  const strokeW = Math.max(1, size * 0.06);
  const resolved = resolveGlyph(glyph);
  const renderMark = MARK_REGISTRY[resolved] ?? (() => <MarkRing />);

  // Disc border: a slightly darker ring drawn via SVG stroke on the disc circle.
  // Avoids CSS box-shadow (rule violation) while still giving the stud a readable edge.
  const discR = size / 2;
  const borderW = Math.max(0.8, size * 0.035);

  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={`glyph-stud${className ? ` ${className}` : ''}`}
      {...a11y}
    >
      {/* Disc fill — category color from caller */}
      <circle
        cx={discR}
        cy={discR}
        r={discR - borderW / 2}
        fill={color}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={borderW}
      />
      {/* Mark — white on the colored disc */}
      <g
        transform={`translate(${(size - markSize) / 2}, ${(size - markSize) / 2})`}
        stroke="#ffffff"
        fill="none"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Scale the 24×24 mark into markSize×markSize */}
        <g transform={`scale(${markSize / 24})`}>
          {renderMark()}
        </g>
      </g>
    </svg>
  );
}
