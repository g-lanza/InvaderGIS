import { describe, it, expect } from 'vitest';
import { formatYear, formatYearSpan } from './formatYear';

describe('formatYear', () => {
  it('renders a non-negative year bare by default', () => {
    expect(formatYear(1066)).toBe('1066');
    expect(formatYear('800')).toBe('800');
  });

  it('renders negative years as BCE (never mislabeled CE — the old bug)', () => {
    expect(formatYear(-44)).toBe('44 BCE');
    expect(formatYear('-100')).toBe('100 BCE');
  });

  it('appends CE only with withEra, and never to negatives', () => {
    expect(formatYear(1066, { withEra: true })).toBe('1066 CE');
    expect(formatYear(-44, { withEra: true })).toBe('44 BCE');
  });

  it('renders the empty marker for nullish/empty/non-numeric input', () => {
    expect(formatYear(null)).toBe('—');
    expect(formatYear(undefined)).toBe('—');
    expect(formatYear('')).toBe('—');
    expect(formatYear('not a year')).toBe('—');
    expect(formatYear(NaN)).toBe('—');
  });

  it('respects a custom empty marker', () => {
    expect(formatYear(null, { empty: 'n/a' })).toBe('n/a');
  });

  it('truncates fractional years', () => {
    expect(formatYear(1066.9)).toBe('1066');
  });
});

describe('formatYearSpan', () => {
  it('formats a closed span', () => {
    expect(formatYearSpan(750, 1258)).toBe('750–1258');
  });

  it('renders an open end as present', () => {
    expect(formatYearSpan(927, null)).toBe('927–present');
  });

  it('returns the empty marker when the start is missing', () => {
    expect(formatYearSpan(null, 1258)).toBe('—');
  });
});
