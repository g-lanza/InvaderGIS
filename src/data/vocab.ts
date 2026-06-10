/**
 * data/vocab.ts — the active-dataset vocabulary RESOLVER (Phase G1).
 *
 * This is the seam that turns vocab-as-data back into the lookup API the app
 * already expects. It loads the active dataset's VocabBundle (currently the
 * single medieval bundle from data/vocab/medieval.json) and exposes selectors
 * that replicate the old hardcoded `tokens.ts` API — so map/charts/legend
 * consumers barely change while gaining dataset-awareness.
 *
 * Theme mechanics stay in design/tokens.ts: this module calls `domainColor()`
 * for the dark-theme lighten transform rather than duplicating it. Colors here
 * encode DATA MEANING and are theme-constant; only domainColor() lightens them.
 *
 * When multiple datasets exist (post-G2), `setActiveVocab()` swaps the bundle;
 * until then the medieval bundle is the default and only active vocabulary.
 */
import medievalVocab from '../../data/vocab/medieval.json';
import type { VocabBundle, VocabEntry } from '@/types/vocab';
import { domainColor } from '@/design/tokens';

/** The medieval bundle, typed. This is dataset #1's vocabulary. */
const MEDIEVAL_VOCAB = medievalVocab as VocabBundle;

/** The currently active vocabulary bundle. Defaults to the medieval dataset. */
let active: VocabBundle = MEDIEVAL_VOCAB;

/** Return the active dataset's full vocabulary bundle. */
export function activeVocab(): VocabBundle {
  return active;
}

/**
 * Swap the active vocabulary bundle (used when a different dataset loads).
 * Reserved for post-G2 multi-dataset support; the Frame uses the default.
 */
export function setActiveVocab(bundle: VocabBundle): void {
  active = bundle;
}

/** Look up a category entry by id, or undefined if not in the active bundle. */
export function categoryEntry(categoryId: string): VocabEntry | undefined {
  return active.categories.find((c) => c.id === categoryId);
}

/**
 * Resolve a raw event subtype to its category id.
 * Mirrors the old `SUBTYPE_TO_CATEGORY[type] ?? 'power'` contract, but the
 * fallback now comes from the dataset (`fallbackCategory`) rather than a constant.
 */
export function categoryFor(eventType: string): string {
  return active.subtypeToCategory[eventType] ?? active.fallbackCategory;
}

/**
 * Color for a category id, lightened for dark theme via domainColor().
 * Unknown category → the fallback category's color (never a fabricated hue).
 */
export function categoryColor(categoryId: string, theme: string): string {
  const entry = categoryEntry(categoryId) ?? categoryEntry(active.fallbackCategory);
  const hex = entry?.color ?? '#4a4a52'; // institution grey as last-resort neutral
  return domainColor(hex, theme);
}

/**
 * Resolve the color for a raw event subtype in one step
 * (subtype → category → color), lightened for dark theme.
 */
export function eventTypeColor(eventType: string, theme: string): string {
  return categoryColor(categoryFor(eventType), theme);
}

/**
 * Glyph mark for a raw event subtype: a subtype-specific override if present,
 * otherwise the category default glyph, otherwise undefined (caller falls back
 * to the visible ring — never a fake mark, per DESIGN.md).
 */
export function glyphFor(eventType: string): string | undefined {
  return active.subtypeGlyphs?.[eventType] ?? categoryEntry(categoryFor(eventType))?.glyph;
}

/** Region tint by key, lightened for dark theme. Unknown key → undefined. */
export function regionColor(regionKey: string, theme: string): string | undefined {
  const hex = active.regions[regionKey];
  return hex ? domainColor(hex, theme) : undefined;
}

/** Relationship type color by key, lightened for dark theme. Unknown → undefined. */
export function relationshipColor(typeKey: string, theme: string): string | undefined {
  const hex = active.relationships[typeKey];
  return hex ? domainColor(hex, theme) : undefined;
}

/** Journey kind color by key, lightened for dark theme. Unknown → undefined. */
export function journeyColor(kindKey: string, theme: string): string | undefined {
  const hex = active.journeys?.[kindKey];
  return hex ? domainColor(hex, theme) : undefined;
}
