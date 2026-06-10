/**
 * TradeCard — inspector card for a clicked historical trade route.
 *
 * Trade routes are a map-only baked GeoJSON layer with NO backing record (see
 * tradeRouteStore.ts), so this card does NOT take a RawRecord like the other
 * cards. It reads the last-clicked route's real, enriched properties from
 * tradeRouteStore and renders them: a sourced historical summary, the primary
 * goods carried, the key hubs along the route, the transport mode, and the real
 * active period (enrich-trade.mjs).
 *
 * Every field mirrors a real GeoJSON property — no fabricated values. Optional
 * fields (summary / goods / hubs / mode) self-hide when absent so un-enriched
 * routes still render honestly with just name + span.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only —
 * matches CapitalCard / SettlementCard. Correct in all 4 themes.
 */

import { useTradeRouteStore } from '@/stores/tradeRouteStore';
import type { TradeMode } from '@/stores/tradeRouteStore';
import { formatYear } from '@/data/formatYear';

/** Dataset window bounds — mirrors DATASET_START / DATASET_END in tradeLayer.ts. */
const DATASET_START = 500;
const DATASET_END = 1500;

/** Human label for the transport mode. */
const MODE_LABEL: Record<TradeMode, string> = {
  overland: 'Overland caravan route',
  maritime: 'Maritime sea route',
  'river-and-portage': 'River & portage route',
};

/**
 * Render the active span for a route. Real start/end years are stamped by
 * enrich-trade.mjs; a null bound coalesces to the dataset window edge (honest:
 * the route's activity extends to/from the window boundary).
 */
function activeSpanLabel(start: number | null, end: number | null): string {
  if (start === null && end === null) {
    return `Throughout the dataset window (${DATASET_START}–${DATASET_END})`;
  }
  const s = start === null ? String(DATASET_START) : formatYear(start);
  const e = end === null ? String(DATASET_END) : formatYear(end);
  return `${s} – ${e} CE`;
}

/**
 * Inspector card for a trade route. Self-resolves its data from tradeRouteStore;
 * renders an honest empty state if no route is stored (e.g. a stale 'trade'
 * selection after a reload cleared the store).
 */
export function TradeCard() {
  const route = useTradeRouteStore((s) => s.route);

  if (!route) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
          textAlign: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <div className="eyebrow" style={{ color: 'var(--ink-mute)' }}>Trade route</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.5 }}>
          Click a trade route on the map to inspect it here.
        </div>
      </div>
    );
  }

  const span = activeSpanLabel(route.start_year, route.end_year);
  const startStr = route.start_year === null ? 'Open-ended' : `${formatYear(route.start_year)} CE`;
  const endStr = route.end_year === null ? 'Open-ended' : `${formatYear(route.end_year)} CE`;
  const modeLabel = route.mode ? MODE_LABEL[route.mode] : 'Trade & exchange route';
  const goods = route.goods ?? [];
  const hubs = route.hubs ?? [];

  return (
    <div>
      {/* ── Identity header ───────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-mid)' }}
      >
        <span className="chip" style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)' }}>
          trade route
        </span>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--ink)',
            marginTop: 'var(--space-1)',
            lineHeight: 1.25,
          }}
        >
          {route.name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink-mute)', marginTop: 'var(--space-1)' }}>
          {modeLabel}
        </div>
      </div>

      {/* ── Summary ───────────────────────────────────────────────────────────── */}
      {route.summary && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">History</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.55, padding: '0 var(--space-4) var(--space-3)' }}>
            {route.summary}
          </p>
        </div>
      )}

      {/* ── Activity ──────────────────────────────────────────────────────────── */}
      <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-head">
          <span className="panel-head__label">Activity</span>
        </div>
        <dl className="dl">
          <dt>Active</dt>
          <dd>{span}</dd>
          <dt>Start</dt>
          <dd className="mono">{startStr}</dd>
          <dt>End</dt>
          <dd className="mono">{endStr}</dd>
          <dt>Mode</dt>
          <dd>{modeLabel}</dd>
        </dl>
      </div>

      {/* ── Goods carried ─────────────────────────────────────────────────────── */}
      {goods.length > 0 && (
        <div className="panel" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="panel-head">
            <span className="panel-head__label">Primary goods</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', padding: '0 var(--space-4) var(--space-3)' }}>
            {goods.map((g) => (
              <span
                key={g}
                className="chip"
                style={{ color: 'var(--ink)', borderColor: 'var(--border)', textTransform: 'capitalize' }}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Key hubs ──────────────────────────────────────────────────────────── */}
      {hubs.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-head__label">Key hubs</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.6, padding: '0 var(--space-4) var(--space-3)' }}>
            {hubs.join('  ·  ')}
          </div>
        </div>
      )}
    </div>
  );
}
