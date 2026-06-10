# InvaderGIS — Marker System

Production marker artwork for the **four** map data layers. Geometry is ported
from `src/design/glyphMarks.tsx`; colors are the locked tokens from
`src/design/tokens.ts`.

Open **`Marker Sheet.html`** to review every marker; the **Tweaks** panel
switches glyph-style variations (stroke weight / line-ends / shadow) live.

## Four silhouettes — one per layer

| Layer        | Silhouette | Anchor        | Color / encoding                       |
|--------------|-----------|---------------|----------------------------------------|
| Events       | teardrop **pin** | bottom point | category token (9 colors) + subtype glyph |
| Settlements  | **disc**  | center        | warm grey `#7a6a5a`; tier = size + ring |
| Capitals     | **diamond** | center      | amber-gold `#b8860b` + **column** glyph |
| Military     | **shield** | center       | battle `#6e3030` swords · fort/castle `#9c1c1c` (house / castle) |

Settlement tiers: **town** = solid dot · **city** = dot + ring · **megacity** =
bullseye (ring + white core), graduated by radius.

## Files

```
markers/
  marker-kit.js          ← builder. buildMarkerSVG(layer, spec, opts) + buildSettlementSVG(tier,…)
  Marker Sheet.html      ← review sheet + glyph-style tweaks
  svg/
    markers/             ← 34 composed, color-baked, drop-in markers
      evt-<category>.svg     (9 category pins)
      evt-<subtype>.svg      (subtype overrides — inherit category color)
      set-town|city|megacity.svg
      cap-capital.svg
      mil-battle|fort|castle.svg
    glyphs/              ← 24 in-use glyph atoms, 24×24, stroke="currentColor"
    manifest.json        ← every file → {layer, shape, glyph, color, …}
```

## Glyph choices (literal icon set)

| Slot | Glyph | | Slot | Glyph |
|------|-------|-|------|-------|
| Violence / battle | crossed **swords** | | siege | **flame** (fire) |
| Diplomacy | **dove** ¹ | | rebellion / revolt | **broken heart** |
| Power | **crown** | | assassination | **ninja** |
| Religion | **praying hands** ¹ | | raid / naval | **ship** (galleon) ¹ |
| Culture | **two people** | | treaty | scroll · marriage | rings |
| Discovery | **magnifier** | | council | church · founding | fortress |
| Economy | **$ dollar** | | plague | skull · famine | wheat |
| Capital | **column** ¹ | | fort | **house** · castle | **castle** |
| Hazard | bolt · Institution | columns | | earthquake | crack · climate | cloud |

¹ **dove, praying hands, ship, column** are vector-traced from the supplied
icons8 reference PNGs (exact silhouette match), filled silhouettes rather than
stroked.

## New marks to add to the codebase

These icons are **new** (not in `glyphMarks.tsx`). Geometry lives in
`marker-kit.js` and each `svg/glyphs/<name>.svg`:

- `swords` (violence/battle), `dove` (diplomacy), `crown` (power),
  `pray` (religion), `people` (culture), `magnifier` (discovery),
  `dollar` (economy), `column` (capital), `house` (fort), `castle` (castle),
  `broken_heart` (rebellion), `ninja` (assassination), and a galleon `ship`.

Then update `tokens.ts` category glyphs + subtype map accordingly
(`violence:'swords'`, `diplomacy:'dove'`, `power:'crown'`, `religion:'pray'`,
`culture:'people'`, `discovery:'magnifier'`, `economy:'dollar'`; `siege:'flame'`,
`rebellion:'broken_heart'`, `assassination:'ninja'`; capital glyph `column`).
The hexagram `star` (Star of David) is **removed** from use.

Note: `revolt` mirrors `rebellion`, `epidemic` mirrors `plague`, `naval` mirrors
`raid` — same glyph, separate files for convenience.

## Glyph atoms vs. composed markers

- **`svg/glyphs/*.svg`** — bare 24×24 marks on `currentColor` / 1.6px stroke /
  round caps; names match `MARK_REGISTRY`. Theme-able from your CSS token tree.
- **`svg/markers/*.svg`** — full markers with container shape + white glyph +
  token color + white rim + soft shadow baked in. Pins reproduce the Google-pin
  geometry from `eventIcons.ts` (`icon-anchor:'bottom'`).

## Regenerating

`marker-kit.js` is the single source (also `window.MarkerKit` in the browser). To
export a different glyph-style variation (e.g. **bold** stroke), pick it in the
sheet and ask — I'll re-export to match.
