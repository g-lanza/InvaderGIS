/**
 * quarantine-bak-cruft.mjs — reversible cleanup of backup/scratch cruft.
 *
 * The working tree accumulated ~17.7k `*.bak-*` files next to live records (3 per
 * record across repeated backfill-provenance-floor.mjs runs) plus a 1,073-file
 * `data/entities.bak-pre-recovery/` snapshot and reproducible build-scratch
 * intermediates. These pollute every file scan and add zero signal.
 *
 * DATA SAFETY: this is destructive, so it is fully reversible.
 *   - Only files matching the cruft rules are touched.
 *   - A `*.json.bak-*` is removed ONLY when its live `<name>.json` sibling exists
 *     (so a backup is never the last copy of a record).
 *   - The 8 `.ts` snapshots under data/_audit/src-bak-relocation-* are NEVER touched.
 *   - --quarantine MOVES (rename) cruft into data/_audit/_bak-quarantine-<ts>/ with
 *     a manifest; --revert restores exactly; --purge is the only irreversible step
 *     and runs only after the human has verified bake/typecheck/build.
 *
 * The bake (bake-manifests.mjs) keeps only `endsWith('.json')` (not `.bak-*`), so
 * removing these cannot change baked output — verified by before/after counts.
 *
 * Usage:
 *   node scripts/maintenance/quarantine-bak-cruft.mjs               # dry-run
 *   node scripts/maintenance/quarantine-bak-cruft.mjs --quarantine
 *   node scripts/maintenance/quarantine-bak-cruft.mjs --revert <quarantine-dir>
 *   node scripts/maintenance/quarantine-bak-cruft.mjs --purge  <quarantine-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');
const AUDIT_DIR = path.join(DATA, '_audit');

const argv = process.argv.slice(2);
const MODE_QUARANTINE = argv.includes('--quarantine');
const REVERT_IDX = argv.indexOf('--revert');
const PURGE_IDX = argv.indexOf('--purge');
const REVERT_DIR = REVERT_IDX >= 0 ? argv[REVERT_IDX + 1] : null;
const PURGE_DIR = PURGE_IDX >= 0 ? argv[PURGE_IDX + 1] : null;

function ts() { return String(Date.now()); }
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Recursively list files under a dir (skips nothing — caller filters). */
function walk(d) {
  let out = [];
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const f of ents) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

/** True if a path is inside data/_audit (the protected revert trail). */
function isProtected(p) {
  const r = rel(p);
  return r.startsWith('data/_audit/');
}

/**
 * Collect the cleanup target set with per-file reason. Pure (no mutation).
 * Returns { files: [{abs, rel, size, reason}], skipped: [{rel, why}] }.
 */
function collectTargets() {
  const files = [];
  const skipped = [];
  const seen = new Set();

  const add = (abs, reason) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    let size = 0;
    try { size = fs.statSync(abs).size; } catch { /* gone */ }
    files.push({ abs, rel: rel(abs), size, reason });
  };

  // 1. *.bak* under data/, EXCEPT the protected audit trail, AND only when a live
  //    sibling exists (a backup is never the last copy).
  for (const f of walk(DATA)) {
    const base = path.basename(f);
    if (!base.includes('.bak')) continue;
    if (isProtected(f)) { skipped.push({ rel: rel(f), why: 'protected: data/_audit trail' }); continue; }
    const live = f.slice(0, f.indexOf('.bak'));
    if (!fs.existsSync(live)) { skipped.push({ rel: rel(f), why: 'orphan: no live sibling — kept' }); continue; }
    add(f, 'bak-with-live-sibling');
  }

  // 2. data/entities.bak-pre-recovery/ — entire dir is timestamped backups.
  const snapDir = path.join(DATA, 'entities.bak-pre-recovery');
  if (fs.existsSync(snapDir)) {
    for (const f of walk(snapDir)) add(f, 'entities-pre-recovery-snapshot');
  }

  // 3. Reproducible build-scratch intermediates — drop out-*/slice-*/wave* only;
  //    preserve human-authored seeds/worklists/markdown.
  const KEEP = /(^seed\.json$)|(^worklist\.json$)|(\.md$)/i;
  for (const scratch of ['scripts/build/_integrity', 'scripts/build/_annotations', 'scripts/build/_eventclaims']) {
    const dir = path.join(ROOT, scratch);
    if (!fs.existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (KEEP.test(path.basename(f))) { skipped.push({ rel: rel(f), why: 'scratch keeper (seed/worklist/md)' }); continue; }
      add(f, 'build-scratch-intermediate');
    }
  }

  return { files, skipped };
}

function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + 'M'; }

function doDryRun() {
  const { files, skipped } = collectTargets();
  const byReason = {};
  let total = 0;
  for (const f of files) { byReason[f.reason] = byReason[f.reason] || { n: 0, size: 0 }; byReason[f.reason].n++; byReason[f.reason].size += f.size; total += f.size; }
  console.log('=== quarantine-bak-cruft (DRY-RUN) ===');
  for (const [r, v] of Object.entries(byReason)) console.log(`  ${r}: ${v.n} files, ${fmtMB(v.size)}`);
  console.log(`  TOTAL to quarantine: ${files.length} files, ${fmtMB(total)}`);
  const orphans = skipped.filter((s) => s.why.startsWith('orphan'));
  const prot = skipped.filter((s) => s.why.startsWith('protected'));
  console.log(`  kept (orphan .bak, no live sibling): ${orphans.length}`);
  console.log(`  kept (protected data/_audit trail):  ${prot.length}`);
  console.log(`  kept (scratch seeds/worklists/md):   ${skipped.filter((s) => s.why.startsWith('scratch')).length}`);
  console.log('\n(dry-run — nothing moved.)');
}

function doQuarantine() {
  const { files } = collectTargets();
  if (files.length === 0) { console.log('Nothing to quarantine.'); return; }
  const qName = `_bak-quarantine-${ts()}`;
  const qDir = path.join(AUDIT_DIR, qName);
  fs.mkdirSync(qDir, { recursive: true });

  const manifest = [];
  let moved = 0;
  let total = 0;
  for (const f of files) {
    // Destination preserves the original path relative to ROOT.
    const dest = path.join(qDir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(f.abs, dest);
      manifest.push({ from: f.rel, to: rel(dest), size: f.size, reason: f.reason });
      moved++; total += f.size;
    } catch (e) {
      console.warn(`  [SKIP] could not move ${f.rel}: ${e.message}`);
    }
  }
  // Remove now-empty entities.bak-pre-recovery dir tree (its files were moved).
  pruneEmptyDirs(path.join(DATA, 'entities.bak-pre-recovery'));

  const manifestPath = path.join(qDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    script: 'quarantine-bak-cruft.mjs',
    created: new Date().toISOString(),
    quarantine_dir: rel(qDir),
    moved_count: moved,
    moved_bytes: total,
    files: manifest,
  }, null, 2) + '\n', 'utf8');

  console.log('=== quarantine-bak-cruft (QUARANTINE) ===');
  console.log(`  moved ${moved} files (${fmtMB(total)}) → ${rel(qDir)}`);
  console.log(`  manifest: ${rel(manifestPath)}`);
  console.log(`\n  Next: verify bake/typecheck/build, then:`);
  console.log(`    node scripts/maintenance/quarantine-bak-cruft.mjs --purge ${rel(qDir)}`);
  console.log(`  Or undo:`);
  console.log(`    node scripts/maintenance/quarantine-bak-cruft.mjs --revert ${rel(qDir)}`);
}

/** Remove empty directories bottom-up under d (best-effort). */
function pruneEmptyDirs(d) {
  if (!fs.existsSync(d)) return;
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) if (e.isDirectory()) pruneEmptyDirs(path.join(d, e.name));
  try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch { /* not empty / gone */ }
}

function resolveQDir(arg) {
  const p = path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
  if (!fs.existsSync(p)) { console.error(`Quarantine dir not found: ${arg}`); process.exit(1); }
  const manifestPath = path.join(p, 'manifest.json');
  if (!fs.existsSync(manifestPath)) { console.error(`No manifest.json in ${arg}`); process.exit(1); }
  return { qDir: p, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
}

function doRevert() {
  const { manifest } = resolveQDir(REVERT_DIR);
  let restored = 0;
  for (const f of manifest.files) {
    const from = path.join(ROOT, f.to);     // current location (in quarantine)
    const to = path.join(ROOT, f.from);     // original location
    if (!fs.existsSync(from)) { console.warn(`  [MISS] ${f.to} not in quarantine`); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    restored++;
  }
  console.log(`=== REVERT === restored ${restored}/${manifest.files.length} files to their original paths.`);
  console.log(`  You may now delete the (now-empty) quarantine dir if you wish.`);
}

function doPurge() {
  const { qDir, manifest } = resolveQDir(PURGE_DIR);
  fs.rmSync(qDir, { recursive: true, force: true });
  console.log(`=== PURGE === deleted ${rel(qDir)} (${manifest.moved_count} files, irreversible).`);
}

// ── Dispatch ────────────────────────────────────────────────────────────────
if (REVERT_DIR) doRevert();
else if (PURGE_DIR) doPurge();
else if (MODE_QUARANTINE) doQuarantine();
else doDryRun();
