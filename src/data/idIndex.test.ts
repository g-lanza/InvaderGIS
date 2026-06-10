/**
 * Tests for the id→record / id→kind index builder (polity precedence).
 *
 * 255 ids collide across kinds in the real corpus (e.g. `abbasid_caliphate` is
 * both a polity and a capital). The index must resolve a colliding id to its
 * POLITY — the kind relationships/events reference and the convention the baker's
 * nameById uses — so linked-record navigation lands on the right record.
 */
import { describe, it, expect } from 'vitest';
import { buildIdMaps } from './loaders';
import type { RawRecord } from './loaders';
import type { RecordType } from '@/types/record';

function rec(id: string, kind: RecordType): RawRecord {
  return { id, kind, dataset: 'test' } as RawRecord;
}

describe('buildIdMaps — polity precedence on collisions', () => {
  it('resolves a colliding id to the polity (first writer wins)', () => {
    const ordered: Array<[RecordType, RawRecord[]]> = [
      ['polity',  [rec('abbasid_caliphate', 'polity')]],
      ['capital', [rec('abbasid_caliphate', 'capital')]], // same id, lower precedence
    ];
    const { kindById, recordById } = buildIdMaps(ordered);
    expect(kindById.get('abbasid_caliphate')).toBe('polity');
    expect(recordById.get('abbasid_caliphate')?.kind).toBe('polity');
  });

  it('resolves non-colliding ids to their own kind', () => {
    const ordered: Array<[RecordType, RawRecord[]]> = [
      ['polity',  [rec('byzantine_empire', 'polity')]],
      ['ruler',   [rec('abd_al_rahman_iii', 'ruler')]],
      ['capital', [rec('cordoba', 'capital')]],
    ];
    const { kindById } = buildIdMaps(ordered);
    expect(kindById.get('byzantine_empire')).toBe('polity');
    expect(kindById.get('abd_al_rahman_iii')).toBe('ruler');
    expect(kindById.get('cordoba')).toBe('capital');
  });

  it('returns undefined for unknown ids', () => {
    const { kindById } = buildIdMaps([['polity', [rec('x', 'polity')]]]);
    expect(kindById.get('nope')).toBeUndefined();
  });
});
