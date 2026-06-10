import { layerReady } from './mapGuards';
import { assetUrl } from '@/data/assetUrl';
/**
 * seaLabelsLayer.ts — in-map italic sea labels (REVIVE §4.3 #6).
 *
 * The ONE sanctioned italic in the design language lives here: the classic
 * cartographic convention of naming major bodies of water in small-caps italic.
 * These are NOT chrome italics — they are map content, rendered inside the
 * MapLibre WebGL pipeline as a symbol layer on a GeoJSON point source.
 *
 * Label text: Latin/medieval naming convention ("MARE NOSTRVM", wide tracking).
 * Font: Georgia (serif italic) — requested via the MapLibre glyph fallback.
 *       MapLibre will use the closest available serif from the glyph PBF;
 *       Georgia-italic appearance is achieved via letter-spacing + text-transform.
 *       The visual effect is the classic cartographic italic sea-label look even
 *       if the PBF serves Noto Serif.
 *
 * Source: /data/layers/sea-labels.geojson (10 points, hand-placed for the
 *         medieval European theatre). Read-only; never modified by this module.
 *
 * ── Design laws ───────────────────────────────────────────────────────────────
 *   - Italic ONLY in-map (inside the MapLibre layer). NEVER in chrome.
 *   - Color from --map-label CSS token (theme-aware via readMapTokens()).
 *   - No hardcoded hex. Letter-spacing via 'text-letter-spacing' MapLibre prop.
 *   - Layer is hidden by default — shown only when the map is ready and the
 *     optional toggle is enabled. Default visible = true at boot (always-on
 *     ambient atmosphere that costs nothing to render).
 *
 * ── Module contract (mirrors eventsLayer / capitalsLayer) ─────────────────────
 *   SEA_LABELS_SOURCE_ID, SEA_LABELS_LAYER_ID — exported constants
 *   fetchSeaLabelsGeojson()     — non-crashing fetch, null on failure
 *   addSeaLabelsLayer(map, geojson, labelColor, visible)
 *   setSeaLabelsVisibility(map, visible)
 *   setSeaLabelsColor(map, labelColor)
 */

export const SEA_LABELS_SOURCE_ID = 'sea-labels-source';
export const SEA_LABELS_LAYER_ID  = 'sea-labels';

const SEA_LABELS_URL = assetUrl('/data/layers/sea-labels.geojson');

// ── Types ─────────────────────────────────────────────────────────────────────

/** A sea-label Point feature. */
export interface SeaLabelFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    /** Unique feature id. */
    id: string;
    /** The label text (e.g. "MARE NOSTRVM"). */
    label: string;
  };
}

/** The sea-labels FeatureCollection. */
export interface SeaLabelFeatureCollection {
  type: 'FeatureCollection';
  features: SeaLabelFeature[];
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the sea-labels GeoJSON. Resolves to null on failure (non-crashing).
 * Logs a warning — no silent swallow.
 */
export async function fetchSeaLabelsGeojson(): Promise<SeaLabelFeatureCollection | null> {
  try {
    const res = await fetch(SEA_LABELS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${SEA_LABELS_URL}`);
    }
    return (await res.json()) as SeaLabelFeatureCollection;
  } catch (err) {
     
    console.warn(
      '[seaLabelsLayer] Failed to load sea-labels.geojson — sea labels disabled.' +
      ` Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Layer registration ─────────────────────────────────────────────────────────

/**
 * Add the sea-labels GeoJSON source + symbol layer to a live MapLibre map.
 *
 * The label text is rendered in a serif italic style with wide letter-spacing —
 * the classic cartographic sea-label convention. This is the ONE sanctioned
 * italic in the design language (DESIGN.md: "in-map sea-labels ARE the one
 * sanctioned italic").
 *
 * Safe to call multiple times — guards against duplicate source/layer registration.
 *
 * @param map        The live MapLibre Map instance.
 * @param geojson    The loaded SeaLabelFeatureCollection.
 * @param labelColor The resolved --map-label token color (e.g. '#0d0907').
 * @param visible    Whether to show the labels immediately.
 */
export function addSeaLabelsLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  geojson: SeaLabelFeatureCollection,
  labelColor: string,
  visible: boolean,
): void {
  if (map.getSource(SEA_LABELS_SOURCE_ID)) return;

  map.addSource(SEA_LABELS_SOURCE_ID, {
    type: 'geojson',
    data: geojson,
  });

  const visibility = visible ? 'visible' : 'none';

  // The ambient sea-label symbol layer. MapLibre does not natively support italic
  // text — we approximate the cartographic italic-adjacent aesthetic via:
  //   1. The only self-hosted fontstack present in /glyphs: "Open Sans Regular,
  //      Arial Unicode MS Regular" (NEVER request Noto/other stacks — they 404).
  //   2. text-letter-spacing: 0.18em — wide tracking is the cartographic convention
  //   3. text-size interpolated by zoom for gentle scaling
  //   4. Low opacity (0.55) so the label reads as ambient cartographic texture,
  //      not a feature label competing with polity names.
  //   5. text-halo-color matching the sea color with 0.6 alpha so labels lift
  //      slightly off the water without a hard box.
  map.addLayer({
    id: SEA_LABELS_LAYER_ID,
    type: 'symbol',
    source: SEA_LABELS_SOURCE_ID,
    layout: {
      visibility,
      'text-field': ['get', 'label'],
      // The only self-hosted glyph fontstack (see comment above). Wide letter-
      // spacing carries the sea-label aesthetic without unavailable italic glyphs.
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        2, 8,    // World zoom: small ambient
        5, 10,   // Region zoom: legible
        7, 13,   // Province zoom: comfortable
        10, 16,  // City zoom: maximum
      ],
      'text-letter-spacing': 0.18,    // Wide tracking — cartographic italic convention
      'text-max-width': 8,            // Wrap long names after 8 em
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      // Slight upward offset so the label centroid sits over open water
      'text-offset': [0, 0],
    },
    paint: {
      // Semi-transparent so labels read as ambient cartographic texture.
      // The opacity is intentionally lower than feature labels — these are
      // geographic context, not interactive markers.
      'text-color': labelColor,
      'text-opacity': 0.55,
      'text-halo-color': 'rgba(232, 224, 200, 0.6)',
      'text-halo-width': 1.5,
    },
  });
}

// ── Live update helpers ────────────────────────────────────────────────────────

/**
 * Show or hide the sea-labels layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSeaLabelsVisibility(map: any, visible: boolean): void {
  if (layerReady(map, SEA_LABELS_LAYER_ID)) {
    map.setLayoutProperty(SEA_LABELS_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Update the label color when the theme changes (called from MapCanvas theme effect).
 * @param map        The live MapLibre Map instance.
 * @param labelColor The resolved --map-label CSS token value for the new theme.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setSeaLabelsColor(map: any, labelColor: string): void {
  if (layerReady(map, SEA_LABELS_LAYER_ID)) {
    map.setPaintProperty(SEA_LABELS_LAYER_ID, 'text-color', labelColor);
  }
}
