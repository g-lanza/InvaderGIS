/**
 * CompareTable — side-by-side comparison of 2–4 records.
 *
 * Polity comparisons are rendered in curated sections with human-readable
 * labels and formatted values. Other kinds fall back to a cleaned flat view.
 *
 * Design contract: square corners, hairline borders, no shadows, token CSS.
 * All values sourced from real records — never fabricated.
 *
 * Phase 4-C — compare/storyline agent.
 */

import { useMemo } from 'react';
import { useCompareStore }  from '@/stores/compareStore';
import { loadRecords }      from '@/data/loaders';
import type { RawRecord }   from '@/data/loaders';
import type { RecordType }  from '@/types/record';
import { MEDIEVAL_KINDS }   from '@/panels/types';
import { RelationshipLink } from '@/panels/RelationshipLink';
import { displayNameFromRecord } from '@/data/displayName';
import { formatYear } from '@/data/formatYear';

// ── Record resolver ────────────────────────────────────────────────────────────

function findRecord(id: string, kind: string): RawRecord | null {
  if (!MEDIEVAL_KINDS.has(kind as RecordType)) return null;
  const records = loadRecords(kind as RecordType);
  return records.find((r) => r.id === id) ?? null;
}

// ── Name resolution ────────────────────────────────────────────────────────────

/** Primary display name from any record (shared helper; "(not found)" for null). */
function displayName(record: RawRecord | null): string {
  if (!record) return '(not found)';
  return displayNameFromRecord(record);
}

/** Resolve a polity id to its name, falling back to the raw id. */
function polityName(id: string): string {
  const polities = loadRecords('polity');
  const p = polities.find((r) => r.id === id);
  return p ? displayName(p) : id;
}

// ── Value formatters ───────────────────────────────────────────────────────────

/** Year formatter for the compare table — shows the era ("1066 CE"), and now
 *  correctly renders negative years as BCE (the old copy mislabeled them "CE"). */
function fmtYear(v: unknown): string {
  return formatYear(v, { withEra: true });
}

function fmtStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '—';
}

function fmtList(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return '—';
  return v.map((x) => (typeof x === 'string' ? x : String(x))).join(', ');
}

function fmtType(v: unknown): string {
  if (typeof v !== 'string' || !v) return '—';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCapitals(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return '—';
  return v
    .map((c) => {
      if (typeof c !== 'object' || !c) return '';
      const cap = c as Record<string, unknown>;
      const name = typeof cap['name'] === 'string' ? cap['name'] : '?';
      const from = typeof cap['from'] === 'number' ? cap['from'] : '?';
      const to   = typeof cap['to']   === 'number' ? cap['to']   : '?';
      return `${name} (${from}–${to} CE)`;
    })
    .filter(Boolean)
    .join(' → ');
}

function fmtPopulation(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return '—';
  const last = v[v.length - 1] as Record<string, unknown>;
  if (!last) return '—';
  const year = last['year'];
  const mid  = last['mid'];
  if (mid === undefined) return '—';
  const n = Number(mid);
  const label = isNaN(n) ? String(mid) : n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(0)}k`
    : String(n);
  return year !== undefined ? `${label} (c. ${year} CE)` : label;
}

function fmtCoords(v: unknown): string {
  if (!Array.isArray(v) || v.length < 2) return '—';
  const [lat, lon] = v as number[];
  const latStr = `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

// ── Section definitions for polities ──────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  format: (v: unknown, record: RawRecord) => string;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

const POLITY_SECTIONS: SectionDef[] = [
  {
    title: 'Identity',
    fields: [
      { key: 'name_primary',  label: 'Name',         format: fmtStr  },
      { key: 'name_variants', label: 'Also known as', format: fmtList },
      { key: 'type',          label: 'Type',          format: fmtType },
      { key: 'monogram',      label: 'Monogram',      format: fmtStr  },
      { key: 'tags',          label: 'Tags',          format: fmtList },
    ],
  },
  {
    title: 'Time',
    fields: [
      { key: 'formed',    label: 'Founded',   format: (v) => fmtYear(v) },
      { key: 'dissolved', label: 'Dissolved', format: (v) => fmtYear(v) },
    ],
  },
  {
    title: 'Geography',
    fields: [
      { key: 'region',          label: 'Region',   format: fmtType },
      { key: 'capital_history', label: 'Capitals', format: fmtCapitals },
      { key: 'centroid',        label: 'Centroid', format: fmtCoords },
    ],
  },
  {
    title: 'Culture',
    fields: [
      { key: 'religion',   label: 'Religion',   format: fmtStr  },
      { key: 'ethnicity',  label: 'Ethnicity',  format: fmtStr  },
      { key: 'languages',  label: 'Languages',  format: fmtList },
    ],
  },
  {
    title: 'Population',
    fields: [
      { key: 'population_estimates', label: 'Peak estimate', format: fmtPopulation },
    ],
  },
];

// ── Generic fallback field list (non-polity kinds) ─────────────────────────────

const EXCLUDED_KEYS = new Set([
  'kind', 'dataset', '__type', 'polygon_snapshots', '_quarry', 'provenance',
  'id', // shown in column header already
]);

/** Human label for a raw field key. */
function labelFor(key: string): string {
  const MAP: Record<string, string> = {
    name: 'Name', name_primary: 'Name', title: 'Title',
    year: 'Year', year_start: 'Start', year_end: 'End',
    reign_start: 'Reign start', reign_end: 'Reign end',
    formed: 'Founded', dissolved: 'Dissolved',
    type: 'Type', kind: 'Kind', region: 'Region',
    entity: 'Entity', polity: 'Polity',
    summary: 'Summary', outcomes: 'Outcomes',
    religion: 'Religion', ethnicity: 'Ethnicity',
    languages: 'Languages', tags: 'Tags',
    coords: 'Coordinates', centroid: 'Centroid',
    since: 'Since', until: 'Until',
    domain: 'Domain', origin: 'Origin',
    waypoints: 'Waypoints',
  };
  return MAP[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Generic formatter for fallback kinds. */
function fmtGeneric(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return fmtList(v);
  return '—';
}

function genericFields(records: RawRecord[]): FieldDef[] {
  const keys = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!EXCLUDED_KEYS.has(k)) keys.add(k);
    }
  }
  // Rough preferred order then alphabetical remainder
  const preferred = ['name','name_primary','type','region','year','formed','dissolved',
    'reign_start','reign_end','entity','polity','summary'];
  const ordered = preferred.filter((k) => keys.has(k));
  const rest = [...keys].filter((k) => !ordered.includes(k)).sort();
  return [...ordered, ...rest].map((key) => ({
    key,
    label: labelFor(key),
    format: (v: unknown, r: RawRecord) => {
      // Year fields
      if (['year','formed','dissolved','since','until','reign_start','reign_end',
           'year_start','year_end'].includes(key)) return fmtYear(v);
      // Type fields
      if (key === 'type') return fmtType(v);
      // Entity/polity refs — resolve to name
      if ((key === 'entity' || key === 'polity') && typeof r[key] === 'string') {
        return polityName(r[key] as string);
      }
      return fmtGeneric(v);
    },
  }));
}

// ── Diff detection ─────────────────────────────────────────────────────────────

function cellVal(record: RawRecord | null, key: string, format: FieldDef['format']): string {
  if (!record) return '—';
  return format(record[key], record);
}

function hasDiff(records: (RawRecord | null)[], key: string, format: FieldDef['format']): boolean {
  const vals = records.map((r) => cellVal(r, key, format));
  return vals.some((v) => v !== vals[0]);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Column header: entity name + kind chip + remove button. */
function ColHeader({ record, kind, onRemove }: {
  record: RawRecord | null; kind: string; onRemove: () => void;
}) {
  const name = displayName(record);
  return (
    <th style={{
      padding: 'var(--space-2) var(--space-3)',
      textAlign: 'left',
      fontFamily: 'var(--font-body)',
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--ink)',
      background: 'var(--surface-2)',
      borderLeft: '1px solid var(--border-mid)',
      borderBottom: '2px solid var(--border-mid)',
      verticalAlign: 'top',
      minWidth: '160px',
      maxWidth: '240px',
      position: 'sticky',
      top: 0,
      zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={name}>
            {name}
          </div>
          <div style={{
            fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '3px',
          }}>
            {fmtType(kind)}
          </div>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} style={{
          background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
          color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>
    </th>
  );
}

/** Section header row spanning all columns. */
function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount + 1} style={{
        padding: 'var(--space-1) var(--space-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-mid)',
        background: 'var(--surface-3)',
        borderTop: '1px solid var(--border-mid)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        left: 0,
      }}>
        {label}
      </td>
    </tr>
  );
}

/** A single data row. Dims identical values; accents differing ones. */
function FieldRow({ field, records }: { field: FieldDef; records: (RawRecord | null)[] }) {
  const diff = hasDiff(records, field.key, field.format);
  const values = records.map((r) => cellVal(r, field.key, field.format));
  // Skip rows where every record has no value (all "—")
  if (values.every((v) => v === '—')) return null;

  return (
    <tr>
      <td style={{
        padding: 'var(--space-2) var(--space-3)',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        // --ink-mid (not --ink-mute) so the label stays legible under contrast.
        color: 'var(--ink-mid)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border-mid)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
        verticalAlign: 'top',
        position: 'sticky',
        left: 0,
        zIndex: 1,
      }}>
        {field.label}
      </td>
      {records.map((_record, i) => {
        const val = values[i];
        return (
          <td key={i} style={{
            padding: 'var(--space-1) var(--space-3)',
            fontSize: '12px',
            color: val === '—' ? 'var(--ink-mute)' : 'var(--ink)',
            fontFamily: 'var(--font-body)',
            verticalAlign: 'top',
            borderLeft: diff ? '2px solid var(--accent)' : '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            background: diff ? 'var(--accent-bg)' : 'transparent',
            wordBreak: 'break-word',
            minWidth: '160px',
            maxWidth: '240px',
            lineHeight: 1.5,
          }}>
            {val}
          </td>
        );
      })}
    </tr>
  );
}

// ── Cross-relationships subsection ────────────────────────────────────────────

function findCrossRelationships(ids: string[]): RawRecord[] {
  const idSet = new Set(ids);
  return loadRecords('relationship').filter((r) => {
    const ps = r['participants'];
    if (Array.isArray(ps)) {
      return (ps as Array<{ entity_id: string }>).some((p) => idSet.has(p.entity_id));
    }
    return idSet.has(r['from_id'] as string) || idSet.has(r['to_id'] as string);
  });
}

function RelationshipsSubsection({ compareIds, onNavigate }: {
  compareIds: string[];
  onNavigate: (id: string, kind: string) => void;
}) {
  const rels = useMemo(() => findCrossRelationships(compareIds), [compareIds]);
  if (rels.length === 0) return null;

  return (
    <div style={{ marginTop: 'var(--space-5)' }}>
      <div style={{
        padding: 'var(--space-1) var(--space-3)',
        background: 'var(--surface-3)',
        borderTop: '1px solid var(--border-mid)',
        borderBottom: '1px solid var(--border-mid)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--ink-mid)', fontWeight: 600,
        }}>
          Relationships between these entities ({rels.length})
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr>
            {['Type', 'Period', 'Participants'].map((h) => (
              <th key={h} style={{
                padding: 'var(--space-1) var(--space-3)',
                textAlign: 'left', fontSize: '9px', fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-mute)',
                background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontWeight: 500,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rels.map((rel) => {
            const type = fmtType(rel['type']);
            const since = rel['since'] !== undefined ? fmtYear(rel['since']) : '—';
            const until = rel['until'] !== null && rel['until'] !== undefined ? fmtYear(rel['until']) : 'ongoing';
            const period = since === '—' ? '—' : `${since} – ${until}`;
            const participants = Array.isArray(rel['participants'])
              ? (rel['participants'] as Array<{ entity_id: string; role: string }>)
              : [];

            return (
              <tr key={rel.id}>
                <td style={{
                  padding: 'var(--space-1) var(--space-3)', fontSize: '12px',
                  color: 'var(--ink)', borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 500,
                }}>
                  {type}
                </td>
                <td style={{
                  padding: 'var(--space-1) var(--space-3)', fontSize: '11px',
                  color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}>
                  {period}
                </td>
                <td style={{
                  padding: 'var(--space-1) var(--space-3)', fontSize: '12px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {participants.map((p, pi) => (
                      <span key={p.entity_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                        {pi > 0 && <span style={{ color: 'var(--ink-mute)', fontSize: '10px' }}>·</span>}
                        <RelationshipLink
                          targetId={p.entity_id}
                          targetKind="polity"
                          label={polityName(p.entity_id)}
                          onNavigate={onNavigate}
                        />
                        {p.role && (
                          <span style={{
                            fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)',
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}>
                            ({p.role})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface CompareTableProps {
  onNavigate: (id: string, kind: string) => void;
}

export function CompareTable({ onNavigate }: CompareTableProps) {
  const items  = useCompareStore((s) => s.items);
  const remove = useCompareStore((s) => s.remove);

  const records = useMemo(
    () => items.map((e) => findRecord(e.id, e.kind)),
    [items],
  );

  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-2)',
        padding: 'var(--space-6)', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--ink-mute)',
        }}>No records to compare</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.5, maxWidth: '300px' }}>
          Add records via the search palette or the dock's Compare action.
        </div>
      </div>
    );
  }

  // Determine sections to render
  const kinds = [...new Set(items.map((e) => e.kind))];
  const isAllPolities = kinds.length === 1 && kinds[0] === 'polity';
  const sections: SectionDef[] = isAllPolities
    ? POLITY_SECTIONS
    : [{ title: 'Fields', fields: genericFields(records.filter((r): r is RawRecord => r !== null)) }];

  const compareIds = items.map((e) => e.id);
  const colCount = items.length;

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', height: '100%' }}>
      <table style={{
        borderCollapse: 'collapse',
        tableLayout: 'auto',
        minWidth: `${150 + colCount * 200}px`,
      }}>
        <thead>
          <tr>
            {/* Sticky label column header */}
            <th style={{
              padding: 'var(--space-2) var(--space-3)',
              textAlign: 'left', fontSize: '9px', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-mute)',
              background: 'var(--surface-2)', borderBottom: '2px solid var(--border-mid)',
              borderRight: '1px solid var(--border-mid)', position: 'sticky',
              top: 0, left: 0, zIndex: 3, minWidth: '110px', fontWeight: 500,
            }}>
              Field
            </th>
            {items.map((entry, i) => (
              <ColHeader
                key={entry.id}
                record={records[i] ?? null}
                kind={entry.kind}
                onRemove={() => remove(entry.id)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <>
              <SectionHeader key={`hdr-${section.title}`} label={section.title} colCount={colCount} />
              {section.fields.map((field) => (
                <FieldRow key={field.key} field={field} records={records} />
              ))}
            </>
          ))}
        </tbody>
      </table>

      <RelationshipsSubsection compareIds={compareIds} onNavigate={onNavigate} />
    </div>
  );
}
