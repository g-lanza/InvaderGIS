/**
 * importParse.ts — boundary parser for user-uploaded GeoJSON and CSV files.
 *
 * Turns raw file text into our generalized model: a list of `UserRecord`
 * (EntityRecord<UserPayload>, kind:'user') plus the detected property keys and a
 * suggested name/time field. The result feeds the ImportDialog preview and, on
 * "Add to map", becomes a persisted `UserDataset`.
 *
 * ── Validation at the boundary (coding-style.md: never trust external data) ─────
 * Every entry point validates structure manually and FAILS FAST with a clear,
 * user-facing message — it never throws an unhandled error or produces a
 * half-broken dataset. Malformed input yields a `ParseResult` with `ok:false`
 * and an `error` string the dialog can show verbatim.
 *
 * ── GeoJSON ─────────────────────────────────────────────────────────────────────
 * Accepts a FeatureCollection. Each feature's geometry is reduced to a single
 * representative [lat, lon] coordinate (Point → itself; Line/Polygon → first
 * vertex; Multi* → first sub-geometry's first vertex). Features without a usable
 * coordinate are skipped and counted (honest: reported in the result, not hidden).
 *
 * ── CSV ─────────────────────────────────────────────────────────────────────────
 * A minimal, dependency-free RFC-4180-ish reader (quoted fields, embedded commas
 * and newlines, doubled-quote escapes). The first row is the header. The parser
 * auto-detects latitude/longitude columns by common header names; the user can
 * override in the dialog (future). Rows with non-finite lat/lon are skipped+counted.
 *
 * Phase: Wave2-A (additive — no frozen stores/types touched).
 */

import type { SpatialRef, TemporalRef } from '@/types/dataset';
import type { UserPayload, UserRecord } from './types';

// ── Result envelope ─────────────────────────────────────────────────────────────

/** Successful parse: records + detected metadata for the dialog preview. */
export interface ParseSuccess {
  ok: true;
  /** The parsed records (kind:'user'), ready to render. */
  records: UserRecord[];
  /** All property keys observed across the source, in first-seen order. */
  propertyKeys: string[];
  /** Suggested name field (best-guess) or null if none could be inferred. */
  suggestedNameField: string | null;
  /** Suggested time field (best-guess) or null. */
  suggestedTimeField: string | null;
  /** Source format that produced these records. */
  format: 'geojson' | 'csv';
  /** Count of source features/rows skipped for lacking a usable coordinate. */
  skipped: number;
}

/** Failed parse: a clear, user-facing reason. */
export interface ParseFailure {
  ok: false;
  /** Human-readable error to show in the dialog (never a raw stack). */
  error: string;
}

/** Discriminated parse outcome. */
export type ParseResult = ParseSuccess | ParseFailure;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Header names commonly used for latitude, lowercased. */
const LAT_KEYS = ['lat', 'latitude', 'y', 'lat_dd', 'lattitude'];
/** Header names commonly used for longitude, lowercased. */
const LON_KEYS = ['lon', 'lng', 'long', 'longitude', 'x', 'lon_dd'];
/** Header names commonly used for a display name, lowercased (preference order). */
const NAME_KEYS = ['name', 'title', 'label', 'place', 'site', 'id'];
/** Header names commonly used for a year/time, lowercased (preference order). */
const TIME_KEYS = ['year', 'date', 'time', 'when', 'start', 'start_year'];

/** Hard cap on parsed records to keep IndexedDB writes and map paint bounded. */
const MAX_RECORDS = 50_000;

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Coerce an arbitrary value to a finite number, or null. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Coerce a value to an integer year. Accepts a bare number, a numeric string,
 * or a leading 4-digit year inside a date string ("1066-10-14" → 1066).
 * Returns null when no plausible year is present.
 */
function toYear(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n !== null) return Math.trunc(n);
  if (typeof value === 'string') {
    const m = value.match(/-?\d{1,4}/);
    if (m) {
      const y = Number(m[0]);
      if (Number.isFinite(y)) return Math.trunc(y);
    }
  }
  return null;
}

/** Pick the first key (case-insensitive) present in `keys` from `candidates`. */
function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k] as const));
  for (const c of candidates) {
    const hit = lower.get(c);
    if (hit !== undefined) return hit;
  }
  return null;
}

/** Build a temporal ref from a chosen year, or undefined when absent. */
function temporalForYear(year: number | null): TemporalRef | undefined {
  return year === null ? undefined : { shape: 'instant', year };
}

// ── GeoJSON parsing ───────────────────────────────────────────────────────────

/** A loose GeoJSON geometry shape — narrowed at runtime. */
interface LooseGeometry {
  type?: unknown;
  coordinates?: unknown;
  geometries?: unknown;
}

/**
 * Reduce any GeoJSON geometry to one representative [lon, lat] pair (GeoJSON
 * coordinate order). Returns null when no coordinate can be found.
 */
function representativeLonLat(geom: LooseGeometry | null | undefined): [number, number] | null {
  if (!geom || typeof geom !== 'object') return null;
  const { type, coordinates } = geom;

  // Descend coordinate arrays until we reach a [number, number] pair.
  const firstPair = (coords: unknown): [number, number] | null => {
    if (!Array.isArray(coords)) return null;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return [coords[0], coords[1]];
    }
    for (const c of coords) {
      const found = firstPair(c);
      if (found) return found;
    }
    return null;
  };

  if (type === 'GeometryCollection') {
    const geoms = (geom as { geometries?: unknown }).geometries;
    if (Array.isArray(geoms)) {
      for (const g of geoms) {
        const found = representativeLonLat(g as LooseGeometry);
        if (found) return found;
      }
    }
    return null;
  }
  return firstPair(coordinates);
}

/** Parse GeoJSON text into a ParseResult. */
function parseGeoJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON. Check for a syntax error.' };
  }
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'GeoJSON root must be an object.' };
  }
  const fc = json as { type?: unknown; features?: unknown };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return {
      ok: false,
      error: 'Expected a GeoJSON FeatureCollection with a "features" array.',
    };
  }
  if (fc.features.length === 0) {
    return { ok: false, error: 'FeatureCollection has no features.' };
  }

  const records: UserRecord[] = [];
  const keySet = new Set<string>();
  let skipped = 0;

  for (let i = 0; i < fc.features.length && records.length < MAX_RECORDS; i += 1) {
    const feat = fc.features[i] as {
      geometry?: LooseGeometry | null;
      properties?: unknown;
      id?: unknown;
    };
    const lonLat = representativeLonLat(feat.geometry);
    if (!lonLat) {
      skipped += 1;
      continue;
    }
    const props: UserPayload =
      feat.properties && typeof feat.properties === 'object'
        ? (feat.properties as UserPayload)
        : {};
    for (const k of Object.keys(props)) keySet.add(k);

    const id =
      typeof feat.id === 'string' || typeof feat.id === 'number'
        ? String(feat.id)
        : `feature-${i}`;

    const spatial: SpatialRef = { shape: 'point', coords: [lonLat[1], lonLat[0]] };
    records.push({
      id,
      kind: 'user',
      name: `Feature ${i + 1}`,
      spatial,
      payload: props,
    });
  }

  if (records.length === 0) {
    return {
      ok: false,
      error: 'No features had a usable coordinate. Every feature lacked geometry.',
    };
  }

  const propertyKeys = [...keySet];
  return {
    ok: true,
    records,
    propertyKeys,
    suggestedNameField: pickKey(propertyKeys, NAME_KEYS),
    suggestedTimeField: pickKey(propertyKeys, TIME_KEYS),
    format: 'geojson',
    skipped,
  };
}

// ── CSV parsing ─────────────────────────────────────────────────────────────────

/**
 * Tokenize CSV text into a matrix of string cells. Handles quoted fields with
 * embedded commas, newlines, and doubled-quote escapes ("" → "). Trailing blank
 * lines are ignored. This is intentionally small and dependency-free.
 */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Normalize CRLF/CR to LF so newline handling is uniform.
  const s = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Flush the final field/row if any content remains.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows (e.g. a trailing newline).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Parse CSV text into a ParseResult. */
function parseCsv(text: string): ParseResult {
  const matrix = tokenizeCsv(text);
  if (matrix.length < 2) {
    return {
      ok: false,
      error: 'CSV needs a header row and at least one data row.',
    };
  }
  const header = matrix[0].map((h) => h.trim());
  if (header.some((h) => h === '')) {
    return { ok: false, error: 'CSV header has an empty column name.' };
  }
  const latKey = pickKey(header, LAT_KEYS);
  const lonKey = pickKey(header, LON_KEYS);
  if (!latKey || !lonKey) {
    return {
      ok: false,
      error:
        'CSV must include latitude and longitude columns ' +
        '(e.g. "lat"/"lon", "latitude"/"longitude").',
    };
  }
  const latIdx = header.indexOf(latKey);
  const lonIdx = header.indexOf(lonKey);

  const records: UserRecord[] = [];
  let skipped = 0;

  for (let r = 1; r < matrix.length && records.length < MAX_RECORDS; r += 1) {
    const cells = matrix[r];
    const lat = toFiniteNumber(cells[latIdx]);
    const lon = toFiniteNumber(cells[lonIdx]);
    if (lat === null || lon === null) {
      skipped += 1;
      continue;
    }
    // Build a payload from every column except the recognized lat/lon columns.
    const payload: UserPayload = {};
    for (let c = 0; c < header.length; c += 1) {
      if (c === latIdx || c === lonIdx) continue;
      payload[header[c]] = cells[c] ?? '';
    }
    const spatial: SpatialRef = { shape: 'point', coords: [lat, lon] };
    records.push({
      id: `row-${r}`,
      kind: 'user',
      name: `Row ${r}`,
      spatial,
      payload,
    });
  }

  if (records.length === 0) {
    return {
      ok: false,
      error: 'No rows had a valid numeric latitude and longitude.',
    };
  }

  // Property keys are the non-coordinate columns (the payload keys).
  const propertyKeys = header.filter((_, c) => c !== latIdx && c !== lonIdx);
  return {
    ok: true,
    records,
    propertyKeys,
    suggestedNameField: pickKey(propertyKeys, NAME_KEYS),
    suggestedTimeField: pickKey(propertyKeys, TIME_KEYS),
    format: 'csv',
    skipped,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Parse uploaded file text into a `ParseResult`, dispatching on filename
 * extension (`.csv` → CSV, otherwise GeoJSON). Never throws: malformed input
 * resolves to `{ ok:false, error }`.
 *
 * @param text     - Raw file contents.
 * @param fileName - Original filename, used to choose the parser.
 */
export function parseUpload(text: string, fileName: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'File is empty.' };
  }
  const isCsv = /\.csv$/i.test(fileName);
  try {
    return isCsv ? parseCsv(text) : parseGeoJson(text);
  } catch (err) {
    return {
      ok: false,
      error: `Could not parse file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Apply the user's chosen name/time fields to a freshly parsed record set,
 * returning NEW records (immutable update — coding-style.md). Each record's
 * `name` is set from `nameField` (falling back to its synthetic name) and its
 * `temporal` is set from `timeField` when the value coerces to a year.
 *
 * @param records   - Records from a successful `parseUpload`.
 * @param nameField - Property key to use as the display name, or null.
 * @param timeField - Property key to coerce into a year, or null.
 */
export function applyFieldChoices(
  records: readonly UserRecord[],
  nameField: string | null,
  timeField: string | null,
): UserRecord[] {
  return records.map((rec) => {
    const nameValue = nameField ? rec.payload[nameField] : undefined;
    const name =
      nameValue !== undefined && nameValue !== null && String(nameValue).trim() !== ''
        ? String(nameValue)
        : rec.name;
    const year = timeField ? toYear(rec.payload[timeField]) : null;
    const temporal = temporalForYear(year);
    return temporal ? { ...rec, name, temporal } : { ...rec, name };
  });
}
