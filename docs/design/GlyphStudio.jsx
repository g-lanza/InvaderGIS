/* global React, EVENT_CATEGORIES, SUBTYPE_GLYPHS, GLYPH_LIST, Glyph, GlyphStud, GlyphPath, GlyphCompass */


/* IIFE-WRAPPED */
(() => {
// =============================================================
// 08 — Glyph studio
// 1280 × 1600. Three blocks:
//   A. Category glyphs (the 9) — construction grid + sizes + on-stud
//   B. Subtype glyphs — every type of event that gets its own mark
//   C. Heraldic & terrain — eagle / fleur / fortress / mountain etc.
// =============================================================

const SUBTYPES = [
  { glyph: "shield",     label: "Siege",            color: "#9c1c1c", under: "violence" },
  { glyph: "ship",       label: "Raid / naval",     color: "#9c1c1c", under: "violence" },
  { glyph: "scroll",     label: "Treaty / charter", color: "#3d7a3a", under: "diplomacy" },
  { glyph: "bell",       label: "Proclamation",     color: "#3d7a3a", under: "diplomacy" },
  { glyph: "fortress",   label: "Founding",         color: "#b8860b", under: "power" },
  { glyph: "church",     label: "Council",          color: "#5a3d8a", under: "religion" },
  { glyph: "mosque",     label: "Mosque / Islam",   color: "#5a3d8a", under: "religion" },
  { glyph: "crescent",   label: "Islamic faith",    color: "#5a3d8a", under: "religion" },
  { glyph: "patriarchal", label: "Orthodox faith",  color: "#5a3d8a", under: "religion" },
  { glyph: "book",       label: "Codex / learning", color: "#2a7575", under: "culture" },
  { glyph: "caravan",    label: "Trade caravan",    color: "#a3592a", under: "economy" },
  { glyph: "flame",      label: "Fire",             color: "#6e3030", under: "disaster" },
  { glyph: "wheat",      label: "Famine",           color: "#6e3030", under: "disaster" },
  { glyph: "skull",      label: "Plague",           color: "#6e3030", under: "disaster" },
];

const HERALDRY = [
  { glyph: "eagle",        label: "Imperial eagle",   color: "#5a4530" },
  { glyph: "fleur",        label: "Fleur-de-lis",     color: "#3b6a8c" },
  { glyph: "horse",        label: "Cavalry / migration", color: "#5a4530" },
  { glyph: "helmet",       label: "Military command", color: "#5a4530" },
];

const TERRAIN = [
  { glyph: "tower",    label: "Capital",      color: "#1a1208" },
  { glyph: "fortress", label: "Castle",       color: "#1a1208" },
  { glyph: "bridge",   label: "Bridge",       color: "#5a4530" },
  { glyph: "mountain", label: "Mountain",     color: "#5a4530" },
  { glyph: "tree",     label: "Forest",       color: "#3d7a3a" },
  { glyph: "compass-rose", label: "Bearing",  color: "#1a1208" },
  { glyph: "arrow",    label: "Direction",    color: "#1a1208" },
  { glyph: "dot",      label: "Settlement",   color: "#1a1208" },
];

function GlyphStudio() {
  return (
    <div style={{ width: 1280, padding: 40, background: "var(--surface)", fontFamily: "var(--sans)" }}>
      <Header />

      {/* A. Categories */}
      <Block num="A" title="Event categories · the nine" sub="Color = category. Each event also has a subtype glyph if available (see block B); these defaults fire when no subtype matches.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "0.5px solid var(--rule)" }}>
          {EVENT_CATEGORIES.map((c) => <CategoryCell key={c.id} cat={c} />)}
        </div>
      </Block>

      {/* B. Subtypes */}
      <Block num="B" title="Subtype glyphs · finer reading on the map" sub="When an event's `type` matches one of these, the map stud uses this glyph instead of the category default. so a treaty doesn't look the same as a marriage, and a siege doesn't look the same as a pitched battle.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "0.5px solid var(--rule)" }}>
          {SUBTYPES.map((s) => <SubtypeCell key={s.glyph} sub={s} />)}
        </div>
      </Block>

      {/* C. Heraldry */}
      <Block num="C" title="Heraldry · entity markers" sub="Used to mark imperial / royal entities on the map and in EntityPanel headers. distinct from event studs.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "0.5px solid var(--rule)" }}>
          {HERALDRY.map((h) => <SubtypeCell key={h.glyph} sub={h} />)}
        </div>
      </Block>

      {/* D. Terrain & furniture */}
      <Block num="D" title="Map furniture · towers, bridges, terrain" sub="Drawn on the map alongside the polity polygons. Capital towers always show; the others appear with their respective layer toggle.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "0.5px solid var(--rule)" }}>
          {TERRAIN.map((t) => <SubtypeCell key={t.glyph} sub={t} />)}
        </div>
      </Block>

      {/* E. Stud parade */}
      <Block num="E" title="Stud parade · how they read on the map" sub="A line-up of every glyph at the size it ships on the map (22 px). This is the real test. read at a glance, no labels.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "16px 18px", border: "0.5px solid var(--rule)" }}>
          {EVENT_CATEGORIES.map((c) => (
            <StudWithLabel key={c.id} glyph={c.glyph} label={c.label} color={c.color} />
          ))}
          {SUBTYPES.map((s) => (
            <StudWithLabel key={"sub-" + s.glyph} glyph={s.glyph} label={s.label} color={s.color} />
          ))}
        </div>
      </Block>

      {/* F. Compass */}
      <Block num="F" title="North compass" sub="Used in the corner cartouche.">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, padding: "18px 18px", border: "0.5px solid var(--rule)" }}>
          {[28, 42, 60, 96].map((s) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <GlyphCompass size={s} color="#1a1208" />
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>{s} px</span>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 14, borderBottom: "0.5px solid var(--rule)" }}>
      <div className="cap-sm">ARTBOARD · 08</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 30, fontWeight: 700, marginTop: 4 }}>Glyph studio</div>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-mid)", margin: "6px 0 0", maxWidth: 920 }}>
        <strong style={{ color: "var(--ink)" }}>v.1 redraw.</strong> 24×24 grid, 1.6 px default stroke. Heavier
        than the first pass so they read on the map at 12 px and in the legend at 32 px. Categories are color-coded;
        subtype overrides give finer reading (treaty ≠ marriage; siege ≠ pitched battle). Heraldic and terrain
        glyphs sit alongside.
      </p>
    </div>
  );
}

function Block({ num, title, sub, children }) {
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 20, color: "var(--ink-mid)" }}>{num}</span>
        <h2 style={{ margin: 0, fontFamily: "var(--sans)", fontSize: 20, fontWeight: 700 }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize: 12, color: "var(--ink-mid)", lineHeight: 1.55, margin: "4px 0 14px 32px", maxWidth: 900 }}>{sub}</p>}
      <div style={{ marginLeft: 32 }}>{children}</div>
    </section>
  );
}

// ── Big category cell with construction grid ──
function CategoryCell({ cat }) {
  return (
    <div style={{ padding: 18, borderRight: "0.5px solid var(--rule)", borderBottom: "0.5px solid var(--rule)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="cap-sm" style={{ color: cat.color }}>{cat.label}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{cat.glyph} · {cat.id}</div>
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{cat.color}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
        {/* Construction grid */}
        <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--chrome-soft)", border: "0.5px solid var(--rule-soft)" }}>
          <svg width="100%" height="100%" viewBox="0 0 24 24">
            {Array.from({ length: 25 }, (_, i) => (
              <React.Fragment key={i}>
                <line x1={i} y1="0" x2={i} y2="24" stroke="rgba(26,18,8,0.06)" strokeWidth="0.05" />
                <line x1="0" y1={i} x2="24" y2={i} stroke="rgba(26,18,8,0.06)" strokeWidth="0.05" />
              </React.Fragment>
            ))}
            <circle cx="12" cy="12" r="10.8" fill="none" stroke="rgba(26,18,8,0.20)" strokeWidth="0.15" />
            <g stroke={cat.color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <GlyphPath name={cat.glyph} color={cat.color} />
            </g>
          </svg>
        </div>

        {/* Three stud sizes */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center", gap: 8, padding: "6px 0", border: "0.5px solid var(--rule-soft)" }}>
          <GlyphStud name={cat.glyph} size={16} color={cat.color} />
          <GlyphStud name={cat.glyph} size={26} color={cat.color} />
          <GlyphStud name={cat.glyph} size={40} color={cat.color} />
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>16 / 26 / 40 px</span>
        </div>
      </div>

      <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {cat.note || ","}
      </div>
    </div>
  );
}

function SubtypeCell({ sub }) {
  return (
    <div style={{ padding: 14, borderRight: "0.5px solid var(--rule)", borderBottom: "0.5px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
      <GlyphStud name={sub.glyph} size={36} color={sub.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{sub.label}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {sub.glyph}{sub.under && ` · under ${sub.under}`}
        </div>
      </div>
    </div>
  );
}

function StudWithLabel({ glyph, label, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 4px", minWidth: 70 }}>
      <GlyphStud name={glyph} size={26} color={color} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{label}</span>
    </div>
  );
}

Object.assign(window, { GlyphStudio });

})();
