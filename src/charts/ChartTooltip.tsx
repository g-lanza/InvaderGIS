/**
 * ChartTooltip — a styled, theme-token tooltip popover for InvaderGIS charts.
 *
 * Replaces the browser-default SVG `<title>` tooltips (which are unstyled, slow to
 * appear, and invisible on touch) with a consistent floating card. One shared
 * component so every chart gets identical chrome.
 *
 * USAGE
 * -----
 * The host chart wraps its SVG in a `position: relative` container and tracks a
 * tooltip state `{ x, y, lines } | null` from pointer handlers on the SVG marks:
 *
 *   const [tip, setTip] = useState<TooltipState | null>(null);
 *   ...
 *   <div style={{ position: 'relative' }}>
 *     <svg
 *       onPointerMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, lines: [...] })}
 *       onPointerLeave={() => setTip(null)}
 *     >…</svg>
 *     <ChartTooltip tip={tip} />
 *   </div>
 *
 * Coordinates are offsets within the relative container (offsetX/offsetY).
 *
 * DESIGN LAWS
 * -----------
 * - Square corners (--radius: 0), hairline border, token colors only.
 * - --border-mid / --ink so it stays legible under the contrast theme.
 * - pointer-events: none so it never steals hover from the marks beneath it.
 * - No drop shadow (DESIGN.md) — a solid surface + hairline border reads cleanly.
 */

import type { JSX } from 'react';

/** A single swatch+label+value line in the tooltip. */
export interface TooltipLine {
  /** Optional color swatch (a domain color). Omit for plain text lines. */
  swatch?: string;
  /** The label / name. */
  label: string;
  /** Optional trailing value (count, percent, year…). */
  value?: string;
}

/** Tooltip position + content, or null when hidden. */
export interface TooltipState {
  /** X offset within the relative container (px). */
  x: number;
  /** Y offset within the relative container (px). */
  y: number;
  /** A bold title line shown first (optional). */
  title?: string;
  /** Detail lines. */
  lines: TooltipLine[];
}

export interface ChartTooltipProps {
  tip: TooltipState | null;
}

/**
 * Floating tooltip card. Renders nothing when `tip` is null.
 * Positioned just above-right of the pointer; the host container should be
 * `position: relative` and `overflow: visible` (default) so the card can sit at
 * the edges without clipping.
 */
export function ChartTooltip({ tip }: ChartTooltipProps): JSX.Element | null {
  if (!tip) return null;

  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left: tip.x,
        top: tip.y,
        // Offset above-right of the cursor so the mark stays visible.
        transform: 'translate(10px, calc(-100% - 8px))',
        pointerEvents: 'none',
        zIndex: 5,
        maxWidth: '220px',
        padding: 'var(--space-2)',
        background: 'var(--surface)',
        border: '1px solid var(--border-mid)',
        // No radius / no shadow — DESIGN.md.
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        lineHeight: 1.4,
        letterSpacing: '0.02em',
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
      }}
    >
      {tip.title && (
        <div
          style={{
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: tip.lines.length ? '3px' : 0,
            whiteSpace: 'normal',
          }}
        >
          {tip.title}
        </div>
      )}
      {tip.lines.map((line, i) => (
        <div
          key={`${line.label}-${i}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {line.swatch && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                flexShrink: 0,
                background: line.swatch,
                border: '0.5px solid var(--border-mid)',
              }}
            />
          )}
          <span style={{ color: 'var(--ink-mid)', flex: 1 }}>{line.label}</span>
          {line.value !== undefined && (
            <span style={{ color: 'var(--ink)', fontWeight: 600, marginLeft: 'var(--space-2)' }}>
              {line.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
