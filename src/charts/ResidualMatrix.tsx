/**
 * ResidualMatrix.tsx — "compared to what?" view (audit finding #2).
 *
 * A category × century grid where each cell is shaded by its signed Pearson residual
 * from independence (Friendly, *Visualizing Categorical Data*, mosaic/association
 * shading). Blue = this kind of event occurred MORE than the baseline rate predicts
 * for that century; red = LESS. Two shading steps at |residual| > 2 and > 4 (the VCD
 * cutoffs ≈ p<.05 and p<.0001 per cell). Cells near zero are left near-neutral.
 *
 * This is the analytical complement to the raw-count charts: it does not ask "how
 * many?" but "over- or under-represented relative to expectation?" — the question the
 * data-viz books say categorical data exists to answer.
 *
 * Rows are effect-ordered by the century each category peaks in (residualMatrix.ts),
 * so the grid reads as a diagonal of historical emphasis rather than an alphabetical
 * lookup table. Columns stay chronological (time is the one axis that must not reorder).
 *
 * DESIGN CONTRACT: tokens only (no hardcoded hex beyond the diverging residual ramp,
 * which is a perceptual scale, not a domain color — documented below). Square corners,
 * hairline borders. Honors the shared filter (Pass 1). Honest empty state.
 */
import type { JSX } from 'react';
import { useMemo } from 'react';
import { ChartFrame } from '@/charts/ChartFrame';
import { EVENT_CATEGORIES } from '@/design/tokens';
import type { EventCategory } from '@/design/tokens';
import { useFilterStore } from '@/stores/filterStore';
import { buildResidualMatrix } from './residualStats';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.id, c.label]),
);

/**
 * Diverging residual → fill color. NOT a domain color: this is a perceptual scale
 * encoding statistical sign + magnitude (blue over / red under), the standard
 * mosaic-shading ramp. Kept literal here (like the heatmap ramp) because it must read
 * as a fixed cool↔warm divergence independent of theme/domain hues. Transparent at
 * |r|<2 so only individually-significant departures draw the eye.
 */
function residualFill(r: number): string {
  const a = Math.abs(r);
  if (a < 2) return 'transparent';
  if (r > 0) return a >= 4 ? 'rgba(33, 102, 172, 0.92)' : 'rgba(103, 169, 207, 0.70)';
  return a >= 4 ? 'rgba(178, 24, 43, 0.92)' : 'rgba(239, 138, 98, 0.70)';
}

/** Text color that stays legible on the cell fill (white on the deep steps). */
function cellInk(r: number): string {
  return Math.abs(r) >= 4 ? '#ffffff' : 'var(--ink)';
}

// ── Geometry ────────────────────────────────────────────────────────────────────
const CELL_W = 44;
const CELL_H = 30;
const ROW_LABEL_W = 92;
const COL_LABEL_H = 22;
const PAD = 8;

/**
 * Diverging-scale legend explaining the red↔blue residual ramp. The matrix shows
 * signed residuals but, without a key, blue/red is not self-evident — this strip
 * names the four steps (under ≥4, under ≥2, over ≥2, over ≥4) with their swatches.
 */
function DivergingLegend(): JSX.Element {
  const steps: { fill: string; label: string }[] = [
    { fill: 'rgba(178, 24, 43, 0.92)',   label: 'Under ≥4' },
    { fill: 'rgba(239, 138, 98, 0.70)',  label: 'Under ≥2' },
    { fill: 'rgba(103, 169, 207, 0.70)', label: 'Over ≥2' },
    { fill: 'rgba(33, 102, 172, 0.92)',  label: 'Over ≥4' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px var(--space-3)',
        marginTop: 'var(--space-2)',
        paddingTop: 'var(--space-2)',
        borderTop: '0.5px solid var(--border-mid)',
      }}
      aria-label="Residual scale: blue over-represented, red under-represented"
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--ink-mid)',
        }}
      >
        Residual
      </span>
      {steps.map((s) => (
        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span
            aria-hidden="true"
            style={{
              width: '12px',
              height: '10px',
              background: s.fill,
              border: '0.5px solid var(--border-mid)',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.03em',
              color: 'var(--ink-mid)',
            }}
          >
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 160,
        color: 'var(--ink-mute)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        letterSpacing: '0.04em',
      }}
    >
      No dated events match the current filter.
    </div>
  );
}

/**
 * Plain-language "what am I looking at?" strip. The residual matrix is a real
 * statistical view (Pearson residuals vs. chance), but that is opaque to a
 * historian without a one-line framing — this names the question it answers,
 * how to read the colors, and why it matters, before the grid.
 */
function ExplainerStrip(): JSX.Element {
  return (
    <div
      style={{
        marginBottom: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        border: '0.5px solid var(--border-mid)',
        background: 'var(--surface-2)',
        fontSize: '11px',
        lineHeight: 1.5,
        color: 'var(--ink-mid)',
        maxWidth: '64ch',
      }}
    >
      <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
        Which kinds of event defined each century?
      </strong>{' '}
      Each row is an event category, each column a century. A{' '}
      <span style={{ color: 'rgb(33,102,172)', fontWeight: 600 }}>blue</span> cell means
      that kind of event happened <em>more</em> often in that century than the overall
      average would predict; <span style={{ color: 'rgb(178,24,43)', fontWeight: 600 }}>red</span>{' '}
      means <em>less</em>. The deeper the color, the stronger the departure from chance
      (the number is the statistical residual). Blank cells are unremarkable. It answers
      “what was this century <em>distinctively</em> about?”, not just “how many events” —
      so a spike of warfare, trade, or scholarship stands out against the baseline. Hover
      a cell for the observed vs. expected counts.
    </div>
  );
}

/**
 * The residual matrix chart. Dataset-level (all events), honors the shared filter.
 * Mount inside an overlay/analysis surface — not an entity tab.
 */
export function ResidualMatrix(): JSX.Element {
  const filterYearRange  = useFilterStore((s) => s.yearRange);
  const filterKinds      = useFilterStore((s) => s.kinds);
  const filterRegions    = useFilterStore((s) => s.regions);
  const filterConfidence = useFilterStore((s) => s.confidence);
  const filterAttestation = useFilterStore((s) => s.attestation);

  const matrix = useMemo(
    () =>
      buildResidualMatrix({
        yearRange: filterYearRange,
        kinds: filterKinds,
        regions: filterRegions,
        confidence: filterConfidence,
        attestation: filterAttestation,
      }),
    [filterYearRange, filterKinds, filterRegions, filterConfidence, filterAttestation],
  );

  const { categories, centuries, cells, total, chiSquare } = matrix;

  const title =
    total > 0
      ? 'Some kinds of event clustered in specific centuries — more than chance would predict.'
      : 'Event emphasis over time';
  const subtitle =
    total > 0
      ? `${total} dated events · χ² = ${chiSquare.toFixed(0)} · blue = over-represented, red = under`
      : 'Category × century · Pearson residuals';

  if (total === 0 || categories.length === 0 || centuries.length === 0) {
    return (
      <ChartFrame title="Event emphasis over time" subtitle="Category × century" asSection={false}>
        <EmptyState />
      </ChartFrame>
    );
  }

  const gridW = ROW_LABEL_W + centuries.length * CELL_W + PAD * 2;
  const gridH = COL_LABEL_H + categories.length * CELL_H + PAD * 2;

  return (
    <ChartFrame title={title} subtitle={subtitle} asSection={false}>
      <ExplainerStrip />
      <div style={{ overflow: 'auto', maxWidth: '100%' }}>
        <svg
          width={gridW}
          height={gridH}
          viewBox={`0 0 ${gridW} ${gridH}`}
          role="img"
          aria-label="Residual matrix of event category by century"
          style={{ display: 'block' }}
        >
          {/* Column (century) headers — chronological. */}
          {centuries.map((c, ci) => (
            <text
              key={c.start}
              x={PAD + ROW_LABEL_W + ci * CELL_W + CELL_W / 2}
              y={PAD + COL_LABEL_H - 7}
              textAnchor="middle"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--ink-mute)' }}
            >
              {c.label}
            </text>
          ))}

          {/* Rows: effect-ordered categories. */}
          {categories.map((cat: EventCategory, ri) => {
            const rowY = PAD + COL_LABEL_H + ri * CELL_H;
            return (
              <g key={cat}>
                <text
                  x={PAD + ROW_LABEL_W - 6}
                  y={rowY + CELL_H / 2 + 3}
                  textAnchor="end"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink)' }}
                >
                  {CATEGORY_LABEL[cat] ?? cat}
                </text>
                {centuries.map((c, ci) => {
                  const cell = cells.get(`${cat}|${c.start}`);
                  const r = cell?.residual ?? 0;
                  const x = PAD + ROW_LABEL_W + ci * CELL_W;
                  const fill = residualFill(r);
                  const significant = Math.abs(r) >= 2;
                  return (
                    <g key={c.start}>
                      <rect
                        x={x}
                        y={rowY}
                        width={CELL_W - 1}
                        height={CELL_H - 1}
                        fill={fill === 'transparent' ? 'var(--surface)' : fill}
                        stroke="var(--border)"
                        strokeWidth={0.5}
                      >
                        <title>
                          {`${CATEGORY_LABEL[cat] ?? cat} · ${c.label} century\n`}
                          {`observed ${cell?.observed ?? 0} · expected ${(cell?.expected ?? 0).toFixed(1)} · residual ${r.toFixed(1)}`}
                        </title>
                      </rect>
                      {significant && (
                        <text
                          x={x + (CELL_W - 1) / 2}
                          y={rowY + CELL_H / 2 + 3}
                          textAnchor="middle"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: cellInk(r) }}
                        >
                          {r > 0 ? '+' : ''}{r.toFixed(1)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <DivergingLegend />
    </ChartFrame>
  );
}
