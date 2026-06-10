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
import {
  eventAtYear,
  buildEventsTimeFilter,
  buildEventsComposedFilter,
  buildTierCircleOpacityExpression,
  buildTierSymbolOpacityExpression,
} from './eventsLayer';

/**
 * Minimal evaluator for the exact expression shape the tier-opacity builders
 * produce: ['step', ['zoom'], default, z1, out1, z2, out2, …] where each output
 * is a ['case', ['==',['get','tier'],1], a, ['==',['get','tier'],2], b, c].
 * Lets us assert what opacity a given tier resolves to at a given zoom without a
 * live MapLibre instance.
 */
function evalTierOpacity(expr: unknown[], zoom: number, tier: number): number {
  // expr = ['step', ['zoom'], def, stop1, out1, stop2, out2, ...]
  const def = expr[2] as unknown[];
  let chosen = def;
  for (let i = 3; i < expr.length; i += 2) {
    const stop = expr[i] as number;
    if (zoom >= stop) chosen = expr[i + 1] as unknown[];
  }
  // chosen = ['case', cond1, a, cond2, b, fallback]
  const a = chosen[2] as number;
  const b = chosen[4] as number;
  const fallback = chosen[5] as number;
  if (tier === 1) return a;
  if (tier === 2) return b;
  return fallback;
}

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

describe('tier-3 (violence) markers are visible at every zoom', () => {
  // Regression: violence/battle events are ALL tier 3 (4332 of 5061). The prior
  // tier gate faded tier 3 to opacity 0 below zoom 6, so battles were invisible at
  // the world/continental zoom users actually use, while tier 1/2 showed from zoom
  // 2–3. User decision: show violence at all zooms, same as other categories.
  const ZOOMS = [2, 3, 4, 5, 6, 8, 12];

  it('symbol layer: tier 3 opacity is > 0 at every zoom', () => {
    const expr = buildTierSymbolOpacityExpression(1);
    for (const z of ZOOMS) {
      expect(evalTierOpacity(expr, z, 3), `symbol tier3 @ zoom ${z}`).toBeGreaterThan(0);
    }
  });

  it('symbol layer: tier 3 matches tier 1 opacity at every zoom (no second-class fade)', () => {
    const expr = buildTierSymbolOpacityExpression(1);
    for (const z of ZOOMS) {
      expect(evalTierOpacity(expr, z, 3), `symbol tier3 vs tier1 @ zoom ${z}`)
        .toBe(evalTierOpacity(expr, z, 1));
    }
  });

  it('circle layer: tier 3 opacity is > 0 at every zoom', () => {
    const expr = buildTierCircleOpacityExpression(1);
    for (const z of ZOOMS) {
      expect(evalTierOpacity(expr, z, 3), `circle tier3 @ zoom ${z}`).toBeGreaterThan(0);
    }
  });

  it('respects the overall opacity scale (slider) for tier 3', () => {
    const expr = buildTierSymbolOpacityExpression(0.5);
    // tier 3 at low zoom should now be the scaled value, not a hard 0.
    expect(evalTierOpacity(expr, 2, 3)).toBeCloseTo(evalTierOpacity(expr, 2, 1));
    expect(evalTierOpacity(expr, 2, 3)).toBeGreaterThan(0);
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
