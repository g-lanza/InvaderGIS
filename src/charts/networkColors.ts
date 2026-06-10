/**
 * networkColors.ts — color helpers for the relationship network graph.
 *
 * Thin wrappers over `src/data/vocab.ts` so NetworkGraph.tsx and any future
 * chart have a single import for chart-specific color resolution.
 *
 * All hex values come from the active VocabBundle (vocab.ts → medieval.json)
 * and are lightened in dark theme by `domainColor()` inside vocab.ts.
 * We never hard-code a hex here — see DESIGN.md "never hard-code a hex".
 *
 * Fallback strategy: if a type key is unknown (relationship type not in the
 * vocab, region not in the active bundle), return the CSS variable
 * `var(--ink-mute)` so the graph renders a visible-but-neutral color rather
 * than crashing or silently dropping the element.
 */

import { regionColor, relationshipColor } from '@/data/vocab';

/** CSS fallback for unknown type/region keys — always visible in every theme. */
const FALLBACK = 'var(--ink-mute)';

/**
 * Resolve the fill color for a network graph node (polity).
 *
 * Uses `regionColor(regionKey, theme)` from vocab.ts. Returns the CSS
 * fallback if the region key is absent from the active vocabulary bundle.
 *
 * @param regionKey - The polity's region field value.
 * @param theme     - The active theme id from settingsStore.
 * @returns         - A hex color string or CSS variable fallback.
 */
export function nodeColor(regionKey: string, theme: string): string {
  return regionColor(regionKey, theme) ?? FALLBACK;
}

/**
 * Resolve the stroke color for a network graph edge (relationship).
 *
 * Uses `relationshipColor(typeKey, theme)` from vocab.ts. Returns the CSS
 * fallback if the relationship type is absent from the active vocabulary bundle.
 *
 * @param typeKey - The relationship's type field value.
 * @param theme   - The active theme id from settingsStore.
 * @returns       - A hex color string or CSS variable fallback.
 */
export function edgeColor(typeKey: string, theme: string): string {
  return relationshipColor(typeKey, theme) ?? FALLBACK;
}

/**
 * Compute the SVG stroke-dasharray for an edge.
 *
 * Ongoing relationships (until === null) use a dash pattern to signal they
 * extend beyond the dataset window. Terminated relationships are solid.
 *
 * @param until - The relationship's `until` field (null = ongoing).
 * @returns     - A CSS stroke-dasharray value or 'none'.
 */
export function edgeDashArray(until: number | null): string {
  return until === null ? '5,3' : 'none';
}

/**
 * Compute node radius from degree count.
 *
 * Minimum 4 px (isolated node), scales to ~16 px for the highest-degree node
 * in the dataset (byzantine_empire degree ≈ 30+). Clamped to [4, 18] px.
 *
 * @param degree - The number of relationships this polity participates in.
 * @returns      - Radius in SVG units (px at 1:1 viewport).
 */
export function nodeRadius(degree: number): number {
  return Math.min(18, Math.max(4, 4 + degree * 0.45));
}
