/**
 * relationshipsLayer.ts — inter-polity relationship arcs for InvaderGIS.
 *
 * Renders 428 relationship records as LineString arcs connecting the centroids of the
 * two participating polities. Each arc is colored by relationship type (RELATIONSHIP_TYPES
 * tokens) and given a dash pattern that encodes the nature of the tie, per LINES.md.
 *
 * ── Dash encoding ─────────────────────────────────────────────────────────────
 *
 * MapLibre line-dasharray cannot be data-driven per-feature (GL4 constraint).
 * Five GL line layers cover the five dash buckets, each filtered to its types:
 *
 *   relationships-solid     solid           alliance, vassalage, marriage,
 *                                           dynastic_union, personal_union
 *   relationships-dashed    [8, 5]          tributary, trade,
 *                                           religious_jurisdiction
 *   relationships-dotted    [0.1, 4]        religious, cultural_exchange
 *   relationships-tense     [5, 5]          rivalry, contested_influence
 *   relationships-dashdot   [10, 4, 1.5, 4] successor, predecessor,
 *                                           succession, fragmentation
 *
 * Plus one shared hit layer and one symbol layer for directed arrowheads.
 *
 * ── Directed arrowheads ───────────────────────────────────────────────────────
 *
 * Directed relationship types carry an arrowhead at the terminus (to endpoint).
 * MapLibre symbol layer with icon-image drawn from the inline SDF arrow, placed
 * at line-end via symbol-placement:'line-center' and rotated to follow the line.
 * Directed types: vassalage, tributary, successor, predecessor, succession,
 * religious_jurisdiction, fragmentation.
 *
 * ── Data source ───────────────────────────────────────────────────────────────
 *
 * Built in-browser from /data/records/relationship.json + /data/records/polity.json.
 * Missing centroid → arc omitted (honest, no fabricated positions).
 *
 * ── Centroid studs ────────────────────────────────────────────────────────────
 *
 * White-fill ring + ink dot per LINES.md spec (stud.svg):
 *   ring layer: circle-color white, circle-stroke ink
 *   dot layer:  circle-color ink, smaller radius inside the ring
 *
 * ── Module contract ───────────────────────────────────────────────────────────
 *
 *   RELATIONSHIPS_SOURCE_ID, RELATIONSHIPS_LAYER_ID — exported constants
 *   fetchRelationshipsGeojson()
 *   addRelationshipsLayer(map, build, theme, year, visible)
 *   setRelationshipsTimeFilter(map, year)
 *   setRelationshipsVisibility(map, visible)
 *   setRelationshipsOpacity(map, opacity)
 *   setRelationshipsColors(map, theme)
 */

import { RELATIONSHIP_TYPES, domainColor } from '@/design/tokens';
import { assetUrl } from '@/data/assetUrl';
import { mapLog } from './mapLog';
import { layerReady, layerExists } from './mapGuards';
import { humanizeId } from '@/data/displayName';

// ── Layer ID constants ────────────────────────────────────────────────────────

export const RELATIONSHIPS_SOURCE_ID       = 'relationships-source';
export const RELATIONSHIPS_HIT_ID          = 'relationships-hit';
export const RELATIONSHIPS_SOLID_ID        = 'relationships-solid';
export const RELATIONSHIPS_DASHED_ID       = 'relationships-dashed';
export const RELATIONSHIPS_DOTTED_ID       = 'relationships-dotted';
export const RELATIONSHIPS_TENSE_ID        = 'relationships-tense';
export const RELATIONSHIPS_DASHDOT_ID      = 'relationships-dashdot';
export const RELATIONSHIPS_ARROW_ID        = 'relationships-arrow';
export const RELATIONSHIP_ARROWS_SOURCE_ID = 'relationship-arrows-source';
export const RELATIONSHIP_STUDS_SOURCE_ID  = 'relationship-studs-source';
export const RELATIONSHIP_STUDS_RING_ID    = 'relationship-studs-ring';
export const RELATIONSHIP_STUDS_DOT_ID     = 'relationship-studs-dot';

// Legacy alias kept so existing MapCanvas imports compile without changes.
export const RELATIONSHIPS_LAYER_ID = RELATIONSHIPS_SOLID_ID;

const RECORDS_URL_RELATIONSHIPS = assetUrl('/data/records/relationship.json');
const RECORDS_URL_POLITIES       = assetUrl('/data/records/polity.json');

const DATASET_START = 500;
const DATASET_END   = 1500;

// ── Dash buckets ──────────────────────────────────────────────────────────────

const SOLID_TYPES    = ['alliance', 'vassalage', 'marriage', 'dynastic_union', 'personal_union'] as const;
const DASHED_TYPES   = ['tributary', 'trade', 'religious_jurisdiction'] as const;
const DOTTED_TYPES   = ['religious', 'cultural_exchange'] as const;
const TENSE_TYPES    = ['rivalry', 'contested_influence'] as const;
const DASHDOT_TYPES  = ['successor', 'predecessor', 'succession', 'fragmentation'] as const;

/** Relationship types that carry a directed arrowhead at the terminus. */
const DIRECTED_TYPES = ['vassalage', 'tributary', 'successor', 'predecessor', 'succession', 'religious_jurisdiction', 'fragmentation'] as const;

// All arc layer IDs (excluding studs).
const ARC_LAYER_IDS = [
  'relationships-hit',
  'relationships-solid',
  'relationships-dashed',
  'relationships-dotted',
  'relationships-tense',
  'relationships-dashdot',
  'relationships-arrow',
] as const;

const ALL_LAYER_IDS = [
  ...ARC_LAYER_IDS,
  'relationship-studs-ring',
  'relationship-studs-dot',
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface BakedRelationship {
  id: string;
  type: string;
  /** Baked human display name, e.g. "Merovingian Kingdom – Lombard Kingdom (Rivalry)". */
  name?: string;
  since?: number | null;
  until?: number | null;
  from_id?: string;
  to_id?: string;
  participants?: { entity_id: string; role: string }[];
}

interface BakedPolity {
  id: string;
  name_primary?: string;
  centroid?: [number, number];
}

export interface RelationshipFeatureProperties {
  id: string;
  /** Human display name (baked) so map hover / selection never show the raw slug. */
  name: string;
  type: string;
  since: number;
  until: number;
  /** Whether the arc is directed (arrow at terminus). */
  directed: boolean;
}

export interface RelationshipFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [[number, number], [number, number]] };
  properties: RelationshipFeatureProperties;
}

export interface RelationshipFeatureCollection {
  type: 'FeatureCollection';
  features: RelationshipFeature[];
}

export interface StudFeatureProperties {
  id: string;
  name: string;
  since: number;
  until: number;
}

export interface StudFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: StudFeatureProperties;
}

export interface StudFeatureCollection {
  type: 'FeatureCollection';
  features: StudFeature[];
}

/** A directed arc's terminus point, carrying the screen heading of the arc so
 *  the arrow glyph can be rotated to point along the line at the `to` endpoint. */
export interface ArrowFeatureProperties {
  id: string;
  type: string;
  since: number;
  until: number;
  /** Heading of the arc at the terminus, degrees clockwise from map-north. */
  bearing: number;
}

export interface ArrowFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: ArrowFeatureProperties;
}

export interface ArrowFeatureCollection {
  type: 'FeatureCollection';
  features: ArrowFeature[];
}

export interface RelationshipsBuild {
  arcs: RelationshipFeatureCollection;
  studs: StudFeatureCollection;
  /** Terminus points for directed arcs (one per directed relationship). */
  arrows: ArrowFeatureCollection;
}

// ── Color expression ──────────────────────────────────────────────────────────

export function buildRelationshipColorExpression(theme: string): unknown[] {
  const pairs: string[] = [];
  for (const [rtype, hex] of Object.entries(RELATIONSHIP_TYPES)) {
    pairs.push(rtype, domainColor(hex, theme));
  }
  return ['match', ['get', 'type'], ...pairs, domainColor('#7a7a8a', theme)];
}

// ── Stud color helpers ────────────────────────────────────────────────────────

function studInkColor(_theme: string): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--map-label').trim();
    if (v) return v;
  }
  return '#0d0907';
}

// ── Terminus bearing ───────────────────────────────────────────────────────────

/**
 * Heading of the segment from `from` to `to`, in degrees clockwise from
 * map-north (planar, screen-space — the arcs are straight 2-point lines and the
 * map uses a Web-Mercator-like projection where north is up, so a planar bearing
 * matches what the eye sees). Both points are GeoJSON [lon, lat].
 *
 * The ▶ glyph points east (90° from north) by default. With
 * `text-rotation-alignment: 'map'`, setting `text-rotate = bearing - 90` turns
 * the east-pointing glyph to point along the line toward the terminus.
 */
export function terminusBearing(
  from: [number, number],
  to: [number, number],
): number {
  const dLon = to[0] - from[0];
  const dLat = to[1] - from[1];
  // atan2(east, north) → clockwise-from-north heading.
  const deg = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

// ── Time filter ───────────────────────────────────────────────────────────────

export function buildRelationshipsTimeFilter(year: number): unknown[] {
  return [
    'all',
    ['<=', ['coalesce', ['get', 'since'], DATASET_START], year],
    ['>=', ['coalesce', ['get', 'until'], DATASET_END],   year],
  ];
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

export async function fetchRelationshipsGeojson(): Promise<RelationshipsBuild | null> {
  let relationships: BakedRelationship[];
  let polities: BakedPolity[];

  try {
    const [relRes, polRes] = await Promise.all([
      fetch(RECORDS_URL_RELATIONSHIPS),
      fetch(RECORDS_URL_POLITIES),
    ]);
    if (!relRes.ok) throw new Error(`HTTP ${relRes.status} fetching ${RECORDS_URL_RELATIONSHIPS}`);
    if (!polRes.ok) throw new Error(`HTTP ${polRes.status} fetching ${RECORDS_URL_POLITIES}`);
    relationships = (await relRes.json()) as BakedRelationship[];
    polities      = (await polRes.json()) as BakedPolity[];
  } catch (err) {
    console.warn(
      '[relationshipsLayer] Failed to load records — relationships layer disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  const centroidMap = new Map<string, [number, number]>();
  const nameMap     = new Map<string, string>();
  for (const p of polities) {
    if (p.centroid) {
      centroidMap.set(p.id, p.centroid);
      nameMap.set(p.id, p.name_primary ?? p.id);
    }
  }

  const directedSet = new Set<string>(DIRECTED_TYPES);
  let built = 0, skipped = 0;

  const features: RelationshipFeature[] = [];
  const arrowFeatures: ArrowFeature[] = [];
  const studAcc = new Map<string, { since: number; until: number }>();
  const noteStud = (id: string, since: number, until: number): void => {
    const cur = studAcc.get(id);
    if (cur) {
      cur.since = Math.min(cur.since, since);
      cur.until = Math.max(cur.until, until);
    } else {
      studAcc.set(id, { since, until });
    }
  };

  for (const rel of relationships) {
    let idA: string | undefined;
    let idB: string | undefined;

    if (rel.participants && rel.participants.length >= 2) {
      idA = rel.participants[0].entity_id;
      idB = rel.participants[1].entity_id;
    } else if (rel.from_id && rel.to_id) {
      idA = rel.from_id;
      idB = rel.to_id;
    }

    if (!idA || !idB) { skipped++; continue; }

    const centA = centroidMap.get(idA);
    const centB = centroidMap.get(idB);
    if (!centA || !centB) { skipped++; continue; }

    const since    = rel.since ?? DATASET_START;
    const until    = rel.until ?? DATASET_END;
    const directed = directedSet.has(rel.type ?? '');

    // centroid stored [lat, lon] — swap to [lon, lat] for GeoJSON.
    const fromLonLat: [number, number] = [centA[1], centA[0]];
    const toLonLat: [number, number]   = [centB[1], centB[0]];

    // Human name for hover/selection — baked relationship name, never the raw slug.
    const relName = (typeof rel.name === 'string' && rel.name) ? rel.name : humanizeId(rel.id);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [fromLonLat, toLonLat],
      },
      properties: { id: rel.id, name: relName, type: rel.type ?? 'unknown', since, until, directed },
    });

    // Directed arc → one arrow glyph pinned at the `to` terminus, rotated to
    // point along the arc. (Previously the glyph sat at line-center.)
    if (directed) {
      arrowFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: toLonLat },
        properties: {
          id: rel.id,
          type: rel.type ?? 'unknown',
          since,
          until,
          bearing: terminusBearing(fromLonLat, toLonLat),
        },
      });
    }

    noteStud(idA, since, until);
    noteStud(idB, since, until);
    built++;
  }

  const studFeatures: StudFeature[] = [];
  for (const [id, span] of studAcc) {
    const cent = centroidMap.get(id);
    if (!cent) continue;
    studFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cent[1], cent[0]] },
      properties: { id, name: nameMap.get(id) ?? id, since: span.since, until: span.until },
    });
  }

  mapLog(
    `[relationshipsLayer] Built ${built} arcs + ${arrowFeatures.length} arrows +` +
    ` ${studFeatures.length} studs, skipped ${skipped} from ${relationships.length} records`,
  );

  return {
    arcs:   { type: 'FeatureCollection', features },
    studs:  { type: 'FeatureCollection', features: studFeatures },
    arrows: { type: 'FeatureCollection', features: arrowFeatures },
  };
}

// ── Layer registration ────────────────────────────────────────────────────────

/**
 * Add relationship arc sources + all GL layers to a live MapLibre map.
 *
 * Z-order (lowest first):
 *   relationships-hit       — transparent 14px click target
 *   relationships-solid     — solid types
 *   relationships-dashed    — [8,5] dashed types
 *   relationships-dotted    — [0.1,4] dotted types
 *   relationships-tense     — [5,5] antagonistic types
 *   relationships-dashdot   — [10,4,1.5,4] succession/temporal types
 *   relationships-arrow     — directed arrowhead symbol
 *   relationship-studs-ring — white-fill ring (casing)
 *   relationship-studs-dot  — ink dot (inner pin)
 */
export function addRelationshipsLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  build: RelationshipsBuild,
  theme: string,
  year: number,
  visible: boolean,
): void {
  if (map.getSource(RELATIONSHIPS_SOURCE_ID)) return;

  const colorExpr  = buildRelationshipColorExpression(theme);
  const timeFilter = buildRelationshipsTimeFilter(year);
  const visibility = visible ? 'visible' : 'none';
  const ink        = studInkColor(theme);

  // Common width: 1px (zoom 2) → 3px (zoom 12) per spec.
  const lineWidth = [
    'interpolate', ['linear'], ['zoom'],
    2, 1.0,
    5, 1.8,
    8, 2.4,
    12, 3.0,
  ];

  // ── Arc source ────────────────────────────────────────────────────────────
  map.addSource(RELATIONSHIPS_SOURCE_ID, { type: 'geojson', data: build.arcs, generateId: true });

  // Bucket filters: time conditions AND type membership in one flat 'all'.
  // Do NOT nest timeFilter (itself an ['all',...]) as a child of another 'all' —
  // MapLibre's filter parser treats the outer 'all' in legacy mode where each child
  // must be a [op, key, val] triple; a nested ['all',...] containing coalesce
  // expressions fails silently and drops all features except the lucky few that
  // happen to match through another path. Flatten the time conditions instead.
  const [timeCondA, timeCondB] = [timeFilter[1], timeFilter[2]];
  const kindFilter = (types: readonly string[]) => [
    'all',
    timeCondA,
    timeCondB,
    ['match', ['get', 'type'], [...types], true, false],
  ];

  // ── Hit layer ─────────────────────────────────────────────────────────────
  map.addLayer({
    id: RELATIONSHIPS_HIT_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: timeFilter,
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#000000', 'line-width': 14, 'line-opacity': 0 },
  });

  // ── Solid — formal bonds ──────────────────────────────────────────────────
  map.addLayer({
    id: RELATIONSHIPS_SOLID_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: kindFilter(SOLID_TYPES),
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colorExpr, 'line-width': lineWidth, 'line-opacity': 0.7 },
  });

  // ── Dashed [8, 5] — flow / soft directional ties ──────────────────────────
  map.addLayer({
    id: RELATIONSHIPS_DASHED_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: kindFilter(DASHED_TYPES),
    layout: { visibility, 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [8, 5],
      'line-opacity': 0.7,
    },
  });

  // ── Dotted [0.1, 4] — soft / cultural ties ────────────────────────────────
  map.addLayer({
    id: RELATIONSHIPS_DOTTED_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: kindFilter(DOTTED_TYPES),
    layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [0.1, 4],
      'line-opacity': 0.7,
    },
  });

  // ── Tense [5, 5] — antagonistic / rivalry ────────────────────────────────
  map.addLayer({
    id: RELATIONSHIPS_TENSE_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: kindFilter(TENSE_TYPES),
    layout: { visibility, 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [5, 5],
      'line-opacity': 0.7,
    },
  });

  // ── Dash-dot [10, 4, 1.5, 4] — succession / temporal ─────────────────────
  map.addLayer({
    id: RELATIONSHIPS_DASHDOT_ID,
    type: 'line',
    source: RELATIONSHIPS_SOURCE_ID,
    filter: kindFilter(DASHDOT_TYPES),
    layout: { visibility, 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colorExpr,
      'line-width': lineWidth,
      'line-dasharray': [10, 4, 1.5, 4],
      'line-opacity': 0.7,
    },
  });

  // ── Arrow source — one terminus point per directed arc ────────────────────
  // Each feature carries `bearing` (arc heading, deg cw from map-north) so the
  // glyph can be rotated to point along the line at the `to` endpoint.
  map.addSource(RELATIONSHIP_ARROWS_SOURCE_ID, { type: 'geojson', data: build.arrows, promoteId: 'id' });

  // ── Arrow — directed types (glyph pinned at the terminus, rotated along arc) ─
  // Filled-triangle text glyph placed as a POINT symbol at the `to` endpoint.
  // The ▶ glyph points east by default; `text-rotate = bearing - 90` (with
  // text-rotation-alignment: 'map') turns it to follow the arc toward the
  // terminus. allow-overlap keeps it drawn on top of the destination stud.
  map.addLayer({
    id: RELATIONSHIPS_ARROW_ID,
    type: 'symbol',
    source: RELATIONSHIP_ARROWS_SOURCE_ID,
    filter: buildRelationshipsTimeFilter(year),
    layout: {
      visibility,
      'symbol-placement': 'point',
      'text-field': '▶',
      'text-font': ['Noto Sans Regular'],
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        2, 7,
        6, 10,
        10, 13,
      ],
      'text-rotate': ['-', ['get', 'bearing'], 90],
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': colorExpr,
      'text-opacity': 0.85,
      'text-halo-color': 'rgba(255,255,255,0.6)',
      'text-halo-width': 1,
    },
  });

  // ── Stud source ───────────────────────────────────────────────────────────
  map.addSource(RELATIONSHIP_STUDS_SOURCE_ID, { type: 'geojson', data: build.studs, promoteId: 'id' });

  const studTimeFilter = buildRelationshipsTimeFilter(year);

  // Ring — white-fill outer disc per LINES.md spec (white ring + ink dot).
  map.addLayer({
    id: RELATIONSHIP_STUDS_RING_ID,
    type: 'circle',
    source: RELATIONSHIP_STUDS_SOURCE_ID,
    filter: studTimeFilter,
    layout: { visibility },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2, 5.0,
        5, 6.5,
        8, 8.5,
        12, 11.0,
      ],
      // White fill with ink stroke = white-fill ring per spec.
      'circle-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ink,
      'circle-stroke-opacity': 1,
      'circle-opacity': 1,
    },
  });

  // Dot — ink inner pin.
  map.addLayer({
    id: RELATIONSHIP_STUDS_DOT_ID,
    type: 'circle',
    source: RELATIONSHIP_STUDS_SOURCE_ID,
    filter: studTimeFilter,
    layout: { visibility },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        2, 2.5,
        5, 3.5,
        8, 4.5,
        12, 6.0,
      ],
      'circle-color': ink,
      'circle-opacity': 1,
    },
  });
}

// ── Live update helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setRelationshipsTimeFilter(map: any, year: number): void {
  const filter = buildRelationshipsTimeFilter(year);
  // Flatten time conditions — same reason as addRelationshipsLayer: nesting
  // ['all',...] as a child of another 'all' triggers legacy filter mode.
  const [condA, condB] = [filter[1], filter[2]];
  const kindFilter = (types: readonly string[]) => [
    'all', condA, condB, ['match', ['get', 'type'], [...types], true, false],
  ];

  // layerExists (not layerReady): setFilter must run during scrub even while a
  // heavy source keeps isStyleLoaded() false. See mapGuards.layerExists.
  if (layerExists(map, RELATIONSHIPS_HIT_ID))     map.setFilter(RELATIONSHIPS_HIT_ID,     filter);
  if (layerExists(map, RELATIONSHIPS_SOLID_ID))   map.setFilter(RELATIONSHIPS_SOLID_ID,   kindFilter(SOLID_TYPES));
  if (layerExists(map, RELATIONSHIPS_DASHED_ID))  map.setFilter(RELATIONSHIPS_DASHED_ID,  kindFilter(DASHED_TYPES));
  if (layerExists(map, RELATIONSHIPS_DOTTED_ID))  map.setFilter(RELATIONSHIPS_DOTTED_ID,  kindFilter(DOTTED_TYPES));
  if (layerExists(map, RELATIONSHIPS_TENSE_ID))   map.setFilter(RELATIONSHIPS_TENSE_ID,   kindFilter(TENSE_TYPES));
  if (layerExists(map, RELATIONSHIPS_DASHDOT_ID)) map.setFilter(RELATIONSHIPS_DASHDOT_ID, kindFilter(DASHDOT_TYPES));
  // Arrow layer is on the arrows source (terminus points only) — plain time filter.
  if (layerExists(map, RELATIONSHIPS_ARROW_ID))   map.setFilter(RELATIONSHIPS_ARROW_ID,   filter);
  if (layerExists(map, RELATIONSHIP_STUDS_RING_ID)) map.setFilter(RELATIONSHIP_STUDS_RING_ID, filter);
  if (layerExists(map, RELATIONSHIP_STUDS_DOT_ID))  map.setFilter(RELATIONSHIP_STUDS_DOT_ID,  filter);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setRelationshipsVisibility(map: any, visible: boolean): void {
  const vis = visible ? 'visible' : 'none';
  for (const id of ALL_LAYER_IDS) {
    if (layerExists(map, id)) map.setLayoutProperty(id, 'visibility', vis);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setRelationshipsOpacity(map: any, opacity: number): void {
  const o = Math.max(0, Math.min(1, opacity));
  for (const id of [
    RELATIONSHIPS_SOLID_ID, RELATIONSHIPS_DASHED_ID, RELATIONSHIPS_DOTTED_ID,
    RELATIONSHIPS_TENSE_ID, RELATIONSHIPS_DASHDOT_ID,
  ] as const) {
    if (layerReady(map, id)) map.setPaintProperty(id, 'line-opacity', 0.7 * o);
  }
  if (layerReady(map, RELATIONSHIPS_ARROW_ID)) {
    map.setPaintProperty(RELATIONSHIPS_ARROW_ID, 'text-opacity', 0.8 * o);
  }
  // Studs: ring opacity fades but casing fill stays opaque so the pin punches
  // cleanly through any arc crossing beneath it.
  if (layerReady(map, RELATIONSHIP_STUDS_RING_ID)) {
    map.setPaintProperty(RELATIONSHIP_STUDS_RING_ID, 'circle-stroke-opacity', o);
    map.setPaintProperty(RELATIONSHIP_STUDS_RING_ID, 'circle-opacity', o);
  }
  if (layerReady(map, RELATIONSHIP_STUDS_DOT_ID)) {
    map.setPaintProperty(RELATIONSHIP_STUDS_DOT_ID, 'circle-opacity', o);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setRelationshipsColors(map: any, theme: string): void {
  const colorExpr = buildRelationshipColorExpression(theme);
  const ink       = studInkColor(theme);

  for (const id of [
    RELATIONSHIPS_SOLID_ID, RELATIONSHIPS_DASHED_ID, RELATIONSHIPS_DOTTED_ID,
    RELATIONSHIPS_TENSE_ID, RELATIONSHIPS_DASHDOT_ID,
  ] as const) {
    if (layerReady(map, id)) map.setPaintProperty(id, 'line-color', colorExpr);
  }
  if (layerReady(map, RELATIONSHIPS_ARROW_ID)) {
    map.setPaintProperty(RELATIONSHIPS_ARROW_ID, 'text-color', colorExpr);
  }
  if (layerReady(map, RELATIONSHIP_STUDS_RING_ID)) {
    map.setPaintProperty(RELATIONSHIP_STUDS_RING_ID, 'circle-stroke-color', ink);
    // Keep circle-color white (spec: white-fill ring).
  }
  if (layerReady(map, RELATIONSHIP_STUDS_DOT_ID)) {
    map.setPaintProperty(RELATIONSHIP_STUDS_DOT_ID, 'circle-color', ink);
  }
}
