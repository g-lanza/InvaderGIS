/**
 * Tests for CommandBar fuzzy search, including the field-aware keyword tier.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { fuzzySearch, __setIndexForTest, type SearchEntry } from './CommandBarFuzzy';

const INDEX: SearchEntry[] = [
  { id: 'byzantine_empire', t: 'polity', n: 'Byzantine Empire', k: 'byzantine world empire' },
  { id: 'kingdom_of_leon',  t: 'polity', n: 'Kingdom of León',  k: 'iberia kingdom' },
  { id: 'abbasid_caliphate', t: 'polity', n: 'Abbasid Caliphate', k: 'near east caliphate' },
  { id: 'rel_x', t: 'relationship', n: 'A – B (Alliance)', k: 'alliance a b' },
  { id: 'rel_y', t: 'relationship', n: 'C – D (Rivalry)',  k: 'rivalry c d' },
];

afterEach(() => __setIndexForTest(null));

describe('fuzzySearch — name matches rank above keyword matches', () => {
  it('an exact name match outranks any keyword match', () => {
    __setIndexForTest(INDEX);
    const results = fuzzySearch('byzantine empire');
    expect(results[0].id).toBe('byzantine_empire');
    expect(results[0].score).toBe(1000);
  });

  it('finds records by a facet keyword the NAME does not contain', () => {
    __setIndexForTest(INDEX);
    // "iberia" appears only in León's keywords, not its name.
    const results = fuzzySearch('iberia');
    expect(results.map((r) => r.id)).toContain('kingdom_of_leon');
    const leon = results.find((r) => r.id === 'kingdom_of_leon');
    expect(leon!.score).toBeLessThan(200); // keyword tier, below all name tiers
  });

  it('finds relationships by their type keyword (e.g. "alliance")', () => {
    __setIndexForTest(INDEX);
    const results = fuzzySearch('alliance');
    // "Alliance" is in the name AND the keywords; either way rel_x must surface.
    expect(results.map((r) => r.id)).toContain('rel_x');
  });

  it('keyword tier requires 2+ chars (single char does not keyword-match)', () => {
    __setIndexForTest([{ id: 'x', t: 'polity', n: 'Zzz', k: 'iberia' }]);
    // 'i' would substring-match the keyword but is below the 2-char gate; and
    // 'i' is not in the name "zzz", so no result at all.
    expect(fuzzySearch('i')).toEqual([]);
  });

  it('returns empty when the index is not loaded', () => {
    __setIndexForTest(null);
    expect(fuzzySearch('byzantine')).toEqual([]);
  });

  it('matches the raw slug id so typing "merovingian_lombards" or "rel_mer" finds it', () => {
    __setIndexForTest([
      { id: 'rel_merovingian_lombards', t: 'relationship', n: 'Merovingian Kingdom – Lombard Kingdom (Rivalry)' },
    ]);
    // The humanized name still works...
    expect(fuzzySearch('merovingian').map((r) => r.id)).toContain('rel_merovingian_lombards');
    // ...and so does the raw slug / a slug-word / the prefix.
    expect(fuzzySearch('merovingian_lombards').map((r) => r.id)).toContain('rel_merovingian_lombards');
    expect(fuzzySearch('rel_mer').map((r) => r.id)).toContain('rel_merovingian_lombards');
    expect(fuzzySearch('lombards').map((r) => r.id)).toContain('rel_merovingian_lombards');
  });

  it('id-only match ranks below a name match', () => {
    __setIndexForTest([
      // "alpha" is ONLY in this record's id, not its name.
      { id: 'rel_alpha_thing', t: 'relationship', n: 'Wholly Unrelated Name' },
      // "alpha" is in this record's NAME.
      { id: 'gamma_polity',    t: 'polity', n: 'Alpha Province' },
    ]);
    const results = fuzzySearch('alpha');
    // Both match, but the name match (gamma_polity) outranks the id-only match.
    expect(results[0].id).toBe('gamma_polity');
    expect(results.map((r) => r.id)).toContain('rel_alpha_thing');
  });
});
