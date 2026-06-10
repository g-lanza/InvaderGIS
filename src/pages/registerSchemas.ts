/**
 * registerSchemas.ts — column definitions ("field aliases") for the attribute-table
 * registers, one schema per record kind.
 *
 * GIS CONVENTION (docs/09 §Attribute table): an attribute table shows
 * rows = features, cols = fields, with a human field ALIAS as the header
 * (not the raw field name). This module is the single place that maps each
 * record kind to the columns the AttributeTable renders, mirroring an ArcGIS
 * FeatureLayer's field-alias list.
 *
 * DATA CONTRACT (Realness Law):
 *   - Every accessor reads a REAL field off the baked RawRecord. Missing →
 *     the cell renders "—" (handled by AttributeTable, accessors may return '').
 *   - No fabricated values, no synthetic columns. Counts/derivations only when
 *     they read real data (none are computed here — accessors are pure reads).
 *
 * SORT CONTRACT:
 *   - Each column declares a `type`: 'text' | 'num'. Numeric columns sort by
 *     the raw number (NaN sinks to the bottom); text columns sort
 *     case-insensitively.
 *   - The AttributeTable owns sort state; this module only provides the value
 *     getters and the comparison key.
 *
 * The set of kinds exposed as registers (docs task Wave2-B): polity, event,
 * ruler, relationship, journey, institution, source. Each maps to a RecordType
 * understood by `loadRecords(kind)`.
 *
 * Phase Wave2-B — Attribute Table registers (ArcGIS FeatureTable convention).
 */

import type { RecordType } from '@/types/record';
import type { RawRecord } from '@/data/loaders';
import { statusRootLabel } from '@/panels/statusRoots';

// ── Column model ────────────────────────────────────────────────────────────

/** Whether a column sorts as text (locale-insensitive) or as a number. */
export type ColKind = 'text' | 'num';

/**
 * One column in an attribute table. The `id` is a stable key used for sort
 * state and React keys; `alias` is the human header label (the ArcGIS
 * "field alias"); `get` reads the display value off a raw record.
 */
export interface RegisterColumn {
  /** Stable column id (sort-state key, React key). */
  id: string;
  /** Human header label shown in the table head (the field alias). */
  alias: string;
  /** Sort/format behaviour. */
  kind: ColKind;
  /**
   * Read the display value from a record. Return a string for text columns.
   * For numeric columns, return the number (or `null`/`NaN` when absent).
   */
  get: (record: RawRecord) => string;
  /**
   * Numeric sort key for `kind === 'num'` columns. Return NaN when the field
   * is absent so missing rows sink to the bottom regardless of direction.
   * Omitted for text columns (text sorts on `get`).
   */
  num?: (record: RawRecord) => number;
}

/**
 * A complete register definition: a record kind, a human label for the picker
 * tab, the loader kind, and its ordered column list.
 */
export interface RegisterSchema {
  /** Loader kind passed to `loadRecords(kind)`. */
  kind: RecordType;
  /** Human label for the kind-picker tab (e.g. "Polities"). */
  label: string;
  /** Ordered columns shown in the table. First column is the "name" column. */
  columns: RegisterColumn[];
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/** Coerce an unknown field to a display string; missing/empty → ''. */
function field(record: RawRecord, key: string): string {
  const v = record[key];
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/** Read a numeric field; absent/non-number → NaN. */
function numField(record: RawRecord, key: string): number {
  const v = record[key];
  return typeof v === 'number' ? v : NaN;
}

/** Title-case a snake_case slug for human display ("near_east" → "Near East"). */
function humanize(slug: string): string {
  if (!slug) return '';
  return slug
    .split('_')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/** Format a [start,end] span as "750 – 1258"; open end → "750 – …". */
function span(start: number, end: number): string {
  const hasStart = !isNaN(start);
  const hasEnd = !isNaN(end);
  if (!hasStart && !hasEnd) return '';
  if (hasStart && hasEnd) return `${start} – ${end}`;
  if (hasStart) return `${start} – …`;
  return `… – ${end}`;
}

/** First participant entity id of a relationship, or '' when absent. */
function participantAt(record: RawRecord, idx: number): string {
  const p = record['participants'];
  if (Array.isArray(p) && p[idx] && typeof p[idx] === 'object') {
    const ent = (p[idx] as { entity_id?: unknown }).entity_id;
    if (typeof ent === 'string') return humanize(ent);
  }
  // Fall back to legacy dyadic shape.
  const legacy = idx === 0 ? record['from_id'] : record['to_id'];
  return typeof legacy === 'string' && legacy ? humanize(legacy) : '';
}

/** Count of waypoints in a journey, or NaN when absent. */
function waypointCount(record: RawRecord): number {
  const w = record['waypoints'];
  return Array.isArray(w) ? w.length : NaN;
}

/** Read the `year` from a nested `{place, year}` object field (e.g. technology.origin,
 *  text.composed), or NaN when absent. */
function nestedYear(record: RawRecord, key: string): number {
  const v = record[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const y = (v as Record<string, unknown>)['year'];
    if (typeof y === 'number') return y;
  }
  return NaN;
}

/** Read the `place` from a nested `{place, year}` object field, or '' when absent. */
function nestedPlace(record: RawRecord, key: string): string {
  const v = record[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const p = (v as Record<string, unknown>)['place'];
    if (typeof p === 'string') return p;
  }
  return '';
}

// ── Column builders ─────────────────────────────────────────────────────────

/** A simple text column over one raw field. */
function textCol(id: string, alias: string, key: string): RegisterColumn {
  return { id, alias, kind: 'text', get: (r) => field(r, key) };
}

/** A simple numeric column over one raw field. */
function numCol(id: string, alias: string, key: string): RegisterColumn {
  return {
    id,
    alias,
    kind: 'num',
    get: (r) => field(r, key),
    num: (r) => numField(r, key),
  };
}

// ── Per-kind schemas ──────────────────────────────────────────────────────────

const POLITY_SCHEMA: RegisterSchema = {
  kind: 'polity',
  label: 'Polities',
  columns: [
    textCol('name', 'Name', 'name_primary'),
    { id: 'type', alias: 'Type', kind: 'text', get: (r) => humanize(field(r, 'type')) },
    { id: 'region', alias: 'Region', kind: 'text', get: (r) => humanize(field(r, 'region')) },
    numCol('formed', 'Formed', 'formed'),
    numCol('dissolved', 'Dissolved', 'dissolved'),
  ],
};

const EVENT_SCHEMA: RegisterSchema = {
  kind: 'event',
  label: 'Events',
  columns: [
    textCol('name', 'Name', 'name'),
    numCol('year', 'Year', 'year'),
    { id: 'type', alias: 'Type', kind: 'text', get: (r) => humanize(field(r, 'type')) },
    { id: 'entity', alias: 'Polity', kind: 'text', get: (r) => humanize(field(r, 'entity')) },
  ],
};

const RULER_SCHEMA: RegisterSchema = {
  kind: 'ruler',
  label: 'Rulers',
  columns: [
    textCol('name', 'Name', 'name'),
    { id: 'title', alias: 'Title', kind: 'text', get: (r) => humanize(field(r, 'title')) },
    { id: 'polity', alias: 'Polity', kind: 'text', get: (r) => humanize(field(r, 'polity')) },
    {
      id: 'reign',
      alias: 'Reign',
      kind: 'num',
      get: (r) => span(numField(r, 'reign_start'), numField(r, 'reign_end')),
      num: (r) => numField(r, 'reign_start'),
    },
  ],
};

const RELATIONSHIP_SCHEMA: RegisterSchema = {
  kind: 'relationship',
  label: 'Relationships',
  columns: [
    { id: 'type', alias: 'Type', kind: 'text', get: (r) => humanize(field(r, 'type')) },
    { id: 'from', alias: 'From', kind: 'text', get: (r) => participantAt(r, 0) },
    { id: 'to', alias: 'To', kind: 'text', get: (r) => participantAt(r, 1) },
    {
      id: 'span',
      alias: 'Period',
      kind: 'num',
      get: (r) => span(numField(r, 'since'), numField(r, 'until')),
      num: (r) => numField(r, 'since'),
    },
  ],
};

const JOURNEY_SCHEMA: RegisterSchema = {
  kind: 'journey',
  label: 'Journeys',
  columns: [
    textCol('name', 'Name', 'name'),
    { id: 'kind_type', alias: 'Kind', kind: 'text', get: (r) => humanize(field(r, 'kind_type')) },
    {
      id: 'span',
      alias: 'Years',
      kind: 'num',
      get: (r) => span(numField(r, 'year_start'), numField(r, 'year_end')),
      num: (r) => numField(r, 'year_start'),
    },
    {
      id: 'waypoints',
      alias: 'Waypoints',
      kind: 'num',
      get: (r) => {
        const n = waypointCount(r);
        return isNaN(n) ? '' : String(n);
      },
      num: waypointCount,
    },
  ],
};

const INSTITUTION_SCHEMA: RegisterSchema = {
  kind: 'institution',
  label: 'Institutions',
  columns: [
    textCol('name', 'Name', 'name_primary'),
    { id: 'domain', alias: 'Domain', kind: 'text', get: (r) => humanize(field(r, 'domain')) },
    numCol('formed', 'Formed', 'formed'),
    numCol('dissolved', 'Dissolved', 'dissolved'),
  ],
};

const TECHNOLOGY_SCHEMA: RegisterSchema = {
  kind: 'technology',
  label: 'Technologies',
  columns: [
    textCol('name', 'Name', 'name_primary'),
    { id: 'domain', alias: 'Domain', kind: 'text', get: (r) => humanize(field(r, 'domain')) },
    { id: 'origin_place', alias: 'Origin', kind: 'text', get: (r) => nestedPlace(r, 'origin') },
    {
      id: 'origin_year',
      alias: 'Year',
      kind: 'num',
      get: (r) => {
        const y = nestedYear(r, 'origin');
        return isNaN(y) ? '' : String(y);
      },
      num: (r) => nestedYear(r, 'origin'),
    },
  ],
};

const TEXT_SCHEMA: RegisterSchema = {
  kind: 'text',
  label: 'Texts',
  columns: [
    textCol('name', 'Title', 'name_primary'),
    textCol('author', 'Author', 'author'),
    textCol('language', 'Language', 'language'),
    { id: 'tradition', alias: 'Tradition', kind: 'text', get: (r) => humanize(field(r, 'tradition')) },
    {
      id: 'composed_year',
      alias: 'Composed',
      kind: 'num',
      get: (r) => {
        const y = nestedYear(r, 'composed');
        return isNaN(y) ? '' : String(y);
      },
      num: (r) => nestedYear(r, 'composed'),
    },
  ],
};

// (Sources are presented in the dedicated Sources bibliography overlay, not as a
// register tab — see REGISTER_SCHEMAS below.)

// ── Wave 3 / Phase C — geo-escalated kind schemas ────────────────────────────

const SETTLEMENT_SCHEMA: RegisterSchema = {
  kind: 'settlement',
  label: 'Settlements',
  columns: [
    textCol('name', 'Name', 'name'),
    { id: 'importance', alias: 'Importance', kind: 'text', get: (r) => humanize(field(r, 'importance')) },
    numCol('start_year', 'From', 'start_year'),
    numCol('end_year', 'To', 'end_year'),
    { id: 'end_confidence', alias: 'Confidence', kind: 'text', get: (r) => field(r, 'end_confidence') },
  ],
};

const MILITARY_SCHEMA: RegisterSchema = {
  kind: 'military',
  label: 'Military',
  columns: [
    textCol('name', 'Name', 'name'),
    { id: 'subtype', alias: 'Type', kind: 'text', get: (r) => humanize(field(r, 'subtype')) },
    numCol('start_year', 'From', 'start_year'),
    numCol('end_year', 'To', 'end_year'),
    textCol('description', 'Description', 'description'),
  ],
};

const CAPITAL_SCHEMA: RegisterSchema = {
  kind: 'capital',
  label: 'Capitals',
  columns: [
    textCol('name', 'Name', 'name'),
    { id: 'entity_name', alias: 'Polity', kind: 'text', get: (r) => field(r, 'entity_name') },
    numCol('start_year', 'From', 'start_year'),
    numCol('end_year', 'To', 'end_year'),
  ],
};

// ── Wave 6 / research-first layer — claim / annotation / research_question ───

/** Count items in an array field; NaN when absent (for numeric "count" columns). */
function arrayCount(record: RawRecord, key: string): number {
  const v = record[key];
  return Array.isArray(v) ? v.length : NaN;
}

/** Join an array-of-strings field as a humanized, comma-separated list. */
function joinIds(record: RawRecord, key: string): string {
  const v = record[key];
  if (!Array.isArray(v)) return '';
  return v.filter((x) => typeof x === 'string').map((x) => humanize(x as string)).join(', ');
}

const CLAIM_SCHEMA: RegisterSchema = {
  kind: 'claim',
  label: 'Claims',
  columns: [
    textCol('statement', 'Claim', 'statement'),
    { id: 'subjects', alias: 'Subjects', kind: 'text', get: (r) => joinIds(r, 'subject_ids') },
    { id: 'predicate', alias: 'Predicate', kind: 'text', get: (r) => humanize(field(r, 'predicate')) },
    {
      id: 'period',
      alias: 'Period',
      kind: 'num',
      get: (r) => {
        const p = r['period'];
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          const o = p as { from?: unknown; to?: unknown };
          const from = typeof o.from === 'number' ? o.from : NaN;
          const to = typeof o.to === 'number' ? o.to : NaN;
          return span(from, to);
        }
        return '';
      },
      num: (r) => {
        const p = r['period'];
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          const from = (p as { from?: unknown }).from;
          return typeof from === 'number' ? from : NaN;
        }
        return NaN;
      },
    },
    {
      id: 'attestation',
      alias: 'Attestation',
      kind: 'text',
      get: (r) => {
        const prov = r['provenance'];
        if (prov && typeof prov === 'object') {
          const a = (prov as Record<string, unknown>)['attestation'];
          return typeof a === 'string' ? humanize(a) : '';
        }
        return '';
      },
    },
  ],
};

const ANNOTATION_SCHEMA: RegisterSchema = {
  kind: 'annotation',
  label: 'Annotations',
  columns: [
    {
      id: 'quote',
      alias: 'Passage',
      kind: 'text',
      get: (r) => {
        const a = r['anchor'];
        if (a && typeof a === 'object') {
          const q = (a as Record<string, unknown>)['quote'];
          if (typeof q === 'string') return q;
          const loc = (a as Record<string, unknown>)['locator'];
          if (typeof loc === 'string') return loc;
        }
        return field(r, 'body');
      },
    },
    { id: 'target', alias: 'Source/Text', kind: 'text', get: (r) => humanize(field(r, 'target_id')) },
    { id: 'links', alias: 'Linked', kind: 'num', get: (r) => { const n = arrayCount(r, 'links_to'); return isNaN(n) ? '' : String(n); }, num: (r) => arrayCount(r, 'links_to') },
    { id: 'supports', alias: 'Claims', kind: 'num', get: (r) => { const n = arrayCount(r, 'supports_claims'); return isNaN(n) ? '' : String(n); }, num: (r) => arrayCount(r, 'supports_claims') },
  ],
};

const RESEARCH_QUESTION_SCHEMA: RegisterSchema = {
  kind: 'research_question',
  label: 'Questions',
  columns: [
    textCol('question', 'Question', 'question'),
    { id: 'status', alias: 'Status', kind: 'text', get: (r) => statusRootLabel(field(r, 'status')) },
    {
      id: 'evidence',
      alias: 'Evidence',
      kind: 'num',
      get: (r) => {
        const e = r['evidence'];
        if (e && typeof e === 'object' && !Array.isArray(e)) {
          const total = Object.values(e as Record<string, unknown>)
            .reduce((a: number, v) => a + (Array.isArray(v) ? v.length : 0), 0);
          return total ? String(total) : '';
        }
        return '';
      },
      num: (r) => {
        const e = r['evidence'];
        if (e && typeof e === 'object' && !Array.isArray(e)) {
          return Object.values(e as Record<string, unknown>)
            .reduce((a: number, v) => a + (Array.isArray(v) ? v.length : 0), 0);
        }
        return NaN;
      },
    },
  ],
};

/**
 * The ordered list of registers shown as kind-picker tabs in the overlay.
 * Order matches the most-used → least-used reading order.
 */
export const REGISTER_SCHEMAS: readonly RegisterSchema[] = [
  POLITY_SCHEMA,
  EVENT_SCHEMA,
  RULER_SCHEMA,
  RELATIONSHIP_SCHEMA,
  JOURNEY_SCHEMA,
  INSTITUTION_SCHEMA,
  TECHNOLOGY_SCHEMA,
  TEXT_SCHEMA,
  // Sources are NOT a register tab — the dedicated Sources overlay (the
  // bibliography view) is the canonical surface for them; a duplicate tab was
  // redundant.
  // Wave 3 / Phase C — geo-escalated kinds
  SETTLEMENT_SCHEMA,
  MILITARY_SCHEMA,
  CAPITAL_SCHEMA,
  // Wave 6 / research-first layer
  CLAIM_SCHEMA,
  ANNOTATION_SCHEMA,
  RESEARCH_QUESTION_SCHEMA,
];

/** Look up a register schema by its loader kind. */
export function schemaForKind(kind: RecordType): RegisterSchema | undefined {
  return REGISTER_SCHEMAS.find((s) => s.kind === kind);
}
