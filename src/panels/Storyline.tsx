/**
 * Storyline — interleaved two-entity chronicle view.
 *
 * Artboard 05: two-column-with-spine layout. Given exactly 2 compare entries
 * (entity A and entity B), renders their events interleaved on a shared year
 * axis:
 *
 *   [ A events ]  |  year spine  |  [ B events ]
 *
 * Event inclusion: an event appears in an entity's column when:
 *   - event.entity === entityId, OR
 *   - event._quarry.participants[] includes entityId
 *
 * Spine: drawn as a vertical rule with year tick marks. Uses timeStore's
 * boundsMin..boundsMax for the axis window. Each event node is positioned
 * at `top = (year - min) / range * 100%`. Relation markers (where a
 * relationship between A and B starts/ends) appear on the spine itself.
 *
 * Click an event → selectionStore.select(eventId, 'event') so EntityDock
 * fills with it.
 *
 * Relationship color: uses the --ng-color-* CSS vars already defined in
 * network-graph.css for consistency with the Network view.
 *
 * Design: square corners, hairline borders, no shadows, token CSS only.
 * Works in all 4 themes.
 *
 * Phase 4-C — compare/storyline agent.
 */

import { useMemo, useCallback } from 'react';
import { useCompareStore } from '@/stores/compareStore';
import { useTimeStore }    from '@/stores/timeStore';
import { loadRecords }     from '@/data/loaders';
import type { RawRecord }  from '@/data/loaders';
import { useSelectionStore } from '@/stores/selectionStore';
import { fieldStr }          from '@/panels/types';
import { ChartFrame }        from '@/charts/ChartFrame';
import { humanizeId, displayNameFromRecord } from '@/data/displayName';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of year-axis tick marks to render on the spine. */
const TICK_COUNT = 11;

/** Minimum pixel separation between events before we start offsetting. */
const MIN_PX_GAP = 28;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Return events from the loaded event array that belong to a given entity id. */
function eventsForEntity(entityId: string): RawRecord[] {
  const events = loadRecords('event');
  return events.filter((e) => {
    if (e['entity'] === entityId) return true;
    const quarry = e['_quarry'] as Record<string, unknown> | undefined;
    if (Array.isArray(quarry?.['participants'])) {
      return (quarry['participants'] as string[]).includes(entityId);
    }
    return false;
  });
}

/** Return relationships where BOTH entity A and entity B are participants. */
function crossRelationships(idA: string, idB: string): RawRecord[] {
  const rels = loadRecords('relationship');
  return rels.filter((r) => {
    const participants = r['participants'];
    if (!Array.isArray(participants)) return false;
    const ids = (participants as Array<{ entity_id: string }>).map((p) => p.entity_id);
    return ids.includes(idA) && ids.includes(idB);
  });
}

/** Extract year as number from an event record, or null if absent. */
function eventYear(e: RawRecord): number | null {
  return typeof e['year'] === 'number' ? e['year'] : null;
}

/** Get the display name for a record (shared helper: name_primary → name → title → humanized id). */
function displayName(r: RawRecord): string {
  return displayNameFromRecord(r);
}

/** Map a relationship type string to its --ng-color-* CSS var. */
function relTypeColor(type: string): string {
  const MAP: Record<string, string> = {
    alliance:   'var(--ng-color-alliance)',
    rivalry:    'var(--ng-color-rivalry)',
    succession: 'var(--ng-color-succession)',
    vassalage:  'var(--ng-color-vassalage)',
    tributary:  'var(--ng-color-tributary)',
    trade:      'var(--ng-color-trade)',
    marriage:   'var(--ng-color-marriage)',
    religious:  'var(--ng-color-religious)',
  };
  return MAP[type] ?? 'var(--ink-mute)';
}

/** Clamp a year to [min, max]. */
function clamp(y: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, y));
}

/**
 * Convert a year to a percent position along the axis (0% = top = min year).
 * The spine flows top-to-bottom chronologically.
 */
function yearToPercent(year: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((clamp(year, min, max) - min) / (max - min)) * 100;
}

// ── Positioned event block ─────────────────────────────────────────────────────

interface EventBlockProps {
  event: RawRecord;
  year: number;
  topPercent: number;
  side: 'left' | 'right';
  onSelect: (id: string) => void;
}

/**
 * A single event card positioned absolutely in its column.
 * Click triggers selectionStore navigation.
 */
function EventBlock({ event, year, topPercent, side, onSelect }: EventBlockProps) {
  const name     = typeof event['name'] === 'string' && event['name'] ? event['name'] : humanizeId(event.id);
  const category = fieldStr(event['category']);
  const type     = fieldStr(event['type']);

  return (
    <button
      type="button"
      onClick={() => onSelect(event.id)}
      title={`${name} (${year})\nClick to inspect`}
      aria-label={`Event: ${name}, year ${year}`}
      style={{
        position: 'absolute',
        top: `${topPercent}%`,
        [side === 'left' ? 'right' : 'left']: 0,
        width: 'calc(100% - 4px)',
        background: 'var(--surface)',
        border: '1px solid var(--border-mid)',
        padding: 'var(--space-1) var(--space-2)',
        cursor: 'pointer',
        textAlign: side === 'left' ? 'right' : 'left',
        transform: 'translateY(-50%)',
        // Compositor-safe transitions only
        transition: 'border-color 100ms ease, background 100ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLButtonElement).style.background  = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
        (e.currentTarget as HTMLButtonElement).style.background  = 'var(--surface)';
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-mute)',
          whiteSpace: 'nowrap',
        }}
      >
        {year} · {type !== '—' ? type : category}
      </div>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--ink)',
          lineHeight: 1.3,
          marginTop: '2px',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {name}
      </div>
    </button>
  );
}

// ── Spine relation marker ──────────────────────────────────────────────────────

interface SpineMarkerProps {
  rel: RawRecord;
  year: number;
  topPercent: number;
}

/** A colored marker on the spine for a cross-relationship start/end point. */
function SpineMarker({ rel, year, topPercent }: SpineMarkerProps) {
  const type  = fieldStr(rel['type']);
  const color = relTypeColor(type);
  const note  = fieldStr(rel['note']);

  return (
    <div
      title={`${type} (${year})${note !== '—' ? ': ' + note : ''}`}
      aria-label={`Relationship: ${type} at year ${year}`}
      style={{
        position: 'absolute',
        top: `${topPercent}%`,
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '12px',
        height: '12px',
        background: color,
        border: '2px solid var(--surface)',
        zIndex: 5,
        cursor: 'default',
      }}
    />
  );
}

// ── Entity column header ───────────────────────────────────────────────────────

interface EntityHeaderProps {
  record: RawRecord | null;
  kind: string;
  side: 'left' | 'right';
  eventCount: number;
}

function EntityHeader({ record, kind, side, eventCount }: EntityHeaderProps) {
  const name = record ? displayName(record) : '—';

  return (
    <div
      style={{
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border-mid)',
        textAlign: side === 'left' ? 'right' : 'left',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={name}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-mute)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginTop: '2px',
        }}
      >
        {kind} · {eventCount} events
      </div>
    </div>
  );
}

// ── Spine year axis ────────────────────────────────────────────────────────────

interface SpineAxisProps {
  boundsMin: number;
  boundsMax: number;
  tickCount: number;
}

/** The center vertical spine with year tick marks. */
function SpineAxis({ boundsMin, boundsMax, tickCount }: SpineAxisProps) {
  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = (boundsMax - boundsMin) / (tickCount - 1);
    for (let i = 0; i < tickCount; i++) {
      out.push(Math.round(boundsMin + step * i));
    }
    return out;
  }, [boundsMin, boundsMax, tickCount]);

  return (
    <div
      style={{
        width: '56px',
        flexShrink: 0,
        position: 'relative',
        borderLeft: '1px solid var(--border-mid)',
        borderRight: '1px solid var(--border-mid)',
        background: 'var(--surface)',
      }}
    >
      {/* Vertical rule */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: '1px',
          background: 'var(--border-mid)',
        }}
      />
      {ticks.map((year) => {
        const pct = yearToPercent(year, boundsMin, boundsMax);
        return (
          <div
            key={year}
            style={{
              position: 'absolute',
              top: `${pct}%`,
              left: 0,
              right: 0,
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {/* Tick mark */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '1px',
                background: 'var(--border)',
                opacity: 0.5,
              }}
            />
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--ink-mute)',
                background: 'var(--surface)',
                padding: '0 2px',
                position: 'relative',
                lineHeight: 1,
              }}
            >
              {year}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/** Props for Storyline. */
export interface StorylineProps {
  /** Height of the scrollable chronicle area in px. Defaults to full flex growth. */
  heightPx?: number;
}

/**
 * Interleaved two-entity chronicle.
 *
 * Only enabled when exactly 2 items are in the compare set. Renders the
 * shared year axis as a spine with entity A's events on the left and
 * entity B's events on the right. Cross-relationships appear as colored
 * markers on the spine.
 *
 * Clicking an event calls selectionStore.select(eventId, 'event') so the
 * EntityDock inspects it.
 */
export function Storyline(_props: StorylineProps) {
  const items  = useCompareStore((s) => s.items);
  const select = useSelectionStore((s) => s.select);

  const boundsMin = useTimeStore((s) => s.boundsMin);
  const boundsMax = useTimeStore((s) => s.boundsMax);

  const handleSelect = useCallback(
    (eventId: string) => select(eventId, 'event'),
    [select],
  );

  // Rules-of-Hooks: ALL hooks below must run on every render, so we derive the two
  // entries as NULLABLE before any guard and make each hook tolerate the not-yet-2
  // case. The render-time guard (requires exactly 2 records) lives at the end, after
  // every hook has run. (Previously an early return sat above these useMemo calls,
  // making them conditional — a real Rules-of-Hooks violation that could corrupt
  // hook state when the compare set changed between 1 and 2 records.)
  const entryA = items[0] ?? null;
  const entryB = items[1] ?? null;

  // Resolve records for headers (null when the entry is absent)
  const recordA = useMemo(() => {
    if (!entryA) return null;
    const rs = loadRecords('polity');
    return (
      rs.find((r) => r.id === entryA.id) ??
      loadRecords('ruler').find((r) => r.id === entryA.id) ??
      null
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryA?.id, entryA?.kind]);

  const recordB = useMemo(() => {
    if (!entryB) return null;
    const rs = loadRecords('polity');
    return (
      rs.find((r) => r.id === entryB.id) ??
      loadRecords('ruler').find((r) => r.id === entryB.id) ??
      null
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryB?.id, entryB?.kind]);

  // Load events for each entity — memoised so we don't re-scan 2,914 events on every render.
  // Deps are entry .id (the stable key) by design, not the entry object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eventsA = useMemo(() => (entryA ? eventsForEntity(entryA.id) : []), [entryA?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eventsB = useMemo(() => (entryB ? eventsForEntity(entryB.id) : []), [entryB?.id]);

  // Cross-relationships for spine markers
  const crossRels = useMemo(
    () => (entryA && entryB ? crossRelationships(entryA.id, entryB.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryA?.id, entryB?.id],
  );

  // Filter events to the active time window and sort chronologically
  const filteredA = useMemo(
    () =>
      eventsA
        .filter((e) => {
          const y = eventYear(e);
          return y !== null && y >= boundsMin && y <= boundsMax;
        })
        .sort((a, b) => (eventYear(a) ?? 0) - (eventYear(b) ?? 0)),
    [eventsA, boundsMin, boundsMax],
  );

  const filteredB = useMemo(
    () =>
      eventsB
        .filter((e) => {
          const y = eventYear(e);
          return y !== null && y >= boundsMin && y <= boundsMax;
        })
        .sort((a, b) => (eventYear(a) ?? 0) - (eventYear(b) ?? 0)),
    [eventsB, boundsMin, boundsMax],
  );

  // Chronicle height: enough space for the densest column
  const maxEvents = Math.max(filteredA.length, filteredB.length, 1);
  // Give at least MIN_PX_GAP per event, minimum 600px
  const chronicleHeight = Math.max(600, maxEvents * MIN_PX_GAP * 1.5);

  // Derive claim title from entity names and cross-relationship count
  const nameA = recordA ? displayName(recordA) : entryA.id;
  const nameB = recordB ? displayName(recordB) : entryB.id;
  const claimTitle = crossRels.length > 0
    ? `${nameA} and ${nameB} shared ${crossRels.length} recorded relationship${crossRels.length > 1 ? 's' : ''} across the compared window.`
    : `${nameA} and ${nameB} have no direct recorded relationships in the compared window.`;

  const claimSubtitle = `Chronicle · ${boundsMin}–${boundsMax} CE · ${filteredA.length + filteredB.length} events`;

  // Render guard (after all hooks have run): Storyline needs exactly 2 records.
  // entryA / entryB are guaranteed non-null below this point.
  if (items.length !== 2 || !entryA || !entryB) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 'var(--space-6)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--ink-mute)', lineHeight: 1.5 }}>
          Storyline requires exactly 2 records in the compare set.
          {items.length < 2
            ? ` Add ${2 - items.length} more record${2 - items.length > 1 ? 's' : ''}.`
            : ' Remove records until exactly 2 remain.'}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ChartFrame header — claim title + hairline */}
      <div style={{ padding: 'var(--space-3) var(--space-3) 0', flexShrink: 0 }}>
        <ChartFrame
          title={claimTitle}
          subtitle={claimSubtitle}
          sourceIds={[]}
          asSection={false}
        >
          {/* No children — only the title/rule portion is used here */}
          <span />
        </ChartFrame>
      </div>
      {/* Column headers — sticky */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-mid)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntityHeader
            record={recordA}
            kind={entryA.kind}
            side="left"
            eventCount={filteredA.length}
          />
        </div>
        {/* Spine header */}
        <div
          style={{
            width: '56px',
            flexShrink: 0,
            background: 'var(--surface-2)',
            borderLeft: '1px solid var(--border-mid)',
            borderRight: '1px solid var(--border-mid)',
            borderBottom: '1px solid var(--border-mid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-mute)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Year
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EntityHeader
            record={recordB}
            kind={entryB.kind}
            side="right"
            eventCount={filteredB.length}
          />
        </div>
      </div>

      {/* Chronicle scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
        {/* Column A */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            height: `${chronicleHeight}px`,
            borderRight: '1px solid var(--border)',
            padding: '0 var(--space-2)',
          }}
        >
          {filteredA.map((ev) => {
            const year = eventYear(ev)!;
            const pct  = yearToPercent(year, boundsMin, boundsMax);
            return (
              <EventBlock
                key={ev.id}
                event={ev}
                year={year}
                topPercent={pct}
                side="left"
                onSelect={handleSelect}
              />
            );
          })}
          {filteredA.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: 'var(--space-3)',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                color: 'var(--ink-mute)',
                textAlign: 'right',
              }}
            >
              No events in window
            </div>
          )}
        </div>

        {/* Spine with year axis + relation markers */}
        <div
          style={{
            width: '56px',
            flexShrink: 0,
            position: 'relative',
            height: `${chronicleHeight}px`,
          }}
        >
          <SpineAxis boundsMin={boundsMin} boundsMax={boundsMax} tickCount={TICK_COUNT} />

          {/* Cross-relationship spine markers */}
          {crossRels.map((rel) => {
            const since = typeof rel['since'] === 'number' ? rel['since'] : null;
            if (since === null) return null;
            const year = clamp(since, boundsMin, boundsMax);
            const pct  = yearToPercent(year, boundsMin, boundsMax);
            return (
              <SpineMarker
                key={rel.id}
                rel={rel}
                year={year}
                topPercent={pct}
              />
            );
          })}
        </div>

        {/* Column B */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            height: `${chronicleHeight}px`,
            borderLeft: '1px solid var(--border)',
            padding: '0 var(--space-2)',
          }}
        >
          {filteredB.map((ev) => {
            const year = eventYear(ev)!;
            const pct  = yearToPercent(year, boundsMin, boundsMax);
            return (
              <EventBlock
                key={ev.id}
                event={ev}
                year={year}
                topPercent={pct}
                side="right"
                onSelect={handleSelect}
              />
            );
          })}
          {filteredB.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 'var(--space-3)',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                color: 'var(--ink-mute)',
              }}
            >
              No events in window
            </div>
          )}
        </div>
      </div>

      {/* Footer: relationship summary */}
      {crossRels.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--border-mid)',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--surface-2)',
            display: 'flex',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-mute)',
            }}
          >
            {crossRels.length} cross-relationship{crossRels.length > 1 ? 's' : ''}
          </span>
          {crossRels.map((rel) => {
            const type  = fieldStr(rel['type']);
            const since = fieldStr(rel['since']);
            const until = fieldStr(rel['until']);
            const color = relTypeColor(type);
            return (
              <span
                key={rel.id}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-mid)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    background: color,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                {type} {since !== '—' ? since : '?'}–{until !== '—' ? until : 'ongoing'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

