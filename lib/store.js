'use strict';
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'data');

// Static require() so bundlers (Netlify Functions) inline the data files.
const SEED_TIPS = require('../data/tips.json');
const db = {
  agencies: require('../data/agencies.json'),
  issues: require('../data/issues.json'),
  places: require('../data/places.json'),
  events: require('../data/events.json'),
  phrases: require('../data/phrases.json'),
  tips: [],
};

// Indicative area -> corporation mapping. Ward boundaries are the source of truth.
const CORPORATIONS = {
  'Bengaluru Central': ['mg road','shivajinagar','church street','commercial street','richmond town','shantinagar','chickpet','kr market','kalasipalya','vasanth nagar','cubbon park','gandhinagar','ulsoor','halasuru','frazer town','cunningham road','lavelle road','brigade road','majestic'],
  'Bengaluru East': ['indiranagar','whitefield','marathahalli','kr puram','mahadevapura','cv raman nagar','domlur','bellandur','varthur','hoodi','kadugodi','ramamurthy nagar','hal','old airport road','kundalahalli','brookefield'],
  'Bengaluru South': ['jayanagar','basavanagudi','jp nagar','btm layout','btm','hsr layout','hsr','koramangala','bommanahalli','banashankari','electronic city','bannerghatta road','wilson garden','lalbagh','madiwala','kumaraswamy layout','uttarahalli','begur','silk board'],
  'Bengaluru North': ['yelahanka','hebbal','rt nagar','sadashivanagar','jakkur','dasarahalli','peenya','nagawara','manyata','kodigehalli','sahakara nagar','thanisandra','vidyaranyapura','jalahalli','hennur','kammanahalli'],
  'Bengaluru West': ['rajajinagar','malleshwaram','vijayanagar','basaveshwaranagar','kengeri','rr nagar','rajarajeshwari nagar','chamarajpet','mahalakshmi layout','nagarbhavi','yeshwanthpur','magadi road','sheshadripuram','srirampura','gavipuram','kamakshipalya'],
};

function corporationFor(areaText) {
  const q = String(areaText || '').toLowerCase().trim();
  if (!q) return null;
  let best = null;
  for (const [corp, areas] of Object.entries(CORPORATIONS)) {
    for (const a of areas) {
      if (q === a || new RegExp('(^|[^a-z])' + a.replace(/ /g, '\\s+') + '($|[^a-z])').test(q)) {
        const score = a.length;
        if (!best || score > best.score) best = { corporation: corp, matched: a, score };
      }
    }
  }
  return best && { corporation: best.corporation, matched: best.matched };
}

const AREAS = [...new Set(Object.values(CORPORATIONS).flat())].sort();

// --- tips persistence (JSON file) ---
const TIPS_FILE = path.join(DATA, 'tips.json');
const TIPS_RUNTIME = process.env.TIPS_FILE || path.join(DATA, 'tips.runtime.json');
function loadTips() {
  try { db.tips = JSON.parse(fs.readFileSync(TIPS_RUNTIME, 'utf8')); }
  catch { db.tips = SEED_TIPS.map((t) => ({ ...t })); }
}
let writing = false, dirty = false;
function saveTips() {
  if (writing) { dirty = true; return; }
  writing = true;
  const tmp = TIPS_RUNTIME + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db.tips, null, 1), (e) => {
    if (!e) fs.rename(tmp, TIPS_RUNTIME, () => done());
    else done();
  });
  function done() { writing = false; if (dirty) { dirty = false; saveTips(); } }
}
loadTips();

module.exports = { db, corporationFor, AREAS, CORPORATIONS, saveTips, TIPS_FILE, SEED_TIPS };
