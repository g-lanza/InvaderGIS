/**
 * DemographicsTab — religion / ethnic / language composition + social structure.
 *
 * Sections (all backed by REAL recovered fields — no fabrication):
 *   1. Religion composition   — CompositionBar (religion_composition[])
 *   2. Ethnic composition     — CompositionBar (ethnic_composition[])
 *   3. Language composition   — CompositionBar (language_composition[])
 *   4. Social structure block — ruling_ethnicity, subject_majority,
 *                               military_ethnicity, administrative_language,
 *                               stratification_type
 *
 * Each section is shown only when the backing array/object is non-empty on
 * the polity record (182/268 have composition data). Honest-empty per part.
 *
 * Design laws (DESIGN.md):
 *   - Square corners, 0.5px hairline borders, no shadows.
 *   - Token colors only — zero hardcoded hex.
 *   - No italics in chrome.
 *   - Correct in all 4 themes (Atlas / Manuscript / Dark / Contrast).
 *
 * Chart mount point:
 *   CompositionBar — imported below as a lazy stub.
 *   Props contract (to be wired by integration agent):
 *     <CompositionBar
 *       entries={Array<{ label: string; proportion: number; sublabel?: string }>}
 *       title={string}
 *     />
 *   Integration agent reconciles if the chart builder uses a different shape.
 */

import { lazy, Suspense, useMemo, useCallback, type JSX } from 'react';
import type { CardProps } from '@/panels/types';
import {
  REGION_COLORS,
  RELIGION_COLORS,
  LANGUAGE_FAMILY_COLORS,
  LANGUAGE_FAMILY_FALLBACK,
  domainColor,
} from '@/design/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import { humanizeLabel } from '@/data/displayName';

// ── Lazy chart import ─────────────────────────────────────────────────────────
// CHART MOUNT — CompositionBar
// Props contract (chart is built): entries, colorFor, title, subtitle?, sourceIds?
const CompositionBar = lazy(() =>
  import('@/charts/CompositionBar').then((m) => ({ default: m.CompositionBar })),
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** A normalised composition entry ready for the chart. */
interface CompositionEntry {
  label: string;
  proportion: number;
  sublabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a composition array from a RawRecord field.
 * Returns empty array when the field is absent or malformed.
 * Never fabricates — only real {label, proportion} pairs are returned.
 */
function parseComposition(
  raw: unknown,
  labelKey: string,
  sublabelKey?: string,
): CompositionEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: CompositionEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const label =
      typeof obj[labelKey] === 'string' && obj[labelKey] !== ''
        ? (obj[labelKey] as string)
        : null;
    const proportion =
      typeof obj['proportion'] === 'number' ? obj['proportion'] : null;
    if (label === null || proportion === null) continue;
    const sublabel =
      sublabelKey && typeof obj[sublabelKey] === 'string'
        ? (obj[sublabelKey] as string)
        : undefined;
    entries.push({ label, proportion, sublabel });
  }
  // Sort descending by proportion for natural reading order (immutable)
  return [...entries].sort((a, b) => b.proportion - a.proportion);
}

/** Humanise a snake_case enum value (shared helper; em-dash for empty). */
function humanise(s: string): string {
  return humanizeLabel(s);
}

// ── Section primitive ─────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

/** Hairline-bordered section block matching atlas-shell.css .panel rhythm. */
function Section({ label, children }: SectionProps): JSX.Element {
  return (
    <div
      className="panel"
      style={{ borderBottom: '0.5px solid var(--border)' }}
    >
      <div className="panel-head">
        <span className="panel-head__label">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Honest empty state for a section with no data. */
function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div
      style={{
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.05em',
        color: 'var(--ink-mute)',
        textTransform: 'uppercase',
      }}
    >
      {message}
    </div>
  );
}

// ── Social structure block ────────────────────────────────────────────────────

interface SocialStructure {
  ruling_ethnicity?: string;
  subject_majority?: string;
  military_ethnicity?: string;
  administrative_language?: string;
  stratification_type?: string;
}

/** Parse social_structure from a RawRecord field. Returns null when absent. */
function parseSocialStructure(raw: unknown): SocialStructure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const get = (k: string): string | undefined =>
    typeof obj[k] === 'string' && obj[k] !== '' ? (obj[k] as string) : undefined;
  const result: SocialStructure = {
    ruling_ethnicity:       get('ruling_ethnicity'),
    subject_majority:       get('subject_majority'),
    military_ethnicity:     get('military_ethnicity'),
    administrative_language: get('administrative_language'),
    stratification_type:    get('stratification_type'),
  };
  // Only return if at least one field is present
  const hasAny = Object.values(result).some((v) => v !== undefined);
  return hasAny ? result : null;
}

// ── DemographicsTab ───────────────────────────────────────────────────────────

/**
 * Demographics tab for a polity record.
 *
 * Renders composition breakdowns (religion, ethnicity, language) and social
 * structure from real recovered donor fields. Honest-empty per section.
 *
 * @param record     - The raw polity RawRecord.
 * @param onNavigate - Navigation callback (unused in this tab, required by CardProps).
 */
export function DemographicsTab({ record, onNavigate: _onNavigate }: CardProps): JSX.Element {
  const theme = useSettingsStore((s) => s.theme);

  const religionEntries = useMemo(
    () => parseComposition(record['religion_composition'], 'religion'),
    [record],
  );
  const ethnicEntries = useMemo(
    () => parseComposition(record['ethnic_composition'], 'group'),
    [record],
  );
  const languageEntries = useMemo(
    () => parseComposition(record['language_composition'], 'language', 'role'),
    [record],
  );
  const socialStructure = useMemo(
    () => parseSocialStructure(record['social_structure']),
    [record],
  );

  // ── colorFor resolvers (token-only, theme-adjusted) ─────────────────────
  // Religion: map common labels to the RELIGION_COLORS token map; unknown → fallback.
  // The hue table lives in design/tokens.ts (single source of truth) so no hex
  // literals leak into this component.
  const religionColorFor = useCallback(
    (label: string): string => {
      const key = label.toLowerCase().replace(/[^a-z]/g, '');
      const base = RELIGION_COLORS[key] ?? LANGUAGE_FAMILY_FALLBACK;
      return domainColor(base, theme);
    },
    [theme],
  );

  // Ethnicity: map via REGION_COLORS where the key overlaps, else fallback.
  const ethnicColorFor = useCallback(
    (label: string): string => {
      const key = label.toLowerCase().replace(/[^a-z_]/g, '');
      const base = REGION_COLORS[key] ?? LANGUAGE_FAMILY_FALLBACK;
      return domainColor(base, theme);
    },
    [theme],
  );

  // Language: use LANGUAGE_FAMILY_COLORS keyed by language name → family, then fallback.
  const languageColorFor = useCallback(
    (label: string): string => {
      // Map common medieval languages to a family for colour lookup
      const LANG_TO_FAMILY: Record<string, string> = {
        arabic:         'Afro-Asiatic',
        arabic_classical: 'Afro-Asiatic',
        persian:        'Indo-European',
        greek:          'Indo-European',
        latin:          'Indo-European',
        french:         'Indo-European',
        german:         'Indo-European',
        english:        'Indo-European',
        slavic:         'Indo-European',
        church_slavonic: 'Indo-European',
        russian:        'Indo-European',
        polish:         'Indo-European',
        czech:          'Indo-European',
        turkish:        'Turkic',
        turkic_lang:    'Turkic',
        mongolian:      'Mongolic',
        chinese:        'Sino-Tibetan',
        hebrew:         'Afro-Asiatic',
        coptic:         'Afro-Asiatic',
        berber:         'Afro-Asiatic',
        armenian:       'Indo-European',
        georgian:       'Indo-European',
      };
      const key = label.toLowerCase().replace(/[^a-z_]/g, '');
      const family = LANG_TO_FAMILY[key];
      const base = family
        ? (LANGUAGE_FAMILY_COLORS[family] ?? LANGUAGE_FAMILY_FALLBACK)
        : LANGUAGE_FAMILY_FALLBACK;
      return domainColor(base, theme);
    },
    [theme],
  );

  const hasSomething =
    religionEntries.length > 0 ||
    ethnicEntries.length > 0 ||
    languageEntries.length > 0 ||
    socialStructure !== null;

  if (!hasSomething) {
    return (
      <div>
        <EmptyState message="No demographic data recorded for this polity" />
      </div>
    );
  }

  return (
    <div>
      {/* ── Religion composition ────────────────────────────────────────── */}
      <Section label="Religion">
        {religionEntries.length === 0 ? (
          <EmptyState message="No religion data recorded" />
        ) : (
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={<CompositionFallback entries={religionEntries} />}>
              <CompositionBar
                entries={religionEntries}
                colorFor={religionColorFor}
                title="Religious composition"
              />
            </Suspense>
          </div>
        )}
      </Section>

      {/* ── Ethnic composition ──────────────────────────────────────────── */}
      <Section label="Ethnicity">
        {ethnicEntries.length === 0 ? (
          <EmptyState message="No ethnic data recorded" />
        ) : (
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={<CompositionFallback entries={ethnicEntries} />}>
              <CompositionBar
                entries={ethnicEntries}
                colorFor={ethnicColorFor}
                title="Ethnic composition"
              />
            </Suspense>
          </div>
        )}
      </Section>

      {/* ── Language composition ─────────────────────────────────────────── */}
      <Section label="Languages">
        {languageEntries.length === 0 ? (
          <EmptyState message="No language data recorded" />
        ) : (
          <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
            <Suspense fallback={<CompositionFallback entries={languageEntries} />}>
              <CompositionBar
                entries={languageEntries}
                colorFor={languageColorFor}
                title="Language composition"
              />
            </Suspense>
          </div>
        )}
      </Section>

      {/* ── Social structure ─────────────────────────────────────────────── */}
      {socialStructure !== null && (
        <Section label="Social structure">
          <dl className="dl" style={{ paddingBottom: 'var(--space-2)' }}>
            {socialStructure.ruling_ethnicity && (
              <>
                <dt>Ruling group</dt>
                <dd>{humanise(socialStructure.ruling_ethnicity)}</dd>
              </>
            )}
            {socialStructure.subject_majority && (
              <>
                <dt>Subject majority</dt>
                <dd>{humanise(socialStructure.subject_majority)}</dd>
              </>
            )}
            {socialStructure.military_ethnicity && (
              <>
                <dt>Military group</dt>
                <dd>{humanise(socialStructure.military_ethnicity)}</dd>
              </>
            )}
            {socialStructure.administrative_language && (
              <>
                <dt>Admin language</dt>
                <dd>{humanise(socialStructure.administrative_language)}</dd>
              </>
            )}
            {socialStructure.stratification_type && (
              <>
                <dt>Stratification</dt>
                <dd>{humanise(socialStructure.stratification_type)}</dd>
              </>
            )}
          </dl>
        </Section>
      )}
    </div>
  );
}

// ── Inline fallback (no chart yet / chart loading) ────────────────────────────

/**
 * Proportional stacked-bar fallback rendered while CompositionBar loads or
 * when the chart module is not yet available.
 *
 * Uses a hand-rolled horizontal bar — token colors, no hex, no chart libs.
 * This is a REAL data-backed fallback, not a skeleton placeholder.
 * Each entry is shown as a segment proportional to its value.
 */
function CompositionFallback({ entries }: { entries: CompositionEntry[] }): JSX.Element {
  if (entries.length === 0) return <></>;

  // Normalise proportions so they always sum to 1
  const total = entries.reduce((s, e) => s + e.proportion, 0) || 1;

  // Muted accent shades — no hardcoded hex, derived from CSS custom props
  // We use opacity layers of --accent and --ink-mute for distinct segments
  const opacities = [0.85, 0.65, 0.50, 0.38, 0.27, 0.20];

  return (
    <div>
      {/* Stacked horizontal bar */}
      <div
        aria-label="Composition bar"
        style={{
          display: 'flex',
          height: 8,
          width: '100%',
          border: '0.5px solid var(--border-mid)',
          overflow: 'hidden',
          marginBottom: 'var(--space-2)',
        }}
      >
        {entries.map((e, i) => (
          <div
            key={e.label}
            title={`${e.label}: ${(e.proportion / total * 100).toFixed(0)}%`}
            style={{
              flex: e.proportion / total,
              background: 'var(--accent)',
              opacity: opacities[Math.min(i, opacities.length - 1)],
              borderRight: i < entries.length - 1 ? '0.5px solid var(--surface)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Legend rows */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        {entries.map((e, i) => (
          <li
            key={e.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            {/* Swatch */}
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                flexShrink: 0,
                background: 'var(--accent)',
                opacity: opacities[Math.min(i, opacities.length - 1)],
                border: '0.5px solid var(--border-mid)',
              }}
            />
            {/* Label */}
            <span
              style={{
                flex: 1,
                fontSize: '11px',
                color: 'var(--ink-light)',
                textTransform: 'capitalize',
              }}
            >
              {e.label.replace(/_/g, ' ')}
              {e.sublabel && (
                <span
                  style={{
                    marginLeft: 'var(--space-1)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: 'var(--ink-mute)',
                    textTransform: 'lowercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {e.sublabel}
                </span>
              )}
            </span>
            {/* Percentage */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--ink-mid)',
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {(e.proportion / total * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
