/**
 * design/glyphMarks.tsx — GLYPH MARK GEOMETRY + REGISTRY (extracted from glyphs.tsx).
 *
 * Holds the 39 individual SVG Mark* components (24×24 grid, currentColor, 1.6px
 * stroke), the MARK_REGISTRY name→render map, the name-lookup helpers
 * (GLYPH_NAMES / hasGlyph / resolveGlyph), and the subtype resolver
 * (SUBTYPE_GLYPH_MAP / resolveSubtypeGlyph). Split out of glyphs.tsx so that
 * file stays under the 800-line cap; glyphs.tsx exports only the public Glyph /
 * GlyphStud components.
 *
 * Wave2 additions (this pass):
 *   · MarkDagger   — assassination
 *   · MarkTorch    — rebellion / revolt
 *   · MarkCrack    — earthquake
 *   · MarkCloud    — climate / weather
 *   · "compass-rose" alias → MarkCompass (artboard TERRAIN block key)
 *   · SUBTYPE_GLYPH_MAP — static compile-time subtype→glyph resolver
 *   · resolveSubtypeGlyph() — exported resolver function
 *
 * Conventions unchanged from the original glyphs.tsx:
 *  · viewBox 0 0 24 24 → centre (12,12), inscribed circle r=10.8
 *  · stroke="currentColor", fill="none"; strokeWidth 1.6, round caps/joins
 *    applied by the <Glyph> wrapper — do NOT set them inside paths.
 *  · Any name without a real mark resolves to the visible "ring" fallback.
 *
 * This module INTENTIONALLY mixes components (the Mark* functions) with the
 * registry + helpers that index them: MARK_REGISTRY maps names → JSX-returning
 * functions, so the registry and the marks are inseparable. Fast Refresh's
 * "component-only module" rule does not usefully apply here (this is a static
 * geometry catalog, not a hot-edited UI surface), so react-refresh is disabled
 * for this file rather than forced into an artificial split that would split the
 * registry from the marks it references.
 */
/* eslint-disable react-refresh/only-export-components */

import React from 'react';

/** Shared SVG presentation props applied to every <Glyph> mark group. */
export const MARK_ATTRS = {
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ── 1. BLADE — Violence ──────────────────────────────────────────────────────
// Two crossed swords: diagonal blades + crossguards + pommels.
// Blade NW→SE: (5,5)→(19,19). Blade NE→SW: (19,5)→(5,19).
// Crossguard perpendicular to blade axis, centred at (12,12).
function MarkBlade() {
  return (
    <>
      {/* Blade NW→SE */}
      <line x1="6" y1="6" x2="18" y2="18" />
      {/* Blade NE→SW */}
      <line x1="18" y1="6" x2="6" y2="18" />
      {/* Crossguard on NW→SE blade (perpendicular, centred at 12,12) */}
      <line x1="9.5" y1="14.5" x2="14.5" y2="9.5" />
      {/* Crossguard on NE→SW blade (perpendicular) */}
      <line x1="9.5" y1="9.5" x2="14.5" y2="14.5" />
      {/* Pommels at hilt ends */}
      <circle cx="6.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  );
}

// ── 2. BALANCE — Diplomacy ───────────────────────────────────────────────────
// A scales of justice: vertical stem, horizontal beam, two hanging pans.
// Stem: (12,5)→(12,19). Beam: (5,8)→(19,8). Pans hang from (5,8) and (19,8).
function MarkBalance() {
  return (
    <>
      {/* Vertical stem */}
      <line x1="12" y1="6" x2="12" y2="19" />
      {/* Base foot */}
      <line x1="9" y1="19" x2="15" y2="19" />
      {/* Horizontal beam */}
      <line x1="5" y1="9" x2="19" y2="9" />
      {/* Left suspension cord */}
      <line x1="5" y1="9" x2="5" y2="14" />
      {/* Right suspension cord */}
      <line x1="19" y1="9" x2="19" y2="14" />
      {/* Left pan arc */}
      <path d="M3,14 Q5,17 7,14" />
      {/* Right pan arc */}
      <path d="M17,14 Q19,17 21,14" />
      {/* Pivot point at top of stem */}
      <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
    </>
  );
}

// ── 3. ORB — Power ───────────────────────────────────────────────────────────
// Imperial orb: circle body, equatorial band, vertical meridian, cross finial.
function MarkOrb() {
  return (
    <>
      {/* Orb body */}
      <circle cx="12" cy="13" r="7" />
      {/* Equatorial band */}
      <path d="M5,13 Q12,15.5 19,13" />
      {/* Vertical meridian on orb */}
      <line x1="12" y1="6" x2="12" y2="20" />
      {/* Cross finial above */}
      <line x1="12" y1="3" x2="12" y2="6" />
      <line x1="10" y1="4.5" x2="14" y2="4.5" />
    </>
  );
}

// ── 4. FLAME — Religion / Fire ───────────────────────────────────────────────
// A clean teardrop flame: pointed tip at top, rounded base.
// Two inner curves for depth.
function MarkFlame() {
  return (
    <>
      {/* Outer flame silhouette */}
      <path d="M12,4 C16,8 18,12 18,15 C18,18.3 15.3,20.5 12,20.5 C8.7,20.5 6,18.3 6,15 C6,12 8,8 12,4Z" />
      {/* Inner flame highlight — second tongue */}
      <path d="M12,8 C14,11 14.5,13 14,15 C13.5,16.8 13,17.5 12,17.5" />
    </>
  );
}

// ── 5. STAR — Culture ────────────────────────────────────────────────────────
// Six-pointed star (Star of David / hexagram): two overlapping equilateral
// triangles, drawn as a single star outline. Clean, geometric.
function MarkStar() {
  // Points of a 6-pointed star inscribed in r=9, centre (12,12)
  // Top triangle: points at top, bottom-left, bottom-right
  // r_outer=9, r_inner=5.2 (ratio for regular 6-point star)
  const R = 9;
  const r = 5.2;
  // 6 outer points at 0°,60°,120°,180°,240°,300° (offset -90° so tip is up)
  const outerPts: [number, number][] = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 - 90) * (Math.PI / 180);
    return [12 + R * Math.cos(a), 12 + R * Math.sin(a)];
  });
  // 6 inner points at 30°,90°,...
  const innerPts: [number, number][] = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 - 60) * (Math.PI / 180);
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a)];
  });
  // Weave outer-inner-outer-inner to make star outline
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    pts.push(outerPts[i], innerPts[i]);
  }
  const d =
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + 'Z';
  return <path d={d} />;
}

// ── 6. EYE — Discovery ───────────────────────────────────────────────────────
// Almond eye shape with a filled pupil. Horizontal orientation.
function MarkEye() {
  return (
    <>
      {/* Outer eyelid outline — pointed almond */}
      <path d="M3,12 Q12,4 21,12 Q12,20 3,12Z" />
      {/* Iris circle */}
      <circle cx="12" cy="12" r="3.5" />
      {/* Pupil dot */}
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  );
}

// ── 7. COIN — Economy ────────────────────────────────────────────────────────
// A coin face: circle outline with a horizontal dividing bar (like a
// denomination line) and a small cross-hatch mark for minted currency.
function MarkCoin() {
  return (
    <>
      {/* Coin circle */}
      <circle cx="12" cy="12" r="8.5" />
      {/* Horizontal bar — the denomination strike */}
      <line x1="5.5" y1="12" x2="18.5" y2="12" />
      {/* Vertical stroke — forms a cross with horizontal bar */}
      <line x1="12" y1="5.5" x2="12" y2="18.5" />
      {/* Inner circle rim — gives the coin depth */}
      <circle cx="12" cy="12" r="5.5" />
    </>
  );
}

// ── 8. BOLT — Hazard ─────────────────────────────────────────────────────────
// Lightning bolt: classic zig-zag downward strike.
// Upper segment: (14,3)→(9,13). Lower segment: (9,13)→(13,11)→(10,21).
function MarkBolt() {
  return (
    <path d="M14,3 L8,13 L12.5,11.5 L10,21 L16,11 L11.5,12.5 Z"
      fill="currentColor" stroke="none" />
  );
}

// ── 9. PILLARS — Institution ─────────────────────────────────────────────────
// Two classical columns with capitals and a lintel (entablature).
// Left column: x=7. Right column: x=17. Lintel top: y=5. Base: y=20.
function MarkPillars() {
  return (
    <>
      {/* Lintel (entablature) across top */}
      <rect x="4" y="5" width="16" height="2" fill="currentColor" stroke="none" />
      {/* Left column shaft */}
      <rect x="6.5" y="7" width="3" height="11" />
      {/* Right column shaft */}
      <rect x="14.5" y="7" width="3" height="11" />
      {/* Base step */}
      <rect x="4" y="18" width="16" height="2" fill="currentColor" stroke="none" />
      {/* Left capital (abacus) */}
      <rect x="5.5" y="5.5" width="5" height="1.5" fill="currentColor" stroke="none" />
      {/* Right capital (abacus) */}
      <rect x="13.5" y="5.5" width="5" height="1.5" fill="currentColor" stroke="none" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBTYPE / FURNITURE MARKS
// ─────────────────────────────────────────────────────────────────────────────

// ── SHIELD — Siege ───────────────────────────────────────────────────────────
// Classic kite/heater shield silhouette, vertical.
function MarkShield() {
  return (
    <path d="M12,3 L20,6 L20,13 Q20,19 12,21 Q4,19 4,13 L4,6 Z" />
  );
}


// ── SCROLL — Treaty / Charter ────────────────────────────────────────────────
// A rolled document: rectangle body with curled ends top and bottom.
function MarkScroll() {
  return (
    <>
      {/* Scroll body */}
      <rect x="6" y="7" width="12" height="10" />
      {/* Top curl (rolled end) */}
      <path d="M6,7 Q6,4 9,4 Q12,4 12,7" />
      <path d="M18,7 Q18,4 15,4 Q12,4 12,7" />
      {/* Bottom curl */}
      <path d="M6,17 Q6,20 9,20 Q12,20 12,17" />
      <path d="M18,17 Q18,20 15,20 Q12,20 12,17" />
      {/* Text lines on scroll */}
      <line x1="8.5" y1="10" x2="15.5" y2="10" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="14" x2="13" y2="14" />
    </>
  );
}

// ── BELL — Proclamation ──────────────────────────────────────────────────────
// Bell silhouette: curved dome, clapper, mounting ring.
function MarkBell() {
  return (
    <>
      {/* Mounting ring at top */}
      <path d="M10.5,5 Q10.5,3.5 12,3.5 Q13.5,3.5 13.5,5" />
      {/* Bell dome — wide-curved profile */}
      <path d="M5,17 Q5,8 12,7 Q19,8 19,17Z" />
      {/* Skirt / bell mouth flare */}
      <path d="M4.5,17 Q12,19 19.5,17" />
      {/* Clapper */}
      <line x1="12" y1="17" x2="12" y2="20" />
      <circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none" />
    </>
  );
}

// ── FORTRESS — Founding / Castle ─────────────────────────────────────────────
// Crenellated tower: square base, three merlons on top, doorway.
function MarkFortress() {
  return (
    <>
      {/* Tower body */}
      <rect x="5" y="10" width="14" height="11" />
      {/* Left merlon */}
      <rect x="5" y="5" width="3.5" height="5" />
      {/* Centre merlon */}
      <rect x="10.25" y="5" width="3.5" height="5" />
      {/* Right merlon */}
      <rect x="15.5" y="5" width="3.5" height="5" />
      {/* Doorway arch */}
      <path d="M10,21 L10,16 Q12,14 14,16 L14,21" />
    </>
  );
}

// ── CHURCH — Council / Christian ─────────────────────────────────────────────
// Simple church profile: nave rectangle, pointed roof, cross finial.
function MarkChurch() {
  return (
    <>
      {/* Nave body */}
      <rect x="5" y="13" width="14" height="8" />
      {/* Roof / steeple triangle */}
      <path d="M5,13 L12,5 L19,13Z" />
      {/* Cross finial on steeple peak */}
      <line x1="12" y1="3" x2="12" y2="6.5" />
      <line x1="10.2" y1="4.5" x2="13.8" y2="4.5" />
      {/* Door */}
      <path d="M10,21 L10,17 Q12,15.5 14,17 L14,21" />
    </>
  );
}

// ── MOSQUE — Islamic architecture ────────────────────────────────────────────
// Dome silhouette with minaret and pointed arch entrance.
function MarkMosque() {
  return (
    <>
      {/* Main dome */}
      <path d="M5,14 Q5,6 12,6 Q19,6 19,14Z" />
      {/* Nave base */}
      <rect x="5" y="14" width="14" height="6" />
      {/* Minaret — right side */}
      <rect x="18" y="8" width="2.5" height="12" />
      {/* Minaret finial */}
      <path d="M18,8 L19.25,5.5 L20.5,8" />
      {/* Entrance arch */}
      <path d="M9,20 L9,16 Q12,13.5 15,16 L15,20" />
      {/* Crescent on dome */}
      <path d="M11,8.5 Q13,7 14,9 Q12.5,8 11,8.5Z"
        fill="currentColor" stroke="none" />
    </>
  );
}

// ── CRESCENT — Islamic faith ──────────────────────────────────────────────────
// Clean Islamic crescent with a 5-pointed star.
function MarkCrescent() {
  return (
    <>
      {/* Crescent moon — outer circle minus inner offset circle */}
      <path d="M12,3 A9,9 0 1 1 12,21 A7,7 0 1 0 12,3Z"
        fill="currentColor" stroke="none" />
      {/* 5-pointed star to the upper right of crescent */}
      {/* Small star at (17, 7), r=2.5 */}
      {(() => {
        const cx = 17, cy = 7, R2 = 2.5, r2 = 1.1;
        const pts2: [number, number][] = [];
        for (let i = 0; i < 5; i++) {
          const ao = (i * 72 - 90) * (Math.PI / 180);
          const ai = (i * 72 - 54) * (Math.PI / 180);
          pts2.push([cx + R2 * Math.cos(ao), cy + R2 * Math.sin(ao)]);
          pts2.push([cx + r2 * Math.cos(ai), cy + r2 * Math.sin(ai)]);
        }
        const d2 = pts2.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + 'Z';
        return <path d={d2} fill="currentColor" stroke="none" />;
      })()}
    </>
  );
}

// ── PATRIARCHAL — Orthodox faith ─────────────────────────────────────────────
// Patriarchal / Orthodox cross: a cross with TWO crossbars.
// Lower bar wider, upper bar narrower (the INRI bar).
function MarkPatriarchal() {
  return (
    <>
      {/* Vertical stem */}
      <line x1="12" y1="3" x2="12" y2="21" />
      {/* Upper crossbar (narrower, INRI) */}
      <line x1="8" y1="7" x2="16" y2="7" />
      {/* Lower (main) crossbar */}
      <line x1="5" y1="12" x2="19" y2="12" />
      {/* Slanted footrest — optional: adds recognisability */}
      <line x1="8" y1="17" x2="16" y2="19" />
    </>
  );
}

// ── BOOK — Codex / Learning ───────────────────────────────────────────────────
// Open book: two pages splayed open with a central spine.
function MarkBook() {
  return (
    <>
      {/* Left page */}
      <path d="M12,6 Q8,5 4,7 L4,19 Q8,17.5 12,18Z" />
      {/* Right page */}
      <path d="M12,6 Q16,5 20,7 L20,19 Q16,17.5 12,18Z" />
      {/* Spine crease */}
      <line x1="12" y1="6" x2="12" y2="18" />
      {/* Left text lines */}
      <line x1="6" y1="10" x2="11" y2="9.5" />
      <line x1="6" y1="12.5" x2="11" y2="12" />
      <line x1="6" y1="15" x2="11" y2="14.5" />
      {/* Right text lines */}
      <line x1="13" y1="9.5" x2="18" y2="10" />
      <line x1="13" y1="12" x2="18" y2="12.5" />
      <line x1="13" y1="14.5" x2="18" y2="15" />
    </>
  );
}

// ── CARAVAN — Trade ───────────────────────────────────────────────────────────
// Three camel humps in profile (simplified camel silhouette) moving left→right.
// Readable even at small sizes as "a line of camels."
function MarkCaravan() {
  return (
    <>
      {/* Ground line */}
      <line x1="2" y1="17" x2="22" y2="17" />
      {/* First camel body (lead camel) */}
      <path d="M15,17 Q15,14 17,14 Q17,12 16,11 Q18,11 18,14 Q20,14 20,17" />
      {/* Second camel */}
      <path d="M8,17 Q8,14 10,14 Q10,12 9,11 Q11,11 11,14 Q13,14 13,17" />
      {/* Third camel (rear) */}
      <path d="M2,17 Q2,14 4,14 Q4,12.5 3.5,11.5 Q5,11.5 5,14 Q7,14 7,17" />
      {/* Rider on lead camel */}
      <circle cx="17.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </>
  );
}

// ── WHEAT — Famine ────────────────────────────────────────────────────────────
// Three wheat stalks with grain heads.
function MarkWheat() {
  return (
    <>
      {/* Centre stalk */}
      <line x1="12" y1="20" x2="12" y2="7" />
      {/* Left stalk */}
      <line x1="8" y1="20" x2="10" y2="9" />
      {/* Right stalk */}
      <line x1="16" y1="20" x2="14" y2="9" />
      {/* Centre grain head */}
      <path d="M12,7 Q10,5.5 11,4 Q12,5 12,7Z" />
      <path d="M12,7 Q14,5.5 13,4 Q12,5 12,7Z" />
      {/* Left grain head */}
      <path d="M10,9 Q8,7.5 9,6 Q10,7 10,9Z" />
      <path d="M10,9 Q12,7.5 11,6 Q10,7 10,9Z" />
      {/* Right grain head */}
      <path d="M14,9 Q12,7.5 13,6 Q14,7 14,9Z" />
      <path d="M14,9 Q16,7.5 15,6 Q14,7 14,9Z" />
      {/* Straw base tie */}
      <path d="M9,18 Q12,19.5 15,18" />
    </>
  );
}

// ── SKULL — Plague ────────────────────────────────────────────────────────────
// Skull and crossbones: cranium, eye sockets, nasal, teeth, crossed bones below.
function MarkSkull() {
  return (
    <>
      {/* Cranium */}
      <path d="M12,3 A6,6 0 0 1 18,9 L18,13 L6,13 L6,9 A6,6 0 0 1 12,3Z" />
      {/* Left eye socket */}
      <circle cx="9.5" cy="9" r="1.8" fill="currentColor" stroke="none" />
      {/* Right eye socket */}
      <circle cx="14.5" cy="9" r="1.8" fill="currentColor" stroke="none" />
      {/* Nasal cavity */}
      <path d="M11,11 L12,12.5 L13,11" />
      {/* Teeth */}
      <line x1="9" y1="13" x2="9" y2="15" />
      <line x1="12" y1="13" x2="12" y2="15" />
      <line x1="15" y1="13" x2="15" y2="15" />
      <line x1="7.5" y1="13" x2="7" y2="15" />
      <line x1="16.5" y1="13" x2="17" y2="15" />
      {/* Crossed bones */}
      <line x1="5" y1="17" x2="19" y2="22" />
      <line x1="19" y1="17" x2="5" y2="22" />
    </>
  );
}

// ── RINGS — Marriage ──────────────────────────────────────────────────────────
// Two interlocking rings (wedding bands).
function MarkRings() {
  return (
    <>
      {/* Left ring */}
      <circle cx="9.5" cy="12" r="5.5" />
      {/* Right ring */}
      <circle cx="14.5" cy="12" r="5.5" />
      {/* White-out the overlap to show interlinking — use surface fill trick:
          Two small arcs that "close" the gap. Since we can't use clip-path
          without complexity, we draw a short arc in surface color. */}
      {/* Overlap mask: right ring's left arc in a slightly thicker "erase" stroke.
          We use the actual geometry: right ring from ~220°→140° (the part that
          visually goes "behind" the left ring) — rendered last in fill. */}
      {/* Interlocking visual: re-draw right ring's behind-arc with background fill */}
      <path
        d="M14.5,6.5 A5.5,5.5 0 0 0 9,12 A5.5,5.5 0 0 0 14.5,17.5"
        stroke="var(--surface, #ffffff)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Re-draw right ring on top (foreground) */}
      <circle cx="14.5" cy="12" r="5.5" />
    </>
  );
}

// ── DOT — Settlement ──────────────────────────────────────────────────────────
// Plain filled circle.
function MarkDot() {
  return <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />;
}

// ── COMPASS (North) ───────────────────────────────────────────────────────────
// Eight-pointed compass rose: 4 cardinal points (N/S/E/W) larger,
// 4 intercardinal points smaller.
function MarkCompass() {
  return (
    <>
      {/* N point (tall) */}
      <path d="M12,2 L10,10 L12,9 L14,10 Z" fill="currentColor" stroke="none" />
      {/* S point */}
      <path d="M12,22 L10,14 L12,15 L14,14 Z" fill="currentColor" stroke="none" />
      {/* E point */}
      <path d="M22,12 L14,10 L15,12 L14,14 Z" fill="currentColor" stroke="none" />
      {/* W point */}
      <path d="M2,12 L10,10 L9,12 L10,14 Z" fill="currentColor" stroke="none" />
      {/* NE intercardinal */}
      <path d="M19.3,4.7 L14.5,10.5 L16,11.5 Z" fill="currentColor" stroke="none" />
      {/* NW intercardinal */}
      <path d="M4.7,4.7 L9.5,10.5 L8,11.5 Z" fill="currentColor" stroke="none" />
      {/* SE intercardinal */}
      <path d="M19.3,19.3 L14.5,13.5 L16,12.5 Z" fill="currentColor" stroke="none" />
      {/* SW intercardinal */}
      <path d="M4.7,19.3 L9.5,13.5 L8,12.5 Z" fill="currentColor" stroke="none" />
      {/* Centre circle */}
      <circle cx="12" cy="12" r="2" fill="var(--surface, #ffffff)" stroke="currentColor" strokeWidth="1.2" />
      {/* N label position marker — small north tick */}
      <line x1="12" y1="2" x2="12" y2="1" strokeWidth="0.8" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTED MARKS (Wave1-B) — fresh geometry on OUR 24×24 / currentColor contract,
// derived from the quarry's components/Glyphs.tsx mark set. These extend the
// furniture / terrain / heraldic vocabulary the original registry lacked:
//   helmet, horse, tower, bridge, mountain, tree, eagle, fleur, arrow.
// Stroke / linecap / linejoin come from the <Glyph>/<GlyphStud> wrapper group
// (MARK_ATTRS) — do NOT set them inside these paths.
// ─────────────────────────────────────────────────────────────────────────────

// ── HELMET — Military / Knight ───────────────────────────────────────────────
// Great-helm silhouette: domed crown, vertical nasal, eye-slit, base band.
function MarkHelmet() {
  return (
    <>
      {/* Crown + cheek profile */}
      <path d="M5,14 Q5,6 12,6 Q19,6 19,14 L19,17 L5,17Z" />
      {/* Vertical nasal / face division */}
      <line x1="12" y1="6" x2="12" y2="17" />
      {/* Eye-slit band */}
      <line x1="5" y1="11" x2="19" y2="11" />
      {/* Base band (gorget) */}
      <line x1="5" y1="17" x2="19" y2="17" />
    </>
  );
}

// ── HORSE — Cavalry / Mounted ────────────────────────────────────────────────
// Knight-chess style horse head in profile, facing left.
function MarkHorse() {
  return (
    <>
      <path d="M6,21 L18,21 L18,18 Q18,14 16,12 Q15,10 16,8 Q15,6 13,5 Q12,3 11,4 L9,6 Q8,7 7,9 Q5,10 5,13 L7,14 L8,12 L9,13 Q9,15 8,17 L6,18Z" />
      {/* Eye */}
      <circle cx="9.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
    </>
  );
}

// ── TOWER — Watchtower / Keep ────────────────────────────────────────────────
// Single crenellated tower with arched doorway and arrow-slits.
function MarkTower() {
  return (
    <>
      {/* Tower body with battlement notches along the top edge */}
      <path d="M6,21 L6,9 L8,9 L8,7 L10,7 L10,9 L14,9 L14,7 L16,7 L16,9 L18,9 L18,21Z" />
      {/* Base line */}
      <line x1="6" y1="21" x2="18" y2="21" />
      {/* Arched doorway */}
      <path d="M11,21 L11,16 Q12,14.5 13,16 L13,21" />
      {/* Arrow-slits */}
      <line x1="11" y1="12" x2="11" y2="14" />
      <line x1="13" y1="12" x2="13" y2="14" />
    </>
  );
}

// ── BRIDGE — Crossing / Infrastructure ───────────────────────────────────────
// Triple-arch span over a deck line.
function MarkBridge() {
  return (
    <>
      {/* Three arches */}
      <path d="M2,16 Q6,11 10,16" />
      <path d="M10,16 Q14,11 18,16" />
      <path d="M14,16 Q18,11 22,16" />
      {/* Deck */}
      <line x1="2" y1="12" x2="22" y2="12" />
      {/* Parapet line */}
      <path d="M2,10 L22,10" />
    </>
  );
}

// ── MOUNTAIN — Terrain / Pass ────────────────────────────────────────────────
// Twin-peak range with snow ticks.
function MarkMountain() {
  return (
    <>
      {/* Range silhouette */}
      <path d="M2,20 L8,9 L12,14 L16,6 L22,20Z" />
      {/* Snow / facet ticks */}
      <line x1="8" y1="9" x2="10" y2="11" />
      <line x1="16" y1="6" x2="14" y2="9" />
    </>
  );
}

// ── TREE — Forest / Woodland ─────────────────────────────────────────────────
// Stylised conifer with a trunk.
function MarkTree() {
  return (
    <>
      {/* Layered crown */}
      <path d="M12,3 L17,9 L14,9 L18,14 L14,14 L19,19 L5,19 L10,14 L6,14 L10,9 L7,9Z" />
      {/* Trunk */}
      <path d="M11,19 L11,22 L13,22 L13,19" />
    </>
  );
}

// ── EAGLE — Empire / Heraldry ────────────────────────────────────────────────
// Displayed eagle: head, body, two spread wings, tail.
function MarkEagle() {
  return (
    <>
      {/* Head */}
      <circle cx="12" cy="6" r="1.8" />
      {/* Beak */}
      <line x1="13.5" y1="5.5" x2="16" y2="5" />
      {/* Body */}
      <line x1="12" y1="7.8" x2="12" y2="18" />
      {/* Left wing */}
      <path d="M12,9 Q4,7 2,12 Q5,10 8,11 Q5,13 6,16 Q9,12 12,12" />
      {/* Right wing */}
      <path d="M12,9 Q20,7 22,12 Q19,10 16,11 Q19,13 18,16 Q15,12 12,12" />
      {/* Tail */}
      <path d="M10,18 L12,22 L14,18" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </>
  );
}

// ── FLEUR — Marriage / Dynasty (fleur-de-lis) ────────────────────────────────
// Central petal, two side scrolls, base band and foot.
function MarkFleur() {
  return (
    <>
      {/* Central stem + petal */}
      <line x1="12" y1="3" x2="12" y2="18" />
      <path d="M12,4 Q9,8 12,12 Q15,8 12,4Z" />
      {/* Side scrolls */}
      <path d="M12,10 Q6,8 5,13 Q8,12 10,14" />
      <path d="M12,10 Q18,8 19,13 Q16,12 14,14" />
      {/* Cross band + foot */}
      <line x1="7" y1="14" x2="17" y2="14" />
      <path d="M9,14 L9,18 L15,18 L15,14" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </>
  );
}

// ── ARROW — Movement / Direction ─────────────────────────────────────────────
// Horizontal shaft with an arrowhead, pointing right.
function MarkArrow() {
  return (
    <>
      <line x1="3" y1="12" x2="19" y2="12" />
      <path d="M14,6 L20,12 L14,18" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL SUBTYPE MARKS (Wave2 — covers subtypes in SUBTYPE_TO_CATEGORY that
// previously fell back to the category default. These give finer reading on the
// map for high-frequency event types. All follow the 24×24 / currentColor contract.)
// ─────────────────────────────────────────────────────────────────────────────

// ── DAGGER — Assassination ────────────────────────────────────────────────────
// A stiletto / rondel dagger: long blade tapering to a point, cross-guard, pommel.
// Rotated ~45° (blade NE→SW) to distinguish from the upright blade/sword.
function MarkDagger() {
  return (
    <>
      {/* Blade — long taper, NE tip to SW base */}
      <path d="M17,4 L8,13" />
      {/* Blade tip cap */}
      <circle cx="17.5" cy="3.5" r="0.7" fill="currentColor" stroke="none" />
      {/* Cross-guard — perpendicular to blade */}
      <line x1="9.5" y1="10" x2="5.5" y2="14" />
      {/* Grip */}
      <line x1="8" y1="13" x2="6" y2="15" />
      {/* Pommel */}
      <circle cx="5.2" cy="15.8" r="1.3" />
      {/* Blood drop — small circle away from the blade */}
      <circle cx="15" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  );
}

// ── TORCH — Rebellion / Revolt ────────────────────────────────────────────────
// Upright torch: handle, head, and three-tongue flame on top.
// Clearly distinct from the category "flame" (which is a teardrop candle flame).
function MarkTorch() {
  return (
    <>
      {/* Handle — wrapped grip */}
      <line x1="12" y1="21" x2="12" y2="14" />
      {/* Grip wraps */}
      <line x1="10.5" y1="17" x2="13.5" y2="17" />
      <line x1="10.5" y1="19" x2="13.5" y2="19" />
      {/* Torch head / basket */}
      <path d="M9,14 L15,14 L14,11 L10,11 Z" />
      {/* Main flame tongue */}
      <path d="M12,11 Q10,8 12,5 Q14,8 12,11Z" />
      {/* Left tongue */}
      <path d="M10,11 Q8,9 9,7 Q11,9 10,11Z" />
      {/* Right tongue */}
      <path d="M14,11 Q16,9 15,7 Q13,9 14,11Z" />
    </>
  );
}

// ── CRACK — Earthquake ────────────────────────────────────────────────────────
// A zigzag ground fissure: the classic seismic-hazard symbol, bold and readable
// at small sizes. Follows the 24×24 grid, no fill.
function MarkCrack() {
  return (
    <>
      {/* Ground line */}
      <line x1="2" y1="14" x2="22" y2="14" />
      {/* Left fissure segment going below ground */}
      <path d="M6,14 L9,18 L7,20 L11,22" />
      {/* Right fissure segment */}
      <path d="M18,14 L15,18 L17,20 L13,22" />
      {/* Tremor rays above the line */}
      <line x1="8" y1="14" x2="6" y2="10" />
      <line x1="12" y1="14" x2="12" y2="8" />
      <line x1="16" y1="14" x2="18" y2="10" />
      {/* Epicentre dot */}
      <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </>
  );
}

// ── CLOUD — Climate / Weather ─────────────────────────────────────────────────
// A cumulus cloud silhouette with three rain/snow lines below.
// Reads as "weather event" or "climate" without confusion with other marks.
function MarkCloud() {
  return (
    <>
      {/* Cloud body — three overlapping circles + a base line */}
      <path d="M5,14 Q5,10 8,10 Q8,7 12,7 Q16,7 16,10 Q19,10 19,14Z" />
      {/* Precipitation lines */}
      <line x1="8" y1="16" x2="7" y2="19" />
      <line x1="12" y1="16" x2="12" y2="20" />
      <line x1="16" y1="16" x2="17" y2="19" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LITERAL ICON SET (Wave3 — per markers/README.md spec)
//
// Representational glyphs replacing abstract category defaults. Geometry is
// ported verbatim from markers/marker-kit.js GLYPHS table (24×24 grid).
// Stroke / linecap / linejoin from the <Glyph> wrapper (MARK_ATTRS) as usual.
// ─────────────────────────────────────────────────────────────────────────────

// ── SWORDS — Violence (replaces blade) ───────────────────────────────────────
// Two crossed swords: solid filled blades + crossguards + pommels.
function MarkSwords() {
  return (
    <>
      {/* NW→SE blade */}
      <path d="M9.58,15.98 L8.02,14.42 L17.30,6.14 L19.70,4.30 L17.86,6.70 Z"
        fill="currentColor" stroke="none" />
      <line x1="6.8" y1="15.0" x2="9.2" y2="17.4" />
      <line x1="8.0" y1="16.2" x2="6.4" y2="17.8" />
      <circle cx="5.9" cy="18.3" r="1.2" fill="currentColor" stroke="none" />
      {/* NE→SW blade */}
      <path d="M14.42,15.98 L15.98,14.42 L6.70,6.14 L4.30,4.30 L6.14,6.70 Z"
        fill="currentColor" stroke="none" />
      <line x1="17.2" y1="15.0" x2="14.8" y2="17.4" />
      <line x1="16.0" y1="16.2" x2="17.6" y2="17.8" />
      <circle cx="18.1" cy="18.3" r="1.2" fill="currentColor" stroke="none" />
    </>
  );
}

// ── CROWN — Power (replaces orb) ─────────────────────────────────────────────
// Five-point crown: solid filled silhouette with a horizontal band.
function MarkCrown() {
  return (
    <>
      <path d="M4.5,18 L4.5,7.5 L8.5,11.5 L12,5.5 L15.5,11.5 L19.5,7.5 L19.5,18 Z"
        fill="currentColor" stroke="none" />
      <line x1="5" y1="15" x2="19" y2="15"
        stroke="var(--surface,#fff)" strokeWidth={1.3} />
      <circle cx="12" cy="5.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </>
  );
}

// ── DOVE — Diplomacy (replaces balance) ──────────────────────────────────────
// Flying dove: vector-traced silhouette from icons8 reference, filled.
function MarkDove() {
  return (
    <path
      fillRule="evenodd"
      d="M6.01,2.50 L6.84,2.50 L6.84,3.74 L8.08,6.63 L12.41,10.55 L14.27,7.87
         L16.13,6.42 L17.58,6.63 L19.64,9.93 L19.43,10.55 L17.16,10.76 L17.58,11.17
         L17.58,14.07 L15.30,16.75 L12.62,17.78 L12.62,19.85 L9.93,21.29 L6.63,21.29
         L4.77,19.85 L8.08,15.72 L6.01,13.65 L5.60,12.00 L3.95,9.93 L3.95,7.87
         L4.77,6.22 L4.36,4.15 L5.80,2.71Z
         M11.38,2.91 L13.03,2.91 L13.45,7.87 L12.62,9.11 L12.00,9.32
         L9.32,6.63 L11.17,3.12Z"
      fill="currentColor" stroke="none"
    />
  );
}

// ── PRAY — Religion (replaces flame) ─────────────────────────────────────────
// Praying hands: two mirrored hands pressed together, filled silhouette.
function MarkPray() {
  return (
    <path
      fillRule="evenodd"
      d="M10.07,2.00 L10.95,1.82 L11.47,2.70 L11.12,7.26 L9.02,8.32 L7.96,13.23
         L9.02,11.82 L9.72,8.67 L10.60,8.49 L11.12,9.02 L11.47,9.72 L11.12,17.79
         L7.44,21.82 L3.75,17.79 L6.21,16.04 L7.26,9.02 L10.07,2.35Z
         M12.53,2.00 L13.58,2.00 L16.39,9.02 L17.44,16.04 L19.89,17.79
         L16.21,21.82 L12.53,17.79 L12.18,16.74 L12.53,9.02 L13.05,8.49
         L13.93,8.67 L14.63,11.82 L15.68,13.23 L14.63,8.32 L12.53,7.26
         L12.18,5.16 L12.53,2.35Z"
      fill="currentColor" stroke="none"
    />
  );
}

// ── PEOPLE — Culture (replaces star/hexagram) ─────────────────────────────────
// Two figures side-by-side: filled heads + bodies, overlap masked.
function MarkPeople() {
  return (
    <>
      <circle cx="8.4" cy="8.4" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="8.4" r="2.5" fill="currentColor" stroke="none" />
      <path d="M3.4,19 C3.4,15.4 5.6,13.1 8.4,13.1 C11.2,13.1 13.4,15.4 13.4,19 Z"
        fill="currentColor" stroke="none" />
      <path d="M10.6,19 C10.6,15.4 12.8,13.1 15.6,13.1 C18.4,13.1 20.6,15.4 20.6,19 Z"
        fill="currentColor" stroke="none" />
      {/* Overlap seam in surface color */}
      <path d="M11.2,18.6 C11.2,15.6 12.4,13.8 13.9,13.3"
        stroke="var(--surface,#fff)" strokeWidth={1.1} fill="none" />
    </>
  );
}

// ── MAGNIFIER — Discovery (replaces eye) ─────────────────────────────────────
// Magnifying glass: circle lens + thick handle at 45°.
function MarkMagnifier() {
  return (
    <>
      <circle cx="10" cy="10" r="6" />
      <line x1="14.4" y1="14.4" x2="20" y2="20" strokeWidth={2.4} strokeLinecap="round" />
    </>
  );
}

// ── DOLLAR — Economy (replaces coin) ─────────────────────────────────────────
// Dollar sign: vertical stroke through an S-curve.
function MarkDollar() {
  return (
    <>
      <line x1="12" y1="4.4" x2="12" y2="19.6" />
      <path d="M16,8 C16,6.1 14.1,5.3 12,5.3 C9.4,5.3 7.7,6.6 7.7,8.5
               C7.7,12.3 16.3,10.8 16.3,14.9 C16.3,17 14.2,18.7 12,18.7
               C9.5,18.7 7.6,17.5 7.5,15.4" />
    </>
  );
}

// ── COLUMN — Capital (ionic column with volute scrolls) ──────────────────────
// Architectural column: filled silhouette, vector-traced.
function MarkColumn() {
  return (
    <path
      fillRule="evenodd"
      d="M4.64,2.50 L18.65,2.26 L20.31,3.92 L20.79,6.30 L19.13,7.96 L17.23,7.96
         L16.51,7.25 L17.46,6.30 L16.75,5.11 L15.09,6.30 L15.09,7.72 L17.46,9.63
         L17.46,21.02 L15.32,21.26 L14.61,20.55 L14.37,8.91 L13.19,9.15 L13.19,20.55
         L10.34,18.65 L10.10,8.91 L8.91,9.15 L8.91,17.70 L7.72,17.94 L6.06,17.23
         L6.06,9.63 L8.44,7.72 L8.44,6.30 L6.77,5.11 L6.06,6.30 L7.01,7.25
         L6.30,7.96 L4.40,7.96 L2.74,6.30 L2.74,4.40 L4.40,2.74Z"
      fill="currentColor" stroke="none"
    />
  );
}

// ── HOUSE — Military fort ─────────────────────────────────────────────────────
// Simple house: roof, walls, central door. Stroked outline.
function MarkHouse() {
  return (
    <>
      <path d="M3.5,11.5 L12,4.8 L20.5,11.5" />
      <path d="M5.8,10.7 L5.8,20 L18.2,20 L18.2,10.7" />
      <path d="M10.1,20 L10.1,14.3 L13.9,14.3 L13.9,20" />
    </>
  );
}

// ── CASTLE — Military castle ──────────────────────────────────────────────────
// Two-tower castle: filled silhouette with a gate arch in surface color.
function MarkCastle() {
  return (
    <>
      <path
        d="M3,20 L3,8 L5,8 L5,6 L7,6 L7,8 L9,8 L9,11 L11,11 L11,9.5 L13,9.5
           L13,11 L15,11 L15,8 L17,8 L17,6 L19,6 L19,8 L21,8 L21,20 Z"
        fill="currentColor" stroke="none"
      />
      <path d="M10,20 L10,15.2 Q12,13 14,15.2 L14,20 Z"
        fill="var(--surface,#fff)" stroke="none" />
    </>
  );
}

// ── BROKEN_HEART — Rebellion / Revolt ────────────────────────────────────────
// Filled heart with a jagged break line in surface color.
function MarkBrokenHeart() {
  return (
    <>
      <path
        d="M12,20 C12,20 4,14.4 4,9.1 C4,6.3 6.1,4.4 8.5,4.4
           C10.1,4.4 11.4,5.3 12,6.6 C12.6,5.3 13.9,4.4 15.5,4.4
           C17.9,4.4 20,6.3 20,9.1 C20,14.4 12,20 12,20 Z"
        fill="currentColor" stroke="none"
      />
      <path
        d="M12,6.2 L10.2,9.6 L12.9,11.9 L10.5,15.1 L11.7,17.8"
        stroke="var(--surface,#fff)" strokeWidth={1.8} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  );
}

// ── NINJA — Assassination (replaces dagger) ───────────────────────────────────
// Masked face: filled circle with a visor cutout + two eyes showing.
function MarkNinja() {
  return (
    <>
      <path
        d="M4.5,12 C4.5,6.8 7.8,3.5 12,3.5 C16.2,3.5 19.5,6.8 19.5,12
           C19.5,17.2 16.2,20.5 12,20.5 C7.8,20.5 4.5,17.2 4.5,12 Z"
        fill="currentColor" stroke="none"
      />
      {/* Visor slit in surface color */}
      <path
        d="M4.7,10.3 C4.7,10.3 7.2,9.1 12,9.1 C16.8,9.1 19.3,10.3 19.3,10.3
           C19.3,10.3 17,13.6 12,13.6 C7,13.6 4.7,10.3 4.7,10.3 Z"
        fill="var(--surface,#fff)" stroke="none"
      />
      <circle cx="9.5" cy="11.3" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11.3" r="1.15" fill="currentColor" stroke="none" />
    </>
  );
}

// ── GALLEON — Raid / Naval (replaces stroked MarkShip) ───────────────────────
// Full galleon silhouette: vector-traced from icons8 reference, filled.
function MarkGalleon() {
  return (
    <path
      fillRule="evenodd"
      d="M10.90,2.50 L12.73,2.13 L13.46,2.87 L14.92,2.87 L16.38,3.60 L16.75,3.96
         L16.38,4.33 L14.19,4.33 L13.46,3.60 L12.00,3.60 L11.63,4.69 L16.38,5.06
         L17.48,6.15 L17.48,7.62 L18.21,8.35 L18.21,12.00 L17.48,13.46 L16.38,14.56
         L12.00,14.56 L11.63,15.65 L16.38,16.02 L19.31,13.10 L21.13,13.46 L19.67,14.19
         L19.67,15.65 L21.13,17.12 L21.13,19.31 L18.58,21.13 L3.96,21.13 L3.23,20.40
         L2.13,19.31 L2.13,16.38 L3.23,15.29 L4.69,16.02 L10.90,15.65 L10.54,14.56
         L5.06,14.19 L6.52,11.27 L6.52,6.15 L5.79,5.42 L10.54,5.06 L10.90,3.23Z"
      fill="currentColor" stroke="none"
    />
  );
}

// ── RING FALLBACK ─────────────────────────────────────────────────────────────
// Any unknown glyph name renders this visible ring. Never blank.
export function MarkRing() {
  return <circle cx="12" cy="12" r="8" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/** Map of glyph name → render function for all drawn-for-real marks. */
export const MARK_REGISTRY: Record<string, () => React.ReactElement> = {
  // 9 category defaults — Wave3 literal icon set (matching EVENT_CATEGORIES[n].glyph in tokens.ts)
  swords:         () => <MarkSwords />,   // violence
  dove:           () => <MarkDove />,     // diplomacy
  crown:          () => <MarkCrown />,    // power
  pray:           () => <MarkPray />,     // religion
  people:         () => <MarkPeople />,   // culture
  magnifier:      () => <MarkMagnifier />, // discovery
  dollar:         () => <MarkDollar />,   // economy
  bolt:           () => <MarkBolt />,     // hazard (kept — universal hazard mark)
  pillars:        () => <MarkPillars />,  // institution

  // Wave3 container glyphs
  column:         () => <MarkColumn />,   // capital marker
  house:          () => <MarkHouse />,    // military fort
  castle:         () => <MarkCastle />,   // military castle
  broken_heart:   () => <MarkBrokenHeart />, // rebellion / revolt
  ninja:          () => <MarkNinja />,    // assassination
  galleon:        () => <MarkGalleon />,  // raid / naval (canonical name)

  // Legacy abstract category marks — kept in registry for backwards compat
  // (old baked event data may still reference these; they resolve cleanly)
  blade:          () => <MarkBlade />,
  balance:        () => <MarkBalance />,
  orb:            () => <MarkOrb />,
  flame:          () => <MarkFlame />,
  star:           () => <MarkStar />,
  eye:            () => <MarkEye />,
  coin:           () => <MarkCoin />,

  // Subtype glyphs (matching SUBTYPE_GLYPHS in tokens.ts + medieval.json subtypeGlyphs)
  shield:         () => <MarkShield />,
  ship:           () => <MarkGalleon />,  // alias → galleon (baked data uses "ship")
  scroll:         () => <MarkScroll />,
  bell:           () => <MarkBell />,
  fortress:       () => <MarkFortress />,
  church:         () => <MarkChurch />,
  mosque:         () => <MarkMosque />,
  crescent:       () => <MarkCrescent />,
  patriarchal:    () => <MarkPatriarchal />,
  book:           () => <MarkBook />,
  caravan:        () => <MarkCaravan />,
  wheat:          () => <MarkWheat />,
  skull:          () => <MarkSkull />,
  rings:          () => <MarkRings />,

  // Wave2 subtype marks
  dagger:         () => <MarkDagger />,
  torch:          () => <MarkTorch />,
  crack:          () => <MarkCrack />,
  cloud:          () => <MarkCloud />,

  // Furniture — map decoration marks
  dot:            () => <MarkDot />,
  compass:        () => <MarkCompass />,
  'compass-rose': () => <MarkCompass />,

  // Ported (Wave1-B) — furniture / terrain / heraldic marks
  helmet:         () => <MarkHelmet />,
  horse:          () => <MarkHorse />,
  tower:          () => <MarkTower />,
  bridge:         () => <MarkBridge />,
  mountain:       () => <MarkMountain />,
  tree:           () => <MarkTree />,
  eagle:          () => <MarkEagle />,
  fleur:          () => <MarkFleur />,
  arrow:          () => <MarkArrow />,

  // Fallback ring — also directly addressable by name
  ring:           () => <MarkRing />,
};

/**
 * All glyph names that have real drawn geometry (excluding the fallback "ring").
 * The events-layer builder can iterate this to validate its glyph mapping.
 */
export const GLYPH_NAMES: ReadonlySet<string> = new Set(
  Object.keys(MARK_REGISTRY).filter((k) => k !== 'ring'),
);

/**
 * Returns true if `name` has a genuinely drawn mark (not the ring fallback).
 * Use this to validate event glyph assignments at runtime.
 */
export function hasGlyph(name: string): boolean {
  return GLYPH_NAMES.has(name);
}

/**
 * Resolves a glyph name to the name that will actually render.
 * Unknown names resolve to `"ring"` so callers can be transparent about
 * what is being shown.
 */
export function resolveGlyph(name: string): string {
  return hasGlyph(name) ? name : 'ring';
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBTYPE → GLYPH RESOLVER
//
// Maps every event subtype in the medieval dataset to the glyph name that
// should be shown on the map stud. This is the static compile-time version of
// `vocab.ts → glyphFor()` (which reads the same data from medieval.json at
// runtime). Having both lets consumers pick: use the static map for
// rendering logic that runs before the data layer loads, or use glyphFor()
// when the vocab bundle is available.
//
// Resolution order (mirrors vocab.ts → glyphFor):
//   1. Subtype-specific override  (e.g. siege → shield)
//   2. Category default glyph     (e.g. violence → blade)
//   3. Visible ring fallback       (never blank)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static subtype → glyph name map covering all 33 subtypes in the medieval
 * vocab. Every entry resolves to a name present in MARK_REGISTRY (or "ring"
 * for the explicit ring fallback — but ring is also in MARK_REGISTRY, so
 * nothing renders blank).
 *
 * Subtype-specific overrides take priority; unrecognised subtypes (e.g. future
 * dataset additions) fall back to "ring" at runtime via `resolveSubtypeGlyph`.
 */
export const SUBTYPE_GLYPH_MAP: Readonly<Record<string, string>> = {
  // ── Violence subtypes ────────────────────────────────────────────────────
  battle:               'swords',       // category default (Wave3 literal)
  war:                  'swords',       // category default
  military:             'swords',       // category default
  conflict:             'swords',       // category default
  conquest:             'swords',       // category default
  rebellion:            'broken_heart', // Wave3 literal mark
  revolt:               'broken_heart', // alias → rebellion mark
  crusade:              'swords',       // swords reads "holy war"
  siege:                'flame',        // per README spec (siege → flame)
  assassination:        'ninja',        // Wave3 literal mark

  // ── Diplomacy subtypes ───────────────────────────────────────────────────
  treaty:               'scroll',      // subtype override
  treaty_fragmentation: 'scroll',      // scroll = treaty broken/fragmented
  marriage:             'rings',       // subtype override

  // ── Power subtypes ───────────────────────────────────────────────────────
  coronation:           'crown',       // Wave3 literal (crown = coronation)
  succession_crisis:    'crown',       // crown = power transfer in progress
  election:             'crown',       // crown = power selection
  political:            'crown',       // category default
  dissolution_event:    'crown',       // power dissolves = same mark

  // ── Religion subtypes ────────────────────────────────────────────────────
  religious:            'pray',        // Wave3 literal (pray = religion)
  religious_council:    'church',      // alias council → church
  council:              'church',      // subtype override

  // ── Culture subtypes ─────────────────────────────────────────────────────
  cultural:             'people',      // Wave3 literal (people = culture)

  // ── Discovery subtypes ───────────────────────────────────────────────────
  exploration:          'magnifier',   // Wave3 literal (magnifier = discovery)
  expansion_milestone:  'magnifier',   // milestone in expansion arc

  // ── Economy subtypes ─────────────────────────────────────────────────────
  economic:             'dollar',      // Wave3 literal (dollar = economy)
  trade:                'caravan',     // subtype override (in vocab subtypeGlyphs)

  // ── Hazard subtypes ───────────────────────────────────────────────────────
  disaster:             'bolt',        // category default
  epidemic:             'skull',       // skull = death/plague
  plague:               'skull',       // subtype override
  famine:               'wheat',       // subtype override
  fire:                 'flame',       // subtype override
  earthquake:           'crack',       // Wave2 drawn mark
  climate:              'cloud',       // Wave2 drawn mark
} as const;

/**
 * Resolve an event subtype string to the glyph name that will render on the
 * map stud. Falls back to `"ring"` for any subtype not in the static map —
 * ensuring nothing ever renders blank even for future dataset additions.
 *
 * For runtime use alongside vocab bundle data, prefer `glyphFor()` from
 * `src/data/vocab.ts` which reads the live dataset's `subtypeGlyphs` table.
 * Use this function when the vocab layer is not yet available (e.g. during
 * layer-spec initialisation or in tests).
 *
 * @example
 *   const glyphName = resolveSubtypeGlyph('siege');   // → "shield"
 *   const glyphName = resolveSubtypeGlyph('unknown'); // → "ring"
 */
export function resolveSubtypeGlyph(subtype: string): string {
  return resolveGlyph(SUBTYPE_GLYPH_MAP[subtype] ?? 'ring');
}
