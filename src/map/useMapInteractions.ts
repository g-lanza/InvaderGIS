/**
 * useMapInteractions — click + hover wiring for every interactive map layer
 * (extracted from MapCanvas.tsx to keep that file under the 800-line cap).
 *
 * Registers click → selectionStore.select(id, kind) and hover → MapTip + global
 * hover id (Pass 1 linked views) across all interactive layers, and removes every
 * listener on cleanup. The map.on / map.off pairs are kept symmetric here — the one
 * place that wiring lives — so adding/removing a layer touches a single hook.
 *
 * The hover handler publishes the hovered record id to selectionStore (guarded on
 * id-change to avoid redundant writes), so charts + registers highlight the same
 * record. The owning component passes its setHoverTip + the polity FILL layer id
 * (FILL_LAYER_ID is private to MapCanvas); all other layer ids are imported here.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { EVENTS_CIRCLE_ID, EVENTS_SYMBOL_ID, EVENTS_HIT_ID } from './eventsLayer';
import { JOURNEYS_LINE_ID, JOURNEYS_HIT_ID, JOURNEYS_WAYPOINT_ID } from './journeysLayer';
import { CAPITALS_LAYER_ID } from './capitalsLayer';
import { SETTLEMENTS_LAYER_ID } from './settlementsLayer';
import { MILITARY_HIT_ID } from './militaryLayer';
import { TRADE_LINE_ID, TRADE_HIT_ID } from './tradeLayer';
import {
  RELATIONSHIPS_HIT_ID,
  RELATIONSHIP_STUDS_DOT_ID,
  RELATIONSHIP_STUDS_RING_ID,
} from './relationshipsLayer';
import { humanizeId } from '@/data/displayName';
import { useTradeRouteStore } from '@/stores/tradeRouteStore';

/** Minimal MapLibre map surface this hook touches. */
interface InteractiveMap {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(type: string, layer: string, listener: (e: any) => void): void;
  // Map-level listener overload (no layer) — used for the canvas `mouseout`
  // hover-pop safety net.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(type: string, listener: (e: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(type: string, layer: string, listener: (e: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(type: string, listener: (e: any) => void): void;
  // Drives the hover/select POP (feature-state-based marker grow/rim-thicken).
  setFeatureState(
    target: { source: string; id: number | string; sourceLayer?: string },
    state: Record<string, unknown>,
  ): void;
  getCanvas(): HTMLCanvasElement;
}

/** The MapTip payload the owning component renders. */
export interface MapHoverTip {
  x: number;
  y: number;
  label: string;
  kind: string;
}

/** Dependencies the hook needs from the owning component. */
export interface MapInteractionDeps {
  /** Lifecycle phase — listeners attach only when 'ready'. */
  phase: string;
  /** selectionStore.select. */
  select: (id: string, kind: string) => void;
  /** selectionStore.setHover (linked-views cross-highlight). */
  setHover: (id: string | null, kind: string | null) => void;
  /** Owning component's MapTip state setter. */
  setHoverTip: (tip: MapHoverTip | null) => void;
}

/**
 * Wire click + hover handlers on all interactive layers. Re-attaches whenever
 * `deps.phase` / `select` / `setHover` change; removes all listeners on cleanup.
 *
 * @param mapRef       Ref to the live MapLibre map.
 * @param fillLayerId  The polity FILL layer id (private to MapCanvas).
 * @param deps         phase + the three store/state callbacks.
 */
export function useMapInteractions(
  mapRef: RefObject<InteractiveMap | null>,
  fillLayerId: string,
  deps: MapInteractionDeps,
): void {
  const { phase, select, setHover, setHoverTip } = deps;

  useEffect(() => {
    if (phase !== 'ready') return;
    const map = mapRef.current;
    if (!map) return;

    // Last hovered id published to selectionStore — guards redundant writes when
    // mousemove fires repeatedly over the same feature.
    let lastHoverId: string | null = null;

    // ── Hover POP via MapLibre feature-state ──────────────────────────────────
    // Markers grow + thicken their rim while hovered (paint reads
    // ['feature-state','hover']). We track the current hovered feature by its
    // runtime numeric id + source (both present on the queried feature) so we can
    // clear it when the pointer moves to a different feature or leaves. This only
    // changes the HOVERED marker's look; resting appearance is untouched.
    // setFeatureState is not in the hardenMap guard list, so wrap in try/catch
    // against teardown races.
    let hoveredFs: { source: string; id: number | string } | null = null;
    const setFsHover = (f?: { id?: number | string; source?: string }) => {
      if (!f || f.id == null || !f.source) return;
      if (hoveredFs && (hoveredFs.id !== f.id || hoveredFs.source !== f.source)) {
        try { map.setFeatureState(hoveredFs, { hover: false }); } catch { /* teardown */ }
      }
      hoveredFs = { source: f.source, id: f.id };
      try { map.setFeatureState(hoveredFs, { hover: true }); } catch { /* teardown */ }
    };
    const clearFsHover = () => {
      if (hoveredFs) {
        try { map.setFeatureState(hoveredFs, { hover: false }); } catch { /* teardown */ }
        hoveredFs = null;
      }
    };

    type ClickEvent = { features?: Array<{ properties: Record<string, unknown> }> };

    const makeClick = (kind: string) => (e: ClickEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.['id'];
      if (typeof id === 'string' && id.length > 0) select(id, kind);
    };

    const handlePolityClick     = makeClick('polity');
    const handleEventClick      = makeClick('event');
    const handleJourneyClick    = makeClick('journey');
    const handleCapitalClick    = makeClick('capital');
    const handleSettlementClick = makeClick('settlement');
    const handleMilitaryClick   = makeClick('military');
    const handleRelationshipClick = makeClick('relationship');
    const handleStudClick       = makeClick('polity'); // studs carry polity id

    // Trade routes have no backing record, so a plain makeClick → dock would show
    // "Record not found". Instead, stash the clicked route's real GeoJSON props in
    // tradeRouteStore and select kind 'trade'; EntityDock renders TradeCard from the
    // store. We read name + active years off the feature here (not just id).
    const handleTradeClick = (e: ClickEvent) => {
      const props = e.features?.[0]?.properties;
      if (!props) return;
      const id = props['id'];
      if (typeof id !== 'string' || id.length === 0) return;
      const name = typeof props['name'] === 'string' && props['name'] ? props['name'] : humanizeId(id);
      const toYear = (v: unknown): number | null => (typeof v === 'number' ? v : null);
      const toStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
      // MapLibre serializes array-valued GeoJSON properties to JSON strings, so
      // goods/hubs come back as a JSON string here — parse them back to arrays.
      const toList = (v: unknown): string[] | undefined => {
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
        if (typeof v === 'string' && v.startsWith('[')) {
          try {
            const arr = JSON.parse(v);
            return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : undefined;
          } catch { return undefined; }
        }
        return undefined;
      };
      const rawMode = toStr(props['mode']);
      const mode =
        rawMode === 'overland' || rawMode === 'maritime' || rawMode === 'river-and-portage'
          ? rawMode
          : undefined;
      useTradeRouteStore.getState().setRoute({
        id,
        name,
        start_year: toYear(props['start_year']),
        end_year: toYear(props['end_year']),
        summary: toStr(props['summary']),
        goods: toList(props['goods']),
        hubs: toList(props['hubs']),
        mode,
      });
      select(id, 'trade');
    };

    const setCursorPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearCursor = () => { map.getCanvas().style.cursor = ''; };

    type MoveEvent = {
      point: { x: number; y: number };
      features?: Array<{ properties: Record<string, unknown>; id?: number | string; source?: string }>;
    };
    const makeHoverMove = (kind: string) => (e: MoveEvent) => {
      const feature = e.features?.[0];
      const props = feature?.properties;
      if (!props) return;
      // Pop the hovered feature (numeric id + source drive feature-state paint).
      setFsHover(feature);
      // Prefer the feature's real name; otherwise HUMANIZE the id so the hover tip
      // never shows a raw slug like "rel_merovingian_lombards".
      const rawName = props['name'];
      const rawId   = props['id'];
      const label =
        typeof rawName === 'string' && rawName
          ? rawName
          : typeof rawId === 'string' && rawId
            ? humanizeId(rawId)
            : '';
      if (!label) return;
      setHoverTip({ x: e.point.x, y: e.point.y, label, kind });
      const id = typeof props['id'] === 'string' ? props['id'] : null;
      if (id && lastHoverId !== id) {
        lastHoverId = id;
        setHover(id, kind);
      }
    };
    const clearHoverTip = () => {
      setHoverTip(null);
      clearFsHover();
      if (lastHoverId !== null) {
        lastHoverId = null;
        setHover(null, null);
      }
    };

    const handlePolityMove       = makeHoverMove('polity');
    const handleEventMove        = makeHoverMove('event');
    const handleJourneyMove      = makeHoverMove('journey');
    const handleCapitalMove      = makeHoverMove('capital');
    const handleSettlementMove   = makeHoverMove('settlement');
    const handleMilitaryMove     = makeHoverMove('military');
    const handleTradeMove        = makeHoverMove('trade');
    const handleRelationshipMove = makeHoverMove('relationship');
    const handleStudMove         = makeHoverMove('polity');

    // ── Attach ──────────────────────────────────────────────────────────────────
    map.on('click',      fillLayerId,       handlePolityClick);
    map.on('mouseenter', fillLayerId,       setCursorPointer);
    map.on('mousemove',  fillLayerId,       handlePolityMove);
    map.on('mouseleave', fillLayerId,       clearCursor);
    map.on('mouseleave', fillLayerId,       clearHoverTip);

    map.on('click',      EVENTS_CIRCLE_ID,  handleEventClick);
    map.on('mouseenter', EVENTS_CIRCLE_ID,  setCursorPointer);
    map.on('mousemove',  EVENTS_CIRCLE_ID,  handleEventMove);
    map.on('mouseleave', EVENTS_CIRCLE_ID,  clearCursor);
    map.on('mouseleave', EVENTS_CIRCLE_ID,  clearHoverTip);
    // The PIN (symbol) layer is the primary marker and the circle is radius-0 at
    // most zooms, so the pin must carry the same click/hover handlers — otherwise
    // events are not clickable (the bug: handlers were only on the circle).
    map.on('click',      EVENTS_SYMBOL_ID,  handleEventClick);
    map.on('mouseenter', EVENTS_SYMBOL_ID,  setCursorPointer);
    map.on('mousemove',  EVENTS_SYMBOL_ID,  handleEventMove);
    map.on('mouseleave', EVENTS_SYMBOL_ID,  clearCursor);
    map.on('mouseleave', EVENTS_SYMBOL_ID,  clearHoverTip);
    // The invisible wide hit circle (events-hit) is the RELIABLE hover/click target:
    // the visible circle is radius-0 below zoom 7 and the symbol pin's hitbox is
    // unreliable with icon-allow-overlap, so the hover annotation never fired on
    // events. This mirrors the capitals/military hit-circle pattern.
    map.on('click',      EVENTS_HIT_ID,     handleEventClick);
    map.on('mouseenter', EVENTS_HIT_ID,     setCursorPointer);
    map.on('mousemove',  EVENTS_HIT_ID,     handleEventMove);
    map.on('mouseleave', EVENTS_HIT_ID,     clearCursor);
    map.on('mouseleave', EVENTS_HIT_ID,     clearHoverTip);

    map.on('click',      JOURNEYS_HIT_ID,      handleJourneyClick);
    map.on('click',      JOURNEYS_WAYPOINT_ID, handleJourneyClick);
    map.on('mouseenter', JOURNEYS_HIT_ID,      setCursorPointer);
    map.on('mouseenter', JOURNEYS_WAYPOINT_ID, setCursorPointer);
    map.on('mousemove',  JOURNEYS_LINE_ID,     handleJourneyMove);
    map.on('mousemove',  JOURNEYS_WAYPOINT_ID, handleJourneyMove);
    map.on('mouseleave', JOURNEYS_HIT_ID,      clearCursor);
    map.on('mouseleave', JOURNEYS_HIT_ID,      clearHoverTip);
    map.on('mouseleave', JOURNEYS_WAYPOINT_ID, clearCursor);
    map.on('mouseleave', JOURNEYS_WAYPOINT_ID, clearHoverTip);

    map.on('click',      CAPITALS_LAYER_ID,    handleCapitalClick);
    map.on('mouseenter', CAPITALS_LAYER_ID,    setCursorPointer);
    map.on('mousemove',  CAPITALS_LAYER_ID,    handleCapitalMove);
    map.on('mouseleave', CAPITALS_LAYER_ID,    clearCursor);
    map.on('mouseleave', CAPITALS_LAYER_ID,    clearHoverTip);

    map.on('click',      SETTLEMENTS_LAYER_ID, handleSettlementClick);
    map.on('mouseenter', SETTLEMENTS_LAYER_ID, setCursorPointer);
    map.on('mousemove',  SETTLEMENTS_LAYER_ID, handleSettlementMove);
    map.on('mouseleave', SETTLEMENTS_LAYER_ID, clearCursor);
    map.on('mouseleave', SETTLEMENTS_LAYER_ID, clearHoverTip);

    map.on('click',      MILITARY_HIT_ID, handleMilitaryClick);
    map.on('mouseenter', MILITARY_HIT_ID, setCursorPointer);
    map.on('mousemove',  MILITARY_HIT_ID, handleMilitaryMove);
    map.on('mouseleave', MILITARY_HIT_ID, clearCursor);
    map.on('mouseleave', MILITARY_HIT_ID, clearHoverTip);

    // Trade routes ARE clickable: handleTradeClick stashes the route's GeoJSON
    // props in tradeRouteStore and selects kind 'trade', which EntityDock renders
    // via TradeCard (no backing record needed). The wide hit-line is the forgiving
    // click/hover target; the visible line carries the hover tip. Pointer cursor
    // signals the line is now interactive.
    map.on('click',      TRADE_HIT_ID,  handleTradeClick);
    map.on('click',      TRADE_LINE_ID, handleTradeClick);
    map.on('mouseenter', TRADE_HIT_ID,  setCursorPointer);
    map.on('mouseenter', TRADE_LINE_ID, setCursorPointer);
    map.on('mousemove',  TRADE_LINE_ID, handleTradeMove);
    map.on('mousemove',  TRADE_HIT_ID,  handleTradeMove);
    map.on('mouseleave', TRADE_LINE_ID, clearCursor);
    map.on('mouseleave', TRADE_HIT_ID,  clearCursor);
    map.on('mouseleave', TRADE_LINE_ID, clearHoverTip);
    map.on('mouseleave', TRADE_HIT_ID,  clearHoverTip);

    map.on('click',      RELATIONSHIPS_HIT_ID, handleRelationshipClick);
    map.on('mouseenter', RELATIONSHIPS_HIT_ID, setCursorPointer);
    map.on('mousemove',  RELATIONSHIPS_HIT_ID, handleRelationshipMove);
    map.on('mouseleave', RELATIONSHIPS_HIT_ID, clearCursor);
    map.on('mouseleave', RELATIONSHIPS_HIT_ID, clearHoverTip);

    map.on('click',      RELATIONSHIP_STUDS_DOT_ID,  handleStudClick);
    map.on('click',      RELATIONSHIP_STUDS_RING_ID, handleStudClick);
    map.on('mouseenter', RELATIONSHIP_STUDS_DOT_ID,  setCursorPointer);
    map.on('mouseenter', RELATIONSHIP_STUDS_RING_ID, setCursorPointer);
    map.on('mousemove',  RELATIONSHIP_STUDS_DOT_ID,  handleStudMove);
    map.on('mousemove',  RELATIONSHIP_STUDS_RING_ID, handleStudMove);
    map.on('mouseleave', RELATIONSHIP_STUDS_DOT_ID,  clearCursor);
    map.on('mouseleave', RELATIONSHIP_STUDS_DOT_ID,  clearHoverTip);
    map.on('mouseleave', RELATIONSHIP_STUDS_RING_ID, clearCursor);
    map.on('mouseleave', RELATIONSHIP_STUDS_RING_ID, clearHoverTip);

    // Safety net: if the pointer leaves the whole canvas (not via a layer
    // mouseleave), clear any lingering hover-pop so a marker can't stay popped.
    map.on('mouseout', clearFsHover);

    // ── Detach (symmetric) ──────────────────────────────────────────────────────
    return () => {
      map.off('mouseout', clearFsHover);
      map.off('click',      fillLayerId,      handlePolityClick);
      map.off('mouseenter', fillLayerId,      setCursorPointer);
      map.off('mousemove',  fillLayerId,      handlePolityMove);
      map.off('mouseleave', fillLayerId,      clearCursor);
      map.off('mouseleave', fillLayerId,      clearHoverTip);
      map.off('click',      EVENTS_CIRCLE_ID, handleEventClick);
      map.off('mouseenter', EVENTS_CIRCLE_ID, setCursorPointer);
      map.off('mousemove',  EVENTS_CIRCLE_ID, handleEventMove);
      map.off('mouseleave', EVENTS_CIRCLE_ID, clearCursor);
      map.off('mouseleave', EVENTS_CIRCLE_ID, clearHoverTip);
      map.off('click',      EVENTS_SYMBOL_ID, handleEventClick);
      map.off('mouseenter', EVENTS_SYMBOL_ID, setCursorPointer);
      map.off('mousemove',  EVENTS_SYMBOL_ID, handleEventMove);
      map.off('mouseleave', EVENTS_SYMBOL_ID, clearCursor);
      map.off('mouseleave', EVENTS_SYMBOL_ID, clearHoverTip);
      map.off('click',      EVENTS_HIT_ID,    handleEventClick);
      map.off('mouseenter', EVENTS_HIT_ID,    setCursorPointer);
      map.off('mousemove',  EVENTS_HIT_ID,    handleEventMove);
      map.off('mouseleave', EVENTS_HIT_ID,    clearCursor);
      map.off('mouseleave', EVENTS_HIT_ID,    clearHoverTip);
      map.off('click',      JOURNEYS_HIT_ID,      handleJourneyClick);
      map.off('click',      JOURNEYS_WAYPOINT_ID, handleJourneyClick);
      map.off('mouseenter', JOURNEYS_HIT_ID,      setCursorPointer);
      map.off('mouseenter', JOURNEYS_WAYPOINT_ID, setCursorPointer);
      map.off('mousemove',  JOURNEYS_LINE_ID,     handleJourneyMove);
      map.off('mousemove',  JOURNEYS_WAYPOINT_ID, handleJourneyMove);
      map.off('mouseleave', JOURNEYS_HIT_ID,      clearCursor);
      map.off('mouseleave', JOURNEYS_HIT_ID,      clearHoverTip);
      map.off('mouseleave', JOURNEYS_WAYPOINT_ID, clearCursor);
      map.off('mouseleave', JOURNEYS_WAYPOINT_ID, clearHoverTip);
      map.off('click',      CAPITALS_LAYER_ID,    handleCapitalClick);
      map.off('mouseenter', CAPITALS_LAYER_ID,    setCursorPointer);
      map.off('mousemove',  CAPITALS_LAYER_ID,    handleCapitalMove);
      map.off('mouseleave', CAPITALS_LAYER_ID,    clearCursor);
      map.off('mouseleave', CAPITALS_LAYER_ID,    clearHoverTip);
      map.off('click',      SETTLEMENTS_LAYER_ID, handleSettlementClick);
      map.off('mouseenter', SETTLEMENTS_LAYER_ID, setCursorPointer);
      map.off('mousemove',  SETTLEMENTS_LAYER_ID, handleSettlementMove);
      map.off('mouseleave', SETTLEMENTS_LAYER_ID, clearCursor);
      map.off('mouseleave', SETTLEMENTS_LAYER_ID, clearHoverTip);
      map.off('click',      MILITARY_HIT_ID, handleMilitaryClick);
      map.off('mouseenter', MILITARY_HIT_ID, setCursorPointer);
      map.off('mousemove',  MILITARY_HIT_ID, handleMilitaryMove);
      map.off('mouseleave', MILITARY_HIT_ID, clearCursor);
      map.off('mouseleave', MILITARY_HIT_ID, clearHoverTip);
      map.off('click',      TRADE_HIT_ID,  handleTradeClick);
      map.off('click',      TRADE_LINE_ID, handleTradeClick);
      map.off('mouseenter', TRADE_HIT_ID,  setCursorPointer);
      map.off('mouseenter', TRADE_LINE_ID, setCursorPointer);
      map.off('mousemove',  TRADE_LINE_ID, handleTradeMove);
      map.off('mousemove',  TRADE_HIT_ID,  handleTradeMove);
      map.off('mouseleave', TRADE_LINE_ID, clearCursor);
      map.off('mouseleave', TRADE_HIT_ID,  clearCursor);
      map.off('mouseleave', TRADE_LINE_ID, clearHoverTip);
      map.off('mouseleave', TRADE_HIT_ID,  clearHoverTip);
      map.off('click',      RELATIONSHIPS_HIT_ID, handleRelationshipClick);
      map.off('mouseenter', RELATIONSHIPS_HIT_ID, setCursorPointer);
      map.off('mousemove',  RELATIONSHIPS_HIT_ID, handleRelationshipMove);
      map.off('mouseleave', RELATIONSHIPS_HIT_ID, clearCursor);
      map.off('mouseleave', RELATIONSHIPS_HIT_ID, clearHoverTip);
      map.off('click',      RELATIONSHIP_STUDS_DOT_ID,  handleStudClick);
      map.off('click',      RELATIONSHIP_STUDS_RING_ID, handleStudClick);
      map.off('mouseenter', RELATIONSHIP_STUDS_DOT_ID,  setCursorPointer);
      map.off('mouseenter', RELATIONSHIP_STUDS_RING_ID, setCursorPointer);
      map.off('mousemove',  RELATIONSHIP_STUDS_DOT_ID,  handleStudMove);
      map.off('mousemove',  RELATIONSHIP_STUDS_RING_ID, handleStudMove);
      map.off('mouseleave', RELATIONSHIP_STUDS_DOT_ID,  clearCursor);
      map.off('mouseleave', RELATIONSHIP_STUDS_DOT_ID,  clearHoverTip);
      map.off('mouseleave', RELATIONSHIP_STUDS_RING_ID, clearCursor);
      map.off('mouseleave', RELATIONSHIP_STUDS_RING_ID, clearHoverTip);
    };
  }, [phase, mapRef, select, setHover, setHoverTip, fillLayerId]);
}
