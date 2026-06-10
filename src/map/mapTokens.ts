/**
 * mapTokens.ts — reads the current --map-* CSS custom properties from the
 * document root and returns them as a typed object.
 *
 * Called by MapCanvas at mount time and on every theme change to keep the
 * MapLibre base style in sync with the active atlas-tokens.css values.
 * Using getComputedStyle ensures the values are always the live resolved
 * values — no hardcoding, no guessing.
 *
 * All four themes define these four tokens in atlas-tokens.css:
 *   --map-land      polygon / land fill
 *   --map-sea       background / sea fill
 *   --map-graticule graticule / border line color
 *   --map-label     label text color
 */

export interface MapTokens {
  land: string;
  sea: string;
  graticule: string;
  label: string;
}

/**
 * Read the four --map-* CSS tokens from the document root.
 * Returns sensible Atlas-theme fallbacks in non-DOM environments (tests).
 */
export function readMapTokens(): MapTokens {
  if (typeof document === 'undefined') {
    // Safe fallback for SSR / test environments.
    return {
      land: '#efe7d0',
      sea: '#e8e0c8',
      graticule: 'rgba(13, 9, 7, 0.14)',
      label: '#0d0907',
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    land: style.getPropertyValue('--map-land').trim() || '#efe7d0',
    sea: style.getPropertyValue('--map-sea').trim() || '#e8e0c8',
    graticule: style.getPropertyValue('--map-graticule').trim() || 'rgba(13, 9, 7, 0.14)',
    label: style.getPropertyValue('--map-label').trim() || '#0d0907',
  };
}
