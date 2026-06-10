/**
 * SuccessionSankey — predecessor → ruler → successor flow (Wave 1B).
 *
 * Shows the succession chain for a ruler record: who they succeeded
 * (ruler.succeeds) and who succeeded them (other rulers whose .succeeds
 * field points to this ruler's id).
 *
 * Data source: real ruler records loaded from public/data/records/ruler.json
 * via loadRecords('ruler'). There are ~8 succession links in the corpus
 * (e.g. charlemagne → louis_the_pious, harun_al_rashid → al_mamun).
 *
 * Renders a three-column SVG Sankey: predecessors | this ruler | successors.
 * Pure SVG — no external charting library (echarts is not in package.json).
 * Honest empty state when a ruler has no succession chain.
 *
 * Token-only, 4 themes, no hardcoded hex (colors from CSS variables via
 * inline style bridging). No italics. Square corners.
 *
 * MOUNT: Inside EntityDock's RulerCard, below key actions. The verify agent
 * should render <SuccessionSankey rulerId={record.id} /> in RulerCard
 * (after the reign section). Alternatively, mount it in LineageOverlay behind
 * the "Lineage" TopBar button as an additional view.
 */
import { useMemo } from 'react';
import { ChartFrame } from '@/charts/ChartFrame';
import { buildSuccessionData } from './successionData';
import type { SuccessionData } from './successionData';

// ── SVG Sankey renderer ───────────────────────────────────────────────────────

const COL_W   = 140;   // column width
const ROW_H   = 28;    // height per node row
const PAD_H   = 16;    // vertical padding above/below node block
const BAND_H  = 12;    // node band height
const GAP     = 8;     // gap between bands
const LINK_OPACITY = 0.4;

interface SvgSankeyProps {
  data: SuccessionData;
}

/**
 * Pure SVG three-column Sankey. No external dependencies.
 * Colors come from CSS custom properties so all 4 themes render correctly.
 */
function SvgSankey({ data }: SvgSankeyProps) {
  const preds = data.nodes.filter((n) => n.side === 'pred');
  const self  = data.nodes.find((n)  => n.side === 'self')!;
  const succs = data.nodes.filter((n) => n.side === 'succ');

  const rows  = Math.max(preds.length, 1, succs.length);
  const svgH  = rows * (ROW_H + GAP) + PAD_H * 2;
  const svgW  = COL_W * 3 + 40; // 40px gutter × 2

  // Column x positions (left edge of each band)
  const x0 = 0;            // pred column
  const x1 = COL_W + 20;   // self column (center)
  const x2 = COL_W * 2 + 40; // succ column

  // Y center for a column with `count` items
  function nodeY(idx: number, count: number): number {
    const blockH = count * (BAND_H + GAP) - GAP;
    const startY = PAD_H + (svgH - PAD_H * 2 - blockH) / 2;
    return startY + idx * (BAND_H + GAP) + BAND_H / 2;
  }

  const selfY = nodeY(0, 1);

  // Link path: smooth cubic bezier from right edge of source to left edge of target
  function linkPath(x1e: number, y1: number, x2s: number, y2: number): string {
    const cx = (x1e + x2s) / 2;
    return `M ${x1e} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2s} ${y2}`;
  }

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width="100%"
      height={svgH}
      aria-label="Succession flow diagram"
      style={{ display: 'block', overflow: 'visible', maxWidth: svgW }}
    >
      {/* Predecessor bands */}
      {preds.map((node, i) => {
        const cy = nodeY(i, preds.length);
        return (
          <g key={node.id}>
            <rect
              x={x0}
              y={cy - BAND_H / 2}
              width={COL_W}
              height={BAND_H}
              fill="var(--surface-4)"
              stroke="var(--border-mid)"
              strokeWidth={0.5}
            />
            <text
              x={x0 + 4}
              y={cy + 4}
              fontSize={10}
              fill="var(--ink-mid)"
              fontFamily="var(--font-body)"
              clipPath={`url(#clip-pred-${i})`}
            >
              {node.label}
            </text>
            <clipPath id={`clip-pred-${i}`}>
              <rect x={x0} y={cy - BAND_H / 2} width={COL_W - 4} height={BAND_H} />
            </clipPath>
            {/* Link from pred to self */}
            <path
              d={linkPath(x0 + COL_W, cy, x1, selfY)}
              fill="none"
              stroke="var(--border-mid)"
              strokeWidth={BAND_H * LINK_OPACITY}
              opacity={LINK_OPACITY}
            />
          </g>
        );
      })}

      {/* Self band */}
      <g>
        <rect
          x={x1}
          y={selfY - BAND_H / 2}
          width={COL_W}
          height={BAND_H}
          fill="var(--accent-bg)"
          stroke="var(--border-strong)"
          strokeWidth={0.5}
        />
        <text
          x={x1 + 4}
          y={selfY + 4}
          fontSize={10}
          fill="var(--ink)"
          fontFamily="var(--font-body)"
          fontWeight={600}
          clipPath="url(#clip-self)"
        >
          {self.label}
        </text>
        <clipPath id="clip-self">
          <rect x={x1} y={selfY - BAND_H / 2} width={COL_W - 4} height={BAND_H} />
        </clipPath>
      </g>

      {/* Successor bands */}
      {succs.map((node, i) => {
        const cy = nodeY(i, succs.length);
        return (
          <g key={node.id}>
            {/* Link from self to succ */}
            <path
              d={linkPath(x1 + COL_W, selfY, x2, cy)}
              fill="none"
              stroke="var(--border-mid)"
              strokeWidth={BAND_H * LINK_OPACITY}
              opacity={LINK_OPACITY}
            />
            <rect
              x={x2}
              y={cy - BAND_H / 2}
              width={COL_W}
              height={BAND_H}
              fill="var(--surface-4)"
              stroke="var(--border-mid)"
              strokeWidth={0.5}
            />
            <text
              x={x2 + 4}
              y={cy + 4}
              fontSize={10}
              fill="var(--ink-mid)"
              fontFamily="var(--font-body)"
              clipPath={`url(#clip-succ-${i})`}
            >
              {node.label}
            </text>
            <clipPath id={`clip-succ-${i}`}>
              <rect x={x2} y={cy - BAND_H / 2} width={COL_W - 4} height={BAND_H} />
            </clipPath>
          </g>
        );
      })}

      {/* Column labels */}
      {preds.length > 0 && (
        <text
          x={x0}
          y={PAD_H - 4}
          fontSize={8}
          fill="var(--ink-mute)"
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Predecessor
        </text>
      )}
      <text
        x={x1}
        y={PAD_H - 4}
        fontSize={8}
        fill="var(--ink-mute)"
        fontFamily="var(--font-mono)"
        style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        This ruler
      </text>
      {succs.length > 0 && (
        <text
          x={x2}
          y={PAD_H - 4}
          fontSize={8}
          fill="var(--ink-mute)"
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Successor
        </text>
      )}
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for SuccessionSankey. */
export interface SuccessionSankeyProps {
  /**
   * The id of the ruler record to display succession for.
   * e.g. "charlemagne", "harun_al_rashid".
   */
  rulerId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Ruler succession flow: predecessor → this ruler → successor(s).
 * Reads real ruler records from the loaded dataset.
 * Renders null (honest empty state) when there are no succession links.
 *
 * Tested against: charlemagne (succeeded by louis_the_pious via louis_the_pious.succeeds),
 * harun_al_rashid (predecessor of al_mamun via al_mamun.succeeds = harun_al_rashid).
 */
export function SuccessionSankey({ rulerId }: SuccessionSankeyProps) {
  const data = useMemo(() => buildSuccessionData(rulerId), [rulerId]);

  if (!data) return null;

  // Derive a claim title from the succession structure
  const selfNode = data.nodes.find((n) => n.side === 'self');
  const predCount = data.nodes.filter((n) => n.side === 'pred').length;
  const succCount = data.nodes.filter((n) => n.side === 'succ').length;
  const selfLabel = selfNode?.label ?? rulerId;

  const claimTitle =
    predCount > 0 && succCount > 0
      ? `${selfLabel} stands at a documented succession pivot — with ${predCount} predecessor${predCount > 1 ? 's' : ''} and ${succCount} successor${succCount > 1 ? 's' : ''}.`
      : predCount > 0
        ? `${selfLabel} succeeded a recorded predecessor, ending a prior reign.`
        : `${selfLabel} was succeeded by ${succCount} ruler${succCount > 1 ? 's' : ''}, fragmenting the line.`;

  return (
    <div style={{ padding: 'var(--space-2) 0' }}>
      <ChartFrame
        title={claimTitle}
        subtitle="Succession flow · ruler corpus"
        sourceIds={[]}
        asSection={false}
      >
        <div style={{ marginTop: 'var(--space-2)' }}>
          <SvgSankey data={data} />
        </div>
      </ChartFrame>
    </div>
  );
}
