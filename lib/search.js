'use strict';
const { db } = require('./store');

const STOP = new Set('a an the of in on at to for is are and or with my me i we how do does can what where who which near best good about from it this that there any some please tell show find want need'.split(' '));
const SYN = {
  dosa: ['dose', 'benne', 'tiffin', 'idli'], idli: ['tiffin', 'breakfast'], coffee: ['kaapi', 'filter'],
  pub: ['bar', 'brewery', 'nightlife'], bar: ['pub', 'nightlife'], party: ['nightlife', 'pub'],
  startup: ['founder', 'startups', 'incubator', 'coworking', 'tech'], founder: ['startup'],
  lake: ['tank', 'kere', 'birds'], park: ['garden', 'nature'], temple: ['gudi', 'heritage'],
  history: ['heritage', 'palace', 'old-city'], old: ['heritage', 'old-city'], shopping: ['market', 'bazaar'],
  market: ['bazaar', 'santhe'], art: ['gallery', 'museum'], music: ['concert', 'carnatic'],
  cheap: ['street-food', 'budget'], kids: ['family', 'science'], walk: ['park', 'lake'],
  biryani: ['non-veg', 'meghana'], veg: ['vegetarian'], theatre: ['plays', 'drama'], book: ['books', 'literature'],
};

const tok = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ಀ-೿\s-]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
const stem = (t) => {
  if (t.length <= 3) return t;
  if (/ies$/.test(t)) t = t.replace(/ies$/, 'y');
  else if (/s$/.test(t) && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 5 && /ing$/.test(t)) t = t.slice(0, -3);
  else if (t.length > 4 && /ed$/.test(t)) t = t.slice(0, -2);
  return t;
};

function expand(tokens) {
  const out = new Set();
  tokens.forEach((t) => { out.add(stem(t)); (SYN[t] || SYN[stem(t)] || []).forEach((s) => out.add(s)); });
  return [...out];
}

function buildDocs() {
  const docs = [];
  db.places.forEach((p) => docs.push({
    kind: 'place', id: p.id, ref: p,
    fields: [[p.name, 4], [p.tags.join(' '), 3], [p.category, 3], [p.area, 2.5], [p.blurb, 2], [p.story, 1], [p.tip, 0.7]],
  }));
  db.events.forEach((e) => docs.push({
    kind: 'event', id: e.id, ref: e,
    fields: [[e.name, 4], [e.tags.join(' '), 3], [e.type, 2], [e.where, 2], [e.blurb, 1.5]],
  }));
  db.issues.forEach((i) => docs.push({
    kind: 'issue', id: i.id, ref: i,
    fields: [[i.title, 4], [i.keywords.join(' '), 3], [i.steps.join(' '), 0.6]],
  }));
  db.tips.forEach((t) => docs.push({
    kind: 'tip', id: t.id, ref: t,
    fields: [[t.title, 3], [t.text, 1.5], [t.area, 2], [t.category, 2]],
  }));
  return docs.map((d) => ({ ...d, tf: d.fields.map(([txt, w]) => [new Set(tok(txt).map(stem)), tok(txt), w]) }));
}

let cache = null, cacheTips = null, cacheLen = -1;
function docs() {
  if (!cache || cacheTips !== db.tips || cacheLen !== db.tips.length) { cache = buildDocs(); cacheTips = db.tips; cacheLen = db.tips.length; }
  return cache;
}

function search(query, { kinds, limit = 12 } = {}) {
  const q = tok(query);
  if (!q.length) return [];
  const exp = expand(q);
  const base = new Set(q.map(stem));
  const all = docs();
  // idf
  const df = new Map();
  exp.forEach((t) => { let n = 0; all.forEach((d) => { if (d.tf.some(([set]) => set.has(t))) n++; }); df.set(t, n); });
  const N = all.length;
  const results = [];
  for (const d of all) {
    if (kinds && !kinds.includes(d.kind)) continue;
    let score = 0;
    for (const t of exp) {
      const idf = Math.log(1 + N / (1 + df.get(t)));
      const boost = base.has(t) ? 1 : 0.55;
      for (const [set, raw, w] of d.tf) {
        if (set.has(t)) score += w * idf * boost;
        else if (t.length > 3 && raw.some((r) => r.startsWith(t) || (r.length > 4 && t.startsWith(r)))) score += w * idf * boost * 0.5;
      }
    }
    if (d.kind === 'tip') score += Math.min(2, (d.ref.votes || 0) / 15);
    if (score > 0) results.push({ kind: d.kind, id: d.id, score: +score.toFixed(3), item: d.ref });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { search, tok, stem };
