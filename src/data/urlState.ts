/**
 * urlState.ts — shareable deep-link view state in the URL hash.
 *
 * InvaderGIS is a static SPA with no server, so view state (active year, theme,
 * map style, projection, and the pinned record) is serialized into the URL HASH
 * — `#year=1066&theme=atlas&map=relief&proj=mercator&sel=kingdom_of_england:polity`.
 * The hash (not the query) is used so a purely static host never has to route it
 * and a stray copy/paste of the link round-trips without a server rewrite.
 *
 * Reuses the CapturedState shape + applyCapturedState() from savedViewsStore so a
 * shared link hydrates through the exact same frozen-store actions as Saved Views.
 * Layer visibility/opacity is intentionally NOT round-tripped through the URL
 * (it would bloat the link and is better served by Saved Views); only the compact,
 * high-signal view fields go in the URL.
 *
 * Coexists with the existing footnote deep-link (`#page=sources&item=<id>`): that
 * is handled separately in AppShell; this codec only reads/writes the view keys
 * below and ignores unknown keys.
 */

import type { CapturedState } from '@/stores/savedViewsStore';
import type { ThemeId, MapType, Projection } from '@/stores/settingsStore';

/** The compact subset of CapturedState we round-trip through the URL hash. */
export interface UrlViewState {
  year: number;
  theme: ThemeId;
  mapType: MapType;
  projection: Projection;
  selectedId: string | null;
  selectedType: string | null;
}

const THEMES: ReadonlySet<string> = new Set(['atlas', 'manuscript', 'dark', 'contrast']);
const MAP_TYPES: ReadonlySet<string> = new Set(['parchment', 'plain', 'relief']);
const PROJECTIONS: ReadonlySet<string> = new Set(['mercator', 'globe']);

/** Reserved hash keys owned by OTHER readers (footnote deep-link) — left untouched. */
const FOREIGN_KEYS: ReadonlySet<string> = new Set(['page', 'item']);

/**
 * Encode a view state into a hash string (no leading '#').
 * Omits the selection keys when nothing is pinned, keeping shared links tidy.
 */
export function encodeViewToHash(view: UrlViewState): string {
  const p = new URLSearchParams();
  p.set('year', String(Math.round(view.year)));
  p.set('theme', view.theme);
  p.set('map', view.mapType);
  p.set('proj', view.projection);
  if (view.selectedId && view.selectedType) {
    // id:type — ids are slugs (no colon), so a single colon split is unambiguous.
    p.set('sel', `${view.selectedId}:${view.selectedType}`);
  }
  return p.toString();
}

/**
 * Parse a hash string (with or without leading '#') into a partial view state.
 * Returns only the keys that are present AND valid — invalid enum values are
 * dropped rather than trusted, so a hand-edited link can never inject bad state.
 * Returns null when no recognized view key is present.
 */
export function decodeHashToView(hash: string): Partial<UrlViewState> | null {
  const raw = hash.replace(/^#/, '');
  if (raw.length === 0) return null;
  const p = new URLSearchParams(raw);

  // If the hash only carries foreign keys (the sources footnote link), ignore it.
  const hasViewKey = ['year', 'theme', 'map', 'proj', 'sel'].some((k) => p.has(k));
  if (!hasViewKey) return null;

  const out: Partial<UrlViewState> = {};

  const yearRaw = p.get('year');
  if (yearRaw !== null) {
    const y = Number(yearRaw);
    if (Number.isFinite(y)) out.year = Math.round(y);
  }

  const theme = p.get('theme');
  if (theme && THEMES.has(theme)) out.theme = theme as ThemeId;

  const map = p.get('map');
  if (map && MAP_TYPES.has(map)) out.mapType = map as MapType;

  const proj = p.get('proj');
  if (proj && PROJECTIONS.has(proj)) out.projection = proj as Projection;

  const sel = p.get('sel');
  if (sel) {
    const idx = sel.lastIndexOf(':');
    if (idx > 0 && idx < sel.length - 1) {
      out.selectedId = sel.slice(0, idx);
      out.selectedType = sel.slice(idx + 1);
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Merge a decoded partial view onto a full CapturedState (from captureCurrentState()),
 * producing a CapturedState ready for applyCapturedState(). Fields absent from the
 * URL keep their current value; layers are always taken from `base` (never URL).
 */
export function mergeViewIntoCaptured(
  base: CapturedState,
  view: Partial<UrlViewState>,
): CapturedState {
  return {
    ...base,
    year: view.year ?? base.year,
    theme: view.theme ?? base.theme,
    mapType: view.mapType ?? base.mapType,
    projection: view.projection ?? base.projection,
    selectedId: 'selectedId' in view ? (view.selectedId ?? null) : base.selectedId,
    selectedType: 'selectedType' in view ? (view.selectedType ?? null) : base.selectedType,
  };
}

/**
 * Build the next full hash given a fresh view-state encoding, PRESERVING any
 * foreign keys (page/item) that another reader owns. Used when writing state back
 * so we never clobber an in-flight sources deep-link.
 */
export function composeHash(existingHash: string, view: UrlViewState): string {
  const existing = new URLSearchParams(existingHash.replace(/^#/, ''));
  const next = new URLSearchParams(encodeViewToHash(view));
  for (const k of FOREIGN_KEYS) {
    const v = existing.get(k);
    if (v !== null) next.set(k, v);
  }
  return next.toString();
}
