/**
 * design/tokens.ts — DOMAIN TOKENS (single source of truth).
 *
 * Reconciled against donor schema on 2026-05-27.
 * Alias decisions:
 *   - donor `disaster` category  → contract `hazard`   (same hazard/bolt glyph)
 *   - donor `political` category → contract `power`    (power/orb glyph; political events
 *     are power-transfer events in the contract vocabulary)
 * Both mappings are documented in SUBTYPE_TO_CATEGORY below.
 *
 * Colors here encode DATA MEANING (event category, region, relationship type,
 * journey kind) and are constant across UI themes — they are read by the map,
 * the charts, and the legend so all three agree. The CSS theme tree
 * (atlas-tokens.css) handles chrome surfaces/ink only.
 *
 * Values are lifted verbatim from the Atlas Redesign Spec Sheet (artboard 30)
 * and Component Sheet (artboard 07), reconciled against the live donor files
 * (src/data/regionColors.ts, src/charts/eventColors.ts,
 * src/charts/relationshipColors.ts). Do not invent new ones; extend deliberately.
 */

/** The nine event categories. `code` is the mono legend letter; `glyph` is the default mark. */
export const EVENT_CATEGORIES = [
  { id: 'violence',    code: 'V', label: 'Violence',    color: '#9c1c1c', glyph: 'swords'    },
  { id: 'diplomacy',   code: 'D', label: 'Diplomacy',   color: '#2e8b57', glyph: 'dove'      },
  { id: 'power',       code: 'P', label: 'Power',       color: '#b8860b', glyph: 'crown'     },
  { id: 'religion',    code: 'R', label: 'Religion',    color: '#5a3d8a', glyph: 'pray'      },
  { id: 'culture',     code: 'C', label: 'Culture',     color: '#2a7575', glyph: 'people'    },
  { id: 'discovery',   code: 'X', label: 'Discovery',   color: '#3b6a8c', glyph: 'magnifier' },
  { id: 'economy',     code: 'E', label: 'Economy',     color: '#a3592a', glyph: 'dollar'    },
  { id: 'hazard',      code: 'H', label: 'Hazard',      color: '#6e3030', glyph: 'bolt'      },
  { id: 'institution', code: 'I', label: 'Institution', color: '#4a4a52', glyph: 'pillars'   },
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['id'];

/**
 * Maps every real event type (from src/charts/eventColors.ts — 33 types total)
 * to one of the 9 contract categories above.
 *
 * Alias decisions applied here:
 *   - donor category `disaster`  → `hazard`     (natural / epidemic / climate events)
 *   - donor category `political` → `power`       (dissolution, political manoeuvre events)
 *
 * Read this map with: SUBTYPE_TO_CATEGORY[event.type] ?? 'power'
 */
export const SUBTYPE_TO_CATEGORY: Record<string, EventCategory> = {
  // Violence (red family) — donor category "violence" → contract "violence"
  battle:               'violence',
  war:                  'violence',
  military:             'violence',
  conflict:             'violence',
  conquest:             'violence',
  rebellion:            'violence',
  revolt:               'violence',
  crusade:              'violence',
  siege:                'violence',
  assassination:        'violence',

  // Diplomacy (green family) — donor category "diplomacy" → contract "diplomacy"
  treaty:               'diplomacy',
  treaty_fragmentation: 'diplomacy',
  marriage:             'diplomacy',

  // Power transfer (amber/gold) — donor category "power" → contract "power"
  coronation:           'power',
  succession_crisis:    'power',
  election:             'power',

  // Religion (purple family) — donor category "religion" → contract "religion"
  religious:            'religion',
  religious_council:    'religion',
  council:              'religion',

  // Culture (teal family) — donor category "culture" → contract "culture"
  cultural:             'culture',

  // Discovery / expansion (blue family) — donor "discovery" → contract "discovery"
  exploration:          'discovery',
  expansion_milestone:  'discovery',

  // Economy (orange) — donor "economy" → contract "economy"
  economic:             'economy',

  // Hazard — donor category "disaster" → contract "hazard" (alias)
  disaster:             'hazard',
  epidemic:             'hazard',
  plague:               'hazard',
  famine:               'hazard',
  fire:                 'hazard',
  earthquake:           'hazard',
  climate:              'hazard',

  // Power (political) — donor category "political" → contract "power" (alias)
  political:            'power',
  dissolution_event:    'power',
};

/** Subtype → glyph override. When an event's `type` matches, the map uses this mark. */
export const SUBTYPE_GLYPHS: Record<string, string> = {
  // Violence overrides (Wave3 literal set)
  siege: 'flame', rebellion: 'broken_heart', revolt: 'broken_heart',
  assassination: 'ninja', raid: 'galleon', naval: 'galleon',
  // Diplomacy / power overrides
  treaty: 'scroll', charter: 'scroll', coronation: 'crown',
  // Institutional overrides
  proclamation: 'bell', founding: 'fortress', council: 'church',
  // Religious overrides
  mosque: 'mosque', islamic: 'crescent', orthodox: 'patriarchal',
  // Knowledge overrides
  codex: 'book', learning: 'book',
  // Economy overrides
  trade: 'caravan',
  // Hazard overrides
  fire: 'flame', famine: 'wheat', plague: 'skull', marriage: 'rings',
};

/**
 * Region tint — polity fill base.
 * Expanded from 12 to 33 regions; hexes are verbatim from
 * src/data/regionColors.ts (canonical map surface / legend source).
 * The original 12 contract keys are all present; their hues now match
 * the live map (e.g. western_europe was #3b6a8c → now #2b8cbe per donor).
 * `islamic_world` alias kept for back-compat (points to same hue as
 * islamic_world_european_facing).
 */
export const REGION_COLORS: Record<string, string> = {
  // ── Loader palette — canonical hues (verbatim from src/data/regionColors.ts) ──
  western_europe:                 '#2b8cbe',
  central_europe:                 '#e66101',
  northern_europe:                '#6a3d9a',
  southern_europe:                '#1b9e77',
  eastern_europe:                 '#9e3030',
  southeastern_europe:            '#6ba858',
  british_isles:                  '#905088',
  iberia:                         '#66c2a5',
  italy:                          '#e6ab02',
  byzantine_world:                '#8da0cb',
  islamic_world_european_facing:  '#b2abd2',
  central_asian:                  '#fb9a99',  // alias kept from donor
  central_asia:                   '#fb9a99',
  north_africa:                   '#d99858',
  near_east:                      '#41ab5d',
  middle_east:                    '#c87c3a',
  scandinavia:                    '#756bb1',

  // ── Extended keys — non-European regions (from donor network table) ──
  east_asia:                      '#cc7a3a',
  south_asia:                     '#a07a9b',
  southeast_asia:                 '#6a9b41',
  sub_saharan_africa:             '#7a4a3a',
  west_africa:                    '#9b6a3a',
  horn_of_africa:                 '#7a4a3a',
  nile_valley:                    '#b29a3a',
  americas:                       '#3a6a3a',
  north_america:                  '#3a6a3a',
  mesoamerica:                    '#5a8a4a',
  andean:                         '#4a7a6a',
  arabia:                         '#a08a3a',
  levant:                         '#a73a3a',
  anatolia:                       '#a73a3a',
  caucasus:                       '#6a3d9a',
  indian_ocean:                   '#3a7a9a',
  siberia:                        '#9aa6c6',
  oceania:                        '#3a7a9a',

  // ── Back-compat alias for original 12-key contract consumers ──
  // (islamic_world was the short key; full key above is canonical)
  islamic_world:                  '#b2abd2',
};

/**
 * Relationship types — color carries to the network graph and the map line layer.
 * Expanded from 8 to 16 types; hexes verbatim from
 * src/charts/relationshipColors.ts (RELATIONSHIP_COLORS_UI, Artboard 30 §G).
 * All original 8 keys retained; new keys added: predecessor, succession,
 * dynastic_union, personal_union, cultural_exchange, religious_jurisdiction,
 * contested_influence, fragmentation.
 */
export const RELATIONSHIP_TYPES: Record<string, string> = {
  // Spec §G — canonical 8 (all kept from original contract)
  alliance:               '#2e8b57',
  rivalry:                '#9c1c1c',
  vassalage:              '#5a3d8a',
  tributary:              '#9b7a3a',
  trade:                  '#a3592a',
  marriage:               '#a07a9b',
  successor:              '#3b6a8c',
  religious:              '#7a5c1e',

  // Aliases and extension types (from relationshipColors.ts)
  predecessor:            '#3b6a8c',   // succession chain — shares successor hue
  succession:             '#3b6a8c',   // succession chain — shares successor hue
  dynastic_union:         '#a07a9b',   // marriage hue
  personal_union:         '#a07a9b',   // marriage hue
  cultural_exchange:      '#7a5c1e',   // religious / cultural hue
  religious_jurisdiction: '#7a5c1e',   // religious hue
  contested_influence:    '#9c1c1c',   // rivalry hue
  fragmentation:          '#5e4214',   // muted gold — distinct from the 8 spec hues
};

/**
 * Neutral fallback for relationship types not present in RELATIONSHIP_TYPES.
 * Mirrors LANGUAGE_FAMILY_FALLBACK — a single "no clear bucket" grey so the
 * relationship donut and ties list never reach for an inline hex literal.
 * Lightened in dark theme via domainColor().
 */
export const RELATIONSHIP_FALLBACK = '#7a7a8a';

/** Journey kinds — dash + color on the map. */
export const JOURNEY_KINDS: Record<string, string> = {
  conquest: '#9c1c1c', individual_journey: '#7a4ec2', migration: '#4d7d3a', spread: '#c2912a',
};

/**
 * Language-family palette — canonical base hues used to colour the per-polity
 * language composition shown in the DemographicsTab. Consumers import from here
 * instead of holding their own hex, so the family→hue mapping has a single source
 * of truth. Lightened automatically in dark theme via domainColor(); any family
 * not listed renders with LANGUAGE_FAMILY_FALLBACK (a neutral grey — honest "no
 * clear family" tone).
 */
export const LANGUAGE_FAMILY_COLORS: Record<string, string> = {
  'Indo-European':    '#4a90d9', // blue
  'Afro-Asiatic':     '#e0a030', // amber
  'Sino-Tibetan':     '#4caf78', // green
  'Austronesian':     '#9c6fc8', // purple
  'Niger-Congo':      '#e06040', // orange-red
  'Trans-New Guinea': '#c07050', // brown-orange
  'Nilo-Saharan':     '#d4b020', // gold
  'Dravidian':        '#d44b9c', // pink
  'Turkic':           '#35b8c4', // cyan
  'Uralic':           '#a0b830', // yellow-green
  'Mongolic':         '#8060c0', // indigo
  'Austroasiatic':    '#50c060', // bright green
  'Tai-Kadai':        '#c0a040', // ochre
  'Otomanguean':      '#e08860', // salmon
  'Mayan':            '#6880e0', // lavender-blue
  'Quechuan':         '#c05090', // magenta
  'Sepik':            '#a06030', // tan
  'Pama-Nyungan':     '#70b070', // sage green
  'Algic':            '#a04040', // deep red
  'Uto-Aztecan':      '#d0706a', // terracotta
};

/** Neutral grey for languages/regions with no clear dominant family. */
export const LANGUAGE_FAMILY_FALLBACK = '#7a7a8a';

/**
 * Religion → base hue map for the demographics religion-composition bar.
 *
 * Single source of truth for religion swatch colours (mirrors REGION_COLORS /
 * LANGUAGE_FAMILY_COLORS). The DemographicsTab religionColorFor resolver reads
 * this map instead of holding inline hex literals — keeping the TOKENS-ONLY law.
 * Most hues are deliberately aligned with the matching domain token
 * (e.g. islam ← islamic_world #b2abd2, orthodox ← byzantine_world #8da0cb,
 * catholic ← western_europe #2b8cbe) so the religion bar reads consistently
 * with the region tint on the map. `shia` is a deliberately distinct desaturated
 * indigo so the two Islamic branches separate; `other` falls back to the neutral
 * family grey. Lightened automatically in dark theme via domainColor().
 * Keys are normalised: lowercased, non-alpha stripped (matches the resolver).
 */
export const RELIGION_COLORS: Record<string, string> = {
  islam:       '#b2abd2', // ← islamic_world
  sunni:       '#b2abd2', // ← islamic_world
  shia:        '#9b9abf', // distinct desaturated indigo for the Shia branch
  orthodox:    '#8da0cb', // ← byzantine_world
  catholic:    '#2b8cbe', // ← western_europe
  christian:   '#3b6a8c', // blue-grey (shared with successor relationship hue)
  protestant:  '#2b8cbe', // ← western_europe
  jewish:      '#9b7a3a', // ← tributary relationship gold
  pagan:       '#4d7d3a', // ← migration green (JOURNEY_KINDS.migration)
  zoroastrian: '#a3592a', // ← trade relationship orange
  hindu:       '#a07a9b', // ← marriage relationship mauve
  buddhist:    '#2a7575', // ← culture event teal
  animist:     '#7a5c1e', // ← religious relationship hue
  armenian:    '#6a3d9a', // ← caucasus / northern_europe
};


/** Lighten a hex for dark-theme legibility (used when [data-theme=dark]). */
export function lighten(hex: string, amt = 0.35): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amt));
  const b = Math.min(255, (n & 255) + Math.round(255 * amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Resolve a category/region color, lightened automatically in dark theme. */
export function domainColor(hex: string, theme: string): string {
  return theme === 'dark' ? lighten(hex, 0.28) : hex;
}
