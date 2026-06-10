/**
 * ConnectionsTab — polity relationship inspector.
 *
 * Resolves a polity's relationships by matching
 *   participants[].entity_id === polityId
 * (NOT from_id/to_id — those are empty ""; the bug is documented in the source).
 *
 * Sections:
 *   1. Relationship-type donut — the shared, theme-aware src/charts/RelationshipDonut.
 *      The panel pre-filters relationships and passes them in as { type }[] plus
 *      the active theme; the donut applies domainColor() and ChartFrame itself.
 *   2. Ties list — each relationship as a .row-key entry:
 *        RelationshipLink to the other party | type chip | since–until | note
 *      Type colors are theme-adjusted via domainColor(theme).
 *   3. Ruler succession Sankey — shown only when this polity has rulers with
 *      succession links. Reuses src/charts/SuccessionSankey.tsx.
 *
 * Honest-empty states:
 *   - No relationships → "No recorded connections" (whole tab)
 *   - No succession data → SuccessionSankey returns null (it self-manages)
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows, token-only.
 *   - No inline hex — domain colors come from RELATIONSHIP_TYPES /
 *     RELATIONSHIP_FALLBACK in tokens.ts, lightened in dark theme via domainColor().
 *   - No italics in chrome. Correct in all 4 themes.
 */

import { lazy, Suspense, useMemo, type JSX } from 'react';
import { formatYear as fmtYear } from '@/data/formatYear';
import type { CardProps } from '@/panels/types';
import { loadRecords, findRecordById } from '@/data/loaders';
import { humanizeId, displayNameFromRecord } from '@/data/displayName';
import { RelationshipLink } from '@/panels/RelationshipLink';
import { RelatedPanel } from '@/panels/RelatedPanel';
import type { RelationshipEntry } from '@/charts/RelationshipDonut';
import { RELATIONSHIP_TYPES, RELATIONSHIP_FALLBACK, domainColor } from '@/design/tokens';
import { useSettingsStore } from '@/stores/settingsStore';

// ── Lazy chart imports (keep the dock light) ───────────────────────────────────

const RelationshipDonut = lazy(() =>
  import('@/charts/RelationshipDonut').then((m) => ({ default: m.RelationshipDonut })),
);

const SuccessionSankey = lazy(() =>
  import('@/charts/SuccessionSankey').then((m) => ({ default: m.SuccessionSankey })),
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** A participant entry in a relationship record. */
interface Participant {
  entity_id: string;
  role?: string;
}

/** A resolved relationship row for display. */
interface RelRow {
  id: string;
  type: string;
  /** The other party's entity id. */
  otherId: string;
  /** The other party's display name. */
  otherName: string;
  since: number | null;
  until: number | null;
  note: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a year-ish value to number | null. */
function toYear(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}


/** Format a since–until span. */
function fmtSpan(since: number | null, until: number | null): string {
  if (since === null && until === null) return '—';
  if (since !== null && until !== null) return `${fmtYear(since)}–${fmtYear(until)}`;
  if (since !== null) return `${fmtYear(since)} –`;
  return `– ${fmtYear(until!)}`;
}

/**
 * Resolve the display name for an entity id via the O(1) id index.
 * Falls back to a HUMANIZED id (never a raw slug) when the record or its name
 * field is absent.
 */
function resolveEntityName(entityId: string): string {
  return displayNameFromRecord(findRecordById(entityId)) || humanizeId(entityId);
}

/**
 * Parse participants[] from a relationship record.
 * Accepts both string items and object items with entity_id.
 */
function parseParticipants(raw: unknown): Participant[] {
  if (!Array.isArray(raw)) return [];
  const out: Participant[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0) {
      out.push({ entity_id: item });
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const eid = typeof o['entity_id'] === 'string' ? o['entity_id'] : null;
      if (eid) {
        out.push({
          entity_id: eid,
          role: typeof o['role'] === 'string' ? o['role'] : undefined,
        });
      }
    }
  }
  return out;
}

/** Theme-adjusted color for a relationship type (dark-theme safe). */
function typeColorFor(type: string, theme: string): string {
  return domainColor(RELATIONSHIP_TYPES[type] ?? RELATIONSHIP_FALLBACK, theme);
}

// ── Empty state ───────────────────────────────────────────────────────────────

function NoConnections(): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-6) var(--space-4)',
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-mute)',
      }}
    >
      No recorded connections
    </div>
  );
}

// ── ConnectionsTab ────────────────────────────────────────────────────────────

/**
 * Connections tab for a polity record.
 *
 * Resolves relationships via participants[].entity_id === polityId.
 * Renders the shared theme-aware type-breakdown donut, the ties list, and a
 * succession Sankey per ruler.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback for RelationshipLink clicks.
 */
export function ConnectionsTab({ record, onNavigate }: CardProps): JSX.Element {
  const polityId = typeof record['id'] === 'string' ? record['id'] : '';
  const theme = useSettingsStore((s) => s.theme);

  // ── Resolve relationships ────────────────────────────────────────────────
  const rows = useMemo<RelRow[]>(() => {
    if (!polityId) return [];

    const allRels = loadRecords('relationship');
    const resolved: RelRow[] = [];

    for (const rel of allRels) {
      const participants = parseParticipants(rel['participants']);
      const isMember = participants.some((p) => p.entity_id === polityId);
      if (!isMember) continue;

      const relType = typeof rel['type'] === 'string' ? rel['type'] : 'unknown';
      const note =
        typeof rel['note'] === 'string' && rel['note'].length > 0 ? rel['note'] : null;
      const since = toYear(rel['since']);
      const until = toYear(rel['until']);

      // The "other" party is the first participant that is not polityId.
      const other = participants.find((p) => p.entity_id !== polityId) ?? null;
      const otherId = other ? other.entity_id : '';
      const otherName = otherId ? resolveEntityName(otherId) : '—';

      resolved.push({
        id: rel['id'] as string,
        type: relType,
        otherId,
        otherName,
        since,
        until,
        note,
      });
    }

    return resolved;
  }, [polityId]);

  // ── Donut entries — pre-filtered { type }[] for the shared donut ─────────
  const donutEntries = useMemo<RelationshipEntry[]>(
    () => rows.map((r) => ({ type: r.type })),
    [rows],
  );

  const total = rows.length;

  // ── Ruler ids for Sankey ─────────────────────────────────────────────────
  // Each ruler for this polity may carry succession data. We render one Sankey
  // per ruler that has succession links (SuccessionSankey returns null when none).
  const rulerIds = useMemo<string[]>(() => {
    const rulers = loadRecords('ruler');
    return rulers
      .filter((r) => r['polity'] === polityId)
      .map((r) => r['id'] as string);
  }, [polityId]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (total === 0) {
    return <NoConnections />;
  }

  return (
    <div>
      {/* ── Type donut (shared, theme-aware) ────────────────────────────── */}
      <div
        className="panel"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div className="panel-head">
          <span className="panel-head__label">Relationship types</span>
          <span
            className="chip mono"
            style={{ color: 'var(--ink-light)', borderColor: 'var(--border)', fontSize: '10px' }}
          >
            {total}
          </span>
        </div>
        <div style={{ padding: '0 var(--space-3) var(--space-2)' }}>
          <Suspense fallback={null}>
            <RelationshipDonut relationships={donutEntries} theme={theme} />
          </Suspense>
        </div>
      </div>

      {/* ── Ties list ───────────────────────────────────────────────────── */}
      <div
        className="panel"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div className="panel-head">
          <span className="panel-head__label">Connections</span>
        </div>
        <ul
          style={{
            margin: 0,
            padding: '0 0 var(--space-2)',
            listStyle: 'none',
          }}
        >
          {rows.map((row) => {
            const typeColor = typeColorFor(row.type, theme);
            const span = fmtSpan(row.since, row.until);
            return (
              <li
                key={row.id}
                className="row-key"
                style={{
                  color: typeColor,
                  borderBottom: '0.5px solid var(--border)',
                  padding: 'var(--space-1) var(--space-3)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-1) var(--space-2)',
                  alignItems: 'start',
                }}
              >
                {/* Left: name link + type + note */}
                <div>
                  {row.otherId ? (
                    <RelationshipLink
                      targetId={row.otherId}
                      targetKind="polity"
                      label={row.otherName}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--ink)' }}>
                      {row.otherName}
                    </span>
                  )}
                  {/* Type badge */}
                  <span
                    className="chip"
                    style={{
                      display: 'inline-block',
                      marginLeft: 'var(--space-1)',
                      fontSize: '9px',
                      color: typeColor,
                      borderColor: typeColor,
                      letterSpacing: '0.05em',
                      textTransform: 'capitalize',
                    }}
                  >
                    {row.type.replace(/_/g, ' ')}
                  </span>
                  {/* Note */}
                  {row.note && (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: '11px',
                        color: 'var(--ink-light)',
                        lineHeight: 1.4,
                      }}
                    >
                      {row.note}
                    </div>
                  )}
                </div>

                {/* Right: span */}
                {span !== '—' && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--ink-mute)',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    {span}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Succession Sankey (per ruler) ────────────────────────────────── */}
      {rulerIds.length > 0 && (
        <div
          className="panel"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div className="panel-head">
            <span className="panel-head__label">Succession</span>
            <span
              className="chip mono"
              style={{ color: 'var(--ink-light)', borderColor: 'var(--border)', fontSize: '10px' }}
            >
              {rulerIds.length} ruler{rulerIds.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={null}>
              {rulerIds.map((rid) => (
                <SuccessionSankey key={rid} rulerId={rid} />
              ))}
            </Suspense>
          </div>
        </div>
      )}

      {/* ── Similar polities (find similar via shared partners) ──────────── */}
      <RelatedPanel id={polityId} onNavigate={onNavigate} variant="similar" />
    </div>
  );
}
