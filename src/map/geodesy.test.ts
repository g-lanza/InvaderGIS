import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  pathLengthMeters,
  polygonAreaSqMeters,
  formatDistance,
  formatArea,
} from './geodesy';

// Known reference: London [-0.1278,51.5074] → Paris [2.3522,48.8566] ≈ 343 km.
const LONDON: [number, number] = [-0.1278, 51.5074];
const PARIS: [number, number] = [2.3522, 48.8566];

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(LONDON, LONDON)).toBe(0);
  });

  it('matches the known London–Paris great-circle distance (~343 km, ±5 km)', () => {
    const km = haversineMeters(LONDON, PARIS) / 1000;
    expect(km).toBeGreaterThan(338);
    expect(km).toBeLessThan(348);
  });

  it('is symmetric', () => {
    expect(haversineMeters(LONDON, PARIS)).toBeCloseTo(haversineMeters(PARIS, LONDON), 3);
  });
});

describe('pathLengthMeters', () => {
  it('returns 0 for fewer than two points', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([LONDON])).toBe(0);
  });

  it('sums segment distances', () => {
    const direct = haversineMeters(LONDON, PARIS);
    const viaTwo = pathLengthMeters([LONDON, PARIS, LONDON]);
    expect(viaTwo).toBeCloseTo(direct * 2, 0);
  });
});

describe('polygonAreaSqMeters', () => {
  it('returns 0 for degenerate rings', () => {
    expect(polygonAreaSqMeters([])).toBe(0);
    expect(polygonAreaSqMeters([[0, 0], [1, 1]])).toBe(0);
  });

  it('computes a positive area for a real triangle and is orientation-insensitive', () => {
    const ring: [number, number][] = [[0, 0], [1, 0], [0, 1]];
    const a = polygonAreaSqMeters(ring);
    const reversed = [...ring].reverse();
    expect(a).toBeGreaterThan(0);
    expect(polygonAreaSqMeters(reversed)).toBeCloseTo(a, 0);
  });
});

describe('formatDistance', () => {
  it('uses metres below 1 km', () => {
    expect(formatDistance(742)).toBe('742 m');
  });
  it('uses km with one decimal under 100 km', () => {
    expect(formatDistance(12_400)).toBe('12.4 km');
  });
  it('rounds to whole km at/above 100 km with thousands separators', () => {
    expect(formatDistance(1_240_000)).toBe('1,240 km');
  });
});

describe('formatArea', () => {
  it('uses m² below 1 km²', () => {
    expect(formatArea(500_000)).toBe('500,000 m²');
  });
  it('uses km² above 1 km²', () => {
    expect(formatArea(2_500_000)).toBe('2.5 km²');
  });
});
