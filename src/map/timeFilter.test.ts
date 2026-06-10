/**
 * Tests for per-polity active-snapshot resolution.
 *
 * Guards the selection-highlight bug: a polity has many snapshot polygons (one
 * per year), and the GLOBAL active-snapshot-year set (computeActiveSnapshotYears)
 * unions active years across ALL polities. Filtering the selected polity by that
 * global set let several of its historical outlines through whenever their
 * snapshotYears coincided with other polities' active years — the criss-cross.
 * activeSnapshotYearForPolity returns the selected polity's OWN single active
 * snapshot year, so the highlight rings exactly one polygon.
 */
import { describe, it, expect } from 'vitest';
import {
  activeSnapshotYearForPolity,
  computeActiveSnapshotYears,
  type PolityFilterProps,
} from './timeFilter';

function feat(props: PolityFilterProps): { properties: PolityFilterProps } {
  return { properties: props };
}

// Byzantium with three snapshots; another polity active at 1075 so 1075 leaks
// into the global set.
const FEATURES = [
  feat({ id: 'byzantine_empire', formed: 330, dissolved: 1453, snapshotYear: 1050 }),
  feat({ id: 'byzantine_empire', formed: 330, dissolved: 1453, snapshotYear: 1075 }),
  feat({ id: 'byzantine_empire', formed: 330, dissolved: 1453, snapshotYear: 1100 }),
  feat({ id: 'other_polity',     formed: 900, dissolved: null, snapshotYear: 1075 }),
];

describe('activeSnapshotYearForPolity — single active snapshot per polity', () => {
  it('returns the max snapshotYear ≤ year within formed..dissolved', () => {
    expect(activeSnapshotYearForPolity(FEATURES, 'byzantine_empire', 1100)).toBe(1100);
    expect(activeSnapshotYearForPolity(FEATURES, 'byzantine_empire', 1099)).toBe(1075);
    expect(activeSnapshotYearForPolity(FEATURES, 'byzantine_empire', 1060)).toBe(1050);
  });

  it('returns null before the polity is formed', () => {
    expect(activeSnapshotYearForPolity(FEATURES, 'other_polity', 800)).toBeNull();
  });

  it('returns null after the polity has dissolved', () => {
    const dissolved = [
      feat({ id: 'gone', formed: 500, dissolved: 700, snapshotYear: 600 }),
    ];
    expect(activeSnapshotYearForPolity(dissolved, 'gone', 800)).toBeNull();
  });

  it('returns null for an unknown polity id', () => {
    expect(activeSnapshotYearForPolity(FEATURES, 'nope', 1100)).toBeNull();
  });

  it('ignores other polities’ snapshots — fixes the criss-cross', () => {
    // At 1100 the GLOBAL set contains both 1075 (from other_polity) and 1100,
    // so an id-only-plus-global filter would match TWO byzantine snapshots.
    const globalYears = computeActiveSnapshotYears(FEATURES, 1100);
    const byzMatchingGlobal = FEATURES.filter(
      (f) =>
        f.properties.id === 'byzantine_empire' &&
        globalYears.has(f.properties.snapshotYear),
    );
    expect(byzMatchingGlobal.length).toBeGreaterThan(1); // the bug

    // The per-polity resolver collapses it to exactly one snapshot year.
    const snap = activeSnapshotYearForPolity(FEATURES, 'byzantine_empire', 1100);
    const byzMatchingPerPolity = FEATURES.filter(
      (f) =>
        f.properties.id === 'byzantine_empire' &&
        f.properties.snapshotYear === snap,
    );
    expect(byzMatchingPerPolity).toHaveLength(1); // the fix
  });
});
