/**
 * settingsStore — FROZEN INTERFACE (docs/00 §1, docs/01 §2.2).
 *
 * Owns the active theme, map base style, projection, and language. Switching
 * theme/map-type/projection live is a REQUIRED feature. The
 * design-system agent builds the Settings panel against this store; the
 * the map-rendering module supplies the base styles + projections. Adding a theme
 * or map type must touch only atlas-tokens.css + the Settings entry (and BASE_STYLES
 * for a map type) — never this shape.
 */
import { create } from 'zustand';

/** The four themes (DESIGN.md). Theme id maps to `<html data-theme>`. */
export type ThemeId = 'atlas' | 'manuscript' | 'dark' | 'contrast';

/** Map base styles — extended by map-rendering via BASE_STYLES. */
export type MapType = 'parchment' | 'plain' | 'relief';

/** Map projections — globe and flat to start; extended behind a setting. */
export type Projection = 'mercator' | 'globe';

export const THEMES: ThemeId[] = ['atlas', 'manuscript', 'dark', 'contrast'];

export interface SettingsState {
  theme: ThemeId;
  mapType: MapType;
  projection: Projection;
  /** BCP-47 language tag; UI is English-first, structured for i18n later. */
  language: string;
  setTheme: (theme: ThemeId) => void;
  setMapType: (mapType: MapType) => void;
  setProjection: (projection: Projection) => void;
  setLanguage: (language: string) => void;
}

/**
 * Apply a theme to the document root by setting `<html data-theme>`.
 * Pure side-effect on the DOM; called by setTheme and once at boot. Guarded for
 * non-DOM (test) environments.
 */
export function applyTheme(theme: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  // Defaults: Contrast theme + Relief map type (product decision, 2026-05-31).
  theme: 'contrast',
  mapType: 'relief',
  projection: 'mercator',
  language: 'en',
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  setMapType: (mapType) => set({ mapType }),
  setProjection: (projection) => set({ projection }),
  setLanguage: (language) => set({ language }),
}));
