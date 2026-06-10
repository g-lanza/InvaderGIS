/**
 * PolityCard — record detail card for polity records.
 *
 * Delegates to EntityTabs for a tabbed overview (Overview / Connections /
 * Sources). EntityTabs owns the section structure and renders the appropriate
 * tab panel. The identity header (name, type/region chips, active span) is
 * rendered here above the tab strip so it is always visible regardless of
 * which tab is active.
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5 px hairline borders only, no panel shadows.
 *   - Token colours only — zero hardcoded hex.
 *   - No italics in chrome. Correct in all 4 themes.
 *
 * Phase enricher — polity-core agent (tabbed panel: tabbed-panel agent).
 */

import { type CardProps, fieldStr, extractProvenance } from '@/panels/types';
import { EntityTabs } from '@/panels/entity/EntityTabs';
import { Crest } from '@/design/Crest';
import { regionColor } from '@/data/vocab';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatYear as fmtYear } from '@/data/formatYear';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format formed–dissolved lifespan span. */
function fmtSpan(formed: unknown, dissolved: unknown): string {
  const f = fmtYear(formed);
  const d = fmtYear(dissolved);
  if (f === '—') return '—';
  return d === '—' ? `${f} – present` : `${f} – ${d}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Detail card for a polity record.
 *
 * Renders a sticky identity header (name, type/region chips, active span) above
 * the EntityTabs strip. EntityTabs owns the three tab panels (Overview,
 * Connections, Sources) and all section rendering within them.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Dock navigation callback passed through to tab panels.
 */
export function PolityCard({ record, onNavigate }: CardProps) {
  const namePrimary = fieldStr(record['name_primary']);
  const type        = fieldStr(record['type']);
  const region      = fieldStr(record['region']);
  const span        = fmtSpan(record['formed'], record['dissolved']);
  const theme       = useSettingsStore((s) => s.theme);

  // Derive monogram: first two letters of the primary name, uppercased.
  const monogram = namePrimary !== '—'
    ? namePrimary.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '??'
    : '??';
  const crestColor = regionColor(region !== '—' ? region : '', theme) ?? 'var(--ink-mute)';

  // At-a-glance provenance summary on the always-visible header (full detail in
  // the Sources tab). Surfaces "is this sourced?" for the research mission without
  // a tab click. Source count from provenance.sources_used.
  const prov = extractProvenance(record);
  const rawProv = record['provenance'] as Record<string, unknown> | undefined;
  const sourceCount = Array.isArray(rawProv?.['sources_used'])
    ? (rawProv!['sources_used'] as unknown[]).filter((s) => typeof s === 'string').length
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Identity header — always visible above the tab strip ─────────── */}
      <div
        className="panel"
        style={{
          padding: 'var(--space-3) var(--space-3) var(--space-2)',
          borderBottom: '0.5px solid var(--border-mid)',
          flexShrink: 0,
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
        }}
      >
        {/* Crest — monogram with region-color hatch and band */}
        <Crest monogram={monogram} regionColor={crestColor} size="lg" />

        {/* Name + chips + provenance */}
        <div style={{ flex: 1, minWidth: 0 }}>

        {/* Type + region chips */}
        {(type !== '—' || region !== '—') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-1)',
            }}
          >
            {type !== '—' && (
              <span
                className="chip"
                style={{
                  color: 'var(--ink-light)',
                  borderColor: 'var(--border-mid)',
                  fontSize: '10px',
                }}
              >
                {type}
              </span>
            )}
            {region !== '—' && (
              <span
                className="chip"
                style={{
                  color: 'var(--ink-light)',
                  borderColor: 'var(--border-mid)',
                  fontSize: '10px',
                }}
              >
                {region}
              </span>
            )}
          </div>
        )}

        {/* Primary name */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1.25,
          }}
        >
          {namePrimary}
        </div>

        {/* Provenance summary — at-a-glance sourcing (full detail in Sources tab) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-1)',
          }}
        >
          <span
            className={`sl-status sl-status--${prov.statusMod}`}
            title={`Review status: ${prov.statusLabel}`}
          >
            {prov.statusLabel}
          </span>
          <span
            className="chip mono"
            style={{ color: 'var(--ink-mute)', borderColor: 'var(--border)', fontSize: '9px' }}
            title="Evidence confidence"
          >
            conf: {prov.confidenceLabel}
          </span>
          <span
            className="chip mono"
            style={{
              color: sourceCount > 0 ? 'var(--ink-light)' : 'var(--ink-mute)',
              borderColor: 'var(--border)',
              fontSize: '9px',
            }}
            title="Sources cited — see the Sources tab for the full bibliography"
          >
            {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
          </span>
        </div>

        {/* Active span */}
        {span !== '—' && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--ink-mute)',
              letterSpacing: '0.04em',
              marginTop: 3,
            }}
          >
            {span}
          </div>
        )}

        </div>{/* end name+chips column */}
      </div>

      {/* ── Tabbed panel — flex-grows to fill remaining height ───────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <EntityTabs record={record} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
