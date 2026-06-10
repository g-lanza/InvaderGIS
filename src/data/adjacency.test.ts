/**
 * Tests for adjacency-based related + similarity ranking (pure functions).
 */
import { describe, it, expect } from 'vitest';
import { relatedFor, similarTo, type AdjacencyMap } from './adjacency';

// A small synthetic graph:
//   A — B (alliance), A — C (rivalry), A — C (vassalage)   [A,C share 2 edge types]
//   D — B (alliance), D — C (rivalry)                       [D shares B and C with A]
//   E — F (trade)                                           [E unrelated to A]
const MAP: AdjacencyMap = {
  A: [
    { to: 'B', type: 'alliance', since: 800 },
    { to: 'C', type: 'rivalry', since: 900 },
    { to: 'C', type: 'vassalage', since: 950 },
  ],
  B: [
    { to: 'A', type: 'alliance', since: 800 },
    { to: 'D', type: 'alliance', since: 810 },
  ],
  C: [
    { to: 'A', type: 'rivalry', since: 900 },
    { to: 'A', type: 'vassalage', since: 950 },
    { to: 'D', type: 'rivalry', since: 905 },
  ],
  D: [
    { to: 'B', type: 'alliance', since: 810 },
    { to: 'C', type: 'rivalry', since: 905 },
  ],
  E: [{ to: 'F', type: 'trade', since: 1000 }],
  F: [{ to: 'E', type: 'trade', since: 1000 }],
};

describe('relatedFor — direct neighbors, de-duplicated', () => {
  it('collapses multiple edges to the same neighbor and lists distinct types', () => {
    const related = relatedFor(MAP, 'A');
    const c = related.find((r) => r.id === 'C');
    expect(c).toBeDefined();
    expect(c!.types).toEqual(['rivalry', 'vassalage']); // both edge types, sorted
    expect(c!.since).toBe(900); // earliest across shared edges
  });

  it('orders by edge-type count desc (C with 2 types before B with 1)', () => {
    const related = relatedFor(MAP, 'A');
    expect(related[0].id).toBe('C');
    expect(related.map((r) => r.id)).toEqual(['C', 'B']);
  });

  it('returns empty for an unknown id', () => {
    expect(relatedFor(MAP, 'ZZZ')).toEqual([]);
  });
});

describe('similarTo — ranks by shared neighbors + type profile', () => {
  it('finds D similar to A (both tied to B and C), excluding A’s own neighbors', () => {
    const similar = similarTo(MAP, 'A');
    const ids = similar.map((s) => s.id);
    expect(ids).toContain('D');
    // B and C are A's direct neighbors → surfaced as "related", not "similar".
    expect(ids).not.toContain('B');
    expect(ids).not.toContain('C');
    expect(ids).not.toContain('A');
  });

  it('reports the shared neighbors that drove the match', () => {
    const d = similarTo(MAP, 'A').find((s) => s.id === 'D');
    expect(d).toBeDefined();
    expect(d!.sharedNeighbors).toEqual(['B', 'C']);
    expect(d!.score).toBeGreaterThan(0);
  });

  it('excludes entities with no shared structure (E shares nothing with A)', () => {
    expect(similarTo(MAP, 'A').map((s) => s.id)).not.toContain('E');
  });

  it('returns empty when the focus entity has no neighbors', () => {
    expect(similarTo(MAP, 'ZZZ')).toEqual([]);
  });

  it('honors the limit', () => {
    expect(similarTo(MAP, 'A', 1).length).toBeLessThanOrEqual(1);
  });
});
