/* global React, EVENT_CATEGORIES, JOURNEY_KINDS, REGION_COLORS, POLITIES, Glyph, GlyphStud, GlyphCompass */


/* IIFE-WRAPPED */
(() => {
// =============================================================
// 07 — Component sheet
// 1400 × 1900. Every primitive: typography, color, crests, chips,
// buttons, rows, panels, glyphs. Print-style reference.
// =============================================================

function ComponentSheet() {
  return (
    <div style={{ width: 1400, padding: 48, background: "var(--surface)", fontFamily: "var(--sans)", color: "var(--ink)" }}>
      <SheetHeader />

      {/* TYPOGRAPHY */}
      <Block num="01" title="Typography" sub="Georgia for narrative, JetBrains Mono for labels, dates, coordinates. No italics in chrome.">
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 8, rowGap: 16, alignItems: "baseline" }}>
          <TypeRow label="display"        sample="Carolingian Empire"           css="36 / 700 / Georgia"   style={{ fontSize: 36, fontWeight: 700, letterSpacing: "0.005em" }} />
          <TypeRow label="title"          sample="Coronation of Charlemagne"     css="22 / 700 / Georgia"   style={{ fontSize: 22, fontWeight: 700 }} />
          <TypeRow label="subtitle"       sample="Aachen palace school"          css="16 / 600 / Georgia"   style={{ fontSize: 16, fontWeight: 600 }} />
          <TypeRow label="body"           sample="Charles Martel halted the Umayyad advance at Tours."  css="13 / 400 / Georgia · 1.55" style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.55 }} />
          <TypeRow label="small body"     sample="A note in the margin of the chronicle." css="11 / 400 / Georgia · 1.5" style={{ fontSize: 11, fontWeight: 400 }} />
          <TypeRow label="section · mono" sample="LIFECYCLE PHASES"               css="10 / 500 / JetBrains Mono / +120 / UPPER" style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500, color: "var(--ink-mid)" }} />
          <TypeRow label="metric · mono"  sample="18,000,000"                    css="14 / 600 / Mono / tabular" style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} />
          <TypeRow label="year · mono"    sample="800–814 CE"                    css="12 / 500 / Mono / tabular" style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums" }} />
          <TypeRow label="map label"      sample="CONSTANTINOPOLIS"              css="14 / 500 / Georgia / +200 / UPPER" style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase" }} />
          <TypeRow label="sea label · italic" sample="Mare Nostrum"             css="16 / italic / Georgia / +120 (map-only)" style={{ fontSize: 16, letterSpacing: "0.12em", color: "rgba(60,40,20,0.55)" }} />
        </div>
      </Block>

      {/* COLOR */}
      <Block num="02" title="Color" sub="Parchment + gilt. three ink scales. No bright UI blues.">
        <SwatchRow label="paper" rows={[
          ["--paper", "#f4f0e6"], ["--paper-stain", "#ebe3cf"], ["--paper-dark", "#ece6d6"], ["--paper-deeper", "#e0d9c8"], ["--paper-edge", "#e6dfca"],
        ]} />
        <SwatchRow label="ink" rows={[
          ["--ink", "#1a1208"], ["--ink-mid", "#5a4530"], ["--ink-light", "#6a5040"], ["--rule-mid", "rgba(26,18,8,0.45)"], ["--rule-soft", "rgba(26,18,8,0.15)"],
        ]} />
        <SwatchRow label="accent" rows={[
          ["--accent", "#7a5c1e"], ["--accent-light", "#a07830"], ["selection", "rgba(200,158,76,0.55)"],
        ]} />
        <SwatchRow label="event" rows={EVENT_CATEGORIES.map((c) => [c.label, c.color])} narrow />
        <SwatchRow label="region (sample)" rows={Object.entries(REGION_COLORS).slice(0, 10)} narrow />
      </Block>

      {/* CRESTS */}
      <Block num="03" title="Crests · entity identity" sub="Two-letter monogram in a hatched square, with a region color band along the bottom. Solves the 'which polity is this' problem at every scale.">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          {POLITIES.slice(0, 9).map((p) => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div className="crest lg" style={{ color: REGION_COLORS[p.region] }}>
                <span>{p.monogram}</span>
                <span className="region-band" />
              </div>
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>{p.id.split("_")[0]}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 18, alignItems: "center" }}>
          <div className="crest sm" style={{ color: "#3b6a8c" }}><span>CA</span><span className="region-band" /></div>
          <div className="crest" style={{ color: "#3b6a8c" }}><span>CA</span><span className="region-band" /></div>
          <div className="crest lg" style={{ color: "#3b6a8c" }}><span>CA</span><span className="region-band" /></div>
          <div className="crest" style={{ width: 64, height: 64, fontSize: 24, color: "#3b6a8c" }}><span>CA</span><span className="region-band" style={{ height: 6 }} /></div>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>sm 22 · md 32 · lg 44 · xl 64</span>
        </div>
      </Block>

      {/* CHIPS + BADGES */}
      <Block num="04" title="Chips · slab, not pill" sub="Mono caps. Hairline border. No rounded corners. pills read AI-generic.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span className="chip">empire</span>
          <span className="chip">christendom</span>
          <span className="chip">successor-rome</span>
          <span className="chip">caliphate</span>
          <span className="chip">golden-age</span>
          <span className="chip">islamic</span>
          <span className="chip">heptarchy</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span className="chip-key" style={{ color: "#41ab5d" }}>professor reviewed</span>
          <span className="chip-key" style={{ color: "#5a4530" }}>claude drafted</span>
          <span className="chip-key" style={{ color: "#3b6a8c" }}>cited · 14</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            ["alliance", "#41ab5d"], ["rivalry", "#a73a3a"], ["vassalage", "#6a3d9a"],
            ["tributary", "#9b7a3a"], ["trade", "#c87c3a"], ["marriage", "#a07a9b"],
            ["religious", "#7a5c1e"], ["successor", "#3b6a8c"],
          ].map(([t, c]) => (
            <span key={t} className="chip-key" style={{ color: c, fontSize: 10 }}>{t}</span>
          ))}
        </div>
      </Block>

      {/* BUTTONS */}
      <Block num="05" title="Buttons" sub="Flat, monospaced uppercase. Pressed = dark slab. No hover glow. Buttons that act on data are full slabs; secondary actions use ghost.">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <button className="btn">default</button>
          <button className="btn" aria-pressed>active / pressed</button>
          <button className="btn btn-ghost">ghost</button>
          <button className="btn btn-ghost" style={{ padding: "2px 6px" }}>×</button>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", marginLeft: 8 }}>same family · sizes by padding</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="kbd">/</span>
          <span className="kbd">L</span>
          <span className="kbd">⌘\</span>
          <span className="kbd">⇧?</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", marginLeft: 6 }}>keyboard slugs</span>
        </div>
      </Block>

      {/* ROWS */}
      <Block num="06" title="Rows · left-keyed" sub="The load-bearing list pattern, preserved from §13. Color comes from data. relationship type, event category, factor layer.">
        <div style={{ width: 540 }}>
          {[
            ["#41ab5d", "alliance", "Papal States", "since 754", "Donation of Pepin"],
            ["#a73a3a", "rivalry", "Byzantine Empire", "since 800", "Two emperors problem"],
            ["#3b6a8c", "diplomatic", "Abbasid Caliphate", "since 797", "Embassies, gifts"],
            ["#a73a3a", "rivalry", "Umayyad Córdoba", "since 778", "Spanish March"],
          ].map(([color, type, name, since, note], i) => (
            <div key={i} className="row-key" style={{ color }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink)" }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{since}</span>
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{type}</div>
              <div style={{ fontSize: 11, color: "var(--ink-mid)", marginTop: 2 }}>{note}</div>
            </div>
          ))}
        </div>
      </Block>

      {/* GLYPHS */}
      <Block num="07" title="Event glyphs · 24 px ink-line" sub="9 category glyphs + 14 subtype overrides for finer reading. See artboard 08 for the full studio.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {EVENT_CATEGORIES.map((c) => (
            <div key={c.id} style={{ padding: 12, border: "0.5px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
              <GlyphStud name={c.glyph} size={42} color={c.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cap-sm" style={{ color: c.color }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>{c.glyph}</div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-mid)", marginTop: 1 }}>{c.color}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <GlyphStud name={c.glyph} size={14} color={c.color} />
                <GlyphStud name={c.glyph} size={20} color={c.color} />
                <GlyphStud name={c.glyph} size={28} color={c.color} />
              </div>
            </div>
          ))}
        </div>
      </Block>

      {/* RULES */}
      <Block num="08" title="Rules · hairlines" sub="0.5 px is the default. Use a black double-rule only for the cartouche.">
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, rowGap: 8 }}>
          <RuleRow label="hairline">
            <hr className="hair" style={{ margin: 0 }} />
          </RuleRow>
          <RuleRow label="full ink">
            <hr className="rule" style={{ margin: 0 }} />
          </RuleRow>
          <RuleRow label="double rule">
            <div style={{ height: 6, borderTop: "0.5px solid var(--rule)", borderBottom: "0.5px solid var(--rule)" }} />
          </RuleRow>
          <RuleRow label="century divider">
            <div className="century-divider" style={{ margin: 0, borderBottom: "0.5px solid var(--rule-soft)" }}>
              <span>9TH CENTURY · 3 events</span>
              <span>800. 899</span>
            </div>
          </RuleRow>
        </div>
      </Block>

      {/* FILLS */}
      <Block num="09" title="Map fills · hatch & stipple" sub="Polities are filled with per-region hatch patterns, not flat color. Reads as drawn, not CSSed.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {Object.entries(REGION_COLORS).slice(0, 10).map(([region, color]) => (
            <div key={region}>
              <svg width="100%" height="60" viewBox="0 0 100 60">
                <defs>
                  <pattern id={`p-${region}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill={color} fillOpacity="0.18" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeOpacity="0.55" strokeWidth="0.6" />
                  </pattern>
                </defs>
                <rect width="100" height="60" fill={`url(#p-${region})`} stroke="rgba(40,28,12,0.55)" strokeWidth="0.5" />
              </svg>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-mid)", marginTop: 2 }}>{region.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      </Block>

      {/* PANEL */}
      <Block num="10" title="Panel surface" sub="No drop shadow. No rounded corners. Hairline border, optional double-rule, header on stained ground.">
        <div className="panel" style={{ width: 360 }}>
          <div className="panel-header">
            <span className="cap-sm">Panel header · cap-sm</span>
            <button className="btn btn-ghost" style={{ padding: "2px 6px" }}>×</button>
          </div>
          <div style={{ padding: "10px 12px" }}>
            <p style={{ fontSize: 12, lineHeight: 1.55, margin: "0 0 8px" }}>
              Panel body content. Use the dl primitive for label / value pairs and the row-key primitive for typed lists.
            </p>
            <div className="dl" style={{ rowGap: 3 }}>
              <dt>Field</dt><dd>Value</dd>
              <dt>Field</dt><dd>Value</dd>
            </div>
          </div>
        </div>
      </Block>

    </div>
  );
}

function SheetHeader() {
  return (
    <div style={{ marginBottom: 36, paddingBottom: 16, borderBottom: "0.5px solid var(--rule)" }}>
      <div className="cap-sm">ARTBOARD · 07</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 36, fontWeight: 700 }}>Component sheet</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-mid)" }}>v.0 · drawn-atlas</div>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-mid)", margin: "8px 0 0", maxWidth: 760 }}>
        Every UI primitive in one place. All styles reference the tokens in tokens.css plus the additions in styles.css. Components compose into the panels and views in the other artboards.
      </p>
    </div>
  );
}

function Block({ num, title, sub, children }) {
  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span className="mono" style={{ fontSize: 20, color: "var(--ink-mid)" }}>{num}</span>
        <h2 style={{ margin: 0, fontFamily: "var(--sans)", fontSize: 22, fontWeight: 700 }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize: 12, color: "var(--ink-mid)", lineHeight: 1.55, margin: "4px 0 16px 32px", maxWidth: 880 }}>{sub}</p>}
      <div style={{ marginLeft: 32 }}>{children}</div>
    </section>
  );
}

function TypeRow({ label, sample, css, style }) {
  return (
    <>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 6 }}>
        {label}
        <div style={{ marginTop: 2 }}>{css}</div>
      </div>
      <div style={style}>{sample}</div>
    </>
  );
}

function SwatchRow({ label, rows, narrow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
      <div className="cap-sm" style={{ paddingTop: 8 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${narrow ? rows.length : Math.min(5, rows.length)}, 1fr)`, gap: 8 }}>
        {rows.map(([name, value]) => (
          <div key={name + value}>
            <div style={{ height: narrow ? 40 : 56, background: value, border: "0.5px solid var(--rule)" }} />
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-mid)", marginTop: 3 }}>{name}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink)" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleRow({ label, children }) {
  return (
    <>
      <div className="cap-sm" style={{ paddingTop: 2 }}>{label}</div>
      <div>{children}</div>
    </>
  );
}

Object.assign(window, { ComponentSheet });

})();
