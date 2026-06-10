/**
 * formatYear.ts — the single canonical year formatter.
 *
 * Consolidates 10 divergent hand-rolled `fmtYear` copies that had three different
 * behaviors (BCE suffix vs a hardcoded " CE" that mislabeled negative years vs a
 * bare minus sign). One correct implementation, used everywhere.
 *
 * Convention: the dataset window is 500–1500 CE, but the formatter is correct for
 * any year. Negative years are rendered as "<n> BCE"; non-negative years are bare
 * (optionally suffixed " CE"). Nullish / non-numeric input renders an em dash.
 */

/** Options for {@link formatYear}. */
export interface FormatYearOptions {
  /** Append " CE" to non-negative years (e.g. "1066 CE"). Default false. */
  withEra?: boolean;
  /** String shown for null/undefined/empty/non-numeric input. Default "—". */
  empty?: string;
}

/**
 * Format a year value for display.
 *
 * @param value - A year as number or numeric string; null/undefined/'' → empty.
 * @returns "<n> BCE" for negatives, "<n>"/"<n> CE" otherwise, or the empty marker.
 */
export function formatYear(value: unknown, opts: FormatYearOptions = {}): string {
  const empty = opts.empty ?? '—';
  if (value === null || value === undefined || value === '') return empty;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return empty;
  const y = Math.trunc(n);
  if (y < 0) return `${Math.abs(y)} BCE`;
  return opts.withEra ? `${y} CE` : `${y}`;
}

/**
 * Format a formed…dissolved (or start…end) span. An open end renders "present".
 *
 * @param start - Start year (number or coercible); nullish → empty marker.
 * @param end   - End year; null/undefined → open-ended ("…–present").
 */
export function formatYearSpan(
  start: unknown,
  end: unknown,
  opts: FormatYearOptions = {},
): string {
  const empty = opts.empty ?? '—';
  const s = formatYear(start, opts);
  if (s === empty) return empty;
  const e = end === null || end === undefined || end === '' ? 'present' : formatYear(end, opts);
  return `${s}–${e}`;
}
