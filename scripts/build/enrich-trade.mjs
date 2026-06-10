/**
 * enrich-trade.mjs — one-shot enrichment of public/data/layers/trade.geojson.
 *
 * The donor-built trade layer carried only { id, name, kind, start_year:null,
 * end_year:null } per route. This script merges in real, sourced historical
 * facts (summary, goods, hubs, mode, active years) by feature id WITHOUT touching
 * geometry, then writes the file back. The bake step preserves trade.geojson as-is,
 * so the enrichment persists across rebakes.
 *
 * All facts are real and route-specific (standard medieval economic history).
 * Years are the route's medieval period of significant activity, clamped to the
 * 500–1500 dataset window where a route predates or outlives it (noted in summary
 * when the route's true span is wider). `mode` ∈ overland | maritime | river-and-portage.
 *
 * Run: node scripts/build/enrich-trade.mjs
 * Idempotent: re-running overwrites the same enriched properties.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRADE_PATH = path.resolve(__dirname, '../../public/data/layers/trade.geojson');

/**
 * Real per-route facts, keyed by feature id. Each entry:
 *   summary    — 1–2 sentence historical description.
 *   goods      — primary commodities carried.
 *   hubs       — key cities / emporia along the route.
 *   mode       — overland | maritime | river-and-portage.
 *   start_year — first century CE of significant medieval activity.
 *   end_year   — last century CE of significant activity (within the dataset era).
 */
const FACTS = {
  silk_road_south: {
    summary: 'The southern overland Silk Road linked Constantinople and the Levant through Persia to the oasis cities of Central Asia. It carried Chinese silk west and Mediterranean glass, wool, and silver east, peaking under the Pax Mongolica of the 13th–14th centuries.',
    goods: ['silk', 'spices', 'glass', 'precious metals', 'paper'],
    hubs: ['Constantinople', 'Antioch', 'Baghdad', 'Merv', 'Samarkand'],
    mode: 'overland',
    start_year: 500,
    end_year: 1400,
  },
  silk_road_steppe: {
    summary: 'The steppe branch of the Silk Road ran north of the Caspian and Aral seas across the Eurasian grasslands, favoured by nomadic confederations and, later, the Mongol khanates who guaranteed its safety. Furs, horses, and slaves moved alongside eastern silk.',
    goods: ['furs', 'horses', 'silk', 'slaves', 'hides'],
    hubs: ['Sarai', 'Urgench', 'Otrar', 'Samarkand'],
    mode: 'overland',
    start_year: 600,
    end_year: 1400,
  },
  via_francigena: {
    summary: 'The Via Francigena was the great pilgrim and trade road from Canterbury through Reims and the Alpine passes to Rome, codified in 990 by Archbishop Sigeric. It bound northern Europe to the Italian markets and the Holy See.',
    goods: ['wool', 'cloth', 'wine', 'pilgrim provisions', 'relics'],
    hubs: ['Canterbury', 'Reims', 'Lausanne', 'Pavia', 'Rome'],
    mode: 'overland',
    start_year: 700,
    end_year: 1500,
  },
  camino_frances: {
    summary: 'The French Way of the Camino de Santiago carried pilgrims from the Pyrenees across northern Iberia to the shrine of Santiago de Compostela. From the 11th century it became a commercial artery lined with Cluniac monasteries, market towns, and Frankish merchant quarters.',
    goods: ['cloth', 'wine', 'metalwork', 'pilgrim badges', 'foodstuffs'],
    hubs: ['Roncesvalles', 'Pamplona', 'Burgos', 'León', 'Santiago de Compostela'],
    mode: 'overland',
    start_year: 1000,
    end_year: 1500,
  },
  amber_road: {
    summary: 'The Amber Road carried Baltic amber south from the Vistula and Sambian coasts across central Europe to the head of the Adriatic at Aquileia. An ancient artery, it remained active in the early medieval centuries supplying amber for devotional and luxury craft.',
    goods: ['amber', 'furs', 'wax', 'salt'],
    hubs: ['Truso', 'Kraków', 'Vienna', 'Aquileia'],
    mode: 'overland',
    start_year: 500,
    end_year: 1200,
  },
  rhine_rhone: {
    summary: 'The Rhine–Rhône corridor connected the North Sea to the Mediterranean through the heart of Lotharingia and Burgundy, the busiest north–south axis of Carolingian and later Frankish Europe. River barges and overland portages moved Flemish cloth and Rhenish wine.',
    goods: ['wine', 'cloth', 'salt', 'metal goods', 'grain'],
    hubs: ['Cologne', 'Mainz', 'Strasbourg', 'Lyon', 'Arles'],
    mode: 'river-and-portage',
    start_year: 700,
    end_year: 1500,
  },
  champagne_fairs: {
    summary: 'This route fed the Champagne fairs, the clearing-house of 12th–13th-century European commerce, where Flemish cloth met Italian silks and spices. The cycle of six annual fairs at Troyes, Provins, and Lagny set the rhythm of long-distance trade until Italian sea routes displaced them around 1300.',
    goods: ['woollen cloth', 'spices', 'silk', 'leather', 'credit instruments'],
    hubs: ['Bruges', 'Paris', 'Provins', 'Troyes', 'Lagny'],
    mode: 'overland',
    start_year: 1150,
    end_year: 1320,
  },
  via_egnatia: {
    summary: 'The Roman Via Egnatia crossed the southern Balkans from the Adriatic at Dyrrachium to Thessalonica and on to Constantinople, the principal land link between the Byzantine capital and the West. It served armies, embassies, and merchants throughout the Byzantine era.',
    goods: ['textiles', 'oil', 'wine', 'military supply'],
    hubs: ['Dyrrachium', 'Ohrid', 'Thessalonica', 'Constantinople'],
    mode: 'overland',
    start_year: 500,
    end_year: 1400,
  },
  med_western: {
    summary: 'The western Mediterranean arc joined the Italian maritime republics to Catalonia and the Strait of Gibraltar, fought over by Genoa, Pisa, and the Crown of Aragon. It carried Iberian and North-African goods into the Italian markets and Atlantic wares inward after the Genoese reopened the Strait around 1277.',
    goods: ['wool', 'salt', 'coral', 'leather', 'grain'],
    hubs: ['Genoa', 'Marseille', 'Barcelona', 'Valencia', 'Cádiz'],
    mode: 'maritime',
    start_year: 1000,
    end_year: 1500,
  },
  med_north_africa: {
    summary: 'The North-African coastal route tied the Maghrib ports to Sicily and the Levant, the maritime outlet for trans-Saharan gold and Ifriqiyan grain. Italian and Catalan merchants ran fondacos in Tunis and Alexandria under treaty with the Hafsid and Mamluk states.',
    goods: ['gold', 'grain', 'wax', 'leather', 'coral'],
    hubs: ['Tunis', 'Tripoli', 'Alexandria', 'Palermo'],
    mode: 'maritime',
    start_year: 800,
    end_year: 1500,
  },
  med_levant: {
    summary: 'The Levant circuit was the eastern Mediterranean spice lifeline, running from Venice and the Adriatic through the Aegean and Crete to the Crusader and Mamluk ports of Syria and Egypt. Through Acre and Alexandria flowed the pepper and silk of the Indian Ocean.',
    goods: ['pepper', 'spices', 'silk', 'cotton', 'sugar'],
    hubs: ['Venice', 'Candia', 'Acre', 'Alexandria', 'Damietta'],
    mode: 'maritime',
    start_year: 900,
    end_year: 1500,
  },
  aegean_route: {
    summary: 'The Aegean route linked Venice to Constantinople through the Ionian and Aegean seas, the spine of the Venetian Stato da Màr. Its island bases — Corfu, Modon, Coron, Negroponte — secured the galley convoys carrying Byzantine and Black-Sea goods west.',
    goods: ['silk', 'wine', 'currants', 'alum', 'grain'],
    hubs: ['Venice', 'Corfu', 'Modon', 'Negroponte', 'Constantinople'],
    mode: 'maritime',
    start_year: 1000,
    end_year: 1500,
  },
  pontic_route: {
    summary: 'The Pontic route opened the Black Sea to Genoese and Venetian galleys after 1261, reaching the Crimean emporium of Caffa and the Sea of Azov. It tapped the Mongol overland trade and the grain, fish, and slaves of the steppe until Ottoman closure in 1475.',
    goods: ['grain', 'slaves', 'fish', 'furs', 'silk'],
    hubs: ['Constantinople', 'Caffa', 'Tana', 'Trebizond'],
    mode: 'maritime',
    start_year: 1261,
    end_year: 1475,
  },
  atlantic_coast: {
    summary: 'The Atlantic seaboard route ran from the English Channel and Brittany down the Bay of Biscay to Iberia and the Strait of Gibraltar. From the late 13th century Genoese and Venetian galleys used it to link the Mediterranean directly with Bruges and the North Sea.',
    goods: ['wine', 'salt', 'wool', 'iron', 'dried fish'],
    hubs: ['Bristol', 'Nantes', 'La Rochelle', 'Lisbon', 'Cádiz'],
    mode: 'maritime',
    start_year: 1100,
    end_year: 1500,
  },
  red_sea_indian_ocean: {
    summary: 'The Red Sea corridor carried the spices and textiles of the Indian Ocean from Aden up to the Egyptian ports of the Mamluk sultanate, the richest leg of the medieval spice trade. The Kārimī merchants of Cairo controlled it, and Venice bought its cargoes at Alexandria.',
    goods: ['pepper', 'spices', 'incense', 'cotton', 'porcelain'],
    hubs: ['Aden', 'Jeddah', 'Quseir', 'Cairo', 'Alexandria'],
    mode: 'maritime',
    start_year: 700,
    end_year: 1500,
  },
  north_sea_channel: {
    summary: 'The North Sea and Channel route linked the cloth towns of Flanders and England to the Rhine mouth and the Baltic, anchored on Bruges, medieval Europe’s greatest commodity market. English wool sailed out and Hanseatic and Mediterranean goods sailed in.',
    goods: ['wool', 'cloth', 'wine', 'tin', 'herring'],
    hubs: ['London', 'Bruges', 'Antwerp', 'Hamburg'],
    mode: 'maritime',
    start_year: 1000,
    end_year: 1500,
  },
  baltic_hanseatic_north: {
    summary: 'The northern Hanseatic arc crossed the Baltic from Sweden and Gotland to the Gulf of Finland and the Novgorod trade. Visby and the Hansa kontor at Novgorod’s Peterhof handled the furs, wax, and stockfish of the Russian and Scandinavian north.',
    goods: ['furs', 'wax', 'stockfish', 'amber', 'timber'],
    hubs: ['Bergen', 'Visby', 'Reval', 'Novgorod'],
    mode: 'maritime',
    start_year: 1150,
    end_year: 1500,
  },
  baltic_hanseatic_south: {
    summary: 'The southern Hanseatic arc ran along the Wendish and Prussian coast from Lübeck through Danzig to the Gulf of Riga, the commercial core of the Hanseatic League. Grain and timber moved west; Lüneburg salt and Flemish cloth moved east.',
    goods: ['grain', 'timber', 'salt', 'cloth', 'amber'],
    hubs: ['Lübeck', 'Wismar', 'Danzig', 'Riga'],
    mode: 'maritime',
    start_year: 1150,
    end_year: 1500,
  },
  varangian_route: {
    summary: 'The Varangian route “from the Greeks to the Varangians” ran from the Baltic up the Volkhov and Lovat, portaged to the Dnieper, and down to the Black Sea and Constantinople. Scandinavian Rus traders and raiders carved it out in the 9th century, founding Novgorod and Kiev along the way.',
    goods: ['furs', 'slaves', 'wax', 'honey', 'silver'],
    hubs: ['Novgorod', 'Smolensk', 'Kiev', 'Constantinople'],
    mode: 'river-and-portage',
    start_year: 800,
    end_year: 1240,
  },
  volga_route: {
    summary: 'The Volga route linked the Baltic and the Rus lands to the Caspian and the Abbasid Caliphate through the Bulgar and, later, Khazar and Golden Horde markets. The flood of Islamic silver dirhams it brought north fuelled the Viking-age economy.',
    goods: ['furs', 'slaves', 'silver dirhams', 'honey', 'wax'],
    hubs: ['Bulgar', 'Itil', 'Sarai', 'Astrakhan'],
    mode: 'river-and-portage',
    start_year: 800,
    end_year: 1400,
  },
  trans_saharan_gold_salt: {
    summary: 'The trans-Saharan gold–salt route crossed the desert by camel caravan from the Maghrib to the Sahel empires of Ghana, Mali, and Songhai. Saharan rock-salt went south and West-African gold came north, supplying much of the bullion of the medieval Mediterranean.',
    goods: ['gold', 'salt', 'slaves', 'ivory', 'kola nuts'],
    hubs: ['Sijilmasa', 'Taghaza', 'Timbuktu', 'Gao'],
    mode: 'overland',
    start_year: 700,
    end_year: 1500,
  },
  indian_ocean_monsoon: {
    summary: 'The monsoon-driven Indian Ocean network bound East Africa, Arabia, India, and Southeast Asia into a single trading world, sailed by Arab, Persian, Gujarati, and Malay merchants. Seasonal winds carried spices, cotton, and porcelain between the Swahili coast and the Strait of Malacca.',
    goods: ['spices', 'cotton textiles', 'porcelain', 'ivory', 'gold'],
    hubs: ['Kilwa', 'Aden', 'Calicut', 'Malacca'],
    mode: 'maritime',
    start_year: 700,
    end_year: 1500,
  },
  silk_road_sogdian_branch: {
    summary: 'The Sogdian eastern branch ran from Samarkand across the Tarim Basin oases to the Gansu Corridor and the Tang capital. Sogdian merchants dominated this leg, planting trading colonies and carrying silk, paper, and Buddhist and Manichaean culture eastward.',
    goods: ['silk', 'paper', 'jade', 'horses', 'glass'],
    hubs: ['Samarkand', 'Kashgar', 'Dunhuang', 'Chang’an'],
    mode: 'overland',
    start_year: 500,
    end_year: 1300,
  },
  tea_horse_road: {
    summary: 'The Tea-Horse Road wound through the mountains of Sichuan and Yunnan into Tibet, exchanging Chinese brick tea for the war-horses of the Tibetan plateau. The trade became a formal state institution under the Song and remained vital through the medieval centuries.',
    goods: ['tea', 'horses', 'salt', 'medicinal herbs'],
    hubs: ['Ya’an', 'Kangding', 'Lhasa', 'Lijiang'],
    mode: 'overland',
    start_year: 700,
    end_year: 1500,
  },
  niger_river_trade: {
    summary: 'The Niger River network was the inland artery of the West-African Sahel, carrying the trade of Mali and Songhai between Jenne, Timbuktu, and Gao. River craft moved gold, grain, and salt to the desert-edge ports where the trans-Saharan caravans took over.',
    goods: ['gold', 'grain', 'salt', 'dried fish', 'kola nuts'],
    hubs: ['Jenne', 'Timbuktu', 'Gao'],
    mode: 'river-and-portage',
    start_year: 800,
    end_year: 1500,
  },
};

function main() {
  const raw = fs.readFileSync(TRADE_PATH, 'utf8');
  const fc = JSON.parse(raw);
  if (!fc || !Array.isArray(fc.features)) {
    throw new Error('[enrich-trade] trade.geojson is not a FeatureCollection');
  }

  let enriched = 0;
  const missing = [];
  for (const f of fc.features) {
    const id = f.properties?.id;
    const facts = id ? FACTS[id] : undefined;
    if (!facts) {
      missing.push(id ?? '(no id)');
      continue;
    }
    // Merge facts into properties WITHOUT touching geometry. Real start/end years
    // replace the prior nulls; the other fields are additive.
    f.properties = {
      ...f.properties,
      start_year: facts.start_year,
      end_year: facts.end_year,
      summary: facts.summary,
      goods: facts.goods,
      hubs: facts.hubs,
      mode: facts.mode,
    };
    enriched++;
  }

  if (missing.length) {
    throw new Error(
      `[enrich-trade] ${missing.length} route(s) had no facts entry: ${missing.join(', ')}. ` +
      'Refusing to write a partially-enriched layer.',
    );
  }

  fs.writeFileSync(TRADE_PATH, JSON.stringify(fc) + '\n');
  console.log(`[enrich-trade] enriched ${enriched}/${fc.features.length} trade routes → ${TRADE_PATH}`);
}

main();
