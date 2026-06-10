#!/usr/bin/env node
/**
 * merge-into-main.mjs — Merge the Fordham seed (data/fordham/) INTO the main
 * medieval atlas (data/) so Fordham records appear on the same map/timeline/
 * registers as everything else, each carrying a citation back to its Fordham
 * source document.
 *
 * STRATEGY (data-safety law — the project conventions: read-old / enrich / write-new only):
 *   - NEW record (id not already in data/<dir>/): write it in, stamped to the
 *     medieval dataset id, with provenance.sources_used pointing at the Fordham
 *     source record + a `from_sourcebook: true` marker for the UI badge.
 *   - COLLISION (id already exists in data/<dir>/): DO NOT overwrite. Only ADD the
 *     Fordham source id to the existing record's provenance.sources_used (dedup),
 *     and set `from_sourcebook` only if it was already sourcebook-derived. The
 *     curated record's own fields are untouched.
 *   - A single Fordham `source` record (id "ims_fordham") is written once so all
 *     citations resolve to a real source with a working URL + public-domain note.
 *   - Events get coords from a SMALL HAND-VERIFIED gazetteer (below) — only for
 *     places whose location is genuinely known. Documents/edicts with no single
 *     meaningful point stay coord-less (honest — they show in registers/timeline,
 *     not as fake map dots). NO coordinate is ever guessed.
 *
 * Every mutation is reversible: a manifest of exactly what was written/enriched is
 * saved to data/_audit/fordham-merge-manifest.json so the merge can be undone.
 *
 * Usage: node scripts/build/fordham/merge-into-main.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');
const MAIN_DATASET = 'medieval-europe-500-1500';

const TYPE_DIR = {
  polity: 'entities',
  event: 'events',
  ruler: 'rulers',
  institution: 'institutions',
  text: 'texts',
  source: 'sources',
};

// ── The Fordham source record (written once; all citations point here) ────────
const FORDHAM_SOURCE = {
  kind: 'source',
  dataset: MAIN_DATASET,
  id: 'ims_fordham',
  title: 'Internet Medieval Sourcebook',
  author: 'ed. Paul Halsall (Fordham University, Center for Medieval Studies)',
  kind_type: 'primary',
  status: 'draft',
  url: 'https://sourcebooks.fordham.edu/sbook.asp',
  license: 'public-domain',
  notes: 'Public-domain / copy-permitted primary-source collection, 500–1500 CE. Records merged from a staged extraction; verify before promoting to reviewed.',
};

// Per-index Fordham source pages, so a record can cite the specific region index
// it was drawn from. id form: ims_fordham_<key>. These supplement ims_fordham.
// FULL BREADTH: every Fordham index/region page + structural hub. A record whose
// _fordham_index is missing still cites the umbrella ims_fordham (line ~149) —
// graceful — but every key the extractor can emit has a target here. sbook1b is
// served as .html (per the link inventory), not .asp.
const u = (key, ext = 'asp') => 'https://sourcebooks.fordham.edu/' + key + '.' + ext;
const INDEX_SOURCES = {
  // Richest regions (the original live-merged 6)
  sbook1c:   { title: 'IMS: Byzantium',                url: u('sbook1c')           },
  sbook1d:   { title: 'IMS: Islam',                    url: u('sbook1d')           },
  sbook1k:   { title: 'IMS: Crusades',                 url: u('sbook1k')           },
  sbook1m:   { title: 'IMS: France',                   url: u('sbook1m')           },
  sbook1n:   { title: 'IMS: England',                  url: u('sbook1n')           },
  sbook1h:   { title: 'IMS: Carolingians',             url: u('sbook1h')           },
  // Remaining regions + structural hubs (full-breadth Phase B)
  'sbook-law': { title: 'IMS: Legal History',          url: u('sbook-law')         },
  sbook1j:   { title: 'IMS: Economic Life',            url: u('sbook1j')           },
  sbook3:    { title: 'IMS: Saints Lives',             url: u('sbook3')            },
  sbook1ff:  { title: 'IMS: Anglo-Saxons',             url: u('sbook1ff')          },
  sbook1t:   { title: 'IMS: Jewish Life',              url: u('sbook1t')           },
  sbook1r:   { title: 'IMS: Intellectual Life',        url: u('sbook1r')           },
  sbook1b:   { title: 'IMS: End of Rome',              url: u('sbook1b', 'html')   },
  sbook1l:   { title: 'IMS: Empire and Papacy',        url: u('sbook1l')           },
  sbook1v:   { title: 'IMS: Sex and Gender',           url: u('sbook1v')           },
  sbook1f:   { title: 'IMS: Early Germanic States',    url: u('sbook1f')           },
  sbook1g:   { title: 'IMS: Celtic World',             url: u('sbook1g')           },
  sbook1i:   { title: 'IMS: Crisis Recovery Feudalism',url: u('sbook1i')           },
  sbook1y:   { title: 'IMS: Reformation',              url: u('sbook1y')           },
  sbook1oo:  { title: 'IMS: Nordic Europe',            url: u('sbook1oo')          },
  sbook1e:   { title: 'IMS: The Church',               url: u('sbook1e')           },
  sbook1o:   { title: 'IMS: Celtic States',            url: u('sbook1o')           },
  sbook1q:   { title: 'IMS: Italy',                    url: u('sbook1q')           },
  sbook1s:   { title: 'IMS: High Medieval Church',     url: u('sbook1s')           },
  sbookmap:  { title: 'IMS: Maps and Images',          url: u('sbookmap')          },
  sbook1x:   { title: 'IMS: Renaissance',              url: u('sbook1x')           },
  sbook1u:   { title: 'IMS: Social History',           url: u('sbook1u')           },
  sbook1w:   { title: 'IMS: States and Society',       url: u('sbook1w')           },
  sbook1a:   { title: 'IMS: Studying History',         url: u('sbook1a')           },
  sbook2:    { title: 'IMS: Full Text Sources',        url: u('sbook2')            },
  sbook1z:   { title: 'IMS: Exploration',              url: u('sbook1z')           },
  sbook1qq:  { title: 'IMS: Eastern Europe',           url: u('sbook1qq')          },
  sbook1p:   { title: 'IMS: Iberia',                   url: u('sbook1p')           },
};

// ── Hand-verified gazetteer for new events lacking coords ─────────────────────
// [lat, lon] for places whose location is genuinely well-established. ONLY these
// get coords; everything else stays coord-less (no fabrication). Verified against
// general geographic knowledge of each battle/place site.
const GAZETTEER = {
  ayn_jalut_1260:           [32.55, 35.34],  // Ayn Jalut, Jezreel Valley, Palestine
  barbarossa_death_1190:    [36.86, 33.50],  // Saleph (Göksu) River, Cilicia
  battle_berre_river_737:   [43.15, 2.93],   // Berre, near Narbonne
  battle_bremule_1119:      [49.32, 1.55],   // Brémule, Normandy
  battle_fontenay_841:      [47.64, 3.74],   // Fontenoy-en-Puisaye, Burgundy
  battle_golden_spurs_1302: [50.83, 3.27],   // Courtrai (Kortrijk), Flanders
  battle_mortemer_1054:     [49.75, 1.55],   // Mortemer, Normandy
  battle_of_agincourt_1415: [50.46, 2.14],   // Agincourt (Azincourt), Pas-de-Calais
  battle_saint_aubin_1053:  [47.70, -0.62],  // Saint-Aubin, Anjou
  edict_of_pistes_864:      [49.30, 1.40],   // Pîtres, Normandy
  first_crusade_1096:       [31.78, 35.23],  // Jerusalem (objective)
  first_crusade_launch_1096:[45.77, 3.08],   // Clermont (Council of Clermont 1095)
  second_crusade_launch_1146:[47.32, 3.57],  // Vézelay (St Bernard's preaching)
  fifth_crusade_1218:       [31.42, 31.81],  // Damietta, Egypt
  st_louis_crusade_1248:    [31.42, 31.81],  // Damietta, Egypt (Seventh Crusade)
  iconoclasm_begins_726:    [41.01, 28.98],  // Constantinople
  iconoclasm_ends_843:      [41.01, 28.98],  // Constantinople
  persian_campaigns_620:    [41.01, 28.98],  // Constantinople (Heraclius' base)
  plague_of_justinian_542:  [41.01, 28.98],  // Constantinople (epicentre of record)
  plague_amwas_638:         [31.84, 34.99],  // Amwas (Emmaus), Palestine
  rhineland_massacre_1096:  [49.99, 8.27],   // Mainz, Rhineland
  outrage_anagni_1303:      [41.73, 13.16],  // Anagni, Lazio
  truce_of_god_1063:        [42.60, 1.50],   // (Pyrenean church councils) — Urgell region
  synod_charroux_989:       [46.14, 0.40],   // Charroux, Poitou
  joan_of_arc_letter_1429:  [47.22, 0.07],   // Chinon / Loire (Joan's 1429 theatre)
  // Carolingian capitularies/diplomas issued at known palaces:
  capitulary_frankfurt_794: [50.11, 8.68],   // Frankfurt
  capitulary_herstal_779:   [50.66, 5.62],   // Herstal, near Liège
  capitulary_paderborn_785: [51.72, 8.75],   // Paderborn
  diploma_charlemagne_spanish_march_795: [42.30, 1.95], // Spanish March (Pyrenees)
  general_capitulary_missi_802: [50.95, 6.04], // Aachen (Charlemagne's capital)
  ordinance_817:            [50.95, 6.04],   // Aachen (Ordinatio Imperii 817)
  // ── Batch 1 (richest 8) new events — hand-verified locations only ───────────
  battle_chalons_451:        [48.96, 4.36],  // Catalaunian Plains, nr Châlons-en-Champagne
  battle_worringen_1288:     [51.05, 6.85],  // Worringen, N of Cologne
  besancon_episode_1157:     [47.24, 6.02],  // Besançon (Diet of 1157)
  council_nicaea_325:        [40.43, 29.72],  // İznik (ancient Nicaea), Bithynia — NOT the extractor's Black-Sea coord
  expulsion_jews_france_1182:[48.86, 2.35],  // Paris (Philip II's 1182 edict)
  expulsion_jews_spain_1492: [37.18, -3.60], // Granada (Alhambra Decree signed there, 1492)
  first_crusade_jerusalem_1099:[31.78, 35.23], // Jerusalem (Crusader capture)
  martyrdom_william_norwich_1144:[52.63, 1.30], // Norwich
  murder_thomas_becket_1170: [51.28, 1.08],  // Canterbury Cathedral
  plague_justinian_541:      [41.01, 28.98], // Constantinople (epicentre of the record)
  rhineland_massacres_1096:  [49.99, 8.27],  // Mainz/Rhineland (First Crusade pogroms)
  ritual_murder_charge_blois_1171:[47.59, 1.33], // Blois
  sack_rome_alaric_410:      [41.90, 12.50], // Rome
  york_massacre_1190:        [53.96, -1.08], // York (Clifford's Tower)
  // ── Batch 2 (final 19) new events — hand-verified single-point locations only ──
  arab_raid_rome_846:        [41.90, 12.46],  // Rome (St Peter's sacked, 846)
  battle_campaldino_1289:    [43.78, 11.78],  // Campaldino plain, Casentino, Tuscany
  battle_caravaggio_1448:    [45.50, 9.64],   // Caravaggio, Lombardy
  battle_falkirk_1298:       [55.99, -3.78],  // Falkirk, Scotland
  battle_kleidion_1014:      [41.36, 23.04],  // Kleidion pass, Belasitsa (Bulgaria/N.Macedonia)
  battle_standard_1138:      [54.30, -1.42],  // Cowton Moor, nr Northallerton
  battle_tannenberg_1410:    [53.49, 20.13],  // Grunwald/Tannenberg, Prussia
  bologna_faenza_forli_war_1275: [44.49, 11.34], // Bologna
  cade_rebellion_1450:       [51.51, -0.09],  // London (Jack Cade's revolt)
  christianisation_kyivan_rus_988: [50.45, 30.52], // Kyiv (988)
  christianization_rus_988:  [50.45, 30.52],  // Kyiv (dup id — same event)
  clovis_conversion_496:     [49.26, 4.03],   // Reims (baptism of Clovis)
  conversion_clovis_496:     [49.26, 4.03],   // Reims (dup id — same event)
  coronation_otto_i_963:     [41.90, 12.46],  // Rome (St Peter's, 962 imperial coronation)
  council_chalcedon_451:     [40.99, 29.03],  // Kadıköy (Chalcedon), opposite Constantinople
  council_constance_1415:    [47.66, 9.18],   // Konstanz
  council_ephesus_431:       [37.94, 27.34],  // Ephesus (Selçuk)
  council_lateran_i_1123:    [41.89, 12.51],  // Rome (Lateran)
  council_lateran_ii_1139:   [41.89, 12.51],  // Rome (Lateran)
  council_lateran_iii_1179:  [41.89, 12.51],  // Rome (Lateran)
  council_lateran_iv_1215:   [41.89, 12.51],  // Rome (Lateran)
  council_lyons_i_1245:      [45.76, 4.83],   // Lyon
  council_lyons_ii_1274:     [45.76, 4.83],   // Lyon
  council_nicaea_i_325:      [40.43, 29.72],  // İznik (Nicaea)
  council_nicea_ii_787:      [40.43, 29.72],  // İznik (Nicaea)
  council_orange_529:        [44.14, 4.81],   // Orange, Provence
  council_toledo_675:        [39.86, -4.03],  // Toledo
  dagome_iudex_991:          [52.41, 16.93],  // Gniezno/Poznań (Mieszko's realm) — capital of early Poland
  declaration_arbroath_1320: [56.56, -2.58],  // Arbroath Abbey
  foundation_quedlinburg_936:[51.79, 11.14],  // Quedlinburg
  great_schism_1378:         [41.90, 12.46],  // Rome (Western Schism begins)
  joan_arc_trial_1431:       [49.44, 1.10],   // Rouen
  martyrdom_boris_gleb_1015: [50.45, 30.52],  // Kyivan Rus (Kyiv) — dynastic murders, 1015
  otto_iii_charlemagne_search_1000:[50.78, 6.08], // Aachen (Charlemagne's tomb)
  papal_estates_600:         [41.90, 12.46],  // Rome (the Patrimony of St Peter)
  peace_league_bourges_1038: [47.08, 2.40],   // Bourges
  peace_treaty_florence_gimignano_1225:[43.47, 11.04], // San Gimignano, Tuscany
  peasant_revolt_1381:       [51.51, -0.09],  // London (English Rising of 1381)
  reggio_gesso_war_1287:     [44.70, 10.63],  // Reggio Emilia
  siege_carlaverock_1300:    [55.01, -3.53],  // Caerlaverock Castle, Scotland
  siege_florence_1312:       [43.77, 11.26],  // Florence
  union_kreva_1385:          [54.32, 26.25],  // Krevo/Kreva (Union of 1385), Belarus
  valentian_edict_445:       [41.90, 12.46],  // Rome (papal-primacy edict of Valentinian III)
  viking_raid_paris_siege_882_886:[48.85, 2.35], // Paris (Viking siege 885–886)
  warfare_perugia_1495:      [43.11, 12.39],  // Perugia
  // Intentionally LEFT coord-less (no single meaningful point — diffuse processes,
  // multi-year campaigns, voyages/journeys, deaths in the field). Batch 1:
  // barons_revolt_1215, battle_nouy_1044, charlemagne_letter_*, convention_mantaille_879,
  // death_attila_453, benjamin_tudela_1160. Batch 2: barbarian_invasions_395,
  // reconquista_1037_1270, ottoman_expansion_1300s_1512, second_third_crusades,
  // columbus_voyage_1492 / da_gama_voyage_1497 / magellan_circumnavigation_1519 /
  // leif_ericsson_vinland_1000 / vinland_discovery_1000 (voyages, no single point),
  // conversion_england, famine_1315, great_famine, embassy_ibn_fadlan_921,
  // edward_i_scotland_1296, and the various "warfare in <region>" diffuse-conflict
  // records (iceland/orkney/norway/pisa-genoa/naval), which have no single locus.
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, o) { if (!DRY) fs.writeFileSync(p, JSON.stringify(o, null, 1)); }

function existingIds(dir) {
  const d = path.join(ROOT, 'data', dir);
  if (!fs.existsSync(d)) return new Set();
  return new Set(fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));
}

// ── Merge ───────────────────────────────────────────────────────────────────
const manifest = { generated: '2026-06-01', dryRun: DRY, new_written: [], enriched: [], coords_applied: [], skipped: [] };

// 1. Write the Fordham source records (main + per-index) if absent.
const srcDir = path.join(ROOT, 'data', 'sources');
fs.mkdirSync(srcDir, { recursive: true });
for (const [id, rec] of [['ims_fordham', FORDHAM_SOURCE], ...Object.entries(INDEX_SOURCES).map(([k, v]) => {
  return ['ims_fordham_' + k, { kind: 'source', dataset: MAIN_DATASET, id: 'ims_fordham_' + k, title: v.title, author: FORDHAM_SOURCE.author, kind_type: 'primary', status: 'draft', url: v.url, license: 'public-domain' }];
})]) {
  const p = path.join(srcDir, id + '.json');
  if (!fs.existsSync(p)) { writeJson(p, rec); manifest.new_written.push('sources/' + id + '.json'); }
}

// 2. Merge each record kind from data/fordham/<dir> into data/<dir>.
// `text` = individual primary-source DOCUMENTS (chronicles/charters/saints lives).
// They are merged as kind:text (NOT source) — keeping them out of source.json
// avoids the bake id-collision trap (bake dedups sources by internal r.id). Texts
// carry no coords (a document is not a map point), so the gazetteer never touches
// them — the kind==='event' guard below gates coord application.
const KIND_DIRS = [['polity', 'entities'], ['event', 'events'], ['ruler', 'rulers'], ['institution', 'institutions'], ['text', 'texts']];

for (const [kind, dir] of KIND_DIRS) {
  const fordDir = path.join(ROOT, 'data', 'fordham', dir);
  if (!fs.existsSync(fordDir)) continue;
  const mainDir = path.join(ROOT, 'data', dir);
  fs.mkdirSync(mainDir, { recursive: true });
  const existing = existingIds(dir);

  for (const f of fs.readdirSync(fordDir).filter((x) => x.endsWith('.json'))) {
    const rec = readJson(path.join(fordDir, f));
    if (!rec || !rec.id) { manifest.skipped.push(dir + '/' + f); continue; }

    // Resolve the citation source ids: the main Fordham source + its index page.
    const idxKey = rec._fordham_index;
    const citeIds = ['ims_fordham'];
    if (idxKey && INDEX_SOURCES[idxKey]) citeIds.push('ims_fordham_' + idxKey);

    if (existing.has(rec.id)) {
      // COLLISION — enrich the EXISTING record's provenance only. Never overwrite.
      const p = path.join(mainDir, rec.id + '.json');
      let cur;
      try { cur = readJson(p); } catch { manifest.skipped.push(dir + '/' + rec.id + ' (unreadable)'); continue; }
      cur.provenance = cur.provenance && typeof cur.provenance === 'object' ? cur.provenance : { status: cur.status || 'draft', sources_used: [] };
      if (!Array.isArray(cur.provenance.sources_used)) cur.provenance.sources_used = [];
      let added = false;
      for (const cid of citeIds) {
        if (!cur.provenance.sources_used.includes(cid)) { cur.provenance.sources_used.push(cid); added = true; }
      }
      if (added) { writeJson(p, cur); manifest.enriched.push(dir + '/' + rec.id + '.json'); }
      continue;
    }

    // NEW — stamp to main dataset, attach citation + sourcebook marker, apply gazetteer.
    rec.dataset = MAIN_DATASET;
    rec.from_sourcebook = true;
    rec.provenance = rec.provenance && typeof rec.provenance === 'object' ? rec.provenance : {};
    rec.provenance.status = rec.provenance.status || 'draft';
    const prior = Array.isArray(rec.provenance.sources_used) ? rec.provenance.sources_used.filter((s) => !String(s).startsWith('fordham:')) : [];
    rec.provenance.sources_used = [...new Set([...prior, ...citeIds])];

    // COORDINATE SAFETY (strictest rule — eliminates fabrication risk entirely):
    // For events, the hand-verified GAZETTEER is the ONLY coordinate source. Any
    // coords the extractor supplied are DISCARDED — even if confident, they are not
    // human-verified. An event gets coords iff its id is in the gazetteer; otherwise
    // it stays coord-less (honest: shows in registers/timeline, not as a fake dot).
    // Texts never get coords (a document has no map point); other kinds keep none here.
    if (kind === 'event') {
      if (GAZETTEER[rec.id]) {
        rec.coords = GAZETTEER[rec.id];
        manifest.coords_applied.push('events/' + rec.id);
      } else if (rec.coords !== undefined) {
        delete rec.coords; // drop unverified extractor coords — gazetteer or nothing
      }
    }
    // Texts are documents, not places — never carry coords.
    if (kind === 'text' && rec.coords !== undefined) delete rec.coords;
    // Polity register reads name_primary; events/rulers read name. Mirror name→name_primary for polities.
    if (kind === 'polity' && rec.name && !rec.name_primary) rec.name_primary = rec.name;

    writeJson(path.join(mainDir, rec.id + '.json'), rec);
    manifest.new_written.push(dir + '/' + rec.id + '.json');
  }
}

// 3. Save the reversible manifest.
const auditDir = path.join(ROOT, 'data', '_audit');
fs.mkdirSync(auditDir, { recursive: true });
writeJson(path.join(auditDir, 'fordham-merge-manifest.json'), manifest);

console.log((DRY ? '[DRY RUN] ' : '') + 'Merge complete:');
console.log('  new written: ' + manifest.new_written.length);
console.log('  enriched (collisions): ' + manifest.enriched.length);
console.log('  coords applied: ' + manifest.coords_applied.length);
console.log('  skipped: ' + manifest.skipped.length);
console.log('  manifest → data/_audit/fordham-merge-manifest.json');
