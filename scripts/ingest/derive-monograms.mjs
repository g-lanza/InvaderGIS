#!/usr/bin/env node
/**
 * derive-monograms.mjs — BUILD-TIME ONLY, reversible monogram derivation.
 *
 * The .crest component (ComponentSheet artboard 03) renders a 2-letter monogram
 * per polity. The Polity type already has an optional `monogram` field, but 0 of
 * 276 entity records populate it. This derives a sensible 2-letter monogram from
 * each polity's `name_primary`, deterministically, so the crest can render.
 *
 * DERIVATION (deterministic, from real existing names — NO fabrication of identity,
 * just an abbreviation of the polity's own name):
 *   1. Strip a leading descriptor + "of"/"de"/"rule in" ("County of Anjou" → "Anjou",
 *      "Almohad rule in al-Andalus" → "al-Andalus", "Kingdom of England" → "England").
 *   2. Strip a leading article ("al-", "the", "el-").
 *   3. If two+ significant words remain, take the first letter of the first two.
 *   4. Else take the first two letters of the single significant word.
 *   5. Uppercase, ASCII-fold diacritics (Córdoba → CO).
 * Monogram is advisory display text; if a record already has one it is left as-is.
 *
 * SAFETY: read-old / write-new. Each changed file backed up with
 * .bak-<ts>; revert log to data/_audit/. To revert, restore each backup.
 *
 * USAGE
 *   node scripts/ingest/derive-monograms.mjs           # apply
 *   node scripts/ingest/derive-monograms.mjs --dry      # report only
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENT_DIR = path.join(ROOT, 'data', 'entities');
const AUDIT_DIR = path.join(ROOT, 'data', '_audit');
const DRY = process.argv.includes('--dry');

// Leading descriptors that are NOT the identifying word (the next word is).
const LEADING_TYPES = /^(county|duchy|kingdom|empire|caliphate|sultanate|khanate|emirate|principality|republic|march|despotate|khaganate|state|confederation|league|realm|dynasty|house|order)\s+(of|de)\s+/i;
// "X rule in Y" / "X rule of Y" → Y is the place.
const RULE_IN = /\brule\s+(in|of)\s+/i;
const LEADING_ARTICLE = /^(al|el|the|la|le|los)[-\s]+/i;

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Derive a 2-letter monogram from a polity display name. */
function deriveMonogram(name) {
  let n = fold(String(name || '')).trim();
  if (!n) return null;

  // "Almohad rule in al-Andalus" → keep the part after "rule in".
  const ruleM = n.match(RULE_IN);
  if (ruleM) n = n.slice(ruleM.index + ruleM[0].length).trim();

  // "County of Anjou" → "Anjou".
  n = n.replace(LEADING_TYPES, '').trim();
  // leading article "al-Andalus" → "Andalus", "the Heptarchy" → "Heptarchy".
  n = n.replace(LEADING_ARTICLE, '').trim();

  // Significant words (length >= 2, not a lone connector).
  const stop = new Set(['of', 'de', 'the', 'and', 'in', 'al', 'el', 'la', 'le']);
  const words = n.split(/[\s\-]+/).filter((w) => w.length >= 1 && !stop.has(w.toLowerCase()));

  let mono;
  if (words.length >= 2) {
    mono = (words[0][0] + words[1][0]);
  } else if (words.length === 1) {
    mono = words[0].slice(0, 2);
  } else {
    mono = fold(String(name)).replace(/[^a-z]/gi, '').slice(0, 2);
  }
  mono = mono.replace(/[^a-z]/gi, '').toUpperCase();
  if (mono.length === 1) mono += mono; // single-letter name → double it
  return mono.length >= 2 ? mono.slice(0, 2) : null;
}

function main() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const ts = Date.now();
  const revertLog = {
    timestamp: new Date(ts).toISOString(),
    script: 'scripts/ingest/derive-monograms.mjs',
    description: 'Derive a 2-letter crest monogram per polity from name_primary (deterministic; additive optional field).',
    changed: [],
  };

  let changed = 0, skippedHas = 0, skippedNoName = 0;
  const sample = [];
  for (const f of fs.readdirSync(ENT_DIR)) {
    if (!f.endsWith('.json') || f.includes('.bak')) continue;
    const fpath = path.join(ENT_DIR, f);
    const raw = fs.readFileSync(fpath, 'utf8');
    const rec = JSON.parse(raw);

    if (rec.monogram) { skippedHas++; continue; }            // never overwrite
    const name = rec.name_primary || rec.name;
    if (!name) { skippedNoName++; continue; }

    const mono = deriveMonogram(name);
    if (!mono) { skippedNoName++; continue; }

    rec.monogram = mono;
    if (sample.length < 30) sample.push(`${name} → ${mono}`);

    if (!DRY) {
      fs.writeFileSync(`${fpath}.bak-${ts}`, raw, 'utf8');
      fs.writeFileSync(fpath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
    }
    revertLog.changed.push({ file: fpath, id: rec.id, name, monogram: mono });
    changed++;
  }

  if (!DRY && changed > 0) {
    fs.writeFileSync(path.join(AUDIT_DIR, `derive-monograms-${ts}.json`), JSON.stringify(revertLog, null, 2) + '\n', 'utf8');
  }

  console.log(`[monograms] ${changed} derived${DRY ? ' (dry)' : ''}, ${skippedHas} already had one, ${skippedNoName} no usable name.`);
  console.log('sample:\n  ' + sample.join('\n  '));
  if (!DRY && changed > 0) console.log(`revert log: data/_audit/derive-monograms-${ts}.json`);
}

main();
