/**
 * Tests for datasetBuilder — build a UserDataset from a parse, and the
 * export/re-import envelope round-trip + its fail-fast validation branches.
 */
import { describe, it, expect } from 'vitest';
import { buildDataset, toExport, fromExport } from './datasetBuilder';
import {
  USER_DATASET_EXPORT_KIND,
  USER_DATASET_EXPORT_VERSION,
  type UserDataset,
} from './types';
import type { ParseSuccess } from './importParse';

const parse: ParseSuccess = {
  ok: true,
  format: 'csv',
  skipped: 0,
  propertyKeys: ['city', 'yr'],
  suggestedNameField: 'city',
  suggestedTimeField: 'yr',
  records: [
    { id: 'r1', kind: 'user', name: 'Row 1', spatial: { shape: 'point', coords: [0, 0] }, payload: { city: 'Rome', yr: '800' } },
  ],
};

describe('buildDataset', () => {
  it('derives a name from the filename and applies field choices', () => {
    const ds = buildDataset(parse, 'my-places.csv', 'city', 'yr');
    expect(ds.name).toBe('my-places');
    expect(ds.format).toBe('csv');
    expect(ds.records[0].name).toBe('Rome');
    expect(ds.records[0].temporal).toEqual({ shape: 'instant', year: 800 });
    expect(ds.id).toBeTruthy();
    expect(ds.importedAt).toBeGreaterThan(0);
  });

  it('strips path + extension and falls back to a default name', () => {
    expect(buildDataset(parse, 'C:/x/y/sites.geojson', null, null).name).toBe('sites');
    expect(buildDataset(parse, '.csv', null, null).name).toBe('Untitled dataset');
  });
});

describe('toExport / fromExport round-trip', () => {
  it('round-trips a dataset through export and back (with a fresh identity)', () => {
    const ds = buildDataset(parse, 'sites.csv', 'city', null);
    const env = toExport(ds);
    expect(env.kind).toBe(USER_DATASET_EXPORT_KIND);
    expect(env.version).toBe(USER_DATASET_EXPORT_VERSION);

    const result = fromExport(env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dataset.records).toEqual(ds.records);
      expect(result.dataset.name).toBe(ds.name);
      // Re-import gets a fresh id so it never collides with the original.
      expect(result.dataset.id).not.toBe(ds.id);
    }
  });
});

describe('fromExport — fail-fast validation', () => {
  it('rejects non-object roots', () => {
    expect(fromExport(null).ok).toBe(false);
    expect(fromExport('nope').ok).toBe(false);
    expect(fromExport(42).ok).toBe(false);
  });

  it('rejects a wrong/missing kind', () => {
    const r = fromExport({ version: USER_DATASET_EXPORT_VERSION, dataset: { records: [] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not an InvaderGIS dataset/i);
  });

  it('rejects an unsupported version', () => {
    const r = fromExport({ kind: USER_DATASET_EXPORT_KIND, version: 999, dataset: { records: [] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version/i);
  });

  it('rejects a missing/invalid dataset payload', () => {
    const r = fromExport({ kind: USER_DATASET_EXPORT_KIND, version: USER_DATASET_EXPORT_VERSION, dataset: { records: 'no' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing a valid dataset/i);
  });

  it('accepts a minimal valid export', () => {
    const ds: Partial<UserDataset> = { name: 'X', format: 'csv', records: [] };
    const r = fromExport({ kind: USER_DATASET_EXPORT_KIND, version: USER_DATASET_EXPORT_VERSION, dataset: ds });
    expect(r.ok).toBe(true);
  });
});
