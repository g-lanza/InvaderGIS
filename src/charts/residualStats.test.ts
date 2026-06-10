/**
 * Tests for residualStats — the "compared to what?" engine (audit finding #2).
 *
 * buildResidualMatrix() reads loadRecords('event'), so we mock the loader with a
 * small hand-built event set whose contingency table, expected values, Pearson
 * residuals, χ², and effect-ordering can all be computed by hand.
 *
 * Worked example (events × century, category × centuryStart):
 *
 *                 1000s   1100s   | row total
 *   violence        8       2     |   10
 *   culture         2       8     |   10
 *   ----------------------------------------
 *   col total      10      10     |   20 = grand total
 *
 *   expected_ij = row_i * col_j / total = 10*10/20 = 5 for every cell.
 *   residual = (obs - 5)/√5.  √5 ≈ 2.2360679…
 *     violence@1000s: (8-5)/√5 = +1.3416…   culture@1000s: (2-5)/√5 = -1.3416…
 *     violence@1100s: (2-5)/√5 = -1.3416…   culture@1100s: (8-5)/√5 = +1.3416…
 *   χ² = Σ residual² = 4 * (3²/5) = 4 * 1.8 = 7.2
 *   Effect order: violence peaks in 1000s, culture peaks in 1100s →
 *     rows ordered [violence, culture] (earlier peak first).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the loader BEFORE importing the module under test.
vi.mock('@/data/loaders', () => ({
  loadRecords: (kind: string) => (kind === 'event' ? MOCK_EVENTS : []),
}));

import { buildResidualMatrix, ordinalCentury } from './residualStats';
import type { FilterFacets } from '@/data/filterPredicate';

// 8 violence + 2 culture in the 1000s; 2 violence + 8 culture in the 1100s.
const MOCK_EVENTS = [
  ...mk(8, 'violence', 1050),
  ...mk(2, 'culture', 1050),
  ...mk(2, 'violence', 1150),
  ...mk(8, 'culture', 1150),
];

function mk(n: number, category: string, year: number) {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'event',
    dataset: 'test',
    id: `${category}_${year}_${i}`,
    category,
    year,
  }));
}

const ALL: FilterFacets = {
  yearRange: null,
  kinds: new Set(),
  regions: new Set(),
  confidence: new Set(),
  attestation: new Set(),
};

const SQRT5 = Math.sqrt(5);

describe('buildResidualMatrix — known-answer contingency table', () => {
  const m = buildResidualMatrix(ALL);

  it('counts the grand total', () => {
    expect(m.total).toBe(20);
  });

  it('produces two century columns in chronological order', () => {
    expect(m.centuries.map((c) => c.start)).toEqual([1000, 1100]);
  });

  it('computes observed counts per cell', () => {
    expect(m.cells.get('violence|1000')?.observed).toBe(8);
    expect(m.cells.get('violence|1100')?.observed).toBe(2);
    expect(m.cells.get('culture|1000')?.observed).toBe(2);
    expect(m.cells.get('culture|1100')?.observed).toBe(8);
  });

  it('computes expected = row*col/total = 5 for every cell', () => {
    for (const key of ['violence|1000', 'violence|1100', 'culture|1000', 'culture|1100']) {
      expect(m.cells.get(key)?.expected).toBeCloseTo(5, 10);
    }
  });

  it('computes signed Pearson residuals (over = +, under = −)', () => {
    expect(m.cells.get('violence|1000')?.residual).toBeCloseTo(3 / SQRT5, 10);
    expect(m.cells.get('violence|1100')?.residual).toBeCloseTo(-3 / SQRT5, 10);
    expect(m.cells.get('culture|1000')?.residual).toBeCloseTo(-3 / SQRT5, 10);
    expect(m.cells.get('culture|1100')?.residual).toBeCloseTo(3 / SQRT5, 10);
  });

  it('computes χ² = Σ residual² = 7.2', () => {
    expect(m.chiSquare).toBeCloseTo(7.2, 10);
  });

  it('effect-orders rows by peak century (earlier peak first)', () => {
    expect(m.categories).toEqual(['violence', 'culture']);
  });
});

describe('buildResidualMatrix — filter is honored', () => {
  it('drops all events when the kinds facet excludes "event"', () => {
    const m = buildResidualMatrix({ ...ALL, kinds: new Set(['polity']) });
    expect(m.total).toBe(0);
    expect(m.categories).toEqual([]);
  });

  it('narrows to one century when the year range excludes the other', () => {
    const m = buildResidualMatrix({ ...ALL, yearRange: [1000, 1099] });
    expect(m.total).toBe(10); // only the 1000s events (8 violence + 2 culture)
    expect(m.centuries.map((c) => c.start)).toEqual([1000]);
  });
});

describe('ordinalCentury', () => {
  it('maps century start years to ordinal labels', () => {
    expect(ordinalCentury(500)).toBe('6th');
    expect(ordinalCentury(1000)).toBe('11th');
    expect(ordinalCentury(1200)).toBe('13th');
    expect(ordinalCentury(1500)).toBe('16th');
  });
});
