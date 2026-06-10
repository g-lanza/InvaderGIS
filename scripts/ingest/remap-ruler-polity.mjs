#!/usr/bin/env node
/**
 * remap-ruler-polity.mjs — BUILD-TIME ONLY, reversible ruler.polity alias fix.
 *
 * Some ruler records reference a polity by a short alias that has no matching
 * entity record, e.g. `polity: "england"` when the entity id is
 * `kingdom_of_england`. This remaps ONLY the confidently-correct aliases (exact
 * single canonical target, with the ruler's reign verified to fall within the
 * target entity's span). It does NOT touch refs to genuinely-missing entities
 * (islamic_caliphate, west_frankish_kingdom, …) — those are a real coverage gap
 * that needs new entity records, not an alias rewrite. No fabrication.
 *
 * SAFETY: read-old / write-new. Each changed file backed up with
 * .bak-<ts>; a revert log is written to data/_audit/. To revert, restore each
 * `backup` over its `file`.
 *
 * USAGE
 *   node scripts/ingest/remap-ruler-polity.mjs           # apply
 *   node scripts/ingest/remap-ruler-polity.mjs --dry     # report only, write nothing
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT       = process.cwd();
const RULERS_DIR = path.join(ROOT, 'data', 'rulers');
const ENT_DIR    = path.join(ROOT, 'data', 'entities');
const AUDIT_DIR  = path.join(ROOT, 'data', '_audit');
const DRY        = process.argv.includes('--dry');

// Confident alias -> canonical entity id. Verified 2026-06-02: every England
// ruler (1066–1485) sits within kingdom_of_england (927–present); every France
// ruler (987–1483) within kingdom_of_france (987–present).
const REMAP = {
  england: 'kingdom_of_england',
  france:  'kingdom_of_france',
};

function entityExists(id) {
  return fs.existsSync(path.join(ENT_DIR, `${id}.json`));
}

function main() {
  // Guard: never remap to a target that doesn't actually exist.
  for (const [alias, target] of Object.entries(REMAP)) {
    if (!entityExists(target)) {
      console.error(`[remap] ABORT — target entity does not exist: ${target} (for alias ${alias})`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const ts = Date.now();
  const revertLog = {
    timestamp: new Date(ts).toISOString(),
    script: 'scripts/ingest/remap-ruler-polity.mjs',
    description: 'Remap confident ruler.polity aliases to canonical entity ids (england->kingdom_of_england, france->kingdom_of_france).',
    remap: REMAP,
    changed: [],
  };

  let changed = 0;
  for (const f of fs.readdirSync(RULERS_DIR)) {
    if (!f.endsWith('.json') || f.includes('.bak')) continue;
    const fpath = path.join(RULERS_DIR, f);
    const raw = fs.readFileSync(fpath, 'utf8');
    const rec = JSON.parse(raw);
    const target = REMAP[rec.polity];
    if (!target) continue;

    const from = rec.polity;
    rec.polity = target;

    if (!DRY) {
      fs.writeFileSync(`${fpath}.bak-${ts}`, raw, 'utf8');
      fs.writeFileSync(fpath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
    }
    revertLog.changed.push({ file: fpath, ruler: rec.id, from, to: target });
    changed++;
    console.log(`  ${rec.id}: polity ${from} -> ${target}`);
  }

  if (!DRY && changed > 0) {
    fs.writeFileSync(path.join(AUDIT_DIR, `remap-ruler-polity-${ts}.json`), JSON.stringify(revertLog, null, 2) + '\n', 'utf8');
  }

  console.log(`\n[remap] ${changed} ruler records remapped${DRY ? ' (dry — none written)' : ''}.`);
  if (!DRY && changed > 0) console.log(`[remap] revert log: data/_audit/remap-ruler-polity-${ts}.json`);
}

main();
