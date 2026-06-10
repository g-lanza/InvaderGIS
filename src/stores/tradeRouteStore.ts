/**
 * tradeRouteStore — last-clicked trade-route properties for the inspector dock.
 *
 * Trade routes are a map-only baked GeoJSON layer (public/data/layers/trade.geojson)
 * with NO backing record in loaders.ts. Clicking one therefore cannot be resolved
 * by findRecordByKindId() — the dock would show "Record not found". This store
 * carries the clicked feature's real properties (read straight off the GeoJSON
 * feature) so TradeCard can render them without the record loader.
 *
 * useMapInteractions writes here on a trade-line click, then calls
 * selectionStore.select(id, 'trade'); EntityDock special-cases the 'trade' kind
 * and feeds TradeCard from this store. Cleared implicitly by selecting any other
 * record (the dock only reads this store when selectedType === 'trade').
 *
 * No fabricated values: every field mirrors a real GeoJSON property. Missing
 * start/end years stay null (the route is open-ended in the dataset) and render
 * honestly as such in the card.
 */
import { create } from 'zustand';

/** Transport mode of a trade route. */
export type TradeMode = 'overland' | 'maritime' | 'river-and-portage';

/** The real, render-ready properties carried by a baked trade-route feature. */
export interface TradeRouteInfo {
  /** Feature id, e.g. "silk_road_south". */
  id: string;
  /** Human-readable route name, e.g. "Silk Road (Southern Branch)". */
  name: string;
  /** First year the route was active, or null when open-ended. */
  start_year: number | null;
  /** Last year the route was active, or null when open-ended. */
  end_year: number | null;
  /** Real historical summary (1–2 sentences). Absent on un-enriched data. */
  summary?: string;
  /** Primary commodities carried along the route. */
  goods?: string[];
  /** Key cities / emporia along the route. */
  hubs?: string[];
  /** Transport mode (overland / maritime / river-and-portage). */
  mode?: TradeMode;
}

export interface TradeRouteState {
  /** The last-clicked trade route, or null before any trade click. */
  route: TradeRouteInfo | null;
  /** Store the clicked route's properties (called from useMapInteractions). */
  setRoute: (route: TradeRouteInfo) => void;
  /** Clear the stored route. */
  clear: () => void;
}

export const useTradeRouteStore = create<TradeRouteState>((set) => ({
  route: null,
  setRoute: (route) => set({ route }),
  clear: () => set({ route: null }),
}));
