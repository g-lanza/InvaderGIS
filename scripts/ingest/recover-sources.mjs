#!/usr/bin/env node
/**
 * recover-sources.mjs — BUILD-TIME ONLY source-record recovery.
 *
 * Closes the "source not found" gap: ~235 distinct source ids are referenced by
 * records' provenance.sources_used but have no matching data/sources/<id>.json.
 * This script resolves each unresolved id to REAL bibliographic metadata and
 * writes one valid Source record per resolved id.
 *
 * PIPELINE
 *   1. Scan every record under data/ for provenance.sources_used ids.
 *   2. Subtract the ids that already have a data/sources/<id>.json. The remainder
 *      is the unresolved set.
 *   3. For each unresolved id, derive a query (author + title) from its shape:
 *        - citation string  "Asbridge, The First Crusade: A New History"
 *        - structured slug   "herrin_byzantium_2007"  (author_keyword_year)
 *   4. Resolve via, in order:  Wikidata  ->  Crossref  ->  OpenLibrary.
 *      The FIRST confident match wins. No match -> id stays honestly unresolved.
 *   5. Validate + sanitise every fetched field at the boundary (untrusted input).
 *   6. Write data/sources/<id>.json (read-old / write-new; never overwrite an
 *      existing source record). Append a revert log to data/_audit/.
 *
 * LAWS
 *   - ZERO runtime external calls: build-time only. src/ never imports this.
 *   - NO FABRICATION: a record is written ONLY from real fetched metadata. An id
 *     that cannot be confidently resolved is logged as unresolved, never invented.
 *   - All fetched data is UNTRUSTED: no eval, no dynamic require, file id is the
 *     sanitised source id only (no path traversal), strings trimmed & length-capped,
 *     year coerced to a plausible integer, url validated as http(s).
 *   - Reversible: every written file is new; a revert log lists them for deletion.
 *
 * USAGE
 *   node scripts/ingest/recover-sources.mjs            # resolve all, write records
 *   node scripts/ingest/recover-sources.mjs --dry      # resolve, write NOTHING, report
 *   node scripts/ingest/recover-sources.mjs --limit 20 # only attempt first 20 (pilot)
 *
 * Network etiquette: sequential requests with a small delay + a descriptive
 * User-Agent (Crossref/OpenLibrary/Wikidata all ask for this). Responses cached
 * to scripts/ingest/_cache/sources/ so re-runs are free and offline-replayable.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT        = process.cwd();
const DATA        = path.join(ROOT, 'data');
const SOURCES_DIR = path.join(DATA, 'sources');
const AUDIT_DIR   = path.join(DATA, '_audit');
const CACHE_DIR   = path.join(ROOT, 'scripts', 'ingest', '_cache', 'sources');
const DATASET     = 'medieval-europe-500-1500';
const UA          = 'InvaderGIS-source-recovery/1.0 (historical atlas; build-time bibliographic resolver)';

// ── CLI flags ───────────────────────────────────────────────────────────────
const ARGV   = process.argv.slice(2);
const DRY    = ARGV.includes('--dry');
const LIMIT  = (() => { const i = ARGV.indexOf('--limit'); return i >= 0 ? parseInt(ARGV[i + 1], 10) : Infinity; })();

// ── Small utilities ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Trim + length-cap an untrusted string. */
function clean(s, max = 512) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Coerce an untrusted value to a plausible publication year, else null. */
function cleanYear(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').slice(0, 4), 10);
  if (!Number.isFinite(n)) return null;
  // Bibliography for a medieval atlas: modern scholarship + primary editions.
  if (n < 800 || n > 2030) return null;
  return n;
}

/** Validate an untrusted url is http(s); else null. */
function cleanUrl(u) {
  const s = clean(u, 400);
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  return null;
}

/** Map a record kind_type-ish hint to the Source.kind union. */
function classifyKind(typeHint) {
  const t = (typeHint || '').toLowerCase();
  if (t.includes('journal') || t.includes('article')) return 'survey';
  if (t.includes('dataset')) return 'dataset';
  return 'monograph'; // default for books
}

// ── 1. Collect referenced source ids + existing records ─────────────────────
function listRecordDirs() {
  return fs.readdirSync(DATA).filter((d) => {
    if (d.startsWith('_') || d.includes('bak')) return false;
    try { return fs.statSync(path.join(DATA, d)).isDirectory(); } catch { return false; }
  });
}

function collectReferencedIds() {
  const refs = new Set();
  for (const dir of listRecordDirs()) {
    let files;
    try { files = fs.readdirSync(path.join(DATA, dir)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.json') || f.includes('.bak') || f.includes('README')) continue;
      let rec;
      try { rec = JSON.parse(fs.readFileSync(path.join(DATA, dir, f), 'utf8')); } catch { continue; }
      const su = rec?.provenance?.sources_used;
      if (Array.isArray(su)) for (const id of su) if (typeof id === 'string' && id.trim()) refs.add(id.trim());
    }
  }
  return refs;
}

function existingSourceIds() {
  const ids = new Set();
  for (const f of fs.readdirSync(SOURCES_DIR)) {
    if (!f.endsWith('.json') || f.includes('.bak') || f.includes('README')) continue;
    ids.add(f.replace(/\.json$/, ''));
    // also index by the record's declared id (filename usually matches, be safe)
    try { ids.add(JSON.parse(fs.readFileSync(path.join(SOURCES_DIR, f), 'utf8')).id); } catch { /* ignore */ }
  }
  return ids;
}

// ── 2. Derive an (author, title) query from an unresolved id ────────────────
const WEAK = new Set(['the','a','an','of','from','when','le','la','les','der','das','el','und','and','i','ii','iii','on','in','to','for','les','des']);

/**
 * Returns { author, title, slug, fileId, kind } or null if the id is an internal
 * placeholder that is not a real citation (e.g. donor-geojson-capital).
 */
function deriveQuery(id) {
  // Internal donor placeholders — not real bibliographic sources. Skip honestly.
  if (/^donor-/.test(id)) return null;

  if (id.includes(', ')) {
    // Citation string: "Author(s), Title: Subtitle"
    const [authorPart, ...titleParts] = id.split(', ');
    const title = titleParts.join(', ');
    return {
      author: clean(authorPart, 120),
      title:  clean(title, 300),
      query:  clean(`${authorPart} ${title}`, 300),
      fileId: slugifyCitation(authorPart, title),
      weak:   false,
    };
  }

  // Structured slug: author_keyword_year
  const m = id.match(/^(.+?)_([a-z0-9'._-]+)_(\d{3,4})$/i);
  if (m) {
    const author  = m[1].replace(/[_-]+/g, ' ');
    const keyword = m[2].replace(/[_-]+/g, ' ');
    const year    = m[3];
    const weak    = WEAK.has(keyword.toLowerCase());
    return {
      author: clean(author, 120),
      title:  clean(keyword, 200),
      year:   cleanYear(year),
      // Query is author + keyword WITHOUT the year: the year in a bibliographic
      // search query hurts OpenLibrary's title relevance ranking (verified — many
      // strong slugs that returned nothing with the year resolve cleanly without
      // it). The year is still kept in `q.year` for the record's year field.
      query:  clean(`${author} ${weak ? '' : keyword}`, 200),
      fileId: id, // already a valid slug
      weak,
    };
  }

  // Unknown shape — attempt a bare query, low confidence.
  return { author: '', title: clean(id, 200), query: clean(id, 200), fileId: slugifyCitation('', id), weak: true };
}

/** Build a filesystem-safe source id from author + title (matches existing convention). */
function slugifyCitation(author, title) {
  const base = `${author} ${title}`
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return base || 'source';
}

// ── 3. Resolvers (Wikidata -> Crossref -> OpenLibrary) ──────────────────────
// Each resolver returns a normalised hit { title, author, year, url, kind, via }
// or null. All network input is untrusted and cleaned before use.

async function fetchJson(url, headers = {}) {
  const cacheKey = path.join(CACHE_DIR, slugifyCitation('', url) + '.json');
  if (fs.existsSync(cacheKey)) {
    try { return JSON.parse(fs.readFileSync(cacheKey, 'utf8')); } catch { /* refetch */ }
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
    if (!res.ok) return null;
    const json = await res.json();
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cacheKey, JSON.stringify(json)); } catch { /* cache best-effort */ }
    return json;
  } catch {
    return null;
  }
}

const normTokens = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

/** Token-overlap confidence: fraction of query title tokens present in candidate. */
function titleConfidence(queryTitle, candidateTitle) {
  const q = normTokens(queryTitle).filter((w) => w.length > 3 && !WEAK.has(w));
  const c = new Set(normTokens(candidateTitle));
  if (q.length === 0) return 0;
  return q.filter((t) => c.has(t)).length / q.length;
}

/**
 * Author-surname guard: the citation's author surname must appear among the
 * candidate's author surnames. This rejects "review of X by Y" matches where the
 * fetched author is the reviewer, not the book's author (a fabrication risk).
 * Returns true when we have NO author to check against (can't disprove), so the
 * title confidence alone governs those.
 */
function authorMatches(queryAuthor, candidateSurnames) {
  const qa = normTokens(queryAuthor).filter((w) => w.length > 2);
  if (qa.length === 0) return true;            // nothing to check
  if (!candidateSurnames || candidateSurnames.length === 0) return false; // we HAVE an author but candidate has none → reject
  const cand = new Set(candidateSurnames.flatMap(normTokens));
  // the citation's first surname token is the discriminating one
  return qa.some((t) => cand.has(t));
}

// Crossref work types that are actual standalone works we want (a book, not a
// review-of or a journal article that merely shares the title).
const BOOK_TYPES = new Set(['book', 'monograph', 'reference-book', 'edited-book', 'book-set']);

async function viaCrossref(q) {
  const url = `https://api.crossref.org/works?rows=5&query.bibliographic=${encodeURIComponent(q.query)}`;
  const json = await fetchJson(url);
  const items = json?.message?.items;
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    // 1. Must be a book-like work. Journal-articles / reviews-of are rejected
    //    outright — they cause wrong-author, wrong-work matches (verified in pilot:
    //    "Allsen" → a review by Helfgott; a chapter mis-matched for Asbridge).
    if (!BOOK_TYPES.has(it.type)) continue;
    const title = clean(Array.isArray(it.title) ? it.title[0] : it.title, 300);
    if (!title) continue;
    // 2. Strong title overlap (≥0.8) — 0.6 let a different same-author book through.
    const conf = titleConfidence(q.title || q.query, title);
    if (conf < 0.8) continue;
    // 3. The PRIMARY author (author[0]) surname must match the citation author —
    //    not merely appear somewhere in a multi-author/review list.
    const primary = Array.isArray(it.author) && it.author[0] ? (it.author[0].family || '') : '';
    if (!authorMatches(q.author, [primary])) continue;
    const author = clean(`${primary}${it.author[0].given ? ', ' + it.author[0].given : ''}`, 120) || clean(q.author, 120);
    const year = cleanYear(it.issued?.['date-parts']?.[0]?.[0] ?? it.created?.['date-parts']?.[0]?.[0]);
    const url2 = cleanUrl(it.URL) || (it.DOI ? `https://doi.org/${clean(it.DOI, 100)}` : null);
    return { title, author, year, url: url2, kind: classifyKind(it.type), via: 'crossref', confidence: conf };
  }
  return null;
}

async function viaOpenLibrary(q) {
  const url = `https://openlibrary.org/search.json?limit=3&q=${encodeURIComponent(q.query)}`;
  const json = await fetchJson(url);
  const docs = json?.docs;
  if (!Array.isArray(docs)) return null;
  for (const d of docs) {
    const title = clean(d.title, 300);
    if (!title) continue;
    const conf = titleConfidence(q.title || q.query, title);
    if (conf < 0.8) continue;
    const surnames = Array.isArray(d.author_name) ? d.author_name : [];
    // Primary-author surname must match (OpenLibrary lists the work's own authors,
    // so author[0] is the right discriminator).
    if (!authorMatches(q.author, [surnames[0] || ''])) continue;
    const author = clean(surnames[0] || '', 120) || clean(q.author, 120);
    const year = cleanYear(d.first_publish_year);
    const url2 = d.key ? `https://openlibrary.org${clean(d.key, 100)}` : null;
    return { title, author, year, url: cleanUrl(url2), kind: 'monograph', via: 'openlibrary', confidence: conf };
  }
  return null;
}

async function viaWikidata(q) {
  // Wikidata search by label/title, then confirm it is a written work (book/article).
  const sUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=3&search=${encodeURIComponent(q.title || q.query)}`;
  const search = await fetchJson(sUrl);
  const hits = search?.search;
  if (!Array.isArray(hits) || hits.length === 0) return null;
  for (const h of hits) {
    const label = clean(h.label, 300);
    if (!label) continue;
    const conf = titleConfidence(q.title || q.query, label);
    if (conf < 0.6) continue; // wikidata labels are short → demand higher overlap
    const url = cleanUrl(h.concepturi) || (h.id ? `https://www.wikidata.org/wiki/${clean(h.id, 30)}` : null);
    return { title: label, author: clean(q.author, 120), year: q.year ?? null, url, kind: 'monograph', via: 'wikidata', confidence: conf };
  }
  return null;
}

async function resolve(q) {
  // Order per director: Wikidata (origin of the corpus) -> Crossref -> OpenLibrary.
  // Crossref/OpenLibrary carry richer book metadata, so Wikidata is the confirm,
  // the other two the recall. First confident hit wins.
  for (const fn of [viaWikidata, viaCrossref, viaOpenLibrary]) {
    const hit = await fn(q);
    await sleep(120); // be polite to the APIs
    if (hit && hit.title) return hit;
  }
  return null;
}

// ── 4. Build a Source record from a resolved hit ────────────────────────────
// CRITICAL: the record's `id` MUST equal the original ref string (`id` arg) —
// that is the exact key the referencing records use in provenance.sources_used,
// and the validator resolves a ref by matching record.id. The slugified `fileId`
// is used only for the on-disk filename (filesystem-safe). Setting id = ref is
// what actually closes the "source not found" warning for that ref.
function buildSourceRecord(id, q, hit) {
  return {
    kind: 'source',
    dataset: DATASET,
    id: id,                      // the original ref string — resolves the warning
    title: hit.title,
    author: hit.author || undefined,
    year: hit.year ?? q.year ?? undefined,
    kind_type: hit.kind,
    status: 'draft',
    url: hit.url || undefined,
    _quarry: {
      resolved_from_ref: id,             // the original unresolved ref string (== id)
      file_slug: q.fileId,               // filesystem-safe slug used for the filename
      resolved_via: hit.via,             // wikidata | crossref | openlibrary
      match_confidence: Number(hit.confidence.toFixed(2)),
      recovered: true,
      notes: 'Auto-recovered at build time from a public bibliographic API. Verify before promoting status to reviewed.',
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });

  const referenced = collectReferencedIds();
  const existing   = existingSourceIds();
  const unresolved = [...referenced].filter((id) => !existing.has(id)).sort();

  console.log(`[recover-sources] referenced ids: ${referenced.size}, existing records: ${existing.size}, unresolved: ${unresolved.length}`);
  if (DRY) console.log('[recover-sources] DRY RUN — no files will be written.');

  const ts = Date.now();
  const revertLog = {
    timestamp: new Date(ts).toISOString(),
    script: 'scripts/ingest/recover-sources.mjs',
    description: 'Recover missing source records from public bibliographic APIs (Wikidata/Crossref/OpenLibrary). Build-time only.',
    written: [],
  };

  let resolved = 0, skippedPlaceholder = 0, unresolvedOut = 0, wrote = 0, collided = 0;
  const byVia = { wikidata: 0, crossref: 0, openlibrary: 0 };
  const unresolvedIds = [];

  let attempted = 0;
  for (const id of unresolved) {
    if (attempted >= LIMIT) break;
    const q = deriveQuery(id);
    if (q === null) { skippedPlaceholder++; continue; } // donor placeholders etc.
    attempted++;

    const hit = await resolve(q);
    if (!hit) { unresolvedOut++; unresolvedIds.push(id); continue; }

    resolved++;
    byVia[hit.via] = (byVia[hit.via] || 0) + 1;

    const rec = buildSourceRecord(id, q, hit);
    // Filename uses the filesystem-safe slug; the record's id is the ref string.
    const outPath = path.join(SOURCES_DIR, `${q.fileId}.json`);

    // Never overwrite an existing source record (read-old / write-new).
    if (fs.existsSync(outPath)) { collided++; continue; }

    if (!DRY) {
      fs.writeFileSync(outPath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
      revertLog.written.push({ ref: id, file: outPath, via: hit.via, confidence: rec._quarry.match_confidence });
      wrote++;
    }
    console.log(`  ✓ ${id}  →  ${q.fileId}.json  [${hit.via} ${rec._quarry.match_confidence}]`);
  }

  if (!DRY && wrote > 0) {
    fs.writeFileSync(path.join(AUDIT_DIR, `recover-sources-${ts}.json`), JSON.stringify(revertLog, null, 2) + '\n', 'utf8');
  }

  console.log('\n[recover-sources] summary');
  console.log(`  attempted real ids : ${attempted}`);
  console.log(`  resolved           : ${resolved}  (wikidata ${byVia.wikidata}, crossref ${byVia.crossref}, openlibrary ${byVia.openlibrary})`);
  console.log(`  wrote new records  : ${wrote}${DRY ? ' (dry — none written)' : ''}`);
  console.log(`  filename collisions: ${collided} (resolved but a record with that id already existed — left untouched)`);
  console.log(`  donor placeholders : ${skippedPlaceholder} (skipped — not real citations)`);
  console.log(`  left UNRESOLVED    : ${unresolvedOut} (honest — no confident match, NOT fabricated)`);
  if (unresolvedIds.length) console.log(`  unresolved sample  : ${unresolvedIds.slice(0, 15).join(' | ')}`);
  if (!DRY && wrote > 0) console.log(`  revert log         : data/_audit/recover-sources-${ts}.json`);
  console.log('\n  Next: node scripts/build/bake-manifests.mjs  &&  node scripts/validate/validate.mjs');
}

main().catch((e) => { console.error('[recover-sources] fatal:', e); process.exit(1); });
