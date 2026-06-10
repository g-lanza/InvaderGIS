/* global React, POLITIES, EVENTS, JOURNEYS, RELATIONSHIPS, RULERS, ERAS, EVENT_CATEGORIES, JOURNEY_KINDS, REGION_COLORS, MapBackground, Glyph, GlyphStud, GlyphCompass, ATLAS_YEAR */


/* IIFE-WRAPPED */
(() => {
// =============================================================
// 01 — Full Atlas mock (1920 × 1080)
// The headline. Shows every chrome surface in its redesigned form,
// populated with real data (Carolingian Empire selected, 814 CE).
// =============================================================

function AtlasFull() {
  const selected = POLITIES.find((p) => p.id === "carolingian_empire");
  const year = ATLAS_YEAR;

  return (
    <div style={{ position: "relative", width: 1920, height: 1080, background: "var(--surface)", overflow: "hidden", fontFamily: "var(--sans)" }}>
      {/* MAP STAGE */}
      <div className="map-stage" style={{ left: 48, right: 380, top: 0, bottom: 28 }}>
        <MapBackground selectedId="carolingian_empire" />

        {/* Corner cartouche. coords + scale */}
        <Cartouche year={year} />

        {/* Compass */}
        <div style={{ position: "absolute", top: 14, right: 14, padding: 6, background: "rgba(250,250,246,0.94)", border: "0.5px solid var(--rule)" }}>
          <GlyphCompass size={42} color="#1a1208" />
        </div>

        {/* Map legend. moved bottom-left to free the top-right for layer panel */}
        <MapLegend />

        {/* Hover annotation. a margin note, not a floating tooltip */}
        <HoverAnnotation />
      </div>

      {/* LEFT RAIL. tool palette */}
      <LeftRail />

      {/* RIGHT DOCK. stackable cards */}
      <RightDock selected={selected} />

      {/* TIME STRIP */}
      <TimeStrip year={year} />

      {/* COMMAND BAR */}
      <CommandBar year={year} polityCount={POLITIES.length} selected={selected} />
    </div>
  );
}

// ── Cartouche (corner inscription) ─────────────────────────
function Cartouche({ year }) {
  return (
    <div style={{
      position: "absolute", top: 14, left: 14,
      padding: "12px 16px",
      background: "rgba(250,250,246,0.97)",
      border: "0.5px solid var(--rule)",
      minWidth: 240,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="cap-sm">Historical Atlas</span>
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>INV · δ7</span>
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 22, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1.1 }}>
        Anno <span className="mono">{year}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", marginTop: 2, letterSpacing: "0.04em" }}>
        Early Middle Ages
      </div>
      <hr className="hair" />
      <div className="dl" style={{ rowGap: 2 }}>
        <dt>Polities</dt><dd className="mono">11</dd>
        <dt>Events</dt><dd className="mono">18 plotted</dd>
        <dt>Journeys</dt><dd className="mono">3</dd>
      </div>
    </div>
  );
}

// ── Map legend (bottom-left) ───────────────────────────────
function MapLegend() {
  return (
    <div style={{
      position: "absolute", left: 14, bottom: 14,
      background: "rgba(250,250,246,0.97)",
      border: "0.5px solid var(--rule)",
      padding: "10px 12px",
      width: 280,
    }}>
      <div className="sec-head" style={{ marginBottom: 6, paddingBottom: 4 }}>
        <span>Legend</span>
        <span className="mono">key</span>
      </div>

      <div className="cap-sm" style={{ marginTop: 4, color: "var(--ink)" }}>Events</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px 6px", marginTop: 4, marginBottom: 10 }}>
        {EVENT_CATEGORIES.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <GlyphStud name={c.glyph} size={16} color={c.color} sw={1.4} />
            <span style={{ color: "var(--ink-mid)" }}>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="cap-sm" style={{ color: "var(--ink)" }}>Journeys</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, marginBottom: 8 }}>
        {JOURNEY_KINDS.map((k) => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <svg width="44" height="6">
              <line x1="0" y1="3" x2="44" y2="3" stroke={k.color} strokeWidth="2"
                strokeDasharray={k.id === "spread" ? "8 4" : k.id === "individual_journey" ? "2 3" : "none"} />
            </svg>
            <span style={{ color: "var(--ink-mid)" }}>{k.label}</span>
          </div>
        ))}
      </div>

      <div className="cap-sm" style={{ color: "var(--ink)" }}>Scale</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <svg width="200" height="14">
          <line x1="0" y1="10" x2="200" y2="10" stroke="#1a1208" strokeWidth="1" />
          <line x1="0" y1="6" x2="0" y2="14" stroke="#1a1208" strokeWidth="1" />
          <line x1="50" y1="6" x2="50" y2="14" stroke="#1a1208" strokeWidth="1" />
          <line x1="100" y1="6" x2="100" y2="14" stroke="#1a1208" strokeWidth="1" />
          <line x1="150" y1="6" x2="150" y2="14" stroke="#1a1208" strokeWidth="1" />
          <line x1="200" y1="6" x2="200" y2="14" stroke="#1a1208" strokeWidth="1" />
          <rect x="0" y="6" width="50" height="4" fill="#1a1208" />
          <rect x="100" y="6" width="50" height="4" fill="#1a1208" />
        </svg>
        <span className="mono" style={{ fontSize: 10 }}>500 km</span>
      </div>
    </div>
  );
}

// ── Hover annotation (margin note replacing floating tooltip) ───
function HoverAnnotation() {
  return (
    <div style={{
      position: "absolute",
      right: 14, top: 80,
      width: 240,
      background: "rgba(250,250,246,0.97)",
      border: "0.5px solid var(--rule)",
      padding: "8px 10px",
    }}>
      <div className="cap-sm" style={{ marginBottom: 4 }}>Hover · 1140, 760</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 700 }}>Constantinople</div>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>Capital · Byzantine Empire</div>
      <hr className="hair" />
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
        Imperial capital. Population ≈ 500,000 in the 9th c. Walls of Theodosius hold.
      </div>
    </div>
  );
}

// ── Left rail ──────────────────────────────────────────────
function LeftRail() {
  const tools = [
    { id: "select", glyph: "asterisk", label: "Select" },
    { id: "layers", glyph: "star", label: "Layers" },
    { id: "search", glyph: "coin", label: "Search" },
    { id: "factors", glyph: "scales", label: "Factors" },
    { id: "lineage", glyph: "coronet", label: "Lineage" },
    { id: "network", glyph: "anchor", label: "Network" },
  ];
  return (
    <div className="rail" style={{ left: 0 }}>
      {tools.map((t, i) => (
        <div key={t.id} className="rail-tool" aria-pressed={i === 0} title={t.label}>
          <Glyph name={t.glyph} size={18} />
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="rail-tool" title="Settings"><Glyph name="dot" size={14} /></div>
    </div>
  );
}

// ── Right dock (stacked cards, no overlap) ─────────────────
function RightDock({ selected }) {
  return (
    <div className="dock dock-right" style={{ width: 380 }}>
      <DockHeader />
      <EntityCard entity={selected} />
      <EventCard />
      <LayersCard />
    </div>
  );
}

function DockHeader() {
  return (
    <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--rule)", background: "var(--chrome-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div className="cap-sm">Workspace</div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }}>compact</button>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }}>pop out</button>
      </div>
    </div>
  );
}

function EntityCard({ entity }) {
  if (!entity) return null;
  const ruler = RULERS.find((r) => r.entity === entity.id);
  const rels = RELATIONSHIPS.filter((r) => r.from === entity.id);

  return (
    <div style={{ borderBottom: "0.5px solid var(--rule)" }}>
      {/* Sticky entity header with crest */}
      <div style={{ padding: "10px 12px", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div className="crest lg" style={{ color: REGION_COLORS[entity.region] }}>
            <span>{entity.monogram}</span>
            <span className="region-band" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cap-sm" style={{ color: REGION_COLORS[entity.region] }}>POLITY · ENTITY</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
              {entity.name}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", marginTop: 2 }}>
              {entity.formed}–{entity.dissolved} · {entity.dissolved - entity.formed} years
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: "2px 6px" }} title="Close">×</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        {["Overview", "Rulers", "People", "Economy", "Links", "Sources"].map((t, i) => (
          <button key={t} className="tab-btn" aria-selected={i === 0}>{t}</button>
        ))}
      </div>

      {/* At-a-glance */}
      <div style={{ padding: "10px 12px" }}>
        <div className="dl" style={{ rowGap: 3 }}>
          <dt>Capital</dt><dd>{entity.capital}</dd>
          <dt>Religion</dt><dd>{entity.religion}</dd>
          <dt>Tongue</dt><dd>{entity.language.split(",")[0]}</dd>
          <dt>People</dt><dd>{entity.ethnicity.split(",")[0]}</dd>
          <dt>Pop. <span className="mono" style={{ opacity: 0.5 }}>c.{ATLAS_YEAR}</span></dt>
          <dd className="mono">{(entity.population_estimate / 1e6).toFixed(1)} M</dd>
          <dt>Ruler</dt>
          <dd>{ruler?.name} <span className="mono" style={{ color: "var(--ink-mid)", fontSize: 10 }}>· {ruler?.from}–{ruler?.to}</span></dd>
        </div>

        {/* Lifecycle bar */}
        <div style={{ marginTop: 12 }}>
          <div className="cap-sm" style={{ marginBottom: 4 }}>Lifecycle</div>
          <LifecycleBar entity={entity} year={ATLAS_YEAR} />
        </div>

        {/* Relationships preview */}
        <div style={{ marginTop: 14 }}>
          <div className="sec-head"><span>Relationships</span><span className="mono">{rels.length}</span></div>
          {rels.slice(0, 4).map((r, i) => {
            const other = POLITIES.find((p) => p.id === r.to);
            const color = REL_COLOR[r.type] || "#7a5c1e";
            return (
              <div key={i} className="row-key" style={{ color }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "var(--ink)" }}>
                  <span style={{ fontWeight: 600 }}>{other?.name || r.to}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>since {r.since}</span>
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.type}</div>
                <div style={{ fontSize: 11, color: "var(--ink-mid)", marginTop: 2 }}>{r.note}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const REL_COLOR = {
  alliance: "#41ab5d",
  rivalry: "#a73a3a",
  vassalage: "#6a3d9a",
  tributary: "#9b7a3a",
  trade: "#c87c3a",
  successor: "#3b6a8c",
  marriage: "#a07a9b",
  religious: "#7a5c1e",
  diplomatic: "#3b6a8c",
};

function LifecycleBar({ entity, year }) {
  const total = entity.dissolved - entity.formed;
  const phases = [
    { name: "form", pct: 8 },
    { name: "consolidate", pct: 14 },
    { name: "peak", pct: 38 },
    { name: "crisis", pct: 18 },
    { name: "fragment", pct: 14 },
    { name: "dissolve", pct: 8 },
  ];
  const cursorPct = ((year - entity.formed) / total) * 100;
  return (
    <div>
      <div style={{ display: "flex", height: 18, border: "0.5px solid var(--rule)" }}>
        {phases.map((p, i) => (
          <div key={i} style={{
            width: `${p.pct}%`,
            background: i === 2 ? "var(--surface-3)" : "var(--surface)",
            borderRight: i < phases.length - 1 ? "0.5px solid var(--rule)" : "none",
            backgroundImage: i % 2 === 0 ? "repeating-linear-gradient(45deg, rgba(26,18,8,0.07) 0 0.5px, transparent 0.5px 3px)" : "none",
            position: "relative",
          }} />
        ))}
        {/* Cursor */}
        <div style={{ position: "absolute", left: `calc(${cursorPct}% * 1)`, transform: "translateX(-50%)", marginLeft: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>{entity.formed}</span>
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-mid)" }}>{entity.dissolved}</span>
      </div>
    </div>
  );
}

function EventCard() {
  const e = EVENTS.find((ev) => ev.id === "death_charlemagne_814"); // Death of Charlemagne
  const cat = EVENT_CATEGORIES.find((c) => c.id === e.category);
  return (
    <div style={{ borderBottom: "0.5px solid var(--rule)", padding: "10px 12px" }}>
      <div className="cap-sm" style={{ color: cat.color }}>Selected Event</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
        <GlyphStud name={cat.glyph} size={28} color={cat.color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700 }}>{e.title}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{e.year} CE · {e.type}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>{e.summary}</div>
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {e.outcomes.map((o, i) => <span key={i} className="chip">{o}</span>)}
      </div>
    </div>
  );
}

function LayersCard() {
  const layers = [
    { name: "Polities", on: true, count: 11 },
    { name: "Capitals", on: true, count: 11 },
    { name: "Events", on: true, count: 18 },
    { name: "Journeys", on: true, count: 3 },
    { name: "Trade routes", on: false, count: 26 },
    { name: "Settlements", on: false, count: 4080 },
    { name: "Religion overlay", on: false, count: 25 },
    { name: "Cartogram (pop.)", on: false, count: 11 },
  ];
  return (
    <div style={{ padding: "10px 12px" }}>
      <div className="sec-head"><span>Layers</span><span className="mono">8</span></div>
      {layers.map((l) => (
        <div key={l.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--rule-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 14, height: 14, border: "0.5px solid var(--rule)", background: l.on ? "var(--ink)" : "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {l.on && <span style={{ color: "var(--paper)", fontSize: 10, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12 }}>{l.name}</span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{l.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Time strip ──────────────────────────────────────────────
function TimeStrip({ year }) {
  const min = 300, max = 1500;
  const cursorPct = ((year - min) / (max - min)) * 100;
  return (
    <div className="timestrip" style={{ left: 48, right: 380 }}>
      {/* Era bands */}
      <div style={{ position: "absolute", left: 16, right: 220, top: 14, height: 28, display: "flex", border: "0.5px solid var(--rule)" }}>
        {ERAS.map((era, i) => {
          const w = ((era.to - era.from) / (max - min)) * 100;
          return (
            <div key={era.name} style={{
              flex: `0 0 ${w}%`,
              borderRight: i < ERAS.length - 1 ? "0.5px solid var(--rule)" : "none",
              padding: "4px 8px",
              fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em",
              color: "var(--ink-mid)",
              background: i % 2 === 0 ? "var(--surface)" : "var(--surface-3)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>{era.name}</span>
              <span className="mono" style={{ fontSize: 9 }}>{era.from}</span>
            </div>
          );
        })}
      </div>

      {/* Event ticks rail */}
      <div style={{ position: "absolute", left: 16, right: 220, top: 50, height: 22, borderBottom: "0.5px solid var(--rule)" }}>
        {EVENTS.map((e) => {
          const cat = EVENT_CATEGORIES.find((c) => c.id === e.category);
          const left = ((e.year - min) / (max - min)) * 100;
          return (
            <div key={e.id} title={e.title} style={{
              position: "absolute", left: `${left}%`, bottom: 0,
              width: 1, height: 14, background: cat.color,
            }} />
          );
        })}
        {/* Cursor line */}
        <div style={{ position: "absolute", left: `${cursorPct}%`, top: -36, bottom: -10, width: 1, background: "var(--ink)" }} />
        <div style={{ position: "absolute", left: `${cursorPct}%`, top: -42, transform: "translateX(-50%)", background: "var(--ink)", color: "var(--surface)", padding: "2px 6px", fontSize: 10, fontFamily: "var(--mono)" }}>
          {year}
        </div>
      </div>

      {/* Year labels */}
      <div style={{ position: "absolute", left: 16, right: 220, bottom: 4, height: 12, display: "flex", justifyContent: "space-between" }}>
        {[300, 600, 900, 1200, 1500].map((y) => (
          <span key={y} className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>{y}</span>
        ))}
      </div>

      {/* Playback controls */}
      <div style={{ position: "absolute", right: 16, top: 14, display: "flex", gap: 4 }}>
        <button className="btn" style={{ padding: "4px 8px" }}>−10y</button>
        <button className="btn" style={{ padding: "4px 8px" }}>−1y</button>
        <button className="btn" aria-pressed style={{ padding: "4px 10px" }}>▶ play</button>
        <button className="btn" style={{ padding: "4px 8px" }}>+1y</button>
        <button className="btn" style={{ padding: "4px 8px" }}>+10y</button>
      </div>
      <div style={{ position: "absolute", right: 16, bottom: 4 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-mid)" }}>1.0× speed</span>
      </div>
    </div>
  );
}

// ── Command bar ────────────────────────────────────────────
function CommandBar({ year, polityCount, selected }) {
  return (
    <div className="cmdbar">
      <div className="seg">
        <span className="cap-sm" style={{ color: "rgba(244,240,230,0.6)" }}>YEAR</span>
        <span className="mono">{year} CE</span>
      </div>
      <div className="seg">
        <span className="cap-sm" style={{ color: "rgba(244,240,230,0.6)" }}>POLITIES</span>
        <span className="mono">{polityCount}</span>
      </div>
      <div className="seg">
        <span className="cap-sm" style={{ color: "rgba(244,240,230,0.6)" }}>SEL</span>
        <span className="mono">{selected?.name}</span>
      </div>
      <div className="seg">
        <span className="cap-sm" style={{ color: "rgba(244,240,230,0.6)" }}>CURSOR</span>
        <span className="mono">540, 410 → 5.2°E 49.8°N (Aachen)</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="seg">
        <span className="kbd-dark">/</span> <span style={{ color: "rgba(244,240,230,0.7)" }}>search</span>
        <span className="kbd-dark">L</span> <span style={{ color: "rgba(244,240,230,0.7)" }}>layers</span>
        <span className="kbd-dark">J</span> <span style={{ color: "rgba(244,240,230,0.7)" }}>jump-year</span>
        <span className="kbd-dark">⇧?</span> <span style={{ color: "rgba(244,240,230,0.7)" }}>help</span>
      </div>
    </div>
  );
}

Object.assign(window, { AtlasFull });

})();
