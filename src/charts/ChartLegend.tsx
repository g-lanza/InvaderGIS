/**
 * ChartLegend — a reusable, interactive legend for InvaderGIS SVG charts.
 *
 * Replaces the static per-chart legend lists with one shared component that adds:
 *   - HOVER HIGHLIGHT: hovering a legend row reports the hovered key so the chart
 *     can emphasise that series and dim the rest.
 *   - CLICK-TO-TOGGLE: clicking a row toggles that series' visibility; the chart
 *     hides/dims the corresponding marks. Hidden rows render struck-through.
 *
 * The component is CONTROLLED for visibility (the host owns the `hidden` set) so
 * the chart and legend never disagree. Hover state is reported via callback.
 *
 * DESIGN LAWS: square corners, hairline swatches, token colors, mono labels.
 * Keyboard accessible (Enter/Space toggles); each row is a real button.
 */

import type { JSX } from 'react';

/** One legend item. */
export interface LegendItem {
  /** Stable key (e.g. the relationship type / category id). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Domain color swatch (already theme-adjusted via domainColor). */
  color: string;
  /** Optional trailing value (count, percent). */
  value?: string | number;
}

export interface ChartLegendProps {
  items: readonly LegendItem[];
  /** Keys currently hidden (host-owned). Rows render struck-through. */
  hidden: ReadonlySet<string>;
  /** Toggle a key's visibility (host updates its `hidden` set). */
  onToggle: (key: string) => void;
  /** Report the hovered key (or null on leave) so the chart can highlight it. */
  onHover?: (key: string | null) => void;
  /** Accessible label for the legend group. */
  ariaLabel?: string;
  /** Layout: 'column' (default, for the narrow dock) or 'wrap' (horizontal). */
  layout?: 'column' | 'wrap';
}

/**
 * Interactive legend. Each row is a toggle button with a color swatch, label,
 * and optional value. Hidden rows are dimmed + struck-through.
 */
export function ChartLegend({
  items,
  hidden,
  onToggle,
  onHover,
  ariaLabel = 'Legend',
  layout = 'column',
}: ChartLegendProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexDirection: layout === 'column' ? 'column' : 'row',
        flexWrap: layout === 'wrap' ? 'wrap' : 'nowrap',
        gap: layout === 'column' ? '4px' : '4px var(--space-3)',
        flex: 1,
        minWidth: 0,
      }}
    >
      {items.map((item) => {
        const isHidden = hidden.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={!isHidden}
            title={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
            onClick={() => onToggle(item.key)}
            onPointerEnter={() => onHover?.(item.key)}
            onPointerLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(item.key)}
            onBlur={() => onHover?.(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: 0,
              padding: '1px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              opacity: isHidden ? 0.4 : 1,
              transition: 'opacity 120ms ease',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '9px',
                height: '9px',
                flexShrink: 0,
                background: isHidden ? 'transparent' : item.color,
                border: `1px solid ${isHidden ? 'var(--border-mid)' : item.color}`,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.04em',
                color: 'var(--ink-mid)',
                textTransform: 'uppercase',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
                textDecoration: isHidden ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </span>
            {item.value !== undefined && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.04em',
                  color: 'var(--ink-mute)',
                  flexShrink: 0,
                }}
              >
                {item.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
