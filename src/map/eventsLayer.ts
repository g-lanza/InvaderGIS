/**
 * eventsLayer.ts — events point layer for InvaderGIS Phase 3.
 *
 * Loads /data/layers/events.geojson (2,914 Point features), renders each event
 * as a category-colored disc with a mono code letter centred on it, filters by
 * time, respects layer visibility, and wires click → selectionStore.select().
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 *
 * Mark approach (b) — Google-pin symbol layer + colored circle fallback:
 *   MapLibre renders two GL layers per event point:
 *     1. `events-circle`  — category-colored filled circle. At low zoom, acts as
 *        the colored-dot fallback for tier-1 events whose pin icon was culled by
 *        the collision engine. At high zoom it becomes the small anchor pip below
 *        the pin's point.
 *     2. `events-symbol`  — symbol layer using evt-stud-{category} images registered
 *        by registerEventIcons() (approach-b). Each image is a Google-pin style
 *        teardrop: category color floods the entire body; white inner disc carries
 *        the white category glyph. icon-anchor:'bottom' makes the pin POINT sit
 *        on the geographic coordinate (Google-Maps-pin behavior).
 *   The old approach (a) label layer (EVENTS_LABEL_ID) constant is kept for
 *   back-compat but the layer is never registered — EVENTS_SYMBOL_ID replaced it.
 *
 * Time-scoping (exact-year — user decision 2026-06-07):
 *   Events are point-in-time (a single year). Strategy: show an event ONLY on its
 *   exact year (`event.year === scrubberYear`), so the field turns over completely
 *   as the scrubber moves — matching how the polities change with time. The prior
 *   accreting model (year ≤ currentYear) piled every past event on screen and never
 *   removed them ("same events stay on screen no matter what year"); a ±40yr window
 *   was too subtle to read. Exact-year replaces both. Many years legitimately have
 *   zero events — an empty year is honest, not a bug. See buildEventsTimeFilter.
 *
 * Fetch failure:
 *   If events.geojson fails to load, a warning is logged and the polity layer
 *   continues to function unaffected — the events layer is simply absent.
 *
 * ── Wave 4A — Zoom-stepped declutter for events ───────────────────────────────
 *
 * With 2,914 accreting event studs at low zoom, overdraw is severe. The approach:
 *
 * 1. CIRCLE layer: At zoom ≤ 3 events are drawn at radius 1.5px — effectively
 *    sub-pixel density markers that do not overdraw meaningfully. MapLibre's 'step'
 *    expression on ['zoom'] reduces the radius (not the feature count) so ALL
 *    events remain queryable/clickable at every zoom level (honest: no feature
 *    dropped from interaction). The standard interpolate-zoom sizing kicks in above
 *    zoom 3 as before.
 *
 * 2. LABEL layer (symbol): Already only shows code letters above zoom 5 via the
 *    text-size interpolation (0 at zoom 5, 6 at zoom 6). No change needed — the
 *    symbol layer does its own allow-overlap culling.
 *
 * 3. CIRCLE opacity: At zoom ≤ 3 circle opacity steps down to 0.45 so the dense
 *    stud mass does not visually dominate the polity fills at world-overview zoom.
 *    At zoom ≥ 4 full 0.92 opacity restores. Uses a 'step' paint expression —
 *    no JS per-feature cost, evaluated in the GL paint thread.
 *
 * These are purely visual adjustments — every event remains in the source and
 * passes the time filter; no data is hidden or deferred from click interaction.
 *
 * ── Constants ─────────────────────────────────────────────────────────────────
 */

import { EVENT_CATEGORIES } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { layerReady, layerExists } from './mapGuards';
import { categoryColor } from '@/data/vocab';
import { DEFAULT_EVENT_YEAR_SPAN } from '@/stores/eventFilterStore';
import type { EventTimeMode } from '@/stores/eventFilterStore';

export const EVENTS_SOURCE_ID   = 'events-source';
export const EVENTS_CIRCLE_ID   = 'events-circle';
export const EVENTS_LABEL_ID    = 'events-label';
export const EVENTS_SYMBOL_ID   = 'events-symbol';
/** Invisible wide hit circle so event pins are reliably hover/clickable at any
 *  zoom (the visible circle is radius-0 below zoom 7 and the symbol pin's hitbox
 *  is unreliable with icon-allow-overlap). Mirrors MILITARY_HIT_ID. */
export const EVENTS_HIT_ID      = 'events-hit';

const EVENTS_URL = assetUrl('/data/layers/events.geojson');

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EventFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    year: number;
    type: string;
    category: string;
    /** Render-declutter priority baked by bake-manifests.mjs. 1=highest, 3=lowest.
     *  Derived deterministically from `category`; NOT a historical-importance ranking.
     *  Every event remains fully queryable/clickable at every zoom regardless of tier.
     */
    tier: 1 | 2 | 3;
  };
}

export interface EventFeatureCollection {
  type: 'FeatureCollection';
  features: EventFeature[];
}

// ── Category color match expression ───────────────────────────────────────────

/**
 * Build a MapLibre 'match' expression mapping category id → theme-aware hex.
 * Covers all 9 EVENT_CATEGORIES; fallback is institution grey (institution
 * events exist in the data model but are currently absent from events.geojson —
 * the fallback handles any future institution events gracefully).
 *
 * Pattern mirrors buildRegionMatchExpression — flat [key, color, ...] pairs.
 */
export function buildCategoryColorExpression(theme: string): unknown[] {
  const pairs: string[] = [];
  for (const cat of EVENT_CATEGORIES) {
    pairs.push(cat.id, categoryColor(cat.id, theme));
  }
  // Fallback: institution grey (#4a4a52), lightened for dark theme.
  const fallback = categoryColor('institution', theme);
  return ['match', ['get', 'category'], ...pairs, fallback];
}

/**
 * Build a MapLibre 'match' expression mapping category id → mono code letter.
 * Used by the text label layer to render V / D / P / R / C / X / E / H / I
 * centred on each disc (kept for reference / fallback).
 */
export function buildCategoryCodeExpression(): unknown[] {
  const pairs: string[] = [];
  for (const cat of EVENT_CATEGORIES) {
    pairs.push(cat.id, cat.code);
  }
  return ['match', ['get', 'category'], ...pairs, '?'];
}

/**
 * Build a MapLibre 'match' expression mapping category id → stud image name.
 * The evt-stud-{category} images are registered by registerEventIcons() in
 * eventIcons.ts before this layer is added. Fallback: 'evt-stud-fallback'.
 */
export function buildCategoryIconExpression(): unknown[] {
  const pairs: string[] = [];
  for (const cat of EVENT_CATEGORIES) {
    pairs.push(cat.id, `evt-stud-${cat.id}`);
  }
  return ['match', ['get', 'category'], ...pairs, 'evt-stud-fallback'];
}

// ── Time filter ────────────────────────────────────────────────────────────────

/**
 * Pure predicate: does an event at `eventYear` belong to the scrubber `year`?
 * Events are point-in-time (a single `year`). Two modes (user decision 2026-06-07):
 *   'exact' — show only on the event's exact year (the field turns over fully on
 *             every scrub step — the original sharpest-possible model).
 *   'span'  — show within ±`span` years of the scrubber year (a sliding window).
 * Mirrors the MapLibre `buildEventsTimeFilter` expression exactly — kept as a
 * testable plain function.
 */
export function eventAtYear(
  eventYear: number,
  year: number,
  mode: EventTimeMode = 'exact',
  span: number = DEFAULT_EVENT_YEAR_SPAN,
): boolean {
  if (mode === 'span') {
    return eventYear >= year - span && eventYear <= year + span;
  }
  return eventYear === year;
}

/**
 * Build a MapLibre filter expression for the events layers' time window.
 *
 * Two modes (user decision 2026-06-07):
 *   'exact' → ['==', ['get','year'], year]                — single year.
 *   'span'  → ['all', ['>=', year, year-span], ['<=', year, year+span]] — window.
 *
 * Exact-year makes the set turn over on every scrub step (the original model);
 * span shows ±`span` years at once. NOTE: many individual years legitimately have
 * zero events (~3 events/yr across 500–1500); an empty exact year is honest, not a
 * bug — switch to span to read a generation at once.
 *
 * NOTE: This remains the sole layer `filter`. MapLibre GL does NOT support
 * `['zoom']` inside a `filter` expression — zoom is only valid in layout/paint
 * expressions. Tier-based low-zoom windowing is therefore implemented as
 * zoom-stepped opacity expressions (see buildTierOpacityExpression), NOT as a
 * filter. This means every event in the window remains in the source and passes
 * the hit-test at every zoom — the honest-declutter contract from Wave 4A holds.
 */
export function buildEventsTimeFilter(
  year: number,
  mode: EventTimeMode = 'exact',
  span: number = DEFAULT_EVENT_YEAR_SPAN,
): unknown[] {
  if (mode === 'span') {
    return [
      'all',
      ['>=', ['get', 'year'], year - span],
      ['<=', ['get', 'year'], year + span],
    ];
  }
  return ['==', ['get', 'year'], year];
}

// ── Wave 4B — Tier-aware low-zoom opacity windowing ───────────────────────────
//
// With 2,914 accreting events, by year 1500 nearly all render at once. At low
// zoom the tier field (baked by bake-manifests.mjs §8) gates which events are
// visually prominent:
//
//   zoom < 4  → only tier 1 (power/religion/diplomacy/discovery — the rarer
//               high-signal turning points) is fully opaque; tier 2 and the
//               bulk tier-3 violence mass are faded to 0 to cut overdraw.
//   zoom 4–5  → tier 1 + tier 2 (culture/economy/hazard) visible; tier 3 faded.
//   zoom ≥ 6  → all tiers at full opacity (incl. tier-3 violence).
//
// Implementation: MapLibre `case` expression on the `tier` property, wrapped in
// a `step` on `['zoom']`. The GL paint thread evaluates this per-feature with
// no per-feature JS cost. Every event stays in the source; only the rendered
// opacity changes — features are still clickable at every zoom (same contract as
// Wave 4A circle-opacity step).
//
// The base opacity values (0.5 at low zoom, 0.85 at mid, 0.95 for symbol) come
// from the existing Wave 4A expressions; tier windowing multiplies into those.
// setEventsOpacity() uses buildTierOpacityExpression() so the user-facing layer
// opacity slider continues to work correctly.

/**
 * Build a MapLibre paint opacity expression for the events circle layer that
 * combines the existing Wave 4A zoom-stepped declutter with tier-aware fading.
 *
 * - zoom < 4 : tier 1 → 0.5×scale, tier 2/3 → 0 (invisible, still clickable)
 * - zoom 4–5 : tier 1 → 0.85×scale, tier 2 → 0.85×scale, tier 3 → 0
 * - zoom ≥ 6 : all tiers → 0.85×scale (full hand-off to symbol layer anyway)
 *
 * @param scale Overall opacity scalar from layersStore (0..1, default 1.0).
 */
export function buildTierCircleOpacityExpression(scale = 1): unknown[] {
  const s = Math.max(0, Math.min(1, scale));
  // Tier gate at each zoom bracket: ['case', tier==1, fullOp, tier==2, fullOp, 0]
  const tierGate = (t1Op: number, t2Op: number, t3Op: number): unknown[] => [
    'case',
    ['==', ['get', 'tier'], 1], t1Op * s,
    ['==', ['get', 'tier'], 2], t2Op * s,
    t3Op * s,
  ];
  return [
    'step', ['zoom'],
    // zoom < 4: tier 1 only
    tierGate(0.5, 0, 0),
    // zoom 4+: tier 1 + 2
    4, tierGate(0.85, 0.85, 0),
    // zoom 6+: all tiers
    6, tierGate(0.85, 0.85, 0.85),
  ];
}

/**
 * Build a MapLibre paint opacity expression for the events symbol layer that
 * combines zoom-stepped declutter with tier-aware fading.
 *
 * With the Google-pin color-flooded body, icons are legible even at small sizes,
 * so the symbol layer now starts at zoom 3 (not 4) for tier-1 events. The circle
 * layer is the colored-dot fallback for collision-culled icons at zoom ≤ 3.
 *
 * - zoom < 3  : all icons at low opacity (0.75×scale for tier 1) — the icon IS
 *               rendered at the smallest icon-size (0.40) but kept semi-transparent
 *               so the denser polity fills still read through. Tier 2/3 → 0.
 * - zoom 3–5  : tier 1 → 0.92×scale, tier 2 → 0.92×scale, tier 3 → 0
 * - zoom ≥ 6  : all tiers → 0.95×scale
 *
 * @param scale Overall opacity scalar from layersStore (0..1, default 1.0).
 */
export function buildTierSymbolOpacityExpression(scale = 1): unknown[] {
  const s = Math.max(0, Math.min(1, scale));
  const tierGate = (t1Op: number, t2Op: number, t3Op: number): unknown[] => [
    'case',
    ['==', ['get', 'tier'], 1], t1Op * s,
    ['==', ['get', 'tier'], 2], t2Op * s,
    t3Op * s,
  ];
  return [
    'step', ['zoom'],
    // zoom < 3: tier 1 fully solid (reads like a real pin); tier 2/3 hidden for declutter
    tierGate(1, 0, 0),
    // zoom 3+: tier 1 + 2 solid; tier 3 still hidden
    3, tierGate(1, 1, 0),
    // zoom 6+: all tiers solid
    6, tierGate(1, 1, 1),
  ];
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the events GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning so the developer knows the layer is absent — no silent swallow.
 */
export async function fetchEventsGeojson(): Promise<EventFeatureCollection | null> {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${EVENTS_URL}`);
    }
    return (await res.json()) as EventFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[eventsLayer] Failed to load events.geojson — events layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ─────────────────────────────────────────────────────────

/**
 * Add the events GeoJSON source + two GL layers to a live MapLibre map.
 *
 * Must be called only after the map style has loaded (inside map.once('load')
 * or after map.isStyleLoaded() === true). Safe to call multiple times — guards
 * against duplicate source/layer registration.
 *
 * @param map       The live MapLibre Map instance (any — avoids importing heavy types).
 * @param geojson   The loaded EventFeatureCollection.
 * @param theme     The active theme id for category color computation.
 * @param year      The initial year for time-scoping.
 * @param visible   Whether to show the layer immediately.
 */
export function addEventsLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: EventFeatureCollection,
  theme: string,
  year: number,
  visible: boolean,
): void {
  // Guard: don't double-register.
  if (map.getSource(EVENTS_SOURCE_ID)) return;

  // ── Source ───────────────────────────────────────────────────────────────────
  map.addSource(EVENTS_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    // generateId so feature-state works (hover / selection highlight, Phase 4+).
    generateId: true,
  });

  const colorExpr        = buildCategoryColorExpression(theme);
  const iconExpr         = buildCategoryIconExpression();
  const timeFilter       = buildEventsTimeFilter(year);
  const circleOpacityExpr = buildTierCircleOpacityExpression(1);
  const symbolOpacityExpr = buildTierSymbolOpacityExpression(1);
  const visibility       = visible ? 'visible' : 'none';

  // ── Circle fallback / anchor-pip layer ────────────────────────────────────────
  // Category-colored dot drawn exactly at the event's geographic coordinates.
  // Serves two roles depending on zoom:
  //
  //   LOW ZOOM (≤ 3): The collision engine culls symbol icons when 2,914 pins
  //   overlap at world-overview zoom. This circle is the colored-dot fallback
  //   visible for any event whose pin icon was culled. Tier 1 only (same gate as
  //   the symbol layer). The colored dot preserves "I can see something happened
  //   here" legibility even at world zoom.
  //
  //   HIGH ZOOM (≥ 6): Acts as a small anchor-pip directly below the pin's point,
  //   reinforcing the precise geographic anchor. Kept ≤ 4px so it doesn't visually
  //   fight the pin head.
  //
  // Wave 4A: radius interpolation starts at 2px at zoom 2 so the 2,914-stud mass
  // at low zoom doesn't overwhelm the polity fills (all events still queryable).
  // Wave 4B: circle-opacity uses buildTierCircleOpacityExpression() — tier 1 only
  // at zoom < 4; tier 1+2 at 4–5; all at ≥ 6. Features remain clickable at 0 opacity.
  map.addLayer({
    id: EVENTS_CIRCLE_ID,
    type: 'circle',
    source: EVENTS_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      'circle-color': colorExpr,
      // The pin is now the primary marker (icon-allow-overlap:true), so the circle
      // is demoted to a tiny anchor pip that only appears at HIGH zoom directly
      // under each pin point — it must NOT compete with or replace the pins.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2,  0,    // world→region: no dot — pins are the markers
        6,  0,
        7,  1.5,  // city zoom: faint anchor pip appears
        12, 2.5,
      ],
      'circle-stroke-width': 0,
      'circle-opacity': circleOpacityExpr,
    },
  });

  // ── Symbol pin layer (evt-stud-* Google-pin icons) ───────────────────────────
  // Renders the category-color-flooded teardrop pin registered by
  // registerEventIcons(). Canvas is 32×42 logical px at pixelRatio 2.
  //
  // icon-anchor: 'bottom' — the pin's POINT (bottom edge of the 32×42 canvas)
  // sits exactly on the event's geographic coordinates. The colored head floats
  // above in screen space — the canonical Google-Maps-pin behavior.
  //
  // icon-size at low zoom (2–3): set to 0.40–0.50 so the colored pin body reads
  // as ~13–16 CSS px tall — large enough to convey color and pin shape even before
  // the glyph can be seen. The prior 0.28 produced a ~9px mark too small to read.
  // With the color-flooded body (no longer cream), even a 13px pin is a clearly
  // colored teardrop. The collision engine (icon-allow-overlap: false) thins the
  // dense 2,914-event field without dropping any from the source.
  //
  // icon-padding: 1 — tighter than before (was 2) so more pins survive collision
  // at zoom 3 before the tier opacity gates further thin the field.
  //
  // Wave 4B: icon-opacity uses buildTierSymbolOpacityExpression() — tier 1 at
  // zoom < 3 (0.75), tier 1+2 at zoom 3–5 (0.92), all at ≥ 6 (0.95).
  map.addLayer({
    id: EVENTS_SYMBOL_ID,
    type: 'symbol',
    source: EVENTS_SOURCE_ID,
    filter: timeFilter,
    layout: {
      visibility,
      'icon-image': iconExpr,
      // icon-size tuned for the 32×42 canvas (CANVAS_W × CANVAS_H):
      // At scale 1.0 the pin renders at 16×21 CSS px (canvas / pixelRatio 2).
      // Low-zoom sizes boosted vs prior (0.40 vs 0.28) so the colored pin body
      // reads as a recognizable map-pin shape even at world overview.
      // Pin sizes tuned so the marker reads as a PIN with a visible glyph at every
      // zoom (matching the reference component) — not a sub-pixel dot at world view.
      // Collision (icon-allow-overlap:false) keeps the 2,984-event field from
      // overdrawing; tier opacity gates further thin low zoom. 32×42 canvas @ pr2.
      // NOTE: icon-size is a LAYOUT property and MapLibre forbids feature-state in
      // layout props, so the hover "pop" CANNOT live here — it is done on the
      // EVENTS_HIT_ID circle's paint instead (see addLayer below + featureStatePop).
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        2,  0.62,  // world overview: ~10×13 CSS px — clearly a colored pin, glyph readable
        3,  0.72,  // sub-continental: ~12×15 CSS px
        4,  0.82,  // region zoom: ~13×17 CSS px — glyph crisp
        6,  0.95,  // continental: ~15×20 CSS px
        8,  1.1,   // city zoom: ~18×23 CSS px
        12, 1.3,   // street zoom: ~21×27 CSS px — prominent like a map marker
      ],
      // PINS ARE THE PRIMARY MARKER: allow overlap so every visible event shows
      // its pin (previously false → the collision engine culled most pins in the
      // dense 2,984-event field, leaving only the circle dots visible — which is
      // why events looked like circles, not markers). Density at low zoom is
      // controlled by the tier/zoom opacity gate, not by culling pins to dots.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // Bottom anchor: pin point sits on the event coordinates
      'icon-anchor': 'bottom',
      'icon-padding': 0,
      // Show event name label above the pin head only at high zoom.
      // With anchor:'bottom', the icon's top edge is ~(icon-height) above the point.
      // text-offset Y is negative (upward). At icon-size 0.85 the pin is ~18 CSS px
      // tall; -2.5em clears the head with a small breathing gap.
      'text-field': ['step', ['zoom'], '', 9, ['get', 'name']],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 9,
      'text-offset': [0, -2.5],
      'text-anchor': 'bottom',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'icon-opacity': symbolOpacityExpr,
      'text-color': 'rgba(30, 20, 10, 0.85)',
      'text-halo-color': 'rgba(255, 255, 255, 0.8)',
      'text-halo-width': 1,
    },
  });

  // ── Hit circle + hover "pop" ─────────────────────────────────────────────────
  // Wide circle on TOP that serves two purposes:
  //  1. Reliable hover/click target — the visible event circle is radius-0 below
  //     zoom 7 and the symbol pin's queryable box is unreliable with
  //     icon-allow-overlap:true, so without this the event hover never fired.
  //  2. The hover "pop" indicator. icon-size (a LAYOUT prop) can't read
  //     feature-state, so the pin itself can't grow; instead this circle is fully
  //     transparent at rest and blooms into a soft halo disc + ring on hover/select
  //     (circle PAINT props DO support feature-state). This is the events analogue
  //     of the capitals circle pop. Same hit-target pattern as MILITARY_HIT_ID.
  map.addLayer({
    id: EVENTS_HIT_ID,
    type: 'circle',
    source: EVENTS_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility },
    paint: {
      // Grow a touch on interaction so the halo reads as a "lift" around the pin.
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 16,
        ['boolean', ['feature-state', 'hover'], false], 15,
        14,
      ],
      // Transparent at rest; soft translucent fill on hover, a bit stronger on select.
      'circle-color': '#ffffff',
      'circle-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 0.22,
        ['boolean', ['feature-state', 'hover'], false], 0.16,
        0,
      ],
      // A crisp ring appears on interaction — the clearest size-independent pop cue.
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 2,
        ['boolean', ['feature-state', 'hover'], false], 1.5,
        0,
      ],
      'circle-stroke-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], 0.9,
        ['boolean', ['feature-state', 'hover'], false], 0.75,
        0,
      ],
    },
  });

  // Keep the legacy label layer id exported for MapCanvas visibility helpers
  // but don't add it — EVENTS_SYMBOL_ID replaces it. The constant is preserved
  // so existing setEventsVisibility / setEventsOpacity callers compile unchanged.
}

// ── Live update helpers ────────────────────────────────────────────────────────

/**
 * Build a MapLibre filter expression that restricts events to a single
 * category. Composed with the time filter via `buildEventsComposedFilter`.
 *
 * @param category The category id to show (e.g. 'war'). null = no restriction.
 */
export function buildEventsCategoryFilter(category: string | null): unknown[] | null {
  if (category === null) return null;
  return ['==', ['get', 'category'], category];
}

/**
 * Compose the time filter (exact or span) with an optional category filter into a
 * single MapLibre filter expression.
 *
 * - no category     → the bare time filter (exact `['==']` or span `['all', …]`).
 * - + category exact → ['all', ['==', year], ['==', category]]
 * - + category span  → ['all', ['>=', lo], ['<=', hi], ['==', category]]
 *
 * The composed result is always FLAT — when the time filter is itself an
 * `['all', …]` (span mode), its child conditions are SPREAD into the composed
 * `all` rather than nested. A nested `['all']` as a child of another `['all']`
 * trips MapLibre's legacy-filter mode and silently drops features (see
 * relationshipsLayer.ts for the same hazard). The handoff calls this out
 * explicitly: keep the composed filter flat when a category is also active.
 *
 * @param year     The current scrubber year.
 * @param category The solo'd category id, or null for all categories.
 * @param mode     Exact-year or span time matching.
 * @param span     Span half-width in years (used only when mode === 'span').
 */
export function buildEventsComposedFilter(
  year: number,
  category: string | null,
  mode: EventTimeMode = 'exact',
  span: number = DEFAULT_EVENT_YEAR_SPAN,
): unknown[] {
  const timeFilter = buildEventsTimeFilter(year, mode, span);
  const catFilter  = buildEventsCategoryFilter(category);
  if (catFilter === null) return timeFilter;
  // Flatten: if the time filter is an ['all', …], spread its conditions so the
  // composed result never nests an 'all' inside an 'all'.
  if (Array.isArray(timeFilter) && timeFilter[0] === 'all') {
    return ['all', ...timeFilter.slice(1), catFilter];
  }
  return ['all', timeFilter, catFilter];
}

/**
 * Apply a category solo filter on both events layers.
 * Composes with the current year stored internally — callers must ensure
 * setEventsTimeFilter was applied first (or use setEventsComposedFilter).
 *
 * Passing null clears the category restriction (shows all categories).
 *
 * @param map      The live MapLibre Map instance.
 * @param year     The current scrubber year (needed to rebuild the composed filter).
 * @param category The category id to show, or null for all.
 * @param mode     Exact-year or span time matching (default 'exact').
 * @param span     Span half-width in years (used only when mode === 'span').
 */
export function setEventsCategoryFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  year: number,
  category: string | null,
  mode: EventTimeMode = 'exact',
  span: number = DEFAULT_EVENT_YEAR_SPAN,
): void {
  const filter = buildEventsComposedFilter(year, category, mode, span);
  // layerExists (not layerReady): setFilter must run during scrub even while the
  // heavy events GeoJSON keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, EVENTS_CIRCLE_ID)) map.setFilter(EVENTS_CIRCLE_ID, filter);
  if (layerExists(map, EVENTS_SYMBOL_ID)) map.setFilter(EVENTS_SYMBOL_ID, filter);
  if (layerExists(map, EVENTS_HIT_ID))    map.setFilter(EVENTS_HIT_ID,    filter);
}

/**
 * Update the time filter on all events layers (called on year change).
 * Guards against calling when layers are absent (fetch failed).
 *
 * NOTE: If a category filter is active, callers should use
 * setEventsCategoryFilter(map, year, category) which composes both, so the
 * category restriction is not accidentally dropped on year change.
 * MapCanvas.applyTimeFilter passes the live category from eventFilterStore.
 */
export function setEventsTimeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  year: number,
  mode: EventTimeMode = 'exact',
  span: number = DEFAULT_EVENT_YEAR_SPAN,
): void {
  const filter = buildEventsTimeFilter(year, mode, span);
  if (layerExists(map, EVENTS_CIRCLE_ID))  map.setFilter(EVENTS_CIRCLE_ID,  filter);
  if (layerExists(map, EVENTS_SYMBOL_ID))  map.setFilter(EVENTS_SYMBOL_ID,  filter);
  if (layerExists(map, EVENTS_HIT_ID))     map.setFilter(EVENTS_HIT_ID,     filter);
}

/**
 * Update circle color on both layers when the theme changes.
 * Label text color is white-on-color so it doesn't need updating.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setEventsCategoryColors(map: any, theme: string): void {
  const colorExpr = buildCategoryColorExpression(theme);
  if (layerReady(map, EVENTS_CIRCLE_ID)) {
    map.setPaintProperty(EVENTS_CIRCLE_ID, 'circle-color', colorExpr);
  }
}

/**
 * Show or hide both events layers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setEventsVisibility(map: any, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  const apply = (): void => {
    if (layerExists(map, EVENTS_CIRCLE_ID))  map.setLayoutProperty(EVENTS_CIRCLE_ID,  'visibility', v);
    if (layerExists(map, EVENTS_SYMBOL_ID))  map.setLayoutProperty(EVENTS_SYMBOL_ID,  'visibility', v);
    if (layerExists(map, EVENTS_HIT_ID))     map.setLayoutProperty(EVENTS_HIT_ID,     'visibility', v);
  };
  apply();
  // Re-apply on the next frame: a SYMBOL layer's visibility set can be a no-op on
  // the frame its icons are still being placed by MapLibre's symbol-placement
  // worker — which left the pin layer hidden while the circle layer showed (events
  // looked like circles, not markers). The deferred re-apply lands once placement
  // has settled, making the toggle reliable. Guarded; cheap; idempotent.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { try { apply(); } catch { /* transitional */ } });
  }
}

/**
 * Set the opacity of the events layers (called when layersStore opacity changes).
 * Uses buildTierCircleOpacityExpression / buildTierSymbolOpacityExpression so
 * both Wave 4A (zoom-stepped declutter) and Wave 4B (tier-based low-zoom fading)
 * are preserved at reduced overall opacity.
 *
 * @param map     The live MapLibre Map instance.
 * @param opacity Opacity value 0..1 from layersStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setEventsOpacity(map: any, opacity: number): void {
  const clamped = Math.max(0, Math.min(1, opacity));
  if (layerReady(map, EVENTS_CIRCLE_ID)) {
    map.setPaintProperty(EVENTS_CIRCLE_ID, 'circle-opacity',
      buildTierCircleOpacityExpression(clamped));
  }
  if (layerReady(map, EVENTS_SYMBOL_ID)) {
    map.setPaintProperty(EVENTS_SYMBOL_ID, 'icon-opacity',
      buildTierSymbolOpacityExpression(clamped));
  }
}
