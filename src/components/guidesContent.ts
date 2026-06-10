/**
 * guidesContent.ts — the compiled, sourced content for the Settings → Guides page.
 *
 * Everything here is COMPILED FROM REAL PROJECT FACTS (no invented claims), per the
 * Realness law:
 *   · Quick-start + manual sections describe features the app actually has.
 *   · Data-source rows + licences are transcribed verbatim from docs/03_LEGAL.md §2,
 *     the canonical attribution surface. SPDX ids match that table.
 *   · Licence rows are the project's two-licence split from docs/03_LEGAL.md §1.
 *   · The no-fabrication / citation note mirrors docs/03_LEGAL.md §5–§6.
 *
 * Keeping the content as DATA (not JSX) means GuidesPanel renders it uniformly and
 * the same arrays can be reused (e.g. an Attribution string for the map footer, or
 * future README generation) without divergence.
 */

// ── Manual: usage guides ────────────────────────────────────────────────────────

/** A single manual entry: a workspace area and how to use it. */
export interface ManualEntry {
  /** Short heading (the region or feature). */
  title: string;
  /** Plain-language explanation of what it does and how to drive it. */
  body: string;
}

/**
 * The manual — one entry per major surface. Each describes real behaviour wired in
 * the app (verified against the components: MapCanvas, TimeRail, LayerRail, the
 * overlays, CommandBar/SemanticSearchBar, savedViewsStore, uploadStore).
 */
export const MANUAL: readonly ManualEntry[] = [
  {
    title: 'The map',
    body:
      'Real polity polygons, capitals, settlements, military sites, events, journeys, trade ' +
      'routes and relationship arcs — all time-scoped to the active year. These are drawn from ' +
      'the full record set of fifteen kinds — alongside the mapped layers it also holds rulers, ' +
      'sources, institutions, technologies, texts, and the research layer of claims, annotations ' +
      'and research questions, all reachable from the analytical views and registers. The ' +
      'languages spoken in each nation are recorded on the polities themselves — select a polity ' +
      'and open its Demographics tab to see its language make-up and administrative language. ' +
      'Hover a feature for a quick tip; click it to open its full record in the inspector. Zoom ' +
      'with the +/− buttons or the scroll wheel; a scale bar and a live latitude/longitude ' +
      'read-out sit in the corners (lat-first, 6 decimals, standard GIS convention).',
  },
  {
    title: 'Time rail',
    body:
      'The bottom strip is the chronoscope. Drag the year scrubber across 500–1500 CE and the ' +
      'whole app updates live. The histogram behind the scrubber shows how many records are ' +
      'active in each period. Press Play to auto-advance; Home/End jump to the bounds, ' +
      'Page-Up/Down step ten years. Era bands (Early / High / Late) label the window.',
  },
  {
    title: 'Layers & legend',
    body:
      'The left rail lists every map layer in collapsible groups (Territory / Places / Activity / ' +
      'Relations). Toggle a layer with its dot; expand a row for a per-layer opacity slider. The ' +
      'legend below decodes the colours — event categories, region tints and relationship types. ' +
      'A layer’s legend section dims when that layer is hidden. Hide the whole rail with “Hide”.',
  },
  {
    title: 'Map styles & themes',
    body:
      'Settings switches the map base — Parchment, Plain or Relief — and the colour theme — ' +
      'Atlas, Manuscript, Dark or Contrast — live, with no reload. Domain colours (what a ' +
      'category or region means) stay constant across themes; only the chrome changes, and ' +
      'they auto-lighten in Dark for legibility.',
  },
  {
    title: 'Inspector',
    body:
      'Selecting any record fills the right dock. Polities get a tabbed profile — Overview, ' +
      'Demographics, Economy, Lifecycle, Connections and Sources — with charts drawn from the ' +
      'real record. Every panel shows provenance (status, confidence) and a citation list; the ' +
      'Sources tab also lists the upstream references behind a record, including the Wikidata and ' +
      'Wikipedia sources behind its population estimates, as clickable links. Links inside a ' +
      'record (rulers, related polities) navigate the dock to that record. Use “Full” to expand ' +
      'the dock across the map for comfortable reading, or “Hide” to collapse it to a thin re-open ' +
      'strip.',
  },
  {
    title: 'Analytical views',
    body:
      'The top-bar buttons open views over the map: Network (force graph + adjacency matrix of ' +
      'relationships), Lineage (ruler reign Gantt with succession), Compare (side-by-side records ' +
      'plus a two-entity storyline), Registers (the records of one kind as a sortable attribute ' +
      'table or a card gallery — switch with the Table / Gallery toggle) and Sources (the ' +
      'bibliography library). Views captures and restores a saved workspace state; My Data adds ' +
      'your own uploaded layers.',
  },
  {
    title: 'Search & command palette',
    body:
      'Press ⌘K / Ctrl-K for the command palette: fuzzy-search every record, jump to a year by ' +
      'typing a number, or run a slash command (/year, /show, /focus, /solo, /compare). The ' +
      'Search button opens a prose (TF-IDF) search over the same index. Selecting a result ' +
      'opens it in the inspector.',
  },
  {
    title: 'Filters & saved views',
    body:
      'Filter narrows records by time range, kind, region, confidence and attestation (evidence ' +
      'strength: strong / weak / inferred), showing a live match count — and a per-value count on ' +
      'each kind, region, confidence and attestation chip. Records with no recorded attestation ' +
      'always pass, so the attestation filter never hides them silently. Views captures the ' +
      'current year, theme, map style and layer setup so you can restore an exact configuration ' +
      'later — saved in your browser.',
  },
  {
    title: 'My Data',
    body:
      'Upload your own GeoJSON or CSV (with latitude/longitude columns) to plot it alongside the ' +
      'historical layers. Your data is stored only in this browser (IndexedDB) and is never sent ' +
      'anywhere; export it back to a file at any time, or remove it.',
  },
];

// ── Quick-start: the five-minute version ────────────────────────────────────────

/** Short numbered quick-start steps shown at the top of the Guides page. */
export const QUICK_START: readonly string[] = [
  'Drag the year scrubber on the bottom rail to move through 500–1500 CE — everything updates live.',
  'Use the left rail to switch which layers are drawn and to read the colour legend.',
  'Click any feature on the map (or search with ⌘K) to open its full record in the right inspector — use “Full” to expand it for reading.',
  'Open Network, Lineage, Compare, Registers (as a table or a card gallery) or Sources from the top bar for analytical views.',
  'Use Filter to narrow records by time, kind, region, confidence and attestation, with a live count on every chip.',
  'Open Settings to change theme and map style, or to read this guide and the data sources.',
];

// ── Data sources (canonical: docs/03_LEGAL.md §2) ───────────────────────────────

/** One upstream data source with its licence and attribution obligation. */
export interface DataSource {
  /** Source name as credited. */
  name: string;
  /** What it contributes to the dataset. */
  contribution: string;
  /** Human-readable licence name. */
  licence: string;
  /** SPDX identifier (or "publicdomain"). */
  spdx: string;
  /** Whether the licence is share-alike (copyleft). */
  shareAlike: boolean;
  /** Canonical URL for the source, when one exists. */
  url?: string;
}

/**
 * The upstream data sources, transcribed from docs/03_LEGAL.md §2 (the canonical
 * attribution surface that mirrors ATTRIBUTIONS.md). Order matches that table.
 */
export const DATA_SOURCES: readonly DataSource[] = [
  {
    name: 'Wikidata',
    contribution: 'QID backbone; structured fields (dates, capitals, rulers).',
    licence: 'CC0 1.0',
    spdx: 'CC0-1.0',
    shareAlike: false,
    url: 'https://www.wikidata.org/',
  },
  {
    name: 'PLEIADES (ISAW, NYU)',
    contribution: 'Settlement gazetteer; capital coordinates.',
    licence: 'CC BY 3.0',
    spdx: 'CC-BY-3.0',
    shareAlike: false,
    url: 'https://pleiades.stoa.org/',
  },
  {
    name: 'Cliopatria (Ourednik)',
    contribution: 'Historical polity polygon shapes.',
    licence: 'CC BY-SA 4.0',
    spdx: 'CC-BY-SA-4.0',
    shareAlike: true,
    url: 'https://github.com/aourednik/historical-basemaps',
  },
  {
    name: 'Natural Earth',
    contribution: 'Coastlines, rivers, lakes, graticule (the base map).',
    licence: 'Public domain',
    spdx: 'publicdomain',
    shareAlike: false,
    url: 'https://www.naturalearthdata.com/',
  },
  {
    name: 'OpenHistoricalMap (OHM)',
    contribution: 'Historical settlements and routes.',
    licence: 'ODbL 1.0',
    spdx: 'ODbL-1.0',
    shareAlike: true,
    url: 'https://www.openhistoricalmap.org/',
  },
];

/**
 * A compact one-line attribution string built from the canonical sources, suitable
 * for footers or about boxes. Mirrors the credits the map footer used to show, but
 * now lives in the Attribution section of this page.
 */
export const ATTRIBUTION_LINE =
  'Data: Wikidata · PLEIADES · Cliopatria · Natural Earth · OpenHistoricalMap';

// ── Licences (canonical: docs/03_LEGAL.md §1) ───────────────────────────────────

/** One project licence layer. */
export interface ProjectLicence {
  /** What the licence covers. */
  layer: string;
  /** Human-readable licence name. */
  licence: string;
  /** SPDX identifier. */
  spdx: string;
}

/**
 * The project's two-licence split, transcribed from docs/03_LEGAL.md §1.
 * Both permit research, study and personal use; commercial use needs written
 * permission from Gavin Lanza.
 */
export const PROJECT_LICENCES: readonly ProjectLicence[] = [
  {
    layer: 'Software (app code, scripts, styles, docs)',
    licence: 'PolyForm Noncommercial License 1.0.0',
    spdx: 'LicenseRef-PolyForm-Noncommercial-1.0.0',
  },
  {
    layer: 'Data (curation, schema, aggregation of the dataset)',
    licence: 'Creative Commons Attribution-NonCommercial 4.0 International',
    spdx: 'CC-BY-NC-4.0',
  },
];

/** Contact for commercial-use permission (docs/03 §1). */
export const COMMERCIAL_CONTACT = 'lanzagavin@gmail.com';

/**
 * The research-integrity note shown beside the sources, summarising the
 * no-fabrication + citation rules from docs/03_LEGAL.md §5–§6.
 */
export const RESEARCH_INTEGRITY_NOTE =
  'This is a research tool: every fact shown traces to a real source record via its ' +
  'provenance. No date, ruler, border or narrative is invented. Wikipedia is used only ' +
  'as a finding aid — citations point to the underlying scholarly source, and a claim ' +
  'that could not be verified there is marked as weakly attested. Scholarly disagreements ' +
  'are shown honestly rather than smoothed over.';
