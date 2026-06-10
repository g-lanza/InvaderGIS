/**
 * Tests for the events time-filter model.
 *
 * Model (user decision 2026-06-07): events are point-in-time and show ONLY on their
 * exact year, so the field turns over completely as the scrubber moves — matching how
 * the polities change with time. Earlier models (accreting `year <= target`, then a
 * ±40yr window) both made events look like they "stay on screen no matter what year".
 *
 * `eventAtYear` is the pure predicate the MapLibre `buildEventsTimeFilter` expression
 * mirrors. The composed-filter test guards the nested-`all` legacy-mode hazard
 * documented in relationshipsLayer.ts: the composed filter must stay FLAT.
 */
import { describe, it, expect } from 'vitest';
import { eventAtYear, buildEventsTimeFilter, buildEventsComposedFilter } from './eventsLayer';

describe('eventAtYear — events show only on their exact year', () => {
  it('shows an event at the exact scrubber year', () => {
    expect(eventAtYear(800, 800)).toBe(true);
  });

  it('hides an event one year before or after the scrubber', () => {
    expect(eventAtYear(799, 800)).toBe(false);
    expect(eventAtYear(801, 800)).toBe(false);
  });

  it('hides past events (no accretion) and future events', () => {
    expect(eventAtYear(600, 1500)).toBe(false);
    expect(eventAtYear(1200, 800)).toBe(false);
  });
});

describe('buildEventsTimeFilter — exact-year MapLibre expression', () => {
  it('is a single equality on the year property, not a range', () => {
    expect(buildEventsTimeFilter(800)).toEqual(['==', ['get', 'year'], 800]);
  });
});

describe('buildEventsComposedFilter — flat, no nested all', () => {
  it('returns the bare time filter when no category is solo’d', () => {
    expect(buildEventsComposedFilter(800, null)).toEqual(['==', ['get', 'year'], 800]);
  });

  it('returns a FLAT all of year AND category when a category is solo’d', () => {
    const expr = buildEventsComposedFilter(800, 'violence') as unknown[];
    expect(expr[0]).toBe('all');
    // No child of the 'all' may itself be an 'all' (would trip legacy-filter mode).
    for (const child of expr.slice(1)) {
      expect(Array.isArray(child) && child[0] === 'all').toBe(false);
    }
    // Both conditions present: exact year + category equality.
    expect(expr).toContainEqual(['==', ['get', 'year'], 800]);
    expect(expr).toContainEqual(['==', ['get', 'category'], 'violence']);
  });
});

describe('eventAtYear — span mode shows a ±span window', () => {
  it('shows events within ±span years of the scrubber', () => {
    expect(eventAtYear(800, 800, 'span', 25)).toBe(true);
    expect(eventAtYear(780, 800, 'span', 25)).toBe(true);  // 800-25 = 775 ≤ 780
    expect(eventAtYear(820, 800, 'span', 25)).toBe(true);  // 800+25 = 825 ≥ 820
    expect(eventAtYear(775, 800, 'span', 25)).toBe(true);  // inclusive lower bound
    expect(eventAtYear(825, 800, 'span', 25)).toBe(true);  // inclusive upper bound
  });

  it('hides events outside the ±span window', () => {
    expect(eventAtYear(774, 800, 'span', 25)).toBe(false);
    expect(eventAtYear(826, 800, 'span', 25)).toBe(false);
  });

  it('exact mode is unaffected by a span argument', () => {
    expect(eventAtYear(799, 800, 'exact', 25)).toBe(false);
    expect(eventAtYear(800, 800, 'exact', 25)).toBe(true);
  });
});

describe('buildEventsTimeFilter — span mode is a bounded all', () => {
  it('builds an inclusive [year-span, year+span] window', () => {
    expect(buildEventsTimeFilter(800, 'span', 25)).toEqual([
      'all',
      ['>=', ['get', 'year'], 775],
      ['<=', ['get', 'year'], 825],
    ]);
  });

  it('exact mode stays a single equality', () => {
    expect(buildEventsTimeFilter(800, 'exact', 25)).toEqual(['==', ['get', 'year'], 800]);
  });
});

describe('buildEventsComposedFilter — span + category stays FLAT', () => {
  it('spreads the span bounds and the category into one non-nested all', () => {
    const expr = buildEventsComposedFilter(800, 'violence', 'span', 25) as unknown[];
    expect(expr[0]).toBe('all');
    // No child of the composed 'all' may itself be an 'all' (legacy-mode hazard).
    for (const child of expr.slice(1)) {
      expect(Array.isArray(child) && child[0] === 'all').toBe(false);
    }
    expect(expr).toContainEqual(['>=', ['get', 'year'], 775]);
    expect(expr).toContainEqual(['<=', ['get', 'year'], 825]);
    expect(expr).toContainEqual(['==', ['get', 'category'], 'violence']);
  });

  it('span with no category is the bare bounded all', () => {
    expect(buildEventsComposedFilter(800, null, 'span', 25)).toEqual([
      'all',
      ['>=', ['get', 'year'], 775],
      ['<=', ['get', 'year'], 825],
    ]);
  });
});
