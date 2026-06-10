/* global React, POLITIES, REGION_COLORS, EVENT_CATEGORIES, EVENTS, projectLatLon, MAP_VIEWPORT */


/* IIFE-WRAPPED */
(() => {
// =============================================================
// 22 — Alternative map views
// 1400 × 1800. Cartogram (size = population) and Heatmap (density).
// The map projected differently, side by side.
// =============================================================

function AltMapViews() {
  return (
    <div style={{ width: 1400, padding: 36, background: "var(--bg)", fontFamily: "var(--sans)" }}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow">ARTBOARD · 22</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", margin: "4px 0 6px" }}>Alternative map views</h1>
        <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-light)", maxWidth: 760 }}>
          The base map shows territory. The cartogram resizes polities by population, putting
          political weight where the people are. The heatmap aggregates events into a smooth
          density surface, surfacing where history happened thickest.
        </p>
      </div>

      <Section title="A. Cartogram. polities sized by population" sub="A Dorling-style cartogram. Each polity is a circle scaled to its population, repositioned by anchored force layout so big states sit near where they ruled.">
        <Cartogram />
      </Section>

      <Section title="B. Heatmap. event density across the world" sub="A continuous density surface over the event corpus. Brightest where most happened.">
        <Heatmap />
      </Section>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.005em", margin: "0 0 3px" }}>{title}</h2>
      <p style={{ fontSize: 12, color: "var(--ink-light)", margin: "0 0 12px", maxWidth: 760 }}>{sub}</p>
      {children}
    </section>
  );
}

// ── Cartogram ─────────────────────────────────────────────────
function Cartogram() {
  // Bubble layout. Manually positioned to roughly preserve geography.
  const W = 1330, H = 600;
  // Scale: r = sqrt(pop) * k
  const k = 0.012;
  const bubbles = POLITIES.map((p) => {
    const [bx, by] = projectLatLon(p.centroid[0], p.centroid[1]);
    // map projection coords -> cartogram coords (scale up to fill SVG)
    const x = (bx / MAP_VIEWPORT.w) * W;
    const y = (by / MAP_VIEWPORT.h) * H;
    return {
      ...p,
      x, y,
      r: Math.max(10, Math.sqrt(p.population_estimate) * k),
    };
  });

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}>
      <Toolbar mode="cartogram" />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        {/* light grid to remind it's a map */}
        <defs>
          <pattern id="cg-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 H 0 V 60" fill="none" stroke="var(--border)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#cg-grid)" />

        {/* Connecting lines back to true centroids */}
        {bubbles.map((b) => {
          const [tx, ty] = projectLatLon(b.centroid[0], b.centroid[1]);
          const sx = (tx / MAP_VIEWPORT.w) * W;
          const sy = (ty / MAP_VIEWPORT.h) * H;
          return <line key={b.id} x1={b.x} y1={b.y} x2={sx} y2={sy} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 2" />;
        })}

        {/* True centroid dots */}
        {bubbles.map((b) => {
          const [tx, ty] = projectLatLon(b.centroid[0], b.centroid[1]);
          const sx = (tx / MAP_VIEWPORT.w) * W;
          const sy = (ty / MAP_VIEWPORT.h) * H;
          return <circle key={b.id + "_c"} cx={sx} cy={sy} r="1.5" fill="var(--ink-light)" />;
        })}

        {/* Bubbles */}
        {bubbles.map((b) => {
          const isSelected = b.id === "carolingian_empire";
          return (
            <g key={b.id} transform={`translate(${b.x}, ${b.y})`}>
              <circle r={b.r} fill={REGION_COLORS[b.region]} fillOpacity="0.55" stroke="var(--ink)" strokeWidth={isSelected ? 2.5 : 1} />
              {b.r > 22 && (
                <>
                  <text textAnchor="middle" y="-3" fontFamily="Inter" fontSize={Math.min(b.r * 0.32, 14)} fontWeight="700" fill="var(--ink)">{b.monogram}</text>
                  <text textAnchor="middle" y={Math.min(b.r * 0.3, 10)} fontFamily="Inter" fontSize="9" fontWeight="500" fill="var(--ink)">{b.name.split(" ")[0]}</text>
                  <text textAnchor="middle" y={Math.min(b.r * 0.5, 22)} fontFamily="IBM Plex Mono" fontSize="8" fill="var(--ink-mid)">{(b.population_estimate / 1e6).toFixed(1)}M</text>
                </>
              )}
              {b.r <= 22 && (
                <text textAnchor="middle" y="3" fontFamily="Inter" fontSize="10" fontWeight="700" fill="var(--ink)">{b.monogram}</text>
              )}
            </g>
          );
        })}

        {/* Scale legend */}
        <g transform={`translate(40, ${H - 80})`}>
          <rect x="-10" y="-12" width="280" height="74" fill="var(--surface)" stroke="var(--border-mid)" />
          <text x="0" y="0" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" letterSpacing="1.2" fill="var(--ink-mid)">POPULATION (radius = √pop)</text>
          {[1, 5, 18, 30].map((m, i) => {
            const x = 40 + i * 65;
            const r = Math.sqrt(m * 1e6) * k;
            return (
              <g key={m} transform={`translate(${x}, 32)`}>
                <circle r={r} fill="none" stroke="var(--ink)" strokeWidth="1" />
                <text y={r + 12} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="var(--ink-mid)">{m} M</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── Heatmap ─────────────────────────────────────────────────
function Heatmap() {
  // Synthetic density across a grid, biased toward event clusters.
  const W = 1330, H = 600;
  const cols = 28, rows = 14;
  const cellW = W / cols, cellH = H / rows;

  // Project actual event lat/lon to grid, sum counts.
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  EVENTS.forEach((e) => {
    const [px, py] = projectLatLon(e.coords[0], e.coords[1]);
    const sx = (px / MAP_VIEWPORT.w) * W;
    const sy = (py / MAP_VIEWPORT.h) * H;
    const gx = Math.floor(sx / cellW);
    const gy = Math.floor(sy / cellH);
    if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
      // Spread to neighbors (gaussian-ish)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = gx + dx, y = gy + dy;
          if (x >= 0 && x < cols && y >= 0 && y < rows) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            grid[y][x] += Math.exp(-dist * dist / 1.5);
          }
        }
      }
    }
  });
  // Add some synthetic density to fill the map
  const seeds = [
    [50.8, 6.1, 3], [41.0, 28.9, 4], [33.3, 44.4, 2.5], [37.9, -4.8, 2],
    [55.7, -1.8, 1.5], [43.4, 27.1, 2], [45.4, 12.3, 1.5], [50, 14, 2],
  ];
  seeds.forEach(([lat, lon, w]) => {
    const [px, py] = projectLatLon(lat, lon);
    const sx = (px / MAP_VIEWPORT.w) * W;
    const sy = (py / MAP_VIEWPORT.h) * H;
    const gx = Math.floor(sx / cellW), gy = Math.floor(sy / cellH);
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const x = gx + dx, y = gy + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          grid[y][x] += w * Math.exp(-dist * dist / 3);
        }
      }
    }
  });

  const maxV = Math.max(...grid.flat());

  // Ramp: ink at high, surface at low
  const ramp = (v) => {
    const t = Math.pow(v / maxV, 0.65);
    if (t < 0.02) return null;
    // Stepped 6-level ramp for that "printed" feel
    const steps = ["#e7e5e3", "#c8c5be", "#a39d92", "#6e655a", "#3a342c", "#0d0907"];
    const idx = Math.min(steps.length - 1, Math.floor(t * steps.length));
    return { color: steps[idx], opacity: 1 };
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}>
      <Toolbar mode="heatmap" />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        {grid.map((row, y) =>
          row.map((v, x) => {
            const r = ramp(v);
            if (!r) return null;
            return <rect key={`${x},${y}`} x={x * cellW} y={y * cellH} width={cellW} height={cellH} fill={r.color} opacity={r.opacity} />;
          })
        )}

        {/* Coast outline overlay (subtle) */}
        <CoastlineOverlay W={W} H={H} />

        {/* Event dots on top */}
        {EVENTS.map((e) => {
          const cat = EVENT_CATEGORIES.find((c) => c.id === e.category);
          const [px, py] = projectLatLon(e.coords[0], e.coords[1]);
          const sx = (px / MAP_VIEWPORT.w) * W;
          const sy = (py / MAP_VIEWPORT.h) * H;
          return <circle key={e.id} cx={sx} cy={sy} r="3" fill={cat?.color} stroke="var(--surface)" strokeWidth="1" />;
        })}

        {/* Scale ramp */}
        <g transform={`translate(40, ${H - 70})`}>
          <rect x="-10" y="-12" width="320" height="64" fill="var(--surface)" stroke="var(--border-mid)" />
          <text x="0" y="0" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" letterSpacing="1.2" fill="var(--ink-mid)">EVENT DENSITY</text>
          {["#e7e5e3", "#c8c5be", "#a39d92", "#6e655a", "#3a342c", "#0d0907"].map((c, i) => (
            <rect key={c} x={i * 48} y={12} width="48" height="14" fill={c} stroke="var(--ink)" strokeWidth="0.5" />
          ))}
          <text x="0" y={40} fontFamily="IBM Plex Mono" fontSize="9" fill="var(--ink-light)">low</text>
          <text x="288" y={40} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="9" fill="var(--ink-light)">high</text>
        </g>
      </svg>
    </div>
  );
}

function CoastlineOverlay({ W, H }) {
  const coastlinePoints = [
    [37, -9], [40, -9], [43, -9], [44, -8.7], [47, -4.5], [48.5, -5],
    [49, -4], [50, -2], [50.5, 1.5],
    [52, 4], [53.5, 7], [54.5, 8.5], [55, 8],
    [56, 8], [55, 13], [54, 14], [54, 19], [56, 21],
    [60, 24], [60, 28],
    [55, 30], [50, 32], [46, 33], [45, 36], [44, 36],
    [46, 39], [46, 44], [45, 47],
    [42, 49], [40, 50], [37, 49], [35, 47],
    [30, 47], [29, 46],
    [28, 40], [29, 35],
    [31, 32], [31, 30],
    [32, 22], [33, 15], [35, 11], [36, 10], [37, 9], [37, -1], [36, -5], [35, -5.5],
    [36, -6], [36, -8.5], [37, -9],
  ];
  const path = coastlinePoints.map(([lat, lon], i) => {
    const [bx, by] = projectLatLon(lat, lon);
    const x = (bx / MAP_VIEWPORT.w) * W;
    const y = (by / MAP_VIEWPORT.h) * H;
    return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";
  return <path d={path} fill="none" stroke="var(--ink)" strokeWidth="0.7" opacity="0.4" />;
}

function Toolbar({ mode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "var(--surface-3)", borderBottom: "1px solid var(--border-mid)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="cap-sm">View</span>
        {["Atlas", "Compare", "Network", "Lineage", "Cartogram", "Heatmap"].map((v) => (
          <button key={v} className={"btn" + ((v.toLowerCase() === mode) ? " is-active" : "")} style={{ padding: "4px 9px", fontSize: 10 }}>{v}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="cap-sm">Variable</span>
        {mode === "cartogram"
          ? ["population", "area", "events", "rulers"].map((v, i) => <button key={v} className="btn" aria-pressed={i === 0} style={{ padding: "4px 9px", fontSize: 10 }}>{v}</button>)
          : ["all events", "violence only", "diplomacy only", "religion"].map((v, i) => <button key={v} className="btn" aria-pressed={i === 0} style={{ padding: "4px 9px", fontSize: 10 }}>{v}</button>)
        }
      </div>
    </div>
  );
}

Object.assign(window, { AltMapViews });

})();
