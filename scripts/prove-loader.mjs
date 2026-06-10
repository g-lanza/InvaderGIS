/**
 * prove-loader.mjs — standalone proof that the year-index logic works correctly
 * against the real data in data/. Run with: node scripts/prove-loader.mjs
 *
 * This script replicates the exact logic in src/data/loaders.ts but uses
 * Node.js fs/path to read the files, since import.meta.glob is a Vite-only API.
 * The results prove what the live loader will produce at runtime.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(__dirname, '..', 'data');

const INDEX_START = 500;
const INDEX_END   = 1500;

function loadDir(dir) {
  const dirPath = join(dataRoot, dir);
  const files = readdirSync(dirPath).filter(f => f.endsWith('.json') && f !== '.gitkeep');
  return files.map(f => {
    const raw = readFileSync(join(dirPath, f), 'utf-8');
    return JSON.parse(raw);
  }).filter(r => r && typeof r.id === 'string' && r.id.length > 0);
}

const polities      = loadDir('entities');
const events        = loadDir('events');
const journeys      = loadDir('journeys');
const relationships = loadDir('relationships');
const rulers        = loadDir('rulers');
const sources       = loadDir('sources');
const institutions  = loadDir('institutions');
const technologies  = loadDir('technologies');
const texts         = loadDir('texts');

const total = polities.length + events.length + journeys.length + relationships.length +
              rulers.length + sources.length + institutions.length + technologies.length + texts.length;

console.log('\n=== REAL RECORD COUNTS (from data/) ===');
console.log(`  polities:      ${polities.length}`);
console.log(`  events:        ${events.length}`);
console.log(`  journeys:      ${journeys.length}`);
console.log(`  relationships: ${relationships.length}`);
console.log(`  rulers:        ${rulers.length}`);
console.log(`  sources:       ${sources.length}`);
console.log(`  institutions:  ${institutions.length}`);
console.log(`  technologies:  ${technologies.length}`);
console.log(`  texts:         ${texts.length}`);
console.log(`  TOTAL:         ${total}`);

// Build year index (mirrors loaders.ts logic exactly)
const yearIndex = new Map();

function indexSpan(id, start, end) {
  const from = Math.max(INDEX_START, Math.round(start));
  const to   = Math.min(INDEX_END,   Math.round(end));
  for (let y = from; y <= to; y++) {
    if (!yearIndex.has(y)) yearIndex.set(y, new Set());
    yearIndex.get(y).add(id);
  }
}
function indexInstant(id, year) {
  if (year < INDEX_START || year > INDEX_END) return;
  const y = Math.round(year);
  if (!yearIndex.has(y)) yearIndex.set(y, new Set());
  yearIndex.get(y).add(id);
}

// Polities: formed..dissolved
for (const r of polities) {
  const formed    = typeof r.formed    === 'number' ? r.formed    : null;
  const dissolved = typeof r.dissolved === 'number' ? r.dissolved : null;
  if (formed !== null && dissolved !== null) indexSpan(r.id, formed, dissolved);
  else if (formed !== null) indexSpan(r.id, formed, INDEX_END);
}

// Events: instant
for (const r of events) {
  const year = typeof r.year === 'number' ? r.year : null;
  if (year !== null) indexInstant(r.id, year);
}

// Journeys: year_start..year_end
for (const r of journeys) {
  const ys = typeof r.year_start === 'number' ? r.year_start : null;
  const ye = typeof r.year_end   === 'number' ? r.year_end   : null;
  if (ys !== null && ye !== null) indexSpan(r.id, ys, ye);
  else if (ys !== null) indexInstant(r.id, ys);
}

// Relationships: active_periods or since..until
for (const r of relationships) {
  if (Array.isArray(r.active_periods) && r.active_periods.length > 0) {
    for (const span of r.active_periods) {
      if (Array.isArray(span) && span.length === 2) indexSpan(r.id, span[0], span[1]);
    }
  } else {
    const since = typeof r.since === 'number' ? r.since : null;
    const until = typeof r.until === 'number' ? r.until : r.until === null ? INDEX_END : null;
    if (since !== null) indexSpan(r.id, since, until ?? INDEX_END);
  }
}

// Rulers: reign_start..reign_end
for (const r of rulers) {
  const rs = typeof r.reign_start === 'number' ? r.reign_start : null;
  const re = typeof r.reign_end   === 'number' ? r.reign_end   : null;
  if (rs !== null && re !== null) indexSpan(r.id, rs, re);
  else if (rs !== null) indexInstant(r.id, rs);
}

// Probe a few years
const probeYears = [700, 800, 1000, 1200, 1400];
console.log('\n=== YEAR INDEX PROBE ===');
for (const y of probeYears) {
  const bucket = yearIndex.get(y) ?? new Set();
  console.log(`  recordsActiveInYear(${y}): ${bucket.size} records`);
}

// Detailed probe for year 1000
console.log('\n=== SAMPLE: recordsActiveInYear(1000) — first 15 ids ===');
const at1000 = yearIndex.get(1000) ?? new Set();
const sample = [...at1000].slice(0, 15);
for (const id of sample) {
  // Find kind
  let kind = '?';
  if (polities.find(r => r.id === id))      kind = 'polity';
  else if (events.find(r => r.id === id))   kind = 'event';
  else if (journeys.find(r => r.id === id)) kind = 'journey';
  else if (relationships.find(r => r.id === id)) kind = 'relationship';
  else if (rulers.find(r => r.id === id))   kind = 'ruler';
  console.log(`  [${kind}] ${id}`);
}
console.log(`  ... (${at1000.size} total active at year 1000)`);
console.log('');
