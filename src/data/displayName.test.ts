/**
 * Tests for the shared display-name helpers.
 */
import { describe, it, expect } from 'vitest';
import { humanizeId, humanizeType, humanizeLabel, displayNameFromRecord } from './displayName';

describe('humanizeId — strip kind prefix, title-case', () => {
  it('strips a known prefix and title-cases', () => {
    expect(humanizeId('rel_amalfi_byzantine')).toBe('Amalfi Byzantine');
  });
  it('humanizes a prefix-less slug as-is', () => {
    expect(humanizeId('near_east')).toBe('Near East');
  });
  it('empty → empty', () => {
    expect(humanizeId('')).toBe('');
  });
});

describe('humanizeType — title-case every word', () => {
  it('title-cases each underscore-separated word', () => {
    expect(humanizeType('dynastic_union')).toBe('Dynastic Union');
    expect(humanizeType('rivalry')).toBe('Rivalry');
  });
});

describe('humanizeLabel — title-case with em-dash fallback', () => {
  it('title-cases like humanizeType', () => {
    expect(humanizeLabel('governance_type')).toBe('Governance Type');
  });
  it('empty → em-dash', () => {
    expect(humanizeLabel('')).toBe('—');
  });
});

describe('displayNameFromRecord — name fallback chain', () => {
  it('prefers name_primary', () => {
    expect(displayNameFromRecord({ id: 'x', name_primary: 'Primary', name: 'Sec' })).toBe('Primary');
  });
  it('falls back to name, then title', () => {
    expect(displayNameFromRecord({ id: 'x', name: 'The Name' })).toBe('The Name');
    expect(displayNameFromRecord({ id: 'x', title: 'A Title' })).toBe('A Title');
  });
  it('last resort: humanized id (never a raw slug)', () => {
    expect(displayNameFromRecord({ id: 'rel_amalfi_byzantine' })).toBe('Amalfi Byzantine');
  });
  it('ignores non-string name fields', () => {
    expect(displayNameFromRecord({ id: 'kingdom_of_leon', name_primary: 42 })).toBe('Kingdom Of Leon');
  });
  it('null/undefined → empty', () => {
    expect(displayNameFromRecord(null)).toBe('');
    expect(displayNameFromRecord(undefined)).toBe('');
  });
});
