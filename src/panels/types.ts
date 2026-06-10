/**
 * src/panels/types.ts — shared type contracts for the record-panels subsystem.
 *
 * These types are internal to src/panels/ and must not be imported by any other
 * subsystem (stores, map, components outside panels). Consumers of selection state
 * use selectionStore; consumers of raw records use loaders.ts.
 *
 * Phase 3 — record-panels agent.
 */

import type { RawRecord } from '@/data/loaders';
import { kindOfId } from '@/data/loaders';
import type { RecordType } from '@/types/record';
import { statusRootLabel } from '@/panels/statusRoots';

// ── Provenance display shape ──────────────────────────────────────────────────

/**
 * Normalised provenance fields extracted from a RawRecord for display.
 * All fields are strings safe for direct rendering — absent values become "—".
 */
export interface ProvenanceDisplay {
  /** Human-readable status label, e.g. "Draft" or "Reviewed". */
  statusLabel: string;
  /** CSS class modifier for the status chip, e.g. "draft" | "reviewed". */
  statusMod: string;
  /** Confidence level string, e.g. "Low" or "High". */
  confidenceLabel: string;
  /** Number of source ids in sources_used, as a display string, e.g. "3 sources". */
  sourcesLabel: string;
}

// ── Card rendering context ────────────────────────────────────────────────────

/**
 * Props shared by all per-type card components rendered inside EntityDock.
 * Each card receives the raw record (already validated to exist) and a
 * navigation callback for relationship link clicks.
 */
export interface CardProps {
  /** The raw record to render. Fields are read directly — never fabricated. */
  record: RawRecord;
  /**
   * Navigate to another record by calling selectionStore.select().
   * Cards use this for relationship participant links, polity refs, etc.
   */
  onNavigate: (id: string, type: string) => void;
}

// ── Kind → RecordType inference ───────────────────────────────────────────────

/**
 * All record types accepted by loadRecords().
 * Used for best-effort type inference when navigating to a linked record.
 * Updated Wave 3 (settlement, military, capital).
 */
export const MEDIEVAL_KINDS: ReadonlySet<RecordType> = new Set<RecordType>([
  'polity', 'event', 'journey', 'relationship', 'ruler',
  'source', 'institution', 'technology', 'text',
  // Wave 3 / Phase C
  'settlement', 'military', 'capital',
  // Wave 6 / research-first layer — cardForKind maps these; without them
  // findRecord() rejects the kind and the dock shows "Record not found".
  'claim', 'annotation', 'research_question',
]);

/**
 * Resolve a RecordType string from an id, used when a record references another
 * by id but does not name its kind (e.g. an event's participant id).
 *
 * Resolves against the actually-loaded records via the loader's id→kind index
 * (O(1), polity-precedence on collisions). The baked ids carry no kind prefix, so
 * the old prefix heuristic was wrong for almost every real id — this is data-driven.
 * Falls back to 'polity' only for ids absent from the index (the most common kind
 * and the one relationship/event participants reference).
 */
export function inferKindFromId(id: string): string {
  return kindOfId(id) ?? 'polity';
}

/**
 * Extract a normalised ProvenanceDisplay from a RawRecord.
 * Reads provenance.status, provenance.confidence, and provenance.sources_used.
 * All missing fields render as "—" rather than being fabricated.
 */
export function extractProvenance(record: RawRecord): ProvenanceDisplay {
  const prov = record.provenance as Record<string, unknown> | undefined;

  const rawStatus = typeof prov?.status === 'string' ? prov.status : '';
  // Display the etymological-root form of the status word (e.g. draft → dragan).
  // statusMod keeps the RAW value so CSS classes + logic comparisons are unaffected.
  const rootStatus = statusRootLabel(rawStatus);
  const statusLabel = rootStatus
    ? rootStatus.charAt(0).toUpperCase() + rootStatus.slice(1)
    : '—';
  const statusMod = rawStatus || 'unknown';

  const rawConf = typeof prov?.confidence === 'string' ? prov.confidence : '';
  const confidenceLabel = rawConf
    ? rawConf.charAt(0).toUpperCase() + rawConf.slice(1)
    : '—';

  const rawSources = prov?.sources_used;
  const sourceCount = Array.isArray(rawSources) ? rawSources.length : 0;
  const sourcesLabel = sourceCount === 1 ? '1 source' : `${sourceCount} sources`;

  return { statusLabel, statusMod, confidenceLabel, sourcesLabel };
}

/**
 * Format a latitude/longitude pair into an honest, hemisphere-aware display
 * string, e.g. `19.4326°N, 99.1332°W`.
 *
 * REALNESS law: hemisphere suffixes are DERIVED from the sign of each value —
 * never hardcoded. A negative latitude renders `°S`, a negative longitude `°W`.
 * Hardcoding `°N, °E` (the previous behaviour) fabricated the location of every
 * southern/western record; this helper removes that entire class of error.
 *
 * @param lat - Latitude in decimal degrees (negative = southern hemisphere).
 * @param lon - Longitude in decimal degrees (negative = western hemisphere).
 * @param digits - Fixed decimal places for each component (default 2).
 * @returns A formatted coordinate string, or "—" when either value is invalid.
 */
export function fmtLatLon(lat: unknown, lon: unknown, digits = 2): string {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '—';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}°${latDir}, ${Math.abs(lon).toFixed(digits)}°${lonDir}`;
}

/**
 * Format a coordinate pair stored in `[lat, lon]` order (the convention used by
 * polity centroids, event coords, journey waypoints, and language records).
 *
 * @param coords - A `[lat, lon]` tuple from a record. Any other shape → "—".
 * @param digits - Fixed decimal places for each component (default 2).
 * @returns A hemisphere-aware coordinate string, or "—" when absent/invalid.
 */
export function fmtCoordsLatLon(coords: unknown, digits = 2): string {
  if (!Array.isArray(coords) || coords.length < 2) return '—';
  return fmtLatLon(coords[0], coords[1], digits);
}

/**
 * Format a coordinate pair stored in GeoJSON `[lon, lat]` order (the convention
 * used by capital / settlement / military records derived from GeoJSON Points).
 *
 * @param coords - A `[lon, lat]` tuple from a record. Any other shape → "—".
 * @param digits - Fixed decimal places for each component (default 4).
 * @returns A hemisphere-aware coordinate string, or "—" when absent/invalid.
 */
export function fmtCoordsLonLat(coords: unknown, digits = 4): string {
  if (!Array.isArray(coords) || coords.length < 2) return '—';
  return fmtLatLon(coords[1], coords[0], digits);
}

/**
 * Coerce an unknown field value to a display string.
 * Arrays are joined with ", "; objects stringify to JSON; missing → "—".
 */
export function fieldStr(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string')  return val;
  if (typeof val === 'number')  return String(val);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) {
    const parts = val.map((v) =>
      typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v),
    );
    return parts.join(', ') || '—';
  }
  return JSON.stringify(val);
}
