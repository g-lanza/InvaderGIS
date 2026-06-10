/**
 * GuidesPanel — the "Guides" tab inside the Settings panel.
 *
 * A scrollable, sectioned reference compiled from real project facts
 * (see guidesContent.ts): a quick-start, a usage manual, the data sources with
 * their licences, the attribution line, and the project licences. It also exposes
 * a "Replay tour" button that re-launches the first-open walkthrough.
 *
 * Pure presentation: it reads only the static content module and fires the
 * walkthrough replay event. No store writes, no frozen-interface impact.
 *
 * Design: square corners, hairline borders, no shadows, tokens only (inline-style
 * idiom matching SettingsPanel / FilterPanel); correct in all four themes.
 */

import type { JSX } from 'react';
import { startWalkthrough } from '@/components/useWalkthrough';
import {
  QUICK_START,
  MANUAL,
  DATA_SOURCES,
  ATTRIBUTION_LINE,
  PROJECT_LICENCES,
  COMMERCIAL_CONTACT,
  RESEARCH_INTEGRITY_NOTE,
  type DataSource,
} from '@/components/guidesContent';

// ── Shared atoms ────────────────────────────────────────────────────────────────

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-mute)',
};

const BODY: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.55,
  color: 'var(--ink-light)',
  margin: 0,
};

const SPDX_CHIP: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  letterSpacing: '0.03em',
  color: 'var(--ink-mute)',
  border: '0.5px solid var(--border-mid)',
  padding: '0 4px',
  whiteSpace: 'nowrap',
};

/** A section wrapper: mono-caps label + a hairline rule + children. */
function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        paddingBottom: 'var(--space-4)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={SECTION_LABEL}>{label}</span>
        <span style={{ flex: 1, height: '0.5px', background: 'var(--border-mid)' }} aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

/** A single data-source row: name + contribution + licence chips. */
function SourceRow({ source }: { source: DataSource }): JSX.Element {
  const nameEl = source.url ? (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--ink)', textDecoration: 'underline', textDecorationColor: 'var(--border-mid)', textUnderlineOffset: '2px' }}
    >
      {source.name}
    </a>
  ) : (
    <span style={{ color: 'var(--ink)' }}>{source.name}</span>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        paddingBottom: 'var(--space-2)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{nameEl}</span>
        <span style={SPDX_CHIP}>{source.licence}</span>
        {source.shareAlike && (
          <span
            style={{ ...SPDX_CHIP, color: 'var(--accent)', borderColor: 'var(--accent)' }}
            title="Share-alike: derivative databases may need to carry a compatible open licence."
          >
            share-alike
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-light)', lineHeight: 1.45 }}>
        {source.contribution}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.03em' }}>
        {source.spdx}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The Guides content. Rendered inside the Settings panel's "Guides" tab.
 * Scrolls within its container; the parent owns the dialog chrome.
 */
export function GuidesPanel(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
      }}
    >
      {/* ── Replay the tour ── */}
      <Section label="Quick start tour">
        <p style={BODY}>
          New here? Take the guided tour of the workspace — it points out each part of the
          screen one step at a time.
        </p>
        <div>
          <button
            type="button"
            className="btn"
            onClick={startWalkthrough}
            title="Replay the first-open guided tour"
          >
            Replay tour
          </button>
        </div>
      </Section>

      {/* ── Quick start steps ── */}
      <Section label="Quick start steps">
        <ol
          style={{
            margin: 0,
            paddingLeft: '1.4em',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {QUICK_START.map((step, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-light)' }}>
              {step}
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Manual ── */}
      <Section label="Manual">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {MANUAL.map((entry) => (
            <div key={entry.title} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                {entry.title}
              </span>
              <p style={BODY}>{entry.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Data sources ── */}
      <Section label="Data sources">
        <p style={{ ...BODY, marginBottom: 'var(--space-1)' }}>
          The dataset incorporates these upstream sources. When reusing the data you must
          respect both the project licence and every upstream licence below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {DATA_SOURCES.map((s) => (
            <SourceRow key={s.spdx + s.name} source={s} />
          ))}
        </div>
        <p style={{ ...BODY, fontSize: 11, color: 'var(--ink-mute)', marginTop: 'var(--space-1)' }}>
          {RESEARCH_INTEGRITY_NOTE}
        </p>
      </Section>

      {/* ── Attribution ── */}
      <Section label="Attribution">
        <p style={BODY}>
          Base map and historical geometry are derived from the sources above. Credit line:
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.02em',
            color: 'var(--ink-mid)',
            background: 'var(--surface-2)',
            border: '0.5px solid var(--border)',
            padding: 'var(--space-2)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {ATTRIBUTION_LINE}
        </p>
        <p style={{ ...BODY, fontSize: 11, color: 'var(--ink-mute)' }}>
          PLEIADES and the share-alike sources (Cliopatria, OpenHistoricalMap) require credit
          on redistribution; assess share-alike obligations when building derivative products.
        </p>
      </Section>

      {/* ── Licences ── */}
      <Section label="Licences">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {PROJECT_LICENCES.map((lic) => (
            <div
              key={lic.spdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                paddingBottom: 'var(--space-2)',
                borderBottom: '0.5px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{lic.layer}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>{lic.licence}</span>
                <span style={SPDX_CHIP}>{lic.spdx}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ ...BODY, fontSize: 11, color: 'var(--ink-mute)' }}>
          Both licences permit research, study and personal use. Commercial use of either layer
          requires prior written permission — contact{' '}
          <a
            href={`mailto:${COMMERCIAL_CONTACT}`}
            style={{ color: 'var(--ink-mid)', textDecoration: 'underline', textDecorationColor: 'var(--border-mid)' }}
          >
            {COMMERCIAL_CONTACT}
          </a>
          . A product of Gavin Lanza.
        </p>
      </Section>
    </div>
  );
}
