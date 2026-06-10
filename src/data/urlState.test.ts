import { describe, it, expect } from 'vitest';
import {
  encodeViewToHash,
  decodeHashToView,
  mergeViewIntoCaptured,
  composeHash,
  type UrlViewState,
} from './urlState';
import type { CapturedState } from '@/stores/savedViewsStore';

const view: UrlViewState = {
  year: 1066,
  theme: 'atlas',
  mapType: 'relief',
  projection: 'mercator',
  selectedId: 'kingdom_of_england',
  selectedType: 'polity',
};

const base: CapturedState = {
  year: 1000,
  theme: 'contrast',
  mapType: 'parchment',
  projection: 'globe',
  layers: { polities: { visible: true, opacity: 0.8 } },
  selectedId: null,
  selectedType: null,
};

describe('encodeViewToHash', () => {
  it('round-trips a full view through decode', () => {
    const decoded = decodeHashToView(encodeViewToHash(view));
    expect(decoded).toEqual({
      year: 1066,
      theme: 'atlas',
      mapType: 'relief',
      projection: 'mercator',
      selectedId: 'kingdom_of_england',
      selectedType: 'polity',
    });
  });

  it('omits selection keys when nothing is pinned', () => {
    const hash = encodeViewToHash({ ...view, selectedId: null, selectedType: null });
    expect(hash).not.toContain('sel=');
  });

  it('rounds the year to an integer', () => {
    expect(encodeViewToHash({ ...view, year: 1066.7 })).toContain('year=1067');
  });
});

describe('decodeHashToView', () => {
  it('returns null for an empty hash', () => {
    expect(decodeHashToView('')).toBeNull();
    expect(decodeHashToView('#')).toBeNull();
  });

  it('returns null when only foreign (footnote) keys are present', () => {
    expect(decodeHashToView('#page=sources&item=ims_fordham')).toBeNull();
  });

  it('drops invalid enum values rather than trusting them', () => {
    const decoded = decodeHashToView('#year=1200&theme=hotpink&map=invalid&proj=warp');
    expect(decoded).toEqual({ year: 1200 });
  });

  it('drops a non-finite year', () => {
    expect(decodeHashToView('#year=notanumber&theme=dark')).toEqual({ theme: 'dark' });
  });

  it('parses a selection id:type, splitting on the last colon', () => {
    const decoded = decodeHashToView('#sel=some_id:polity');
    expect(decoded).toEqual({ selectedId: 'some_id', selectedType: 'polity' });
  });

  it('ignores a malformed selection with no type', () => {
    expect(decodeHashToView('#sel=lonely_id')).toBeNull();
  });
});

describe('mergeViewIntoCaptured', () => {
  it('overrides only the URL-present fields and keeps layers from base', () => {
    const merged = mergeViewIntoCaptured(base, { year: 1066, theme: 'atlas' });
    expect(merged.year).toBe(1066);
    expect(merged.theme).toBe('atlas');
    expect(merged.mapType).toBe('parchment'); // untouched from base
    expect(merged.layers).toBe(base.layers); // layers never come from URL
  });

  it('applies a URL selection over an empty base selection', () => {
    const merged = mergeViewIntoCaptured(base, { selectedId: 'x', selectedType: 'event' });
    expect(merged.selectedId).toBe('x');
    expect(merged.selectedType).toBe('event');
  });
});

describe('composeHash', () => {
  it('preserves a foreign footnote key when writing view state', () => {
    const out = composeHash('#page=sources&item=ims_fordham', view);
    const p = new URLSearchParams(out);
    expect(p.get('page')).toBe('sources');
    expect(p.get('item')).toBe('ims_fordham');
    expect(p.get('year')).toBe('1066');
  });
});
