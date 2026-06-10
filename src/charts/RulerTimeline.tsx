/**
 * RulerTimeline — horizontal reign bars for a polity's rulers.
 *
 * DATA CONTRACT:
 *   Reads ruler records from loadRecords('ruler') where rec.polity === polityId.
 *   Ruler shape (real data): { id, name, polity, title?, reign_start, reign_end, succeeds? }
 *
 * Each ruler is rendered as a horizontal bar spanning reign_start to reign_end
 * on a shared time axis. Bars are sorted ascending by reign_start.
 * Clicking a bar selects (rulerId, 'ruler') via useSelectionStore.
 *
 * DESIGN LAWS (non-negotiable, per DESIGN.md):
 *   - Square corners (border-radius: 0), hairline 0.5px strokes only.
 *   - No drop shadows; no hardcoded hex — tokens only.
 *   - No italics in chrome.
 *   - Correct in all 4 themes: Atlas / Manuscript / Dark / Contrast.
 *
 * REALNESS LAWS:
 *   - Renders ONLY real ruler records from the loaded corpus.
 *   - Honest empty state when no rulers match the polityId.
 *   - Bars with missing reign dates are omitted (no fabrication).
 *
 * LAYOUT:
 *   Wrapped in ChartFrame with a claim-style title.
 *   Gantt-style horizontal bars. Name label inside (or adjacent for short reigns).
 *   Click a bar → selectionStore.select(rulerId, 'ruler').
 *
 * Wave 6 — charts builder.
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { loadRecords } from '@/data/loaders';
import { formatYear as fmtYear } from '@/data/formatYear';
import { useSelectionStore } from '@/stores/selectionStore';
import { ChartFrame } from '@/charts/ChartFrame';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A validated ruler entry for rendering. */
interface RulerBar {
  id: string;
  name: string;
  title: string;
  reignStart: number;
  reignEnd: number;
  duration: number;
}

/** Props for RulerTimeline. */
export interface RulerTimelineProps {
  /**
   * The polity id to look up rulers for.
   * Matches against ruler records where rec.polity === polityId.
   */
  polityId: string;
  /**
   * Display name of the polity — used in the claim title and subtitle.
   */
  polityName?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Row height per ruler bar in px. */
const ROW_H = 22;

/** Gap between rows in px. */
const ROW_GAP = 3;

/** Left axis gutter (for year labels). */
const AXIS_LEFT = 38;

/** Bottom axis gutter (for year tick labels). */
const AXIS_BOTTOM = 16;

/** Hairline width. */
const HAIRLINE = 0.5;

/** SVG viewBox width (responsive via width="100%"). */
const SVG_W = 272;

/** Bar area width (right of AXIS_LEFT). */
const BAR_W = SVG_W - AXIS_LEFT;

/** Approximate number of x-axis ticks. */
const X_TICK_COUNT = 5;

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Load and validate rulers for a given polity id.
 * Returns only rulers with finite reign_start and reign_end values.
 * Sorted ascending by reign_start.
 */
function loadRulersForPolity(polityId: string): RulerBar[] {
  const records = loadRecords('ruler');
  const bars: RulerBar[] = [];

  for (const rec of records) {
    const recPolity = typeof rec['polity'] === 'string' ? rec['polity'] : '';
    if (recPolity !== polityId) continue;

    const reignStart = typeof rec['reign_start'] === 'number' ? rec['reign_start'] : null;
    const reignEnd   = typeof rec['reign_end']   === 'number' ? rec['reign_end']   : null;
    if (reignStart === null || reignEnd === null) continue;
    if (!isFinite(reignStart) || !isFinite(reignEnd)) continue;

    const name  = typeof rec['name']  === 'string' ? rec['name']  : rec['id'] as string;
    const title = typeof rec['title'] === 'string' ? rec['title'] : '';

    bars.push({
      id:         rec['id'] as string,
      name,
      title,
      reignStart,
      reignEnd,
      duration: Math.max(1, reignEnd - reignStart),
    });
  }

  return [...bars].sort((a, b) => a.reignStart - b.reignStart);
}

/**
 * Compute evenly spaced tick values for the time axis.
 */
function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const rawStep   = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step      = Math.ceil(rawStep / magnitude) * magnitude;
  const start     = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) ticks.push(t);
  if (ticks.length === 0) ticks.push(min);
  return ticks;
}


// ── Claim title builder ───────────────────────────────────────────────────────

function buildClaimTitle(polityName: string, rulers: RulerBar[]): string {
  if (rulers.length === 0) return `${polityName} — ruler timeline`;
  if (rulers.length === 1) {
    const r = rulers[0];
    return `${polityName} had one documented ruler: ${r.name} (${r.reignStart}–${r.reignEnd}).`;
  }
  const first = rulers[0];
  const last  = rulers[rulers.length - 1];
  return `${polityName} had ${rulers.length} documented rulers from ${first.reignStart} to ${last.reignEnd}.`;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState(): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: 'var(--ink-mute)',
        textTransform: 'uppercase',
        borderTop: `${HAIRLINE}px solid var(--border)`,
        borderBottom: `${HAIRLINE}px solid var(--border)`,
      }}
    >
      No rulers recorded for this polity
    </div>
  );
}

// ── SVG Gantt ─────────────────────────────────────────────────────────────────

interface GanttSvgProps {
  rulers: RulerBar[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Pure SVG horizontal Gantt bars. Click a bar triggers onSelect. */
function GanttSvg({ rulers, selectedId, onSelect }: GanttSvgProps): JSX.Element {
  const xMin = rulers[0].reignStart;
  const xMax = rulers[rulers.length - 1].reignEnd;
  const xRange = Math.max(1, xMax - xMin);

  const xOf = (year: number): number => ((year - xMin) / xRange) * BAR_W;

  const ticks = niceTicks(xMin, xMax, X_TICK_COUNT);

  const totalH = rulers.length * (ROW_H + ROW_GAP) + AXIS_BOTTOM;
  const svgH   = totalH;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      width="100%"
      height={svgH}
      aria-label="Ruler reign timeline"
      role="img"
      style={{ display: 'block', cursor: 'default', maxWidth: SVG_W }}
    >
      {/* X-axis gridlines */}
      {ticks.map((tick) => {
        const xPx = AXIS_LEFT + xOf(tick);
        return (
          <g key={tick}>
            <line
              x1={xPx}
              y1={0}
              x2={xPx}
              y2={svgH - AXIS_BOTTOM}
              stroke="var(--border)"
              strokeWidth={HAIRLINE}
            />
            <text
              x={xPx}
              y={svgH - 3}
              textAnchor="middle"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                fill: 'var(--ink-mute)',
                letterSpacing: '0.03em',
              }}
            >
              {fmtYear(tick)}
            </text>
          </g>
        );
      })}

      {/* X-axis baseline */}
      <line
        x1={AXIS_LEFT}
        y1={svgH - AXIS_BOTTOM}
        x2={SVG_W}
        y2={svgH - AXIS_BOTTOM}
        stroke="var(--border-mid)"
        strokeWidth={HAIRLINE}
      />

      {/* Ruler bars */}
      {rulers.map((ruler, i) => {
        const rowY   = i * (ROW_H + ROW_GAP);
        const barX   = AXIS_LEFT + xOf(ruler.reignStart);
        const barW   = Math.max(1, xOf(ruler.reignEnd) - xOf(ruler.reignStart));
        const isSelected = ruler.id === selectedId;

        return (
          <g
            key={ruler.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(ruler.id)}
            role="button"
            aria-label={`${ruler.name}: ${ruler.reignStart}–${ruler.reignEnd}`}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(ruler.id); }}
          >
            {/* Bar */}
            <rect
              x={barX}
              y={rowY + 2}
              width={barW}
              height={ROW_H - 4}
              fill={isSelected ? 'var(--accent)' : 'var(--accent)'}
              fillOpacity={isSelected ? 0.90 : 0.45}
              stroke={isSelected ? 'var(--border-strong)' : 'var(--border-mid)'}
              strokeWidth={isSelected ? 1 : HAIRLINE}
            />

            {/* Name label — inside bar if wide enough, outside otherwise */}
            {barW > 30 ? (
              <text
                x={barX + 3}
                y={rowY + ROW_H / 2 + 3}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fill: isSelected ? 'var(--surface)' : 'var(--ink)',
                  letterSpacing: '0.02em',
                  pointerEvents: 'none',
                }}
                clipPath={`url(#rc-clip-${i})`}
              >
                {ruler.name}
              </text>
            ) : (
              <text
                x={barX + barW + 3}
                y={rowY + ROW_H / 2 + 3}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '8px',
                  fill: 'var(--ink-light)',
                  letterSpacing: '0.02em',
                  pointerEvents: 'none',
                }}
              >
                {ruler.name}
              </text>
            )}

            <clipPath id={`rc-clip-${i}`}>
              <rect x={barX} y={rowY} width={barW} height={ROW_H} />
            </clipPath>

            <title>
              {`${ruler.name}${ruler.title ? ' · ' + ruler.title : ''} · ${fmtYear(ruler.reignStart)}–${fmtYear(ruler.reignEnd)} (${ruler.duration} yr)`}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * RulerTimeline — Gantt-style horizontal reign bars for a polity's rulers.
 *
 * Self-loads ruler records via `loadRecords('ruler')`, filters by polityId.
 * Clicking a bar calls `selectionStore.select(rulerId, 'ruler')`.
 * Honest empty state when no rulers match.
 *
 * @param polityId   - The polity id to filter rulers by (rec.polity === polityId).
 * @param polityName - Optional display name for claim title generation.
 */
export function RulerTimeline({ polityId, polityName = polityId }: RulerTimelineProps): JSX.Element {
  const rulers = useMemo(() => loadRulersForPolity(polityId), [polityId]);

  const { selectedId, select } = useSelectionStore();

  const claimTitle = buildClaimTitle(polityName, rulers);

  if (rulers.length === 0) {
    return (
      <ChartFrame
        title={`${polityName} — ruler timeline`}
        subtitle="Reign spans"
        asSection={false}
      >
        <EmptyState />
      </ChartFrame>
    );
  }

  const first    = rulers[0];
  const last     = rulers[rulers.length - 1];
  const subtitle = `${rulers.length} ruler${rulers.length === 1 ? '' : 's'} · ${fmtYear(first.reignStart)}–${fmtYear(last.reignEnd)}`;

  return (
    <ChartFrame title={claimTitle} subtitle={subtitle} asSection={false}>
      <div style={{ marginTop: 'var(--space-2)' }}>
        <GanttSvg
          rulers={rulers}
          selectedId={selectedId}
          onSelect={(id) => select(id, 'ruler')}
        />
      </div>
    </ChartFrame>
  );
}
