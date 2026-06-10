/**
 * assetUrl.ts — resolve a runtime-fetched asset path against the deploy base.
 *
 * The app fetches baked artifacts (data, index, geo, glyphs, fonts) by absolute
 * path, e.g. `/data/records/polity.json`. When the site is served from a subpath
 * (GitHub Pages project sites live at `/<repo>/`), a bare `/data/...` resolves to
 * the domain root and 404s. Vite injects the configured base as
 * `import.meta.env.BASE_URL` (always begins and ends with `/`, e.g. `/InvaderGIS/`
 * in production, `/` in dev), so prefixing it makes every asset URL correct in
 * both dev and on Pages.
 *
 * Usage: `fetch(assetUrl('/data/manifest.json'))`.
 */

/** Base path the app is served from (e.g. "/" in dev, "/InvaderGIS/" on Pages). */
const BASE = import.meta.env.BASE_URL || '/';

/**
 * Prefix a root-absolute asset path with the deploy base.
 * @param path - A path beginning with "/" (e.g. "/data/records/polity.json").
 * @returns The base-aware URL ("/InvaderGIS/data/records/polity.json" on Pages).
 */
export function assetUrl(path: string): string {
  // Strip the leading slash so we don't double it against BASE's trailing slash.
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE}${clean}`;
}
