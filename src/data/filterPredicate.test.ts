/**
 * Tests for filterPredicate — the shared-filter single source of truth (Pass 1).
 *
 * passesFilter() is pure, so these are known-answer cases. The highest-risk part is
 * the per-kind temporal overlap, which MUST mirror loaders.ts buildYearIndex(); each
 * temporal kind is exercised with an in-range and an out-of-range year.
 */
import { describe, it, expect } from 'vitest';
import { passesFilter, type FilterFacets } from './filterPredicate';
import type { RawRecord } from './loaders';

/** Build a minimal RawRecord literal for a given kind + extra fields. */
function rec(kind: string, fields: Record<string, unknown> = {}): RawRecord {
  return { kind, dataset: 'test', id: `${kind}_x`, ...fields } as RawRecord;
}

/** No-restriction facets (everything passes). */
const ALL: FilterFacets = {
  yearRange: null,
  kinds: new Set(),
  regions: new Set(),
  confidence: new Set(),
  attestation: new Set(),
};

describe('passesFilter — empty facets', () => {
  it('passes every record when no facet is active', () => {
    expect(passesFilter(rec('event', { year: 800 }), ALL)).toBe(true);
    expect(passesFilter(rec('polity', { formed: 750 }), ALL)).toBe(true);
    expect(passesFilter(rec('source'), ALL)).toBe(true);
  });
});

describe('passesFilter — kinds facet', () => {
  const facets: FilterFacets = { ...ALL, kinds: new Set(['event']) };
  it('passes records whose kind is selected', () => {
    expect(passesFilter(rec('event', { year: 800 }), facets)).toBe(true);
  });
  it('rejects records whose kind is not selected', () => {
    expect(passesFilter(rec('polity', { formed: 750 }), facets)).toBe(false);
  });
});

describe('passesFilter — regions facet (reads _quarry.region)', () => {
  const facets: FilterFacets = { ...ALL, regions: new Set(['iberia']) };
  it('passes a record in the selected region', () => {
    expect(passesFilter(rec('polity', { _quarry: { region: 'iberia' } }), facets)).toBe(true);
  });
  it('rejects a record in a different region', () => {
    expect(passesFilter(rec('polity', { _quarry: { region: 'near_east' } }), facets)).toBe(false);
  });
  it('rejects a record with no region when a region facet is set', () => {
    expect(passesFilter(rec('polity', {}), facets)).toBe(false);
  });
});

describe('passesFilter — confidence facet (reads provenance.confidence, default unknown)', () => {
  const facets: FilterFacets = { ...ALL, confidence: new Set(['high']) };
  it('passes a record at the selected confidence', () => {
    expect(passesFilter(rec('event', { year: 800, provenance: { confidence: 'high' } }), facets)).toBe(true);
  });
  it('rejects a record at a different confidence', () => {
    expect(passesFilter(rec('event', { year: 800, provenance: { confidence: 'low' } }), facets)).toBe(false);
  });
  it('treats a missing confidence as "unknown"', () => {
    const f: FilterFacets = { ...ALL, confidence: new Set(['unknown']) };
    expect(passesFilter(rec('event', { year: 800 }), f)).toBe(true);
  });
});

describe('passesFilter — year-range temporal overlap, per kind (mirrors buildYearIndex)', () => {
  const span: FilterFacets = { ...ALL, yearRange: [1000, 1100] };

  it('event: instantaneous year inside / outside the range', () => {
    expect(passesFilter(rec('event', { year: 1050 }), span)).toBe(true);
    expect(passesFilter(rec('event', { year: 900 }), span)).toBe(false);
  });

  it('polity: formed..dissolved overlap; open end → window end', () => {
    expect(passesFilter(rec('polity', { formed: 950, dissolved: 1050 }), span)).toBe(true); // overlaps
    expect(passesFilter(rec('polity', { formed: 700, dissolved: 800 }), span)).toBe(false); // ends before
    expect(passesFilter(rec('polity', { formed: 1200 }), span)).toBe(false); // starts after
    expect(passesFilter(rec('polity', { formed: 1050 }), span)).toBe(true); // open end spans window
  });

  it('journey: year_start..year_end; open end → instant at start', () => {
    expect(passesFilter(rec('journey', { year_start: 1020, year_end: 1080 }), span)).toBe(true);
    expect(passesFilter(rec('journey', { year_start: 900, year_end: 950 }), span)).toBe(false);
    expect(passesFilter(rec('journey', { year_start: 1050 }), span)).toBe(true); // instant in range
  });

  it('ruler: reign_start..reign_end', () => {
    expect(passesFilter(rec('ruler', { reign_start: 1010, reign_end: 1040 }), span)).toBe(true);
    expect(passesFilter(rec('ruler', { reign_start: 1200, reign_end: 1230 }), span)).toBe(false);
  });

  it('relationship: active_periods spans, else since..until (open until → window end)', () => {
    expect(passesFilter(rec('relationship', { active_periods: [[1020, 1090]] }), span)).toBe(true);
    expect(passesFilter(rec('relationship', { active_periods: [[800, 900]] }), span)).toBe(false);
    expect(passesFilter(rec('relationship', { since: 1050, until: null }), span)).toBe(true); // open until
    expect(passesFilter(rec('relationship', { since: 700, until: 800 }), span)).toBe(false);
  });

  it('settlement/military/capital: start_year..end_year; open end → window end', () => {
    expect(passesFilter(rec('settlement', { start_year: 950, end_year: 1050 }), span)).toBe(true);
    expect(passesFilter(rec('military', { start_year: 1304 }), span)).toBe(false); // instant after range
    expect(passesFilter(rec('capital', { start_year: 900 }), span)).toBe(true); // open end spans window
  });

  it('non-temporal kinds (source/institution/technology/text) always pass a year range', () => {
    expect(passesFilter(rec('source', {}), span)).toBe(true);
    expect(passesFilter(rec('institution', {}), span)).toBe(true);
    expect(passesFilter(rec('technology', {}), span)).toBe(true);
    expect(passesFilter(rec('text', {}), span)).toBe(true);
  });
});

describe('passesFilter — facets are AND-composed', () => {
  it('rejects when any single facet fails even if others pass', () => {
    const facets: FilterFacets = {
      yearRange: [1000, 1100],
      kinds: new Set(['event']),
      regions: new Set(),
      confidence: new Set(['high']),
      attestation: new Set(),
    };
    // right kind + right year, wrong confidence → fails
    expect(passesFilter(rec('event', { year: 1050, provenance: { confidence: 'low' } }), facets)).toBe(false);
    // all three satisfied → passes
    expect(passesFilter(rec('event', { year: 1050, provenance: { confidence: 'high' } }), facets)).toBe(true);
  });
});

describe('passesFilter — attestation facet (absent passes)', () => {
  it('excludes records whose attestation is not in the active set', () => {
    const facets: FilterFacets = { ...ALL, attestation: new Set(['strong']) };
    expect(passesFilter(rec('capital', { provenance: { attestation: 'weak' } }), facets)).toBe(false);
    expect(passesFilter(rec('capital', { provenance: { attestation: 'strong' } }), facets)).toBe(true);
  });

  it('PASSES records with NO attestation even when the facet is active (honesty rule)', () => {
    const facets: FilterFacets = { ...ALL, attestation: new Set(['strong']) };
    // ruler with provenance but no attestation field → must still pass
    expect(passesFilter(rec('ruler', { provenance: { confidence: 'high' } }), facets)).toBe(true);
    // record with no provenance at all → must still pass
    expect(passesFilter(rec('ruler', {}), facets)).toBe(true);
  });
});
