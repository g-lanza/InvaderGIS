# Marker System — Naming Reference

Proper names for every silhouette, glyph atom, and composed marker.

## Container silhouettes (one per layer)

| Shape key | Proper name | Layer |
|-----------|-------------|-------|
| `pin`     | Teardrop pin (Google-pin) | Events |
| `disc`    | Graduated disc | Settlements |
| `diamond` | Rounded rhombus / diamond | Capitals |
| `shield`  | Heater shield | Military |

## Glyph atoms (`svg/glyphs/*.svg`)

| File / key | Proper name |
|------------|-------------|
| `swords`        | Crossed Swords |
| `dove`          | Dove |
| `crown`         | Crown |
| `pray`          | Praying Hands |
| `people`        | Two Figures |
| `magnifier`     | Magnifying Glass |
| `dollar`        | Dollar Sign |
| `bolt`          | Lightning Bolt |
| `pillars`       | Colonnade (twin pillars + lintel) |
| `flame`         | Flame |
| `broken_heart`  | Broken Heart |
| `ninja`         | Masked Ninja |
| `ship`          | Galleon |
| `scroll`        | Scroll |
| `rings`         | Wedding Rings |
| `church`        | Church |
| `fortress`      | Crenellated Tower |
| `house`         | House |
| `castle`        | Castle |
| `column`        | Ionic Column |
| `skull`         | Skull |
| `wheat`         | Wheat Sheaf |
| `crack`         | Ground Fissure |
| `cloud`         | Cloud |
| `ring`          | Ring (unknown / fallback) |

## Composed markers (`svg/markers/*.svg`)

### Events — teardrop pins (category color)

| File | Proper name | Glyph |
|------|-------------|-------|
| `evt-violence`    | Violence    | Crossed Swords |
| `evt-diplomacy`   | Diplomacy   | Dove |
| `evt-power`       | Power       | Crown |
| `evt-religion`    | Religion    | Praying Hands |
| `evt-culture`     | Culture     | Two Figures |
| `evt-discovery`   | Discovery   | Magnifying Glass |
| `evt-economy`     | Economy     | Dollar Sign |
| `evt-hazard`      | Hazard      | Lightning Bolt |
| `evt-institution` | Institution | Colonnade |

### Events — subtype override pins (inherit category color)

| File | Proper name | Glyph |
|------|-------------|-------|
| `evt-siege`                | Siege | Flame |
| `evt-rebellion`            | Rebellion | Broken Heart |
| `evt-revolt`               | Revolt | Broken Heart |
| `evt-assassination`        | Assassination | Masked Ninja |
| `evt-raid`                 | Raid | Galleon |
| `evt-naval`                | Naval | Galleon |
| `evt-treaty`               | Treaty | Scroll |
| `evt-treaty_fragmentation` | Treaty Fragmentation | Scroll |
| `evt-marriage`             | Marriage | Wedding Rings |
| `evt-council`              | Council | Church |
| `evt-religious_council`    | Religious Council | Church |
| `evt-founding`             | Founding | Crenellated Tower |
| `evt-plague`               | Plague | Skull |
| `evt-epidemic`             | Epidemic | Skull |
| `evt-famine`               | Famine | Wheat Sheaf |
| `evt-fire`                 | Fire | Flame |
| `evt-earthquake`           | Earthquake | Ground Fissure |
| `evt-climate`              | Climate | Cloud |

### Settlements — graduated discs (warm grey `#7a6a5a`)

| File | Proper name | Mark |
|------|-------------|------|
| `set-town`     | Town     | Solid dot |
| `set-city`     | City     | Dot + ring |
| `set-megacity` | Megacity | Bullseye (ring + core) |

### Capitals — amber diamond

| File | Proper name | Glyph |
|------|-------------|-------|
| `cap-capital` | Capital | Ionic Column |

### Military — dark-red shields

| File | Proper name | Glyph |
|------|-------------|-------|
| `mil-battle` | Battle | Crossed Swords |
| `mil-fort`   | Fort   | House |
| `mil-castle` | Castle | Castle |
