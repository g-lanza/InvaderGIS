/**
 * registerRowUtils — shared cell-formatting + sort helpers for the register views.
 *
 * Extracted from AttributeTable so the table and the GalleryGrid format and sort
 * records identically (one implementation, no drift). Both views read columns
 * from a RegisterSchema (registerSchemas.ts) and render the same RawRecord set.
 *
 * Pure functions — no React, no stores. Safe to import from anywhere.
 */
import type { RawRecord } from '@/data/loaders';
import type { RegisterColumn } from './registerSchemas';

/** Display a column value for a record; empty → "—". */
export function cell(col: RegisterColumn, record: RawRecord): string {
  const v = col.get(record);
  return v === '' ? '—' : v;
}

/**
 * Compare two records by a column. Numeric columns use the column's `num`
 * key (NaN sinks to the bottom in BOTH directions); text columns compare the
 * lower-cased display value.
 */
export function compare(a: RawRecord, b: RawRecord, col: RegisterColumn): number {
  if (col.kind === 'num' && col.num) {
    const an = col.num(a);
    const bn = col.num(b);
    const aNan = isNaN(an);
    const bNan = isNaN(bn);
    if (aNan && bNan) return 0;
    if (aNan) return 1; // missing always sinks
    if (bNan) return -1;
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  const av = col.get(a).toLowerCase();
  const bv = col.get(b).toLowerCase();
  return av < bv ? -1 : av > bv ? 1 : 0;
}
