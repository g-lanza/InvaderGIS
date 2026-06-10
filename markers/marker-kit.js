/* ============================================================================
 * marker-kit.js — InvaderGIS marker builder (no dependencies, runs in browser
 * AND in the file-generator sandbox).
 *
 * Ports the 39 stroked marks from src/design/glyphMarks.tsx onto a 24×24 /
 * currentColor / round-cap contract, and composes them into four distinct
 * section container silhouettes:
 *
 *   events       → teardrop PIN   (point anchor; category color flood)
 *   settlements  → DISC           (warm grey; size = importance tier)
 *   capitals     → DIAMOND        (amber-gold rounded rhombus; power glyph)
 *   military     → SHIELD         (dark-red heater shield)
 *   furniture    → STUD           (neutral disc; map decoration marks)
 *
 * The glyph mark is always drawn in white on the colored body. Stroke weight
 * and line-cap are the tunable "glyph style" axis (see buildMarkerSVG opts).
 *
 * Exposed as window.MarkerKit (browser) and globalThis.MarkerKit (sandbox).
 * ==========================================================================*/
(function (root) {
  'use strict';

  // ── Token colors (verbatim from src/design/tokens.ts) ─────────────────────
  var CATEGORY = {
    violence:    { color: '#9c1c1c', glyph: 'swords',    label: 'Violence'    },
    diplomacy:   { color: '#2e8b57', glyph: 'dove',      label: 'Diplomacy'   },
    power:       { color: '#b8860b', glyph: 'crown',     label: 'Power'       },
    religion:    { color: '#5a3d8a', glyph: 'pray',      label: 'Religion'    },
    culture:     { color: '#2a7575', glyph: 'people',    label: 'Culture'     },
    discovery:   { color: '#3b6a8c', glyph: 'magnifier', label: 'Discovery'   },
    economy:     { color: '#a3592a', glyph: 'dollar',    label: 'Economy'     },
    hazard:      { color: '#6e3030', glyph: 'bolt',      label: 'Hazard'      },
    institution: { color: '#4a4a52', glyph: 'pillars',   label: 'Institution' },
  };

  // ── Computed star paths (mirrors MarkStar / crescent star in source) ──────
  function starPath(cx, cy, R, r, n, rotDeg) {
    var pts = [], i, a;
    for (i = 0; i < n; i++) {
      a = ((i * (360 / n)) + rotDeg) * Math.PI / 180;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      a = ((i * (360 / n)) + (360 / n / 2) + rotDeg) * Math.PI / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts.map(function (p, k) {
      return (k === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2);
    }).join(' ') + 'Z';
  }
  var STAR5 = starPath(12, 12, 9, 4.0, 5, -90);
  var CRESC_STAR = starPath(16.4, 13, 2.3, 1.0, 5, -90);

  // ── Glyph geometry: name → inner SVG markup (24×24 grid) ──────────────────
  // Stroke / fill / width / caps come from the wrapping <g> (MARK_ATTRS),
  // EXCEPT elements that explicitly set fill="currentColor" stroke="none".
  var GLYPHS = {
    blade:
      '<line x1="6" y1="6" x2="18" y2="18"/>' +
      '<line x1="18" y1="6" x2="6" y2="18"/>' +
      '<line x1="9.5" y1="14.5" x2="14.5" y2="9.5"/>' +
      '<line x1="9.5" y1="9.5" x2="14.5" y2="14.5"/>' +
      '<circle cx="6.5" cy="17.5" r="1.1" fill="currentColor" stroke="none"/>' +
      '<circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/>',
    balance:
      '<line x1="12" y1="6" x2="12" y2="19"/>' +
      '<line x1="9" y1="19" x2="15" y2="19"/>' +
      '<line x1="5" y1="9" x2="19" y2="9"/>' +
      '<line x1="5" y1="9" x2="5" y2="14"/>' +
      '<line x1="19" y1="9" x2="19" y2="14"/>' +
      '<path d="M3,14 Q5,17 7,14"/>' +
      '<path d="M17,14 Q19,17 21,14"/>' +
      '<circle cx="12" cy="6" r="1" fill="currentColor" stroke="none"/>',
    orb:
      '<circle cx="12" cy="13" r="7"/>' +
      '<path d="M5,13 Q12,15.5 19,13"/>' +
      '<line x1="12" y1="6" x2="12" y2="20"/>' +
      '<line x1="12" y1="3" x2="12" y2="6"/>' +
      '<line x1="10" y1="4.5" x2="14" y2="4.5"/>',
    flame:
      '<path d="M12,4 C16,8 18,12 18,15 C18,18.3 15.3,20.5 12,20.5 C8.7,20.5 6,18.3 6,15 C6,12 8,8 12,4Z"/>' +
      '<path d="M12,8 C14,11 14.5,13 14,15 C13.5,16.8 13,17.5 12,17.5"/>',
    star: '<path d="' + STAR5 + '"/>',
    // Solid square — Military fort / castle (■, per data spec).
    square:
      '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none"/>',
    // ── Literal icon set (representational, per review) ──────────────────────
    // Crossed swords — Violence / battle.
    swords:
      '<path d="M9.58,15.98 L8.02,14.42 L17.30,6.14 L19.70,4.30 L17.86,6.70 Z" fill="currentColor" stroke="none"/>' +
      '<line x1="6.8" y1="15.0" x2="9.2" y2="17.4"/>' +
      '<line x1="8.0" y1="16.2" x2="6.4" y2="17.8"/>' +
      '<circle cx="5.9" cy="18.3" r="1.2" fill="currentColor" stroke="none"/>' +
      '<path d="M14.42,15.98 L15.98,14.42 L6.70,6.14 L4.30,4.30 L6.14,6.70 Z" fill="currentColor" stroke="none"/>' +
      '<line x1="17.2" y1="15.0" x2="14.8" y2="17.4"/>' +
      '<line x1="16.0" y1="16.2" x2="17.6" y2="17.8"/>' +
      '<circle cx="18.1" cy="18.3" r="1.2" fill="currentColor" stroke="none"/>',
    // Crown — Power.
    crown:
      '<path d="M4.5,18 L4.5,7.5 L8.5,11.5 L12,5.5 L15.5,11.5 L19.5,7.5 L19.5,18 Z" fill="currentColor" stroke="none"/>' +
      '<line x1="5" y1="15" x2="19" y2="15" stroke="var(--surface,#fff)" stroke-width="1.3"/>' +
      '<circle cx="12" cy="5.5" r="1.15" fill="currentColor" stroke="none"/>' +
      '<circle cx="4.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="19.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>',
    // Two people — Culture.
    people:
      '<circle cx="8.4" cy="8.4" r="2.5" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.6" cy="8.4" r="2.5" fill="currentColor" stroke="none"/>' +
      '<path d="M3.4,19 C3.4,15.4 5.6,13.1 8.4,13.1 C11.2,13.1 13.4,15.4 13.4,19 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M10.6,19 C10.6,15.4 12.8,13.1 15.6,13.1 C18.4,13.1 20.6,15.4 20.6,19 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M11.2,18.6 C11.2,15.6 12.4,13.8 13.9,13.3" stroke="var(--surface,#fff)" stroke-width="1.1" fill="none"/>',
    // Dollar — Economy.
    dollar:
      '<line x1="12" y1="4.4" x2="12" y2="19.6"/>' +
      '<path d="M16,8 C16,6.1 14.1,5.3 12,5.3 C9.4,5.3 7.7,6.6 7.7,8.5 C7.7,12.3 16.3,10.8 16.3,14.9 C16.3,17 14.2,18.7 12,18.7 C9.5,18.7 7.6,17.5 7.5,15.4"/>',
    // Tripod telescope — Discovery / exploration.
    telescope:
      '<path d="M7.3,15.8 L15.8,4.8 L18.6,6.8 L10.1,17.8 Z"/>' +
      '<line x1="15" y1="4" x2="17.8" y2="6"/>' +
      '<line x1="12.6" y1="12.4" x2="9" y2="20"/>' +
      '<line x1="12.6" y1="12.4" x2="16.2" y2="20"/>' +
      '<line x1="12.6" y1="12.4" x2="12.2" y2="20"/>' +
      '<circle cx="12.6" cy="12.4" r="0.95" fill="currentColor" stroke="none"/>',
    // House — Military fort.
    house:
      '<path d="M3.5,11.5 L12,4.8 L20.5,11.5"/>' +
      '<path d="M5.8,10.7 L5.8,20 L18.2,20 L18.2,10.7"/>' +
      '<path d="M10.1,20 L10.1,14.3 L13.9,14.3 L13.9,20"/>',
    // Castle — Military castle (two towers + gate).
    castle:
      '<path d="M3,20 L3,8 L5,8 L5,6 L7,6 L7,8 L9,8 L9,11 L11,11 L11,9.5 L13,9.5 L13,11 L15,11 L15,8 L17,8 L17,6 L19,6 L19,8 L21,8 L21,20 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M10,20 L10,15.2 Q12,13 14,15.2 L14,20 Z" fill="var(--surface,#fff)" stroke="none"/>',
    // Broken heart — Rebellion / revolt.
    broken_heart:
      '<path d="M12,20 C12,20 4,14.4 4,9.1 C4,6.3 6.1,4.4 8.5,4.4 C10.1,4.4 11.4,5.3 12,6.6 C12.6,5.3 13.9,4.4 15.5,4.4 C17.9,4.4 20,6.3 20,9.1 C20,14.4 12,20 12,20 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M12,6.2 L10.2,9.6 L12.9,11.9 L10.5,15.1 L11.7,17.8" stroke="var(--surface,#fff)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    // Dove — Diplomacy (flying, raised wing, forked tail).
    dove:
      '<path fill-rule="evenodd" d="M6.01,2.50 L6.84,2.50 L6.84,3.74 L8.08,6.63 L12.41,10.55 L14.27,7.87 L16.13,6.42 L17.58,6.63 L19.64,9.93 L19.43,10.55 L17.16,10.76 L17.58,11.17 L17.58,14.07 L15.30,16.75 L12.62,17.78 L12.62,19.85 L9.93,21.29 L6.63,21.29 L4.77,19.85 L8.08,15.72 L6.01,13.65 L5.60,12.00 L3.95,9.93 L3.95,7.87 L4.77,6.22 L4.36,4.15 L5.80,2.71ZM11.38,2.91 L13.03,2.91 L13.45,7.87 L12.62,9.11 L12.00,9.32 L9.32,6.63 L11.17,3.12Z" fill="currentColor" stroke="none"/>',
    // Magnifying glass — Discovery.
    magnifier:
      '<circle cx="10" cy="10" r="6"/>' +
      '<line x1="14.4" y1="14.4" x2="20" y2="20" stroke-width="2.4" stroke-linecap="round"/>',
    // Praying hands — Religion.
    pray:
      '<path fill-rule="evenodd" d="M10.07,2.00 L10.95,1.82 L11.47,2.70 L11.12,7.26 L9.02,8.32 L7.96,13.23 L9.02,11.82 L9.72,8.67 L10.60,8.49 L11.12,9.02 L11.47,9.72 L11.12,17.79 L7.44,21.82 L3.75,17.79 L6.21,16.04 L7.26,9.02 L10.07,2.35ZM12.53,2.00 L13.58,2.00 L16.39,9.02 L17.44,16.04 L19.89,17.79 L16.21,21.82 L12.53,17.79 L12.18,16.74 L12.53,9.02 L13.05,8.49 L13.93,8.67 L14.63,11.82 L15.68,13.23 L14.63,8.32 L12.53,7.26 L12.18,5.16 L12.53,2.35Z" fill="currentColor" stroke="none"/>',
    // Classical column — Capital (architectural "capital" w/ volute scrolls).
    column:
      '<path fill-rule="evenodd" d="M4.64,2.50 L18.65,2.26 L20.31,3.92 L20.79,6.30 L19.13,7.96 L17.23,7.96 L16.51,7.25 L17.46,6.30 L16.75,5.11 L15.09,6.30 L15.09,7.72 L17.46,9.63 L17.46,21.02 L15.32,21.26 L14.61,20.55 L14.37,8.91 L13.19,9.15 L13.19,20.55 L10.34,18.65 L10.10,8.91 L8.91,9.15 L8.91,17.70 L7.72,17.94 L6.06,17.23 L6.06,9.63 L8.44,7.72 L8.44,6.30 L6.77,5.11 L6.06,6.30 L7.01,7.25 L6.30,7.96 L4.40,7.96 L2.74,6.30 L2.74,4.40 L4.40,2.74Z" fill="currentColor" stroke="none"/>',
    // Masked ninja — Assassination.
    ninja:
      '<path d="M4.5,12 C4.5,6.8 7.8,3.5 12,3.5 C16.2,3.5 19.5,6.8 19.5,12 C19.5,17.2 16.2,20.5 12,20.5 C7.8,20.5 4.5,17.2 4.5,12 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M4.7,10.3 C4.7,10.3 7.2,9.1 12,9.1 C16.8,9.1 19.3,10.3 19.3,10.3 C19.3,10.3 17,13.6 12,13.6 C7,13.6 4.7,10.3 4.7,10.3 Z" fill="var(--surface,#fff)" stroke="none"/>' +
      '<circle cx="9.5" cy="11.3" r="1.15" fill="currentColor" stroke="none"/>' +
      '<circle cx="14.5" cy="11.3" r="1.15" fill="currentColor" stroke="none"/>',
    // Lyre — Culture (replaces the hexagram; arts/culture, non-religious).
    lyre:
      '<path d="M9.2,19.4 Q12,21.4 14.8,19.4 Q15,16.7 12,16.1 Q9,16.7 9.2,19.4Z"/>' +
      '<path d="M9.6,16.8 C7,14.3 6.2,10.5 7.9,7.4"/>' +
      '<path d="M14.4,16.8 C17,14.3 17.8,10.5 16.1,7.4"/>' +
      '<line x1="6.7" y1="7.6" x2="17.3" y2="7.6"/>' +
      '<line x1="10" y1="8.2" x2="10.3" y2="15.9"/>' +
      '<line x1="12" y1="8" x2="12" y2="15.8"/>' +
      '<line x1="14" y1="8.2" x2="13.7" y2="15.9"/>',
    eye:
      '<path d="M3,12 Q12,4 21,12 Q12,20 3,12Z"/>' +
      '<circle cx="12" cy="12" r="3.5"/>' +
      '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    coin:
      '<circle cx="12" cy="12" r="8.5"/>' +
      '<line x1="5.5" y1="12" x2="18.5" y2="12"/>' +
      '<line x1="12" y1="5.5" x2="12" y2="18.5"/>' +
      '<circle cx="12" cy="12" r="5.5"/>',
    bolt:
      '<path d="M14,3 L8,13 L12.5,11.5 L10,21 L16,11 L11.5,12.5 Z" fill="currentColor" stroke="none"/>',
    pillars:
      '<rect x="4" y="5" width="16" height="2" fill="currentColor" stroke="none"/>' +
      '<rect x="6.5" y="7" width="3" height="11"/>' +
      '<rect x="14.5" y="7" width="3" height="11"/>' +
      '<rect x="4" y="18" width="16" height="2" fill="currentColor" stroke="none"/>' +
      '<rect x="5.5" y="5.5" width="5" height="1.5" fill="currentColor" stroke="none"/>' +
      '<rect x="13.5" y="5.5" width="5" height="1.5" fill="currentColor" stroke="none"/>',
    shield:
      '<path d="M12,3 L20,6 L20,13 Q20,19 12,21 Q4,19 4,13 L4,6 Z"/>',
    ship:
      '<path fill-rule="evenodd" d="M10.90,2.50 L12.73,2.13 L13.46,2.87 L14.92,2.87 L16.38,3.60 L16.75,3.96 L16.38,4.33 L14.19,4.33 L13.46,3.60 L12.00,3.60 L11.63,4.69 L16.38,5.06 L17.48,6.15 L17.48,7.62 L18.21,8.35 L18.21,12.00 L17.48,13.46 L16.38,14.56 L12.00,14.56 L11.63,15.65 L16.38,16.02 L19.31,13.10 L21.13,13.46 L19.67,14.19 L19.67,15.65 L21.13,17.12 L21.13,19.31 L18.58,21.13 L3.96,21.13 L3.23,20.40 L2.13,19.31 L2.13,16.38 L3.23,15.29 L4.69,16.02 L10.90,15.65 L10.54,14.56 L5.06,14.19 L6.52,11.27 L6.52,6.15 L5.79,5.42 L10.54,5.06 L10.90,3.23Z" fill="currentColor" stroke="none"/>',
    scroll:
      '<rect x="6" y="7" width="12" height="10"/>' +
      '<path d="M6,7 Q6,4 9,4 Q12,4 12,7"/>' +
      '<path d="M18,7 Q18,4 15,4 Q12,4 12,7"/>' +
      '<path d="M6,17 Q6,20 9,20 Q12,20 12,17"/>' +
      '<path d="M18,17 Q18,20 15,20 Q12,20 12,17"/>' +
      '<line x1="8.5" y1="10" x2="15.5" y2="10"/>' +
      '<line x1="8.5" y1="12" x2="15.5" y2="12"/>' +
      '<line x1="8.5" y1="14" x2="13" y2="14"/>',
    bell:
      '<path d="M10.5,5 Q10.5,3.5 12,3.5 Q13.5,3.5 13.5,5"/>' +
      '<path d="M5,17 Q5,8 12,7 Q19,8 19,17Z"/>' +
      '<path d="M4.5,17 Q12,19 19.5,17"/>' +
      '<line x1="12" y1="17" x2="12" y2="20"/>' +
      '<circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none"/>',
    fortress:
      '<rect x="5" y="10" width="14" height="11"/>' +
      '<rect x="5" y="5" width="3.5" height="5"/>' +
      '<rect x="10.25" y="5" width="3.5" height="5"/>' +
      '<rect x="15.5" y="5" width="3.5" height="5"/>' +
      '<path d="M10,21 L10,16 Q12,14 14,16 L14,21"/>',
    church:
      '<rect x="5" y="13" width="14" height="8"/>' +
      '<path d="M5,13 L12,5 L19,13Z"/>' +
      '<line x1="12" y1="3" x2="12" y2="6.5"/>' +
      '<line x1="10.2" y1="4.5" x2="13.8" y2="4.5"/>' +
      '<path d="M10,21 L10,17 Q12,15.5 14,17 L14,21"/>',
    mosque:
      '<path d="M5,14 Q5,6 12,6 Q19,6 19,14Z"/>' +
      '<rect x="5" y="14" width="14" height="6"/>' +
      '<rect x="18" y="8" width="2.5" height="12"/>' +
      '<path d="M18,8 L19.25,5.5 L20.5,8"/>' +
      '<path d="M9,20 L9,16 Q12,13.5 15,16 L15,20"/>' +
      '<path d="M11,8.5 Q13,7 14,9 Q12.5,8 11,8.5Z" fill="currentColor" stroke="none"/>',
    crescent:
      '<path d="M12,3 A9,9 0 1 1 12,21 A7,7 0 1 0 12,3Z" fill="currentColor" stroke="none"/>' +
      '<path d="' + CRESC_STAR + '" fill="currentColor" stroke="none"/>',
    patriarchal:
      '<line x1="12" y1="3" x2="12" y2="21"/>' +
      '<line x1="8" y1="7" x2="16" y2="7"/>' +
      '<line x1="5" y1="12" x2="19" y2="12"/>' +
      '<line x1="8" y1="17" x2="16" y2="19"/>',
    book:
      '<path d="M12,6 Q8,5 4,7 L4,19 Q8,17.5 12,18Z"/>' +
      '<path d="M12,6 Q16,5 20,7 L20,19 Q16,17.5 12,18Z"/>' +
      '<line x1="12" y1="6" x2="12" y2="18"/>' +
      '<line x1="6" y1="10" x2="11" y2="9.5"/>' +
      '<line x1="6" y1="12.5" x2="11" y2="12"/>' +
      '<line x1="6" y1="15" x2="11" y2="14.5"/>' +
      '<line x1="13" y1="9.5" x2="18" y2="10"/>' +
      '<line x1="13" y1="12" x2="18" y2="12.5"/>' +
      '<line x1="13" y1="14.5" x2="18" y2="15"/>',
    caravan:
      '<line x1="2" y1="17" x2="22" y2="17"/>' +
      '<path d="M15,17 Q15,14 17,14 Q17,12 16,11 Q18,11 18,14 Q20,14 20,17"/>' +
      '<path d="M8,17 Q8,14 10,14 Q10,12 9,11 Q11,11 11,14 Q13,14 13,17"/>' +
      '<path d="M2,17 Q2,14 4,14 Q4,12.5 3.5,11.5 Q5,11.5 5,14 Q7,14 7,17"/>' +
      '<circle cx="17.5" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
    wheat:
      '<line x1="12" y1="20" x2="12" y2="7"/>' +
      '<line x1="8" y1="20" x2="10" y2="9"/>' +
      '<line x1="16" y1="20" x2="14" y2="9"/>' +
      '<path d="M12,7 Q10,5.5 11,4 Q12,5 12,7Z"/>' +
      '<path d="M12,7 Q14,5.5 13,4 Q12,5 12,7Z"/>' +
      '<path d="M10,9 Q8,7.5 9,6 Q10,7 10,9Z"/>' +
      '<path d="M10,9 Q12,7.5 11,6 Q10,7 10,9Z"/>' +
      '<path d="M14,9 Q12,7.5 13,6 Q14,7 14,9Z"/>' +
      '<path d="M14,9 Q16,7.5 15,6 Q14,7 14,9Z"/>' +
      '<path d="M9,18 Q12,19.5 15,18"/>',
    skull:
      '<path d="M12,3 A6,6 0 0 1 18,9 L18,13 L6,13 L6,9 A6,6 0 0 1 12,3Z"/>' +
      '<circle cx="9.5" cy="9" r="1.8" fill="currentColor" stroke="none"/>' +
      '<circle cx="14.5" cy="9" r="1.8" fill="currentColor" stroke="none"/>' +
      '<path d="M11,11 L12,12.5 L13,11"/>' +
      '<line x1="9" y1="13" x2="9" y2="15"/>' +
      '<line x1="12" y1="13" x2="12" y2="15"/>' +
      '<line x1="15" y1="13" x2="15" y2="15"/>' +
      '<line x1="7.5" y1="13" x2="7" y2="15"/>' +
      '<line x1="16.5" y1="13" x2="17" y2="15"/>' +
      '<line x1="5" y1="17" x2="19" y2="22"/>' +
      '<line x1="19" y1="17" x2="5" y2="22"/>',
    rings:
      '<circle cx="9.5" cy="12" r="5.5"/>' +
      '<circle cx="14.5" cy="12" r="5.5"/>' +
      '<path d="M14.5,6.5 A5.5,5.5 0 0 0 9,12 A5.5,5.5 0 0 0 14.5,17.5" stroke="var(--surface,#fff)" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="14.5" cy="12" r="5.5"/>',
    dot:
      '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    compass:
      '<path d="M12,2 L10,10 L12,9 L14,10 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M12,22 L10,14 L12,15 L14,14 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M22,12 L14,10 L15,12 L14,14 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M2,12 L10,10 L9,12 L10,14 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M19.3,4.7 L14.5,10.5 L16,11.5 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M4.7,4.7 L9.5,10.5 L8,11.5 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M19.3,19.3 L14.5,13.5 L16,12.5 Z" fill="currentColor" stroke="none"/>' +
      '<path d="M4.7,19.3 L9.5,13.5 L8,12.5 Z" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="2" fill="var(--surface,#fff)" stroke="currentColor" stroke-width="1.2"/>',
    helmet:
      '<path d="M5,14 Q5,6 12,6 Q19,6 19,14 L19,17 L5,17Z"/>' +
      '<line x1="12" y1="6" x2="12" y2="17"/>' +
      '<line x1="5" y1="11" x2="19" y2="11"/>' +
      '<line x1="5" y1="17" x2="19" y2="17"/>',
    horse:
      '<path d="M6,21 L18,21 L18,18 Q18,14 16,12 Q15,10 16,8 Q15,6 13,5 Q12,3 11,4 L9,6 Q8,7 7,9 Q5,10 5,13 L7,14 L8,12 L9,13 Q9,15 8,17 L6,18Z"/>' +
      '<circle cx="9.5" cy="9" r="0.8" fill="currentColor" stroke="none"/>',
    tower:
      '<path d="M6,21 L6,9 L8,9 L8,7 L10,7 L10,9 L14,9 L14,7 L16,7 L16,9 L18,9 L18,21Z"/>' +
      '<line x1="6" y1="21" x2="18" y2="21"/>' +
      '<path d="M11,21 L11,16 Q12,14.5 13,16 L13,21"/>' +
      '<line x1="11" y1="12" x2="11" y2="14"/>' +
      '<line x1="13" y1="12" x2="13" y2="14"/>',
    bridge:
      '<path d="M2,16 Q6,11 10,16"/>' +
      '<path d="M10,16 Q14,11 18,16"/>' +
      '<path d="M14,16 Q18,11 22,16"/>' +
      '<line x1="2" y1="12" x2="22" y2="12"/>' +
      '<path d="M2,10 L22,10"/>',
    mountain:
      '<path d="M2,20 L8,9 L12,14 L16,6 L22,20Z"/>' +
      '<line x1="8" y1="9" x2="10" y2="11"/>' +
      '<line x1="16" y1="6" x2="14" y2="9"/>',
    tree:
      '<path d="M12,3 L17,9 L14,9 L18,14 L14,14 L19,19 L5,19 L10,14 L6,14 L10,9 L7,9Z"/>' +
      '<path d="M11,19 L11,22 L13,22 L13,19"/>',
    eagle:
      '<circle cx="12" cy="6" r="1.8"/>' +
      '<line x1="13.5" y1="5.5" x2="16" y2="5"/>' +
      '<line x1="12" y1="7.8" x2="12" y2="18"/>' +
      '<path d="M12,9 Q4,7 2,12 Q5,10 8,11 Q5,13 6,16 Q9,12 12,12"/>' +
      '<path d="M12,9 Q20,7 22,12 Q19,10 16,11 Q19,13 18,16 Q15,12 12,12"/>' +
      '<path d="M10,18 L12,22 L14,18"/>' +
      '<line x1="10" y1="18" x2="14" y2="18"/>',
    fleur:
      '<line x1="12" y1="3" x2="12" y2="18"/>' +
      '<path d="M12,4 Q9,8 12,12 Q15,8 12,4Z"/>' +
      '<path d="M12,10 Q6,8 5,13 Q8,12 10,14"/>' +
      '<path d="M12,10 Q18,8 19,13 Q16,12 14,14"/>' +
      '<line x1="7" y1="14" x2="17" y2="14"/>' +
      '<path d="M9,14 L9,18 L15,18 L15,14"/>' +
      '<line x1="9" y1="18" x2="15" y2="18"/>',
    arrow:
      '<line x1="3" y1="12" x2="19" y2="12"/>' +
      '<path d="M14,6 L20,12 L14,18"/>',
    dagger:
      '<path d="M17,4 L8,13"/>' +
      '<circle cx="17.5" cy="3.5" r="0.7" fill="currentColor" stroke="none"/>' +
      '<line x1="9.5" y1="10" x2="5.5" y2="14"/>' +
      '<line x1="8" y1="13" x2="6" y2="15"/>' +
      '<circle cx="5.2" cy="15.8" r="1.3"/>' +
      '<circle cx="15" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
    torch:
      '<line x1="12" y1="21" x2="12" y2="14"/>' +
      '<line x1="10.5" y1="17" x2="13.5" y2="17"/>' +
      '<line x1="10.5" y1="19" x2="13.5" y2="19"/>' +
      '<path d="M9,14 L15,14 L14,11 L10,11 Z"/>' +
      '<path d="M12,11 Q10,8 12,5 Q14,8 12,11Z"/>' +
      '<path d="M10,11 Q8,9 9,7 Q11,9 10,11Z"/>' +
      '<path d="M14,11 Q16,9 15,7 Q13,9 14,11Z"/>',
    crack:
      '<line x1="2" y1="14" x2="22" y2="14"/>' +
      '<path d="M6,14 L9,18 L7,20 L11,22"/>' +
      '<path d="M18,14 L15,18 L17,20 L13,22"/>' +
      '<line x1="8" y1="14" x2="6" y2="10"/>' +
      '<line x1="12" y1="14" x2="12" y2="8"/>' +
      '<line x1="16" y1="14" x2="18" y2="10"/>' +
      '<circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none"/>',
    cloud:
      '<path d="M5,14 Q5,10 8,10 Q8,7 12,7 Q16,7 16,10 Q19,10 19,14Z"/>' +
      '<line x1="8" y1="16" x2="7" y2="19"/>' +
      '<line x1="12" y1="16" x2="12" y2="20"/>' +
      '<line x1="16" y1="16" x2="17" y2="19"/>',
    ring:
      '<circle cx="12" cy="12" r="8"/>',
  };

  // ── Container silhouettes ─────────────────────────────────────────────────
  // Each returns { vb, body(color), gx, gy, gsize }  where (gx,gy) is the glyph
  // center and gsize the glyph box edge (24-grid scaled to gsize).
  function darken(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, ((n >> 16) & 255) - Math.round(255 * amt));
    var g = Math.max(0, ((n >> 8) & 255) - Math.round(255 * amt));
    var b = Math.max(0, (n & 255) - Math.round(255 * amt));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  var CONTAINERS = {
    // Teardrop pin — point at bottom-center is the geographic anchor.
    pin: function (color) {
      var rim = darken(color, 0.18);
      var d = 'M20,52 L30.47,32.40 A17,17 0 1 0 9.53,32.40 L20,52 Z';
      var body =
        '<path d="' + d + '" ' +
        'fill="' + color + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="' + d + '" ' +
        'fill="none" stroke="' + rim + '" stroke-width="0.6" stroke-opacity="0.55" stroke-linejoin="round"/>';
      return { vb: '0 0 40 53', body: body, gx: 20, gy: 19, gsize: 26 };
    },
    // Plain disc — settlements. Tier encoded by overall scale at call site.
    disc: function (color) {
      var rim = darken(color, 0.2);
      var body =
        '<circle cx="20" cy="20" r="16" fill="' + color + '" stroke="#ffffff" stroke-width="1.6"/>' +
        '<circle cx="20" cy="20" r="16" fill="none" stroke="' + rim + '" stroke-width="0.6" stroke-opacity="0.5"/>';
      return { vb: '0 0 40 40', body: body, gx: 20, gy: 20, gsize: 23 };
    },
    // Rounded diamond — capitals (seat of power). Rotated square w/ rounded tips.
    diamond: function (color) {
      var rim = darken(color, 0.2);
      var body =
        '<rect x="9.27" y="9.27" width="25.46" height="25.46" rx="5" ' +
        'transform="rotate(45 22 22)" fill="' + color + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>' +
        '<rect x="9.27" y="9.27" width="25.46" height="25.46" rx="5" ' +
        'transform="rotate(45 22 22)" fill="none" stroke="' + rim + '" stroke-width="0.6" stroke-opacity="0.5"/>';
      return { vb: '0 0 44 44', body: body, gx: 22, gy: 22, gsize: 19 };
    },
    // Heater shield — military sites.
    shield: function (color) {
      var rim = darken(color, 0.18);
      var d = 'M20,3 L34,8 L34,22 Q34,35 20,42 Q6,35 6,22 L6,8 Z';
      var body =
        '<path d="' + d + '" fill="' + color + '" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="' + d + '" fill="none" stroke="' + rim + '" stroke-width="0.6" stroke-opacity="0.55" stroke-linejoin="round"/>';
      return { vb: '0 0 40 46', body: body, gx: 20, gy: 19.5, gsize: 22 };
    },
    // Neutral stud — furniture / terrain decoration marks.
    stud: function (color) {
      var body =
        '<circle cx="20" cy="20" r="15.5" fill="' + color + '" stroke="#ffffff" stroke-width="1.4"/>';
      return { vb: '0 0 40 40', body: body, gx: 20, gy: 20, gsize: 22 };
    },
  };

  // ── Glyph group (white mark, tunable weight + cap) ────────────────────────
  function glyphGroup(name, opts) {
    var inner = GLYPHS[name] || GLYPHS.ring;
    var c = (opts && opts.container) || '#000';
    var w = (opts && opts.weight) != null ? opts.weight : 1.7;
    var cap = (opts && opts.cap) || 'round';
    return (
      '<g fill="none" stroke="#ffffff" stroke-width="' + w + '" ' +
      'stroke-linecap="' + cap + '" stroke-linejoin="' + cap + '" ' +
      'color="#ffffff" style="--surface:' + c + '">' + inner + '</g>'
    );
  }

  // ── Compose a marker SVG ──────────────────────────────────────────────────
  // section: 'events'|'settlements'|'capitals'|'military'|'furniture'
  // spec: { glyph, color, shape, scale }  (shape inferred from section)
  var SECTION_SHAPE = {
    events: 'pin', settlements: 'disc', capitals: 'diamond',
    military: 'shield', furniture: 'stud',
  };

  function buildMarkerSVG(section, spec, opts) {
    opts = opts || {};
    var shapeName = spec.shape || SECTION_SHAPE[section] || 'stud';
    var color = spec.color || '#4a4a52';
    var c = CONTAINERS[shapeName](color);
    var glyphMarkup = spec.glyph
      ? '<g transform="translate(' + (c.gx - c.gsize / 2) + ',' + (c.gy - c.gsize / 2) +
        ') scale(' + (c.gsize / 24) + ')">' +
        glyphGroup(spec.glyph, { container: color, weight: opts.weight, cap: opts.cap }) +
        '</g>'
      : '';
    var defs =
      '<defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feDropShadow dx="0" dy="0.6" stdDeviation="0.7" flood-color="#000" flood-opacity="0.28"/>' +
      '</filter></defs>';
    var shadowWrap = opts.shadow === false ? c.body : '<g filter="url(#sh)">' + c.body + '</g>';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + c.vb + '" width="' + c.vb.split(' ')[2] +
      '" height="' + c.vb.split(' ')[3] + '">' + defs + shadowWrap + glyphMarkup + '</svg>'
    );
  }

  // ── Settlement graduated symbol (tiers read as importance) ────────────────
  // town  → small solid dot · city → dot + inner ring · megacity → bullseye
  function buildSettlementSVG(tier, color, opts) {
    opts = opts || {};
    color = color || '#7a6a5a';
    var rim = darken(color, 0.22);
    function disc(r, sw) {
      return '<circle cx="15" cy="15" r="' + r + '" fill="' + color +
        '" stroke="#ffffff" stroke-width="' + sw + '"/>' +
        '<circle cx="15" cy="15" r="' + r + '" fill="none" stroke="' + rim +
        '" stroke-width="0.6" stroke-opacity="0.5"/>';
    }
    var parts;
    if (tier === 'town') {
      parts = disc(5, 1.4);
    } else if (tier === 'city') {
      parts = disc(7.2, 1.5) +
        '<circle cx="15" cy="15" r="3.1" fill="none" stroke="#ffffff" stroke-width="1.3"/>';
    } else { // megacity
      parts = disc(9.6, 1.7) +
        '<circle cx="15" cy="15" r="5.4" fill="none" stroke="#ffffff" stroke-width="1.4"/>' +
        '<circle cx="15" cy="15" r="2" fill="#ffffff" stroke="none"/>';
    }
    var defs =
      '<defs><filter id="sh" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="0.6" stdDeviation="0.7" flood-color="#000" flood-opacity="0.28"/>' +
      '</filter></defs>';
    var wrap = opts.shadow === false ? parts : '<g filter="url(#sh)">' + parts + '</g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="30" height="30">' +
      defs + wrap + '</svg>';
  }

  // ── Line layer data (mirrors journeysLayer.ts + relationshipsLayer.ts) ──────

  var JOURNEY_KINDS = [
    { key: 'individual_journey', label: 'Individual Journey', color: '#7a4ec2', dash: null,       cap: 'round', note: 'solid · curated default' },
    { key: 'spread',             label: 'Spread',             color: '#c2912a', dash: [0.1, 4],   cap: 'round', note: 'dotted [0.1, 4]' },
    { key: 'migration',          label: 'Migration',          color: '#4d7d3a', dash: [8, 5],     cap: 'butt',  note: 'dashed [8, 5]' },
    { key: 'conquest',           label: 'Conquest',           color: '#9c1c1c', dash: null,       cap: 'round', note: 'solid · hidden by default (zigzag)' },
  ];

  var RELATIONSHIP_DASH_BUCKETS = [
    { label: 'Solid',     dash: null,          cap: 'round', desc: 'formal bond',       types: ['alliance','vassalage','marriage','dynastic_union','personal_union'] },
    { label: 'Dashed',    dash: [8, 5],        cap: 'butt',  desc: 'flow / directed',   types: ['tributary','trade','religious_jurisdiction'] },
    { label: 'Dotted',    dash: [0.1, 4],      cap: 'round', desc: 'soft / cultural',   types: ['religious','cultural_exchange'] },
    { label: 'Tense',     dash: [5, 5],        cap: 'butt',  desc: 'antagonistic',      types: ['rivalry','contested_influence'] },
    { label: 'Dash-dot',  dash: [10,4,1.5,4],  cap: 'butt',  desc: 'succession / temporal', types: ['successor','predecessor','succession','fragmentation'] },
  ];

  var RELATIONSHIP_TYPES_MAP = {
    alliance: '#2e8b57', rivalry: '#9c1c1c', vassalage: '#5a3d8a',
    tributary: '#9b7a3a', trade: '#a3592a', marriage: '#a07a9b',
    successor: '#3b6a8c', religious: '#7a5c1e', predecessor: '#3b6a8c',
    succession: '#3b6a8c', dynastic_union: '#a07a9b', personal_union: '#a07a9b',
    cultural_exchange: '#7a5c1e', religious_jurisdiction: '#7a5c1e',
    contested_influence: '#9c1c1c', fragmentation: '#5e4214',
  };

  // Which dash bucket each relationship type belongs to.
  var RELATIONSHIP_TYPE_BUCKET = (function() {
    var out = {};
    RELATIONSHIP_DASH_BUCKETS.forEach(function(b) {
      b.types.forEach(function(t) { out[t] = b.label; });
    });
    return out;
  }());

  var DIRECTED_RELATIONSHIP_TYPES = [
    'vassalage','tributary','successor','predecessor','succession',
    'religious_jurisdiction','fragmentation',
  ];

  var TRADE_STYLE = { label: 'Trade Route', color: '#a3592a', dash: [4, 3], cap: 'round', opacity: 0.78 };

  // ── Line preview builders ─────────────────────────────────────────────────────

  /**
   * Build a simple SVG line preview.
   * dash: array of numbers in MapLibre line-width units (multiplied by strokeWidth for px).
   */
  function buildLinePreviewSVG(color, dash, cap, opts) {
    opts = opts || {};
    var w = opts.width || 180;
    var h = opts.height || 28;
    var y = h / 2;
    var sw = opts.strokeWidth || 2.5;
    var opacity = opts.opacity != null ? opts.opacity : 1;
    var dashAttr = dash
      ? 'stroke-dasharray="' + dash.map(function(d) { return (d * sw).toFixed(1); }).join(' ') + '"'
      : '';
    var capAttr = 'stroke-linecap="' + (cap || 'round') + '"';
    var line = '<line x1="10" y1="' + y + '" x2="' + (w - 10) + '" y2="' + y + '" ' +
      'stroke="' + color + '" stroke-width="' + sw + '" ' + dashAttr + ' ' + capAttr +
      ' opacity="' + opacity + '"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
      '" width="' + w + '" height="' + h + '">' + line + '</svg>';
  }

  /**
   * Replace currentColor in an endpoint SVG string with a real hex.
   */
  function buildEndpointPreviewSVG(markup, color) {
    return markup.replace(/currentColor/g, color);
  }

  root.MarkerKit = {
    GLYPHS: GLYPHS, CATEGORY: CATEGORY, CONTAINERS: CONTAINERS,
    SECTION_SHAPE: SECTION_SHAPE, glyphGroup: glyphGroup,
    buildMarkerSVG: buildMarkerSVG, buildSettlementSVG: buildSettlementSVG,
    darken: darken, glyphNames: Object.keys(GLYPHS),
    // Line layer data
    JOURNEY_KINDS: JOURNEY_KINDS,
    RELATIONSHIP_DASH_BUCKETS: RELATIONSHIP_DASH_BUCKETS,
    RELATIONSHIP_TYPES_MAP: RELATIONSHIP_TYPES_MAP,
    RELATIONSHIP_TYPE_BUCKET: RELATIONSHIP_TYPE_BUCKET,
    DIRECTED_RELATIONSHIP_TYPES: DIRECTED_RELATIONSHIP_TYPES,
    TRADE_STYLE: TRADE_STYLE,
    // Line preview builders
    buildLinePreviewSVG: buildLinePreviewSVG,
    buildEndpointPreviewSVG: buildEndpointPreviewSVG,
  };
})(typeof window !== 'undefined' ? window : globalThis);
