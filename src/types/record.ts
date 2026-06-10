/**
 * record.ts — THE DATA MODEL CONTRACT (reconciled with the Atlas data dictionary,
 * artboard 29). Field names match the published dictionary verbatim so the design
 * package, the data, and the code all agree. Change only via a logged migration.
 *
 * Reconciled against donor schema on 2026-05-27.
 * Changes in this revision:
 *   - Polity.type widened to the full 21-value entity controlled vocabulary
 *     from docs/schema.md (added khanate, principality, county, city_state,
 *     tribal_confederation, nomadic_polity, league, military_order_state,
 *     crusader_state, dynasty, sultanate, chiefdom, city_state_federation,
 *     polity, military_order; removed non-canonical `emirate` and `khaganate`
 *     which do not appear in schema.md — kept as string union safety valve).
 *   - Relationship widened: kept from_id/to_id; added optional participants[],
 *     directed, and active_periods to match real relationship data shape.
 *   - AtlasEvent.category made optional (it is derived via SUBTYPE_TO_CATEGORY,
 *     not stored in raw JSON files). AtlasEvent.coords made optional (raw event
 *     records lack coords; they are enriched by the map layer builder).
 *   - Provenance.confidence now accepts 'moderate' as a synonym for 'medium'
 *     (donor schema uses 'high'|'moderate'|'low'|'unknown'; contract also keeps
 *     'medium' for back-compat). sources_used kept as string[].
 *   - Ruler: TSDoc note added — Ruler records derive from data/people whose
 *     roles[] array includes 'ruler'.
 *
 * Six core record types ship with the design (polity, event, journey, relationship,
 * ruler, source). Three expansion types (institution, technology, text) extend the
 * same shape — "room for agents to adapt and expand."
 *
 * Folder map (data/<folder>): polity→entities, event→events, journey→journeys,
 * relationship→relationships, ruler→rulers, source→sources, institution→institutions,
 * technology→technologies, text→texts.
 */

export type RecordType =
  | 'polity' | 'event' | 'journey' | 'relationship' | 'ruler' | 'source' // 6 core (shipped)
  | 'institution' | 'technology' | 'text' // 3 expansion
  | 'settlement' | 'military' | 'capital' // Wave 3 / Phase C — geo-escalated kinds
  | 'claim' | 'annotation' | 'research_question'; // Wave 6 / research-first layer (Competitive Audit §4B)

export type Year = number; // negative = BCE if the window ever widens past 500–1500

/**
 * Attestation strength of the underlying evidence (Wave 2 / B.3, additive).
 * `strong` = verified in a cited scholarly source; `weak` = claim found only via a
 * finding aid (e.g. Wikipedia) and NOT verified in the underlying source (docs/03 §5);
 * `inferred` = derived/computed, not directly attested. Optional — absent means unset.
 */
export type Attestation = 'strong' | 'weak' | 'inferred';

/**
 * A scholarly dispute on a single field (Wave 2 / B.3, additive). Surfaces
 * disagreement honestly rather than smoothing it over (docs/03 §6). Each position
 * cites the source ids that support it.
 */
export interface Dispute {
  field: string;                                  // the disputed field, e.g. "decline_factors"
  summary: string;                                // one-line description of the debate
  positions: { claim: string; sources: string[] }[];
}

/** Provenance — required on every record. No claim without a source. */
export interface Provenance {
  reviewers?: string[];
  date_reviewed?: string;
  status: 'reviewed' | 'community' | 'disputed' | 'draft';
  sources_used: string[]; // ids of `source` records
  /**
   * Confidence level. Accepts both the original contract values ('high'|'medium'|'low')
   * and the donor schema values ('high'|'moderate'|'low'|'unknown').
   * 'moderate' and 'medium' are treated as synonyms by all consumers.
   */
  confidence?: 'high' | 'medium' | 'moderate' | 'low' | 'unknown';
  /** B.3 (additive): evidence strength — see Attestation. Optional. */
  attestation?: Attestation;
  /**
   * B.3 (additive): scholarly disagreements on specific fields, shown to the user
   * (never smoothed over — docs/03 §6). Optional; absent = no recorded dispute.
   */
  disputes?: Dispute[];
  /**
   * B.3 (additive): stable external identifiers for re-verification against upstream
   * sources (e.g. { wikidata: 'Q...', pleiades: '...', viaf: '...' }). Optional.
   */
  external_ids?: Record<string, string>;
}

/* ----------------------------- core types ----------------------------- */

/**
 * polity — /data/entities/<slug>.json (15 fields, 9 required).
 *
 * Polity.type is the full controlled vocabulary from docs/schema.md §Entity types.
 */
export interface Polity {
  id: string;                 // snake_case slug, permanent — e.g. "carolingian_empire"
  name_primary: string;       // canonical English form
  name_variants?: string[];   // ["Imperium Romanum"]
  /**
   * Entity type — controlled vocabulary (21 values from docs/schema.md).
   * String fallback is kept so loaders do not hard-fail on future extensions.
   */
  type:
    | 'empire'
    | 'kingdom'
    | 'caliphate'
    | 'khanate'
    | 'duchy'
    | 'principality'
    | 'county'
    | 'city_state'
    | 'republic'
    | 'theocracy'
    | 'tribal_confederation'
    | 'nomadic_polity'
    | 'league'
    | 'military_order_state'
    | 'crusader_state'
    | 'dynasty'
    | 'sultanate'
    | 'chiefdom'
    | 'city_state_federation'
    | 'polity'
    | 'military_order'
    | (string & {}); // extensible — prevents hard failure on unlisted types
  region: keyof typeof import('../design/tokens')['REGION_COLORS'] | string;
  monogram?: string;          // "CA" — for the crest
  formed: Year;
  dissolved: Year;
  capital_history: { name: string; from: Year; to: Year; lat: number; lon: number }[];
  polygon_snapshots: { year: Year; polygon: [number, number][] }[]; // [lat, lon]; interpolated between
  centroid?: [number, number];
  religion?: string;
  ethnicity?: string;
  languages?: string[];
  population_estimates?: { year: Year; low?: number; mid: number; high?: number; source?: string }[];
  tags?: string[];

  /**
   * ── Recovered research-depth fields (entity-depth recovery, 2026-05-31) ──
   * These were present in the original donor entities but dropped by a prior
   * migration; recovered from the archived quarry by scripts/ingest/recover-entity-depth.mjs.
   * ALL are OPTIONAL and populated ONLY from real donor data — an entity missing
   * a field in the donor stays without it (no fabrication, honest-empty). They
   * back the inspector's research tabs + charts (Demographics / Economy / Lifecycle /
   * causal factors / composition breakdowns).
   */
  /** Free-text scholarly summary of the polity. */
  description?: string;
  /** Donor temporal block (founding/dissolution context); shape preserved as-is. */
  temporal?: Record<string, unknown>;
  /** Donor geographic block (extent/core regions); shape preserved as-is. */
  geographic?: Record<string, unknown>;
  /** Governance shape: type, legitimacy basis, centralization. */
  internal_structure?: {
    governance_type?: string;
    legitimacy_basis?: string[];
    centralization?: string;
    [k: string]: unknown;
  };
  /** Rise/peak/decline phases with year spans + descriptions (LifecycleTimeline). */
  lifecycle_phases?: { phase: string; years?: string; description?: string; sources?: unknown[] }[];
  /** Tagged, layered causal drivers of the polity's rise (FactorBalance/Flow). */
  rise_factors?: { tag: string; layer?: string; description?: string; sources?: unknown[] }[];
  /** Tagged, layered causal drivers of the polity's decline. */
  decline_factors?: { tag: string; layer?: string; description?: string; sources?: unknown[] }[];
  /** Notable people associated with the polity (rulers, scholars, generals). */
  key_figures?: { name: string; role?: string; years?: string; year_start?: number; year_end?: number; sources?: unknown[] }[];
  /** Ids of predecessor polities (lineage). */
  predecessor_entity_ids?: string[];
  /** Ids of successor polities (lineage). */
  successor_entity_ids?: string[];
  /** Dominant ethnicity id. */
  primary_ethnicity?: string;
  /** Ethnic make-up as proportions (CompositionBar / Demographics). */
  ethnic_composition?: { group: string; proportion: number }[];
  /** Religious make-up as proportions. */
  religion_composition?: { religion: string; proportion: number }[];
  /** Dominant language id. */
  primary_language?: string;
  /** Language make-up as proportions + role (vernacular/regional/liturgical…). */
  language_composition?: { language: string; proportion: number; role?: string }[];
  /** Economic profile: base(s), wealth level, exports/imports (EconomicSummary). */
  economic?: {
    primary_base?: string;
    secondary_bases?: string[];
    wealth_level?: string;
    major_exports?: string[];
    major_imports?: string[];
    [k: string]: unknown;
  };
  /** Social stratification: ruling/subject/military groups, admin language. */
  social_structure?: {
    ruling_ethnicity?: string;
    subject_majority?: string;
    military_ethnicity?: string;
    administrative_language?: string;
    stratification_type?: string;
    [k: string]: unknown;
  };
  /** Wikidata enrichment block (QIDs, statements) preserved as-is for provenance. */
  wikidata_enrichment?: Record<string, unknown>;
  /** Bibliographic source references attached to the entity (citations). */
  sources?: unknown[];

  provenance: Provenance;
}

/**
 * event — /data/events/<slug>.json (9 fields, 8 required).
 *
 * category is optional/derivable: raw event JSON does not store it.
 * Derive it at runtime via SUBTYPE_TO_CATEGORY[event.type] from design/tokens.ts.
 *
 * coords is optional: raw event records lack coordinates; they are added by
 * the map layer builder (src/map/MapLayers.ts) during feature construction.
 */
export interface AtlasEvent {
  id: string;
  name: string;
  year: Year;
  type: string;       // 33 types in eventColors.ts + schema.md vocab
  /** Derived from type via SUBTYPE_TO_CATEGORY; not stored in raw data. */
  category?: import('../design/tokens').EventCategory;
  /** Added by map layer builder; absent in raw JSON. */
  coords?: [number, number]; // [lat, lon]
  entity: string;     // owning polity id
  summary: string;    // 1–3 sentences
  outcomes?: string[];
  provenance?: Provenance;
}

/** journey — /data/journeys/<slug>.json (6 fields, all required). */
export interface Journey {
  id: string;
  name: string;
  kind: 'conquest' | 'individual_journey' | 'migration' | 'spread';
  year_start: Year;
  year_end: Year;
  waypoints: [number, number, string][]; // [lat, lon, label]
  provenance?: Provenance;
}

/**
 * relationship — /data/relationships/<slug>.json. Typed tie between polities.
 *
 * from_id/to_id are kept for back-compat with all existing consumers.
 * The real data shape (docs/schema.md) uses participants[] + directed.
 * Both shapes are valid; loaders should prefer participants[] for new records.
 */
export interface Relationship {
  id: string;
  /** Legacy dyadic shape — kept for back-compat. */
  from_id?: string;
  /** Legacy dyadic shape — kept for back-compat. */
  to_id?: string;
  /**
   * Real data shape (schema.md §Relationship). Each participant carries a role
   * label, which is asymmetric for directed types:
   *   vassalage:  suzerain / vassal
   *   tributary:  hegemon / tributary
   *   succession: predecessor / successor
   *   fragmentation: parent / fragment
   */
  participants?: { entity_id: string; role: string }[];
  /** Whether the relationship is directional (from_id → to_id or participants[0] → participants[1]). */
  directed?: boolean;
  /**
   * Active sub-periods within the overall temporal range, as [start_year, end_year] pairs.
   * Matches schema.md `temporal.active_periods`.
   */
  active_periods?: [number, number][];
  type: keyof typeof import('../design/tokens')['RELATIONSHIP_TYPES'] | string;
  since?: Year;
  until?: Year | null;
  note?: string;
  provenance?: Provenance;
}

/**
 * ruler — /data/rulers/<slug>.json. Sits inside a polity's lineage.
 *
 * NOTE: In the real dataset, ruler records are modelled as Person records
 * (data/people/) whose roles[] array includes 'ruler'. The Ruler interface
 * here is a flattened projection used by the UI layer; the data loader
 * materialises it from the Person shape. Person roles include:
 * ruler | military_leader | religious_authority | institutional_reformer |
 * administrator | dynastic_founder | claimant.
 */
export interface Ruler {
  id: string;
  name: string;
  polity: string;          // polity id
  title?: string;          // king | emperor | caliph | mayor ...
  reign_start: Year;
  reign_end: Year;
  succeeds?: string;       // prior ruler id (for the lineage DAG)
  provenance?: Provenance;
}

/** source — /data/sources/<slug>.json (10 fields). Backs everything. */
export interface Source {
  id: string;
  title: string;
  author?: string;
  year?: Year;
  kind: 'primary' | 'monograph' | 'biography' | 'survey' | 'edited' | 'popular' | 'dataset';
  status: 'reviewed' | 'draft';
  url?: string;
  license?: string;        // SPDX id — REQUIRED for datasets (docs/03_LEGAL.md)
  covers?: { polities?: number; events?: number };
  citations?: number;
}

/* --------------------------- expansion types --------------------------- */

export interface Institution {
  id: string; name_primary: string; name_variants?: string[];
  domain?: 'religious' | 'administrative' | 'educational' | 'legal' | 'economic';
  formed: Year; dissolved?: Year | null;
  seat_history?: { place: string; from: Year; to: Year }[];
  provenance: Provenance;
}

export interface Technology {
  id: string; name_primary: string;
  domain?: 'military' | 'agricultural' | 'maritime' | 'metallurgy' | 'writing' | 'other';
  origin?: { place?: string; year?: Year };
  materials?: string[];           // e.g. ['crucible steel', 'tin trade'] — historical detail, not survey
  diffusion?: string[];           // event/relationship ids carrying the spread
  provenance: Provenance;
}

export interface AtlasText {
  id: string; name_primary: string; author?: string; language?: string;
  composed?: { place?: string; year?: Year };
  tradition?: string; influence?: string[];
  provenance: Provenance;
}

/* ------------------- Wave 3 / Phase C geo-escalated kinds ------------------- */

/**
 * settlement — /data/settlements/<slug>.json
 * Escalated from settlements.geojson map layer to a first-class typed record.
 * Real fields derived from the donor GeoJSON feature properties.
 */
export interface Settlement {
  id: string;
  name: string;
  /** Importance tier from donor schema: megacity | city | town | village. */
  importance: 'megacity' | 'city' | 'town' | 'village' | string;
  start_year: number;
  end_year: number | null;
  /** Donor end_confidence field when present ('high' | 'low' etc). */
  end_confidence?: string;
  /** Geometry coords [lon, lat] from GeoJSON Point. */
  coords: [number, number];
  provenance: Provenance;
}

/**
 * military — /data/military/<slug>.json
 * Escalated from military.geojson map layer to a first-class typed record.
 */
export interface MilitarySite {
  id: string;
  name: string;
  /** Subtype from donor schema: fort | castle | battlefield | etc. */
  subtype: string;
  start_year: number;
  end_year: number | null;
  description?: string;
  /** Geometry coords [lon, lat] from GeoJSON Point. */
  coords: [number, number];
  provenance: Provenance;
}

/**
 * capital — /data/capitals/<slug>.json
 * Escalated from capitals.geojson map layer to a first-class typed record.
 */
export interface Capital {
  id: string;
  name: string;
  /** The polity this was a capital of (maps donor entity_id). */
  entity_id: string;
  /** Human-readable polity name (donor entity_name). */
  entity_name: string;
  start_year: number;
  end_year: number | null;
  /** Geometry coords [lon, lat] from GeoJSON Point. */
  coords: [number, number];
  provenance: Provenance;
}

/* ---------------- Wave 6 / research-first layer (Competitive Audit §4B) ----------------
 *
 * Three additive record types that make InvaderGIS RESEARCH-FIRST: the connected
 * chain Source → Claim → Evidence → Entity → Relationship → Timeline → Map →
 * Research Question. All three reuse the frozen
 * Provenance shape — every claim still carries its sources. These
 * are additive: no existing interface changes. Data folders start EMPTY and are
 * populated only with real, sourced records — no fabrication (honest-empty until
 * authored or migrated from existing provenance/disputes).
 */

/**
 * claim — /data/claims/<slug>.json. A discrete, falsifiable historical assertion
 * ("Polity X held territory Y in 1066"). Makes Source → Claim → Evidence
 * first-class instead of implicit inside a record's prose. A claim is the
 * upgrade target for the `attestation: 'inferred'` provenance backfilled in
 * Priority 1: once a specific assertion is verified against a real source, it
 * becomes a `claim` with `attestation: 'strong'`.
 */
export interface Claim {
  id: string;                        // snake_case slug, permanent
  /** The assertion in one falsifiable sentence. */
  statement: string;
  /** Record ids this claim is about (polity/event/ruler/relationship/...). */
  subject_ids: string[];
  /** Optional predicate/qualifier vocabulary, e.g. "held", "succeeded", "allied_with". */
  predicate?: string;
  /** Optional object record ids (for relational claims: subject —predicate→ object). */
  object_ids?: string[];
  /** Temporal scope of the assertion, when bounded. */
  period?: { from?: Year; to?: Year };
  /**
   * Optional id of the seed record this claim was derived from (e.g. a
   * relationship, journey, or event). Traceability for machine-generated claims;
   * absent for hand-authored ones.
   */
  derived_from?: string;
  /**
   * Source ids that were cited by the seed record but do NOT yet resolve to a
   * `source` record in the library (so they cannot render as a readable
   * citation). Flagged honestly here rather than shown as a bare-slug footnote
   * Targets for a later source-recovery pass. Absent = all cited
   * sources resolved.
   */
  unresolved_sources?: string[];
  /**
   * Provenance carries sources_used, confidence, attestation, and (crucially)
   * disputes[] — a claim is the natural home for competing sourced positions.
   */
  provenance: Provenance;
}

/**
 * annotation — /data/annotations/<slug>.json. Recogito's strength: a passage
 * anchor inside a `source` or `text`, linked to the entities / places / claims
 * it attests. We have source + text records but no passage layer; this adds it,
 * wired straight into our entities, map, timeline, and provenance.
 */
export interface Annotation {
  id: string;                        // snake_case slug, permanent
  /** The source or text record this annotation anchors into. */
  target_id: string;                 // id of a `source` or `text` record
  target_kind?: 'source' | 'text';
  /** Where in the target: a quote, a locator, or a character range. */
  anchor: {
    quote?: string;                  // the cited passage text
    locator?: string;                // e.g. "book 3, ch. 12" / page / folio
    range?: [number, number];        // optional char offsets within the target text
  };
  /** Free-text annotator note / interpretation. */
  body?: string;
  /** Entities / places / events this passage references (entity linking). */
  links_to?: string[];               // record ids
  /** Claims this passage supports as evidence. */
  supports_claims?: string[];        // claim ids
  /** Free tags (named-entity types, themes). */
  tags?: string[];
  provenance: Provenance;
}

/**
 * research_question — /data/research_questions/<slug>.json. The workspace the
 * user STARTS from (the differentiator no competitor occupies). Binds the
 * entities, sources, claims, relationships, timeline, and geography assembled
 * to answer a historical inquiry.
 */
export interface ResearchQuestion {
  id: string;                        // snake_case slug, permanent
  /** The question, in the researcher's own words. */
  question: string;
  /** Optional longer framing / scope of the inquiry. */
  description?: string;
  /** Temporal / spatial scope of the inquiry, when bounded. */
  scope?: { from?: Year; to?: Year; regions?: string[] };
  /** The evidence chain assembled for this question. */
  evidence?: {
    entity_ids?: string[];
    claim_ids?: string[];
    source_ids?: string[];
    relationship_ids?: string[];
    event_ids?: string[];
    annotation_ids?: string[];
  };
  /** Working status of the inquiry. */
  status?: 'open' | 'in_progress' | 'answered' | 'abandoned';
  /** The current synthesized answer (sourced via provenance). */
  findings?: string;
  provenance: Provenance;
}

export type AtlasRecord =
  | Polity | AtlasEvent | Journey | Relationship | Ruler | Source
  | Institution | Technology | AtlasText
  | Settlement | MilitarySite | Capital
  | Claim | Annotation | ResearchQuestion; // Wave 6 / research-first layer

export const ATLAS_WINDOW = { start: 500, end: 1500 } as const;

/** type → data folder. Used by loaders, migration, and validation. */
export const TYPE_DIR: Record<RecordType, string> = {
  polity: 'entities', event: 'events', journey: 'journeys', relationship: 'relationships',
  ruler: 'rulers', source: 'sources', institution: 'institutions',
  technology: 'technologies', text: 'texts',
  // Wave 3 / Phase C additions
  settlement: 'settlements', military: 'military', capital: 'capitals',
  // Wave 6 / research-first layer additions
  claim: 'claims', annotation: 'annotations', research_question: 'research_questions',
};
