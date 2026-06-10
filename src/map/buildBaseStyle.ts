/**
 * buildBaseStyle.ts — constructs a MapLibre style object with real base geography.
 *
 * Ported from public/map-style/parchment.json (the quarry reference base style).
 * Sources: Natural Earth 50m land/lakes/rivers/glaciers, all self-hosted under /geo/.
 * Layers (bottom→top): ocean (background), land-fill, land-outline, glaciers, lakes, rivers.
 *
 * Polity polygons and all other dataset layers are added above these base layers by
 * MapCanvas/useMapLifecycle — they always sit above 'rivers' so they are visible over land.
 *
 * Glyphs: self-hosted PBF under /glyphs/{fontstack}/{range}.pbf
 *   Available fontstack: "Open Sans Regular,Arial Unicode MS Regular"
 *   Do NOT request Noto or other stacks — they are not present in the PBF tree.
 *
 * Theme reactivity: initial colors are set from tokens at boot. MapCanvas.tsx repaint
 * effects handle live updates via setPaintProperty on theme/mapType change.
 *
 * The version field must be 8 (MapLibre GL spec).
 */

import type { MapTokens } from './mapTokens';
import { assetUrl } from '@/data/assetUrl';

/**
 * Returns a MapLibre StyleSpecification-compatible object with real base geography.
 * Sources and layers are ported from the parchment.json quarry style; colors are
 * driven by the active MapTokens so all four themes work from boot.
 *
 * Using `Record<string, unknown>` to avoid importing heavy MapLibre types at build time
 * (the module itself is dynamically imported in MapCanvas).
 *
 * @param tokens The resolved --map-* CSS tokens for the active theme.
 */
export function buildBaseStyle(tokens: MapTokens): Record<string, unknown> {
  return {
    version: 8,
    name: 'InvaderGIS Atlas',
    // Self-hosted PBF glyphs. The available fontstack is:
    //   "Open Sans Regular,Arial Unicode MS Regular"
    // Used by sea-labels and any other text layers.
    glyphs: assetUrl('/glyphs/{fontstack}/{range}.pbf'),
    sources: {
      land: {
        type: 'geojson',
        data: assetUrl('/geo/ne_50m_land.geojson'),
        attribution: 'Natural Earth',
      },
      lakes: {
        type: 'geojson',
        data: assetUrl('/geo/ne_50m_lakes.geojson'),
      },
      rivers: {
        type: 'geojson',
        data: assetUrl('/geo/ne_50m_rivers.geojson'),
      },
      glaciers: {
        type: 'geojson',
        data: assetUrl('/geo/ne_50m_glaciers.geojson'),
      },
    },
    layers: [
      // ── Ocean background (sea color) ──────────────────────────────────────────
      // Named 'ocean' to match parchment.json; repainted on theme change.
      {
        id: 'ocean',
        type: 'background',
        paint: {
          'background-color': tokens.sea,
        },
      },
      // ── Land fill ─────────────────────────────────────────────────────────────
      // Base land polygon. Repainted to tokens.land on theme change.
      {
        id: 'land-fill',
        type: 'fill',
        source: 'land',
        paint: {
          'fill-color': tokens.land,
          'fill-opacity': 1.0,
        },
      },
      // ── Land outline ──────────────────────────────────────────────────────────
      // Hairline coastline / continent border. 0.5px at opacity 0.55 per DESIGN.md.
      // Repainted to tokens.graticule on theme change.
      {
        id: 'land-outline',
        type: 'line',
        source: 'land',
        paint: {
          'line-color': tokens.graticule,
          'line-width': 0.5,
          'line-opacity': 0.55,
        },
      },
      // ── Glaciers ──────────────────────────────────────────────────────────────
      // Subtle near-white fill — emphasized in 'relief' mapType, dimmed in 'plain'.
      {
        id: 'glaciers',
        type: 'fill',
        source: 'glaciers',
        paint: {
          'fill-color': '#ecebe4',
          'fill-opacity': 0.85,
        },
      },
      // ── Lakes ────────────────────────────────────────────────────────────────
      // Water bodies colored as sea. Repainted to tokens.sea on theme change.
      {
        id: 'lakes',
        type: 'fill',
        source: 'lakes',
        paint: {
          'fill-color': tokens.sea,
          'fill-opacity': 0.85,
        },
      },
      // ── Rivers ───────────────────────────────────────────────────────────────
      // Line layer; width interpolates with zoom. Repainted to tokens.graticule on
      // theme change. Hidden in 'plain' mapType.
      {
        id: 'rivers',
        type: 'line',
        source: 'rivers',
        paint: {
          'line-color': tokens.graticule,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.3,
            5, 0.7,
            8, 1.2,
          ],
          'line-opacity': 0.6,
        },
      },
      // Polity layers and all dataset layers are added HERE (above 'rivers')
      // by MapCanvas / useMapLifecycle via map.addLayer().
    ],
  };
}
