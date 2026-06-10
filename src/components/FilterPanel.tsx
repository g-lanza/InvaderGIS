/**
 * FilterPanel — faceted filter UI (Wave 1B).
 *
 * Sections: year range · record kinds · region · confidence level.
 * Active facet state lives in filterStore (additive, not frozen).
 * The panel derives a filtered list of polities from recordsStore + the
 * active facets, showing the result count as a live visible filter surface.
 *
 * Open/close is controlled by the parent (TopBar or AppShell) via the `open`
 * prop. The panel does not mount itself — the verify agent wires the toggle.
 *
 * Design: square corners, hairline borders, token-only, no shadows, 4 themes.
 *
 * MOUNT: TopBar adds a "Filter" toggle button that shows/hides FilterPanel.
 * The verify agent should render <FilterPanel open={filterOpen} onClose={...} />
 * as a fixed overlay in AppShell (same pattern as NetworkOverlay / z-index 50).
 */
import { useMemo, useRef, useEffect } from 'react';
import { useFilterStore, countActiveFilters } from '@/stores/filterStore';
import { useRecordsStore } from '@/stores/recordsStore';
import { loadRecords, type RawRecord } from '@/data/loaders';
import { passesFilter, type FilterFacets } from '@/data/filterPredicate';
import { useFocusTrap } from '@/components/useFocusTrap';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_YEAR = 500;
const MAX_YEAR = 1500;

/** All nine record kinds. */
const ALL_KINDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'polity',       label: 'Polities'      },
  { id: 'event',        label: 'Events'        },
  { id: 'ruler',        label: 'Rulers'        },
  { id: 'relationship', label: 'Relationships' },
  { id: 'journey',      label: 'Journeys'      },
  { id: 'source',       label: 'Sources'       },
  { id: 'institution',  label: 'Institutions'  },
  { id: 'technology',   label: 'Technologies'  },
  { id: 'text',         label: 'Texts'         },
];

/** Confidence levels present in the corpus. */
const CONFIDENCE_LEVELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'high',     label: 'High'     },
  { id: 'moderate', label: 'Moderate' },
  { id: 'low',      label: 'Low'      },
  { id: 'unknown',  label: 'Unknown'  },
];

/**
 * Attestation (evidence-strength) levels. Sparsely populated — only some kinds
 * carry it — so a record with no attestation always passes (see filterPredicate).
 * The per-value counts count only records that HAVE the value.
 */
const ATTESTATION_LEVELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'strong',   label: 'Strong'   },
  { id: 'weak',     label: 'Weak'     },
  { id: 'inferred', label: 'Inferred' },
];

// ── Shared style atoms ────────────────────────────────────────────────────────

const SECTION_STYLE: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-3)',
  borderBottom: '0.5px solid var(--border-mid)',
};

const HEADING_ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 'var(--space-2)',
};

const META: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  color: 'var(--ink-light)',
};

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for FilterPanel. */
export interface FilterPanelProps {
  /** Whether the panel is open. Controlled by parent. */
  open: boolean;
  /** Called when the user closes the panel (close button or Escape). */
  onClose: () => void;
}

// ── Derived filtered list (visible filter surface) ────────────────────────────

/**
 * Derives the count of polities visible under the current filter state.
 * Year range is checked against polity.formed / polity.dissolved.
 * Region is checked against polity._quarry.region.
 * Confidence is checked against polity.provenance.confidence.
 */
function countFilteredPolities(
  yearRange: [number, number] | null,
  regions: ReadonlySet<string>,
  confidence: ReadonlySet<string>,
  attestation: ReadonlySet<string>,
): number {
  const facets: FilterFacets = {
    yearRange,
    regions,
    confidence,
    attestation,
    kinds: new Set<string>(),
  };
  let count = 0;
  for (const p of loadRecords('polity')) {
    if (passesFilter(p, facets)) count++;
  }
  return count;
}

/**
 * Per-kind matched count under the active region/confidence/year-range facets,
 * via the shared passesFilter predicate (the same one the map + registers use).
 * The kinds facet itself is applied at the chip/aggregate level, not here, so each
 * chip can show "matched / total" for its own kind regardless of selection.
 */
function countFilteredKind(
  kind: string,
  yearRange: [number, number] | null,
  regions: ReadonlySet<string>,
  confidence: ReadonlySet<string>,
  attestation: ReadonlySet<string>,
): number {
  // kinds is intentionally empty here: we want this kind's own match count,
  // independent of which kinds are toggled (toggling kinds changes the footer total).
  const facets: FilterFacets = {
    yearRange,
    regions,
    confidence,
    attestation,
    kinds: new Set<string>(),
  };
  let count = 0;
  for (const r of loadRecords(kind as never)) {
    if (passesFilter(r, facets)) count++;
  }
  return count;
}

/** Enumerate unique region keys from all polity records. */
function collectRegions(): string[] {
  const polities = loadRecords('polity');
  const seen = new Set<string>();
  for (const p of polities) {
    const quarry = p._quarry as Record<string, unknown> | undefined;
    if (typeof quarry?.region === 'string' && quarry.region.length > 0) {
      seen.add(quarry.region as string);
    }
  }
  return [...seen].sort();
}

/** The facet whose per-value counts we want, and how to read that value off a record. */
type CountableFacet = 'region' | 'confidence' | 'attestation';

/** Read the facet value of one record for a given facet, or '' when absent. */
function readFacetValue(record: RawRecord, facet: CountableFacet): string {
  if (facet === 'region') {
    const quarry = record._quarry as Record<string, unknown> | undefined;
    return typeof quarry?.region === 'string' ? quarry.region : '';
  }
  const prov = record.provenance as Record<string, unknown> | undefined;
  if (facet === 'confidence') {
    return typeof prov?.confidence === 'string' ? prov.confidence : 'unknown';
  }
  // attestation — absent stays '' (never counted; absent records aren't filtered)
  return typeof prov?.attestation === 'string' ? prov.attestation : '';
}

/**
 * Per-value counts for one facet across the given kinds, under the OTHER active
 * facets (the facet being counted is itself emptied so each value shows its own
 * independent contribution — the same convention the per-kind chips already use).
 *
 * `region` is polity-only (matches collectRegions); confidence/attestation sweep
 * every kind. Built on the shared passesFilter so counts never drift from the
 * predicate the map + registers use.
 */
function countByFacetValue(
  facet: CountableFacet,
  facetKinds: readonly string[],
  yearRange: [number, number] | null,
  regions: ReadonlySet<string>,
  confidence: ReadonlySet<string>,
  attestation: ReadonlySet<string>,
): Map<string, number> {
  // Empty the facet being counted so its own selection doesn't gate its values.
  const facets: FilterFacets = {
    yearRange,
    kinds: new Set<string>(),
    regions: facet === 'region' ? new Set<string>() : regions,
    confidence: facet === 'confidence' ? new Set<string>() : confidence,
    attestation: facet === 'attestation' ? new Set<string>() : attestation,
  };
  const out = new Map<string, number>();
  for (const kind of facetKinds) {
    for (const r of loadRecords(kind as never)) {
      if (!passesFilter(r, facets)) continue;
      const v = readFacetValue(r, facet);
      if (v === '') continue; // absent values are never counted
      out.set(v, (out.get(v) ?? 0) + 1);
    }
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Faceted filter panel. Writes to filterStore on every interaction.
 * Renders a live "N polities match" count to prove the filter is wired.
 */
export function FilterPanel({ open, onClose }: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap: keep Tab within the panel while open; restore on close
  useFocusTrap(panelRef, open);

  const counts    = useRecordsStore((s) => s.counts);
  const yearRange  = useFilterStore((s) => s.yearRange);
  const kinds      = useFilterStore((s) => s.kinds);
  const regions    = useFilterStore((s) => s.regions);
  const confidence = useFilterStore((s) => s.confidence);
  const attestation = useFilterStore((s) => s.attestation);
  const setYearRange    = useFilterStore((s) => s.setYearRange);
  const toggleKind      = useFilterStore((s) => s.toggleKind);
  const toggleRegion    = useFilterStore((s) => s.toggleRegion);
  const toggleConf      = useFilterStore((s) => s.toggleConfidence);
  const toggleAttest    = useFilterStore((s) => s.toggleAttestation);
  const clearAll        = useFilterStore((s) => s.clearAll);

  const activeCount = useFilterStore(countActiveFilters);

  // Available regions — derived once from loaded polity records.
  const availableRegions = useMemo(
    () => (counts !== null ? collectRegions() : []),
    [counts],
  );

  // Live polity match count for the filter surface.
  const matchedPolities = useMemo(
    () => (counts !== null ? countFilteredPolities(yearRange, regions, confidence, attestation) : null),
    [counts, yearRange, regions, confidence, attestation],
  );

  // Live per-kind matched counts (region/confidence/attestation/year facets applied),
  // so each kind chip shows how many records it contributes and the kinds toggle has a
  // visible effect on the footer total. Recomputed only when facets/data change.
  const perKindMatched = useMemo(() => {
    if (counts === null) return null;
    const out: Record<string, number> = {};
    for (const { id } of ALL_KINDS) {
      out[id] = countFilteredKind(id, yearRange, regions, confidence, attestation);
    }
    return out;
  }, [counts, yearRange, regions, confidence, attestation]);

  // Per-value counts for the Region / Confidence / Attestation chips, under the
  // OTHER active facets. Region is polity-only; confidence + attestation sweep all
  // kinds. Each map is value → count; absent values are not counted.
  const ALL_KIND_IDS = useMemo(() => ALL_KINDS.map((k) => k.id), []);
  const regionCounts = useMemo(
    () => (counts !== null
      ? countByFacetValue('region', ['polity'], yearRange, regions, confidence, attestation)
      : new Map<string, number>()),
    [counts, yearRange, regions, confidence, attestation],
  );
  const confidenceCounts = useMemo(
    () => (counts !== null
      ? countByFacetValue('confidence', ALL_KIND_IDS, yearRange, regions, confidence, attestation)
      : new Map<string, number>()),
    [counts, ALL_KIND_IDS, yearRange, regions, confidence, attestation],
  );
  const attestationCounts = useMemo(
    () => (counts !== null
      ? countByFacetValue('attestation', ALL_KIND_IDS, yearRange, regions, confidence, attestation)
      : new Map<string, number>()),
    [counts, ALL_KIND_IDS, yearRange, regions, confidence, attestation],
  );

  // Footer aggregate: sum the matched counts of the SELECTED kinds (all kinds when
  // none selected). This makes the kinds facet visibly drive the total.
  const matchedTotal = useMemo(() => {
    if (perKindMatched === null) return null;
    const selected = kinds.size > 0 ? ALL_KINDS.filter((k) => kinds.has(k.id)) : ALL_KINDS;
    return selected.reduce((sum, k) => sum + (perKindMatched[k.id] ?? 0), 0);
  }, [perKindMatched, kinds]);

  /** RecordCounts is keyed by plural names; map a singular kind id to its total. */
  const kindTotal = (id: string): number | null => {
    if (counts === null) return null;
    const key = ({
      polity: 'polities', event: 'events', ruler: 'rulers', relationship: 'relationships',
      journey: 'journeys', source: 'sources', institution: 'institutions',
      technology: 'technologies', text: 'texts',
    } as Record<string, keyof typeof counts>)[id];
    return key ? (counts[key] as number) : null;
  };

  if (!open) return null;

  const yearRangeOn = yearRange !== null;
  const yrLo = yearRange?.[0] ?? MIN_YEAR;
  const yrHi = yearRange?.[1] ?? MAX_YEAR;

  const toggleYearRange = () => {
    if (yearRangeOn) setYearRange(null);
    else setYearRange([MIN_YEAR, MAX_YEAR]);
  };
  const setYrLo = (v: number) => setYearRange([Math.min(v, yrHi), yrHi]);
  const setYrHi = (v: number) => setYearRange([yrLo, Math.max(v, yrLo)]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Filters"
      aria-modal="true"
      className="msa-panel-overlay"
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        width: 320,
        maxHeight: 'calc(100dvh - 28px - 40px)',
        background: 'var(--surface)',
        border: '0.5px solid var(--border-strong)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px var(--space-3)',
          background: 'var(--surface-3)',
          borderBottom: '0.5px solid var(--border-mid)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
          <span className="cap-sm">Filters</span>
          {activeCount > 0 && (
            <span
              className="chip"
              style={{ fontSize: 9, padding: '1px 5px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
            >
              {activeCount} active
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn"
          style={{ padding: '2px 7px', fontSize: 11 }}
          onClick={onClose}
          aria-label="Close filters"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Year range ── */}
        <section style={SECTION_STYLE}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: yearRangeOn ? 'var(--space-2)' : 0,
            }}
          >
            <span className="cap-sm" style={{ color: 'var(--ink)' }}>Time range</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={yearRangeOn}
                onChange={toggleYearRange}
                aria-label="Enable year range filter"
              />
              {yearRangeOn && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>
                  {yrLo}–{yrHi} CE
                </span>
              )}
            </span>
          </label>
          {yearRangeOn && (
            <div>
              <input
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={5}
                value={yrLo}
                onChange={(e) => setYrLo(Number(e.target.value))}
                style={{ width: '100%' }}
                aria-label="Year range start"
              />
              <input
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={5}
                value={yrHi}
                onChange={(e) => setYrHi(Number(e.target.value))}
                style={{ width: '100%' }}
                aria-label="Year range end"
              />
              <div
                className="mono"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 9,
                  color: 'var(--ink-light)',
                  marginTop: 2,
                }}
              >
                <span>{MIN_YEAR}</span>
                <span>{MAX_YEAR}</span>
              </div>
            </div>
          )}
        </section>

        {/* ── Record kinds ── */}
        <section style={SECTION_STYLE}>
          <div style={HEADING_ROW}>
            <span className="cap-sm" style={{ color: 'var(--ink)' }}>Record kind</span>
            <span className="mono" style={META}>
              {kinds.size === 0 ? 'all' : `${kinds.size} selected`}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ALL_KINDS.map(({ id, label }) => {
              const active = kinds.has(id);
              const matched = perKindMatched?.[id];
              const total = kindTotal(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleKind(id)}
                  aria-pressed={active}
                  title={
                    matched !== undefined && total !== null
                      ? `${matched} of ${total} ${label.toLowerCase()} match the active facets`
                      : label
                  }
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '2px 6px',
                    border: '0.5px solid var(--border-mid)',
                    background: active ? 'var(--ink)' : 'var(--surface)',
                    color: active ? 'var(--surface)' : 'var(--ink-mid)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                  {matched !== undefined && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{matched}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Region ── */}
        {availableRegions.length > 0 && (
          <section style={SECTION_STYLE}>
            <div style={HEADING_ROW}>
              <span className="cap-sm" style={{ color: 'var(--ink)' }}>Region</span>
              <span className="mono" style={META}>
                {regions.size === 0 ? 'all' : `${regions.size} selected`}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {availableRegions.map((r) => {
                const active = regions.has(r);
                const n = regionCounts.get(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRegion(r)}
                    aria-pressed={active}
                    title={n !== undefined ? `${n} polities in ${r.replace(/_/g, ' ')} match the active facets` : undefined}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 6px',
                      border: '0.5px solid var(--border-mid)',
                      background: active ? 'var(--ink)' : 'var(--surface)',
                      color: active ? 'var(--surface)' : 'var(--ink-mid)',
                      cursor: 'pointer',
                    }}
                  >
                    {r.replace(/_/g, ' ')}
                    {n !== undefined && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>{n}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Confidence ── */}
        <section style={SECTION_STYLE}>
          <div style={HEADING_ROW}>
            <span className="cap-sm" style={{ color: 'var(--ink)' }}>Confidence</span>
            <span className="mono" style={META}>
              {confidence.size === 0 ? 'any' : `${confidence.size} selected`}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {CONFIDENCE_LEVELS.map(({ id, label }) => {
              const active = confidence.has(id);
              const n = confidenceCounts.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleConf(id)}
                  aria-pressed={active}
                  title={n !== undefined ? `${n} records with ${label.toLowerCase()} confidence match the active facets` : undefined}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '2px 6px',
                    border: '0.5px solid var(--border-mid)',
                    background: active ? 'var(--ink)' : 'var(--surface)',
                    color: active ? 'var(--surface)' : 'var(--ink-mid)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                  {n !== undefined && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Attestation (evidence strength) ── */}
        <section style={SECTION_STYLE}>
          <div style={HEADING_ROW}>
            <span className="cap-sm" style={{ color: 'var(--ink)' }}>Attestation</span>
            <span className="mono" style={META}>
              {attestation.size === 0 ? 'any' : `${attestation.size} selected`}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ATTESTATION_LEVELS.map(({ id, label }) => {
              const active = attestation.has(id);
              const n = attestationCounts.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAttest(id)}
                  aria-pressed={active}
                  title={n !== undefined ? `${n} records attested as ${label.toLowerCase()} match the active facets (records without attestation always pass)` : undefined}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '2px 6px',
                    border: '0.5px solid var(--border-mid)',
                    background: active ? 'var(--ink)' : 'var(--surface)',
                    color: active ? 'var(--surface)' : 'var(--ink-mid)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                  {n !== undefined && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>
          <p
            className="mono"
            style={{ ...META, marginTop: 'var(--space-2)', opacity: 0.7, lineHeight: 1.4 }}
          >
            Records without a recorded attestation always pass.
          </p>
        </section>

      </div>

      {/* Footer — live filter result */}
      <div
        style={{
          padding: '8px var(--space-3)',
          borderTop: '0.5px solid var(--border-mid)',
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          flexShrink: 0,
        }}
      >
        {/* Live result count — the visible filter surface. Shows the aggregate
            matched-record count across the SELECTED kinds (all kinds when none
            selected), plus the polity line for continuity. */}
        <span className="mono" style={META}>
          {counts === null
            ? '— loading —'
            : matchedTotal !== null
            ? `${matchedTotal} ${kinds.size > 0 ? 'records match (selected kinds)' : 'records match'}`
            : '—'}
        </span>
        {counts !== null && matchedPolities !== null && (
          <span className="mono" style={{ ...META, opacity: 0.75 }}>
            {`${matchedPolities} of ${counts.polities} polities`}
          </span>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={clearAll}
            disabled={activeCount === 0}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              opacity: activeCount === 0 ? 0.4 : 1,
              cursor: activeCount === 0 ? 'default' : 'pointer',
            }}
          >
            clear all
          </button>
        </div>
      </div>
    </div>
  );
}
