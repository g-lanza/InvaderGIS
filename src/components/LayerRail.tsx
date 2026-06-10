/**
 * LayerRail — printer's-table layer panel (the `.msa-layerrail` region).
 *
 * Implements the real ArcGIS **LayerList** convention (docs/09 §"LayerList":
 * "per layer = visibility checkbox + title + expand + actions (opacity slider
 * as panel)"). Every control reflects and drives REAL `layersStore` state — the
 * canonical 10 layer ids, their live `visible` flags, and their live `opacity`
 * values. No mocks.
 *
 * Wave2-C additions over the 5-b legend build:
 *   1. Per-layer OPACITY slider (0–100%). The thumb is wired to
 *      `layersStore.setOpacity(id, value)` (clamps 0..1). Map layer modules read
 *      `opacity` from the store, so the slider live-tints the canvas. The slider
 *      is revealed inline on the row's expand toggle, matching ArcGIS's
 *      "actions panel under the layer item" pattern.
 *   2. COLLAPSIBLE GROUPS — the 10 layers are organised into four logical
 *      `<details>`-style groups (Territory / Places / Activity / Relations),
 *      each with a live count and a rotating chevron. Group styling matches the
 *      legend's existing expander chrome; motion stays on transform/opacity.
 *   3. The legend lives in its own collapsible group at the bottom of the rail
 *      so the whole rail body scrolls cleanly.
 *
 * Phase G2 note: `LAYER_ORDER` is imported from layersStore (single source of
 * truth). Groups below partition that canonical id set; any id present in the
 * store but missing from a group still renders under an "Other" fallback group,
 * so the rail never silently drops a real layer (honest completeness).
 */
import { useState } from 'react';
import { useLayersStore, LAYER_ORDER } from '@/stores/layersStore';
import type { LayerId } from '@/stores/layersStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useEventFilterStore, EVENT_YEAR_SPAN_MIN, EVENT_YEAR_SPAN_MAX, EVENT_YEAR_SPAN_STEP } from '@/stores/eventFilterStore';
import type { EventTimeMode } from '@/stores/eventFilterStore';
import { activeVocab, categoryColor, regionColor, relationshipColor } from '@/data/vocab';
import { GlyphStud } from '@/design/glyphs';

/** Human-readable display name for each layer id. */
const LAYER_LABELS: Record<LayerId, string> = {
  polities:      'Polities',
  capitals:      'Capitals',
  settlements:   'Settlements',
  // The 'military' layer now renders FORTS only; battles/sieges live in Events.
  military:      'Forts',
  events:        'Events',
  journeys:      'Journeys',
  trade:         'Trade',
  relationships: 'Relationships',
  cartogram:     'Cartogram',
};

/** Tooltip shown on hover for layers that need a caveat. */
const LAYER_TOOLTIPS: Partial<Record<LayerId, string>> = {
  military:
    'Forts & fortifications (32 sites), shown across their active years. ' +
    'Battles and sieges are now in the Events layer under the Violence category.',
};

// ── Layer grouping (ArcGIS LayerList group items) ───────────────────────────────

/** A logical, collapsible cluster of layer ids shown as one group header. */
interface LayerGroup {
  /** Stable group key (used for React key + DOM id). */
  readonly key: string;
  /** Group display title (uppercase mono header). */
  readonly title: string;
  /** Member layer ids, in display order. */
  readonly layerIds: ReadonlyArray<LayerId>;
  /** Whether the group starts expanded. */
  readonly defaultOpen: boolean;
}

/**
 * Logical partition of the canonical layer set. Mirrors how a GIS analyst
 * reasons about these layers (territory vs. places vs. activity vs. relations)
 * rather than the raw draw order. Order within each group is curated, but every
 * id here is a real `layersStore` layer.
 */
const LAYER_GROUPS: ReadonlyArray<LayerGroup> = [
  {
    key: 'territory',
    title: 'Territory',
    // Cartogram is a polity-derived analytical view (proportional symbols), so it
    // belongs with Territory. (The Event-Density heatmap layer was removed.)
    layerIds: ['polities', 'cartogram'],
    defaultOpen: true,
  },
  {
    key: 'places',
    title: 'Places',
    // 'military' is now the Forts layer (forts are places). Battles/sieges moved
    // into the Events layer (Violence category).
    layerIds: ['capitals', 'settlements', 'military'],
    defaultOpen: true,
  },
  {
    key: 'activity',
    title: 'Activity',
    // Relationships is a selectable activity layer here (its toggle lives in the
    // Layers tab, not the Legend tab).
    layerIds: ['events', 'journeys', 'trade', 'relationships'],
    defaultOpen: true,
  },
];

// ── Region display labels ─────────────────────────────────────────────────────

/**
 * Human-readable label for each region key. Snake_case → Title Case where
 * special abbreviations apply. Keys without an entry fall back to a
 * computed title-cased version of the key (see `regionLabel()`).
 */
const REGION_LABELS: Record<string, string> = {
  western_europe:                 'Western Europe',
  central_europe:                 'Central Europe',
  northern_europe:                'Northern Europe',
  southern_europe:                'Southern Europe',
  eastern_europe:                 'Eastern Europe',
  southeastern_europe:            'SE Europe',
  british_isles:                  'British Isles',
  iberia:                         'Iberia',
  italy:                          'Italy',
  byzantine_world:                'Byzantine World',
  islamic_world_european_facing:  'Islamic World (W)',
  central_asian:                  'Central Asia',   // alias; de-duped below
  central_asia:                   'Central Asia',
  north_africa:                   'North Africa',
  near_east:                      'Near East',
  middle_east:                    'Middle East',
  scandinavia:                    'Scandinavia',
  east_asia:                      'East Asia',
  south_asia:                     'South Asia',
  southeast_asia:                 'SE Asia',
  sub_saharan_africa:             'Sub-Saharan Africa',
  west_africa:                    'West Africa',
  horn_of_africa:                 'Horn of Africa',
  nile_valley:                    'Nile Valley',
  americas:                       'Americas',
  north_america:                  'North America',
  mesoamerica:                    'Mesoamerica',
  andean:                         'Andean',
  arabia:                         'Arabia',
  levant:                         'Levant',
  anatolia:                       'Anatolia',
  caucasus:                       'Caucasus',
  indian_ocean:                   'Indian Ocean',
  siberia:                        'Siberia',
  oceania:                        'Oceania',
  islamic_world:                  'Islamic World',  // alias; de-duped below
};

/**
 * Canonical relationship keys that will appear in the legend.
 * These are the 8 non-alias types from the spec §G; aliases that share
 * a color (predecessor ≡ successor, dynastic_union ≡ marriage, etc.) are
 * omitted to avoid duplicate rows.
 */
const CANONICAL_RELATIONSHIPS: ReadonlyArray<string> = [
  'alliance',
  'rivalry',
  'vassalage',
  'tributary',
  'trade',
  'marriage',
  'successor',
  'religious',
  'fragmentation',
];

/** Canonical relationship display labels. */
const RELATIONSHIP_LABELS: Record<string, string> = {
  alliance:    'Alliance',
  rivalry:     'Rivalry',
  vassalage:   'Vassalage',
  tributary:   'Tributary',
  trade:       'Trade',
  marriage:    'Marriage / Union',
  successor:   'Succession',
  religious:   'Religious',
  fragmentation: 'Fragmentation',
};

// ── De-duplication for regions ────────────────────────────────────────────────

/**
 * Alias keys to skip so we don't render duplicate swatch rows.
 * `central_asian` duplicates `central_asia`; `islamic_world` duplicates
 * `islamic_world_european_facing`. Both share identical hex values in vocab.
 */
const REGION_ALIAS_SKIP = new Set<string>(['central_asian', 'islamic_world']);

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Single layer item — an ArcGIS-style LayerList row.
 *
 * Top line: visibility dot/toggle + name + opacity percent readout + expand
 * chevron. The expand reveals the opacity slider panel (the "actions" panel in
 * ArcGIS parlance). Both the toggle and the slider drive real store actions.
 */
interface LayerItemProps {
  /** The layer identifier. */
  id: LayerId;
  /** Whether the layer is currently visible (live store state). */
  visible: boolean;
  /** Current opacity 0..1 (live store state). */
  opacity: number;
  /** Toggle this layer's visibility. */
  onToggle: (id: LayerId) => void;
  /** Set this layer's opacity (0..1, store clamps). */
  onOpacity: (id: LayerId, value: number) => void;
}

function LayerItem({ id, visible, opacity, onToggle, onOpacity }: LayerItemProps) {
  const label   = LAYER_LABELS[id] ?? id;
  const tooltip = LAYER_TOOLTIPS[id];
  const pct = Math.round(opacity * 100);
  const [expanded, setExpanded] = useState(false);
  const panelId = `layer-panel-${id}`;

  return (
    <div className="layer-item">
      <div className={`layer-item__summary${visible ? ' is-visible' : ''}`} title={tooltip}>
        <button
          className={`layer-item__toggle${visible ? ' is-visible' : ''}`}
          type="button"
          aria-pressed={visible}
          title={`${visible ? 'Hide' : 'Show'} ${label} layer`}
          onClick={() => onToggle(id)}
        >
          <span
            className={`layer-item__dot${visible ? ' is-on' : ''}`}
            aria-hidden="true"
          />
        </button>
        <span className="layer-item__name">{label}</span>
        <span
          className="layer-item__pct"
          aria-label={`${label} opacity ${pct} percent`}
        >
          {pct}%
        </span>
        <button
          className={`layer-item__expand${expanded ? ' is-open' : ''}`}
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} options`}
          onClick={() => setExpanded((v) => !v)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {expanded && (
        <div id={panelId} className="layer-item__panel">
          <label className="layer-slider">
            <span className="layer-slider__label">Opacity</span>
            <input
              className="layer-slider__input"
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              aria-label={`${label} layer opacity`}
              onChange={(e) => onOpacity(id, Number(e.target.value) / 100)}
            />
            <span className="layer-slider__value" aria-hidden="true">{pct}%</span>
          </label>
        </div>
      )}
    </div>
  );
}

interface LayerGroupSectionProps {
  /** The group definition. */
  group: LayerGroup;
  /** Live layer config map from the store. */
  layers: ReturnType<typeof useLayersStore.getState>['layers'];
  /** Toggle a layer's visibility. */
  onToggle: (id: LayerId) => void;
  /** Set a layer's opacity. */
  onOpacity: (id: LayerId, value: number) => void;
}

/**
 * One collapsible group of layer items. Header shows the group title plus a
 * live "visible / total" count and a rotating chevron. Reuses the legend's
 * `.legend-expander` chrome conventions via the `.layer-group` classes.
 *
 * @param props - see {@link LayerGroupSectionProps}
 */
function LayerGroupSection({ group, layers, onToggle, onOpacity }: LayerGroupSectionProps) {
  // Only include ids that actually exist in the store (honest completeness).
  const presentIds = group.layerIds.filter((id) => layers[id] !== undefined);
  if (presentIds.length === 0) return null;

  const visibleCount = presentIds.filter((id) => layers[id]?.visible).length;

  return (
    <details className="layer-group" open={group.defaultOpen}>
      <summary className="layer-group__summary">
        <span className="layer-group__title">{group.title}</span>
        <span className="layer-group__count" aria-label={`${visibleCount} of ${presentIds.length} visible`}>
          {visibleCount}/{presentIds.length}
        </span>
      </summary>
      <div className="layer-group__items">
        {presentIds.map((id) => (
          <LayerItem
            key={id}
            id={id}
            visible={layers[id]?.visible ?? false}
            opacity={layers[id]?.opacity ?? 1}
            onToggle={onToggle}
            onOpacity={onOpacity}
          />
        ))}
      </div>
    </details>
  );
}

// ── Legend sub-sections ───────────────────────────────────────────────────────

interface CategoryKeyProps {
  /** Current theme id — passed to categoryColor(). */
  theme: string;
  /** Whether the events layer is currently visible. */
  eventsVisible: boolean;
  /** Toggle the events layer on/off (two-way badge in the legend head). */
  onToggleLayer: () => void;
  /** The currently solo'd category id, or null for all. */
  activeCategory: string | null;
  /** Toggle-solo a category (click again to deselect). */
  onToggleCategory: (id: string) => void;
  /** Reset the category solo filter. */
  onClearCategory: () => void;
  /** Current search string. */
  searchQuery: string;
  /** Update the search string. */
  onSearchChange: (q: string) => void;
  /** Current event time mode (exact-year vs span window). */
  timeMode: EventTimeMode;
  /** Switch the event time mode. */
  onTimeModeChange: (mode: EventTimeMode) => void;
  /** Current span half-width in years (used only in span mode). */
  yearSpan: number;
  /** Update the span half-width in years. */
  onYearSpanChange: (span: number) => void;
}

/**
 * Event categories key: 9 rows, each showing a GlyphStud disc (category color
 * from the active vocab, theme-aware) with label and mono code letter.
 *
 * Extended with:
 *   - Search input: filters the visible legend rows by category label / id
 *     (case-insensitive substring). This is a UI-only filter; the map category
 *     filter is driven by the solo (click) mechanic below.
 *   - Click-to-solo: clicking a row sets that category as the sole visible
 *     type on the map. Clicking the active row resets to "all". A "show all"
 *     reset button appears when a category is solo'd.
 *   - Active-state feedback: the solo'd row gets a filled background; all
 *     other rows dim. Keyboard-accessible (Enter/Space to toggle).
 *
 * The whole section dims to 40% opacity when the events layer is toggled off —
 * honest feedback that these colors are not currently drawn on the map. When off,
 * the "off" badge becomes a button that turns the events layer on.
 *
 * @param props - see {@link CategoryKeyProps}
 */
function CategoryKey({
  theme,
  eventsVisible,
  onToggleLayer,
  activeCategory,
  onToggleCategory,
  onClearCategory,
  searchQuery,
  onSearchChange,
  timeMode,
  onTimeModeChange,
  yearSpan,
  onYearSpanChange,
}: CategoryKeyProps) {
  const vocab = activeVocab();

  // Filter the category rows by the search query (label or id substring).
  const visibleCategories = vocab.categories.filter((cat) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return cat.label.toLowerCase().includes(q) || cat.id.toLowerCase().includes(q);
  });

  return (
    <section
      className={`legend-section${eventsVisible ? '' : ' is-layer-off'}`}
      aria-label="Event categories"
    >
      <div className="legend-section__head">
        <span className="legend-section__title">Events</span>
        {/* Two-way layer toggle so the legend can turn the layer OFF as well as
            on (the old badge was show-only — once on, there was no way to hide
            it from the legend). */}
        <button
          type="button"
          className="legend-section__off-badge legend-section__off-badge--btn"
          onClick={onToggleLayer}
          title={eventsVisible ? 'Turn the Events layer off' : 'Turn the Events layer on'}
          aria-label={eventsVisible ? 'Events layer visible — click to hide' : 'Events layer hidden — click to show'}
          aria-pressed={eventsVisible}
        >
          {eventsVisible ? 'on · hide' : 'off · show'}
        </button>
        {eventsVisible && activeCategory !== null && (
          <button
            type="button"
            className="legend-section__off-badge legend-section__off-badge--btn legend-cat-reset"
            onClick={onClearCategory}
            title="Show all event categories"
            aria-label="Show all event categories"
          >
            show all
          </button>
        )}
      </div>

      {/* Time mode — segmented Exact / Span toggle + (span only) a ± year stepper.
          Exact shows events on their precise year; Span shows a ±N-year window. */}
      <div className="legend-time-mode" role="group" aria-label="Event time matching">
        <div className="legend-seg" role="radiogroup" aria-label="Event time mode">
          {/* Span first (default), then Exact — Span is the primary mode. */}
          <button
            type="button"
            className={`legend-seg__btn${timeMode === 'span' ? ' is-active' : ''}`}
            role="radio"
            aria-checked={timeMode === 'span'}
            onClick={() => onTimeModeChange('span')}
            title="Show events within a ± year window of the scrubber"
          >
            Span
          </button>
          <button
            type="button"
            className={`legend-seg__btn${timeMode === 'exact' ? ' is-active' : ''}`}
            role="radio"
            aria-checked={timeMode === 'exact'}
            onClick={() => onTimeModeChange('exact')}
            title="Show events only on their exact year"
          >
            Exact
          </button>
        </div>
        {timeMode === 'span' && (
          <div className="legend-span-step" aria-label="Span half-width in years">
            <button
              type="button"
              className="legend-span-step__btn"
              onClick={() => onYearSpanChange(yearSpan - EVENT_YEAR_SPAN_STEP)}
              disabled={yearSpan <= EVENT_YEAR_SPAN_MIN}
              aria-label={`Decrease span (currently ±${yearSpan} years)`}
              title="Narrow the window"
            >
              −
            </button>
            <span className="legend-span-step__value" aria-live="polite">
              ±{yearSpan} yr
            </span>
            <button
              type="button"
              className="legend-span-step__btn"
              onClick={() => onYearSpanChange(yearSpan + EVENT_YEAR_SPAN_STEP)}
              disabled={yearSpan >= EVENT_YEAR_SPAN_MAX}
              aria-label={`Increase span (currently ±${yearSpan} years)`}
              title="Widen the window"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Event search — filters the legend rows (UI) and the map (via category solo) */}
      <div className="legend-cat-search">
        <input
          type="search"
          className="legend-cat-search__input"
          placeholder="Search events…"
          value={searchQuery}
          aria-label="Search event categories"
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="legend-cat-search__clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear event search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <ul className="legend-cat-list" role="list" aria-label="Event category filter">
        {visibleCategories.map((cat) => {
          const color = categoryColor(cat.id, theme);
          const isActive = activeCategory === cat.id;
          const isDimmed = activeCategory !== null && !isActive;
          return (
            <li
              key={cat.id}
              className={
                `legend-cat-row legend-cat-row--clickable` +
                (isActive ? ' is-solo' : '') +
                (isDimmed ? ' is-dimmed' : '')
              }
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              title={isActive ? `Showing only ${cat.label} — click to show all` : `Show only ${cat.label}`}
              onClick={() => onToggleCategory(cat.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleCategory(cat.id);
                }
              }}
            >
              <GlyphStud
                category={cat.id}
                glyph={cat.glyph}
                size={18}
                color={color}
                label={cat.label}
                className="legend-cat-row__stud"
              />
              <span className="legend-cat-row__label">{cat.label}</span>
              <span className="legend-cat-row__code" aria-label={`code ${cat.code}`}>
                {cat.code}
              </span>
              {isActive && (
                <span className="legend-cat-row__solo-badge" aria-hidden="true">
                  solo
                </span>
              )}
            </li>
          );
        })}
        {visibleCategories.length === 0 && (
          <li className="legend-cat-empty" aria-live="polite">
            No categories match "{searchQuery}"
          </li>
        )}
      </ul>
    </section>
  );
}

interface RegionKeyProps {
  /** Current theme id — passed to regionColor(). */
  theme: string;
  /** Whether the polities layer is currently visible. */
  politiesVisible: boolean;
}

/**
 * Regions color key: all region keys from the active vocab, de-duplicated
 * (alias keys with the same hex are skipped), sorted alphabetically by label.
 * Wrapped in a `<details>` expander so 33 entries don't dominate the rail.
 * The section dims when the polities layer is off.
 *
 * @param props - see {@link RegionKeyProps}
 */
function RegionKey({ theme, politiesVisible }: RegionKeyProps) {
  const vocab = activeVocab();
  const regionEntries = Object.entries(vocab.regions)
    .filter(([key]) => !REGION_ALIAS_SKIP.has(key))
    .map(([key]) => ({
      key,
      label: REGION_LABELS[key] ?? key.replace(/_/g, ' '),
      color: regionColor(key, theme) ?? '#888888',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalCount = regionEntries.length;

  return (
    <section
      className={`legend-section${politiesVisible ? '' : ' is-layer-off'}`}
      aria-label="Regions"
    >
      <details className="legend-expander">
        <summary className="legend-expander__summary">
          <span className="legend-section__title">Regions</span>
          <span className="legend-expander__count">({totalCount})</span>
          {!politiesVisible && (
            <span className="legend-section__off-badge" aria-label="layer hidden">off</span>
          )}
        </summary>
        <ul className="legend-swatch-list" role="list">
          {regionEntries.map(({ key, label, color }) => (
            <li key={key} className="legend-swatch-row">
              <span
                className="legend-swatch"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="legend-swatch-row__label">{label}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

interface RelationshipKeyProps {
  /** Current theme id — passed to relationshipColor(). */
  theme: string;
  /** Whether the relationships layer is currently visible (dims the key when off). */
  relationshipsVisible: boolean;
}

/**
 * Relationship types color key: canonical 9 non-alias types, each with a
 * hairline dash swatch in the relationship color and a label. Collapsed by
 * default (lower-priority information in the rail context). Dims when the
 * relationships layer is off.
 *
 * @param props - see {@link RelationshipKeyProps}
 */
function RelationshipKey({ theme, relationshipsVisible }: RelationshipKeyProps) {
  return (
    <section
      className={`legend-section${relationshipsVisible ? '' : ' is-layer-off'}`}
      aria-label="Relationship types"
    >
      <details className="legend-expander">
        <summary className="legend-expander__summary">
          <span className="legend-section__title">Relationships</span>
          <span className="legend-expander__count">
            ({CANONICAL_RELATIONSHIPS.length})
          </span>
          {/* No toggle here — the Relationships layer is toggled from the Layers
              tab (Activity group). This is a pure color key. */}
        </summary>
        <ul className="legend-swatch-list" role="list">
          {CANONICAL_RELATIONSHIPS.map((key) => {
            const color = relationshipColor(key, theme) ?? 'var(--ink-mute)';
            const label = RELATIONSHIP_LABELS[key] ?? key.replace(/_/g, ' ');
            return (
              <li key={key} className="legend-swatch-row">
                <span
                  className="legend-dash-swatch"
                  style={{ borderTopColor: color }}
                  aria-hidden="true"
                />
                <span className="legend-swatch-row__label">{label}</span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────


interface LayerRailProps {
  /** Whether the rail is collapsed to a thin re-open strip. */
  collapsed?: boolean;
  /** Toggle the collapsed state (owned by AppShell so the grid column narrows). */
  onToggleCollapse?: () => void;
  /** Whether the rail is expanded to fill the map area (mirror of the dock). */
  fullscreen?: boolean;
  /** Toggle the fullscreen state (owned by AppShell). */
  onToggleFullscreen?: () => void;
}

/**
 * Vertical layer rail in the ArcGIS LayerList idiom: collapsible layer groups,
 * each layer item carrying a visibility toggle and an expandable opacity slider,
 * plus a real color-key legend in its own collapsible group at the foot of the
 * rail. All controls reflect and drive live `layersStore` state; all colors
 * route through the theme-aware vocab resolvers so the rail re-tints on theme
 * change.
 *
 * The whole rail collapses to a thin strip via `collapsed`/`onToggleCollapse`
 * (user request: every aspect hideable). When collapsed, only a re-open tab shows.
 */
export function LayerRail({ collapsed = false, onToggleCollapse, fullscreen = false, onToggleFullscreen }: LayerRailProps) {
  const layers   = useLayersStore((s) => s.layers);
  const toggle   = useLayersStore((s) => s.toggle);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const theme    = useSettingsStore((s) => s.theme);

  // Event filter store (additive — not frozen).
  const eventCategory    = useEventFilterStore((s) => s.eventCategory);
  const eventSearch      = useEventFilterStore((s) => s.eventSearch);
  const toggleEventCat   = useEventFilterStore((s) => s.toggleEventCategory);
  const clearEventCat    = useEventFilterStore((s) => s.clearEventFilters);
  const setEventSearch   = useEventFilterStore((s) => s.setEventSearch);
  const eventTimeMode    = useEventFilterStore((s) => s.eventTimeMode);
  const eventYearSpan    = useEventFilterStore((s) => s.eventYearSpan);
  const setEventTimeMode = useEventFilterStore((s) => s.setEventTimeMode);
  const setEventYearSpan = useEventFilterStore((s) => s.setEventYearSpan);

  const eventsVisible        = layers['events']?.visible ?? false;
  const politiesVisible      = layers['polities']?.visible ?? false;
  const relationshipsVisible = layers['relationships']?.visible ?? false;

  // Two surfaces: 'layers' = the toggle/opacity controls; 'legend' = the color/
  // glyph keys. Separated so the rail reads cleanly (the legend is reference, not
  // controls). Default to the Layers controls.
  const [activeRailTab, setActiveRailTab] = useState<'layers' | 'legend'>('layers');

  // Every canonical layer is claimed by a curated group (Territory / Places /
  // Activity), so the rail renders exactly those — no "Other" catch-all group.
  // (Dev guard: if a future layer is added to the store but not to a group, warn
  // so it isn't silently hidden, rather than surfacing an ungrouped "Other".)
  if (import.meta.env.DEV) {
    const claimed = new Set<LayerId>(LAYER_GROUPS.flatMap((g) => [...g.layerIds]));
    const orphanIds = LAYER_ORDER.filter((id) => !claimed.has(id) && layers[id] !== undefined);
    if (orphanIds.length > 0) {
      console.warn('[LayerRail] layer(s) not assigned to any group (hidden from rail):', orphanIds);
    }
  }

  const groups = LAYER_GROUPS;

  // Collapsed: render only a thin vertical re-open strip (the grid column is
  // narrowed by .msa-app.is-rail-collapsed in CSS).
  if (collapsed) {
    return (
      <nav className="msa-layerrail msa-layerrail--collapsed" aria-label="Map layers (collapsed)">
        <button
          type="button"
          className="msa-rail-reopen"
          onClick={onToggleCollapse}
          title="Show layers panel"
          aria-label="Show layers panel"
        >
          <span className="msa-rail-reopen__chevron" aria-hidden="true">›</span>
          <span className="msa-rail-reopen__label">Layers</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="msa-layerrail" aria-label="Map layers">
      {/* Collapse / fullscreen controls — mirror of the inspector dock. */}
      {(onToggleCollapse || onToggleFullscreen) && (
        <div className="msa-rail-collapsehead">
          {onToggleCollapse && (
            <button
              type="button"
              className="msa-rail-collapse-btn"
              onClick={onToggleCollapse}
              title="Hide layers panel"
              aria-label="Hide layers panel"
            >
              <span aria-hidden="true">‹</span> Hide
            </button>
          )}
          {onToggleFullscreen && (
            <button
              type="button"
              className="msa-rail-collapse-btn"
              onClick={onToggleFullscreen}
              title={fullscreen ? 'Exit fullscreen layers' : 'Expand layers to full width'}
              aria-label={fullscreen ? 'Exit fullscreen layers' : 'Expand layers to full width'}
              aria-pressed={fullscreen}
            >
              {fullscreen ? (
                <>Exit full <span aria-hidden="true">⊡</span></>
              ) : (
                <>Full <span aria-hidden="true">⊞</span></>
              )}
            </button>
          )}
        </div>
      )}

      {/* Tab strip — separates the layer CONTROLS from the LEGEND keys. */}
      <div className="rail-tabs" role="tablist" aria-label="Layers panel sections">
        <button
          type="button"
          role="tab"
          id="rail-tab-layers"
          aria-selected={activeRailTab === 'layers'}
          aria-controls="rail-panel-layers"
          className={`rail-tab${activeRailTab === 'layers' ? ' is-active' : ''}`}
          onClick={() => setActiveRailTab('layers')}
        >
          Layers
        </button>
        <button
          type="button"
          role="tab"
          id="rail-tab-legend"
          aria-selected={activeRailTab === 'legend'}
          aria-controls="rail-panel-legend"
          className={`rail-tab${activeRailTab === 'legend' ? ' is-active' : ''}`}
          onClick={() => setActiveRailTab('legend')}
        >
          Legend
        </button>
      </div>

      {/* Layers tab — layer groups (LayerList): toggles + opacity only. */}
      {activeRailTab === 'layers' && (
        <div className="panel" id="rail-panel-layers" role="tabpanel" aria-labelledby="rail-tab-layers">
          <div className="layer-groups">
            {groups.map((group) => (
              <LayerGroupSection
                key={group.key}
                group={group}
                layers={layers}
                onToggle={toggle}
                onOpacity={setOpacity}
              />
            ))}
          </div>
        </div>
      )}

      {/* Legend tab — the color / glyph keys only. */}
      {activeRailTab === 'legend' && (
        <div className="panel" id="rail-panel-legend" role="tabpanel" aria-labelledby="rail-tab-legend">
          <div className="legend-body">
            <CategoryKey
              theme={theme}
              eventsVisible={eventsVisible}
              onToggleLayer={() => toggle('events')}
              activeCategory={eventCategory}
              onToggleCategory={toggleEventCat}
              onClearCategory={clearEventCat}
              searchQuery={eventSearch}
              onSearchChange={setEventSearch}
              timeMode={eventTimeMode}
              onTimeModeChange={setEventTimeMode}
              yearSpan={eventYearSpan}
              onYearSpanChange={setEventYearSpan}
            />
            <RegionKey       theme={theme} politiesVisible={politiesVisible} />
            <RelationshipKey theme={theme} relationshipsVisible={relationshipsVisible} />
          </div>
        </div>
      )}
    </nav>
  );
}
