'use strict';
/* Namma Bengaluru - zero-dependency Node.js server (Node 18+) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, corporationFor, AREAS, saveTips } = require('./lib/store');
const { search } = require('./lib/search');
const { triage, draftComplaint } = require('./lib/triage');
const { plan } = require('./lib/planner');
const { chat } = require('./lib/assistant');

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// ---------- helpers ----------
const send = (res, code, body, headers = {}) => {
  const isStr = typeof body === 'string';
  res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isStr ? body : JSON.stringify(body));
};
const readBody = (req, limit = 20000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
  req.on('error', reject);
});

// tiny fixed-window rate limiter
const hits = new Map();
function limited(ip, bucket, max, windowMs) {
  const k = bucket + ':' + ip, now = Date.now();
  const rec = hits.get(k);
  if (!rec || now - rec.t > windowMs) { hits.set(k, { t: now, n: 1 }); return false; }
  return ++rec.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 600000) hits.delete(k); }, 300000).unref();

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const BAD = /(https?:\/\/|www\.|\bfuck|\bshit|\bbitch)/i;

// ---------- API routes ----------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

route('GET', '/api/health', () => ({ ok: true, uptime: process.uptime(), ai: process.env.ANTHROPIC_API_KEY ? 'claude' : 'local' }));

route('GET', '/api/meta', () => ({
  categories: [
    { id: 'food', label: 'Food', icon: '🍛' }, { id: 'heritage', label: 'Heritage', icon: '🏛️' },
    { id: 'lake', label: 'Lakes', icon: '🦆' }, { id: 'market', label: 'Markets', icon: '🌸' },
    { id: 'culture', label: 'Culture', icon: '🎭' }, { id: 'nightlife', label: 'Nightlife', icon: '🍻' },
    { id: 'startup', label: 'Startups', icon: '🚀' },
  ],
  areas: AREAS, counts: { places: db.places.length, issues: db.issues.length, events: db.events.length, tips: db.tips.length, agencies: db.agencies.length },
  ai: process.env.ANTHROPIC_API_KEY ? 'claude' : 'local',
}));

route('GET', '/api/places', ({ query }) => {
  let list = db.places;
  if (query.category && query.category !== 'all') list = list.filter((p) => p.category === query.category);
  if (query.price) list = list.filter((p) => p.price <= +query.price);
  if (query.area) list = list.filter((p) => p.area.toLowerCase().includes(query.area.toLowerCase()));
  if (query.tag) list = list.filter((p) => p.tags.includes(query.tag));
  if (query.q) {
    const ids = new Map(search(query.q, { kinds: ['place'], limit: 100 }).map((r, i) => [r.id, i]));
    list = list.filter((p) => ids.has(p.id)).sort((a, b) => ids.get(a.id) - ids.get(b.id));
  }
  return { count: list.length, places: list };
});
route('GET', '/api/places/:id', ({ params }) => {
  const p = db.places.find((x) => x.id === params.id);
  if (!p) return [404, { error: 'Place not found' }];
  const related = search(p.tags.join(' ') + ' ' + p.category, { kinds: ['place'], limit: 5 }).filter((r) => r.id !== p.id).slice(0, 3).map((r) => r.item);
  return { place: p, related, corporation: corporationFor(p.area)?.corporation || null };
});

route('GET', '/api/agencies', () => ({ agencies: db.agencies }));
route('GET', '/api/issues', () => ({ issues: db.issues.map(({ id, title, icon, agency }) => ({ id, title, icon, agency })) }));
route('GET', '/api/issues/:id', ({ params }) => {
  const i = db.issues.find((x) => x.id === params.id);
  if (!i) return [404, { error: 'Issue not found' }];
  return { issue: i, agency: db.agencies.find((a) => a.id === i.agency), also: (i.also || []).map((id) => db.agencies.find((a) => a.id === id)).filter(Boolean) };
});
route('POST', '/api/triage', ({ body }) => {
  const text = clean(body.text, 500);
  if (text.length < 3) return [400, { error: 'Describe the problem in a few words.' }];
  const results = triage(text, 3);
  const area = corporationFor(body.area || text);
  return { results, corporation: area, confidence: results[0] ? (results[0].score >= 5 ? 'high' : results[0].score >= 3 ? 'medium' : 'low') : 'none' };
});
route('GET', '/api/corporation', ({ query }) => {
  const c = corporationFor(query.area);
  return c ? { ...c, note: 'Indicative mapping - confirm your ward on the official GBA ward map.' } : [404, { error: 'No match. Try a nearby well-known locality.' }];
});
route('POST', '/api/complaint', ({ body }) => {
  const r = draftComplaint({ issueId: clean(body.issueId, 60), area: clean(body.area, 120), details: clean(body.details, 900), name: clean(body.name, 80), landmark: clean(body.landmark, 120), ticket: clean(body.ticket, 60) });
  return r || [400, { error: 'Unknown issue' }];
});

route('GET', '/api/events', ({ query }) => {
  const m = +query.month;
  let list = db.events;
  if (m >= 1 && m <= 12) list = list.filter((e) => e.month === m || e.month === 0);
  if (query.type) list = list.filter((e) => e.type === query.type);
  return { events: [...list].sort((a, b) => (a.month || 13) - (b.month || 13)) };
});
route('GET', '/api/phrases', () => ({ phrases: db.phrases }));
route('GET', '/api/search', ({ query }) => {
  const q = clean(query.q, 120);
  if (q.length < 2) return { results: [] };
  return { results: search(q, { limit: 10 }).map((r) => ({ kind: r.kind, id: r.id, score: r.score, title: r.item.name || r.item.title, subtitle: r.item.area || r.item.where || r.item.category || '', blurb: r.item.blurb || r.item.text || '', category: r.item.category || r.item.type || '' })) };
});
route('POST', '/api/plan', ({ body }) => plan(body));
route('POST', '/api/chat', async ({ body, ip }) => {
  if (limited(ip, 'chat', 30, 60000)) return [429, { error: 'Slow down a little - try again in a minute.' }];
  return chat(body.messages);
});

route('GET', '/api/tips', ({ query }) => {
  let list = [...db.tips];
  if (query.category && query.category !== 'all') list = list.filter((t) => t.category === query.category);
  list.sort(query.sort === 'new' ? (a, b) => b.createdAt.localeCompare(a.createdAt) : (a, b) => b.votes - a.votes);
  return { tips: list };
});
route('POST', '/api/tips', ({ body, ip }) => {
  if (limited(ip, 'tip', 5, 3600000)) return [429, { error: 'You can share up to 5 tips per hour. Thank you for contributing!' }];
  const tip = { title: clean(body.title, 80), text: clean(body.text, 500), area: clean(body.area, 60), category: clean(body.category, 20) || 'other', author: clean(body.author, 40) || 'A neighbour' };
  if (tip.title.length < 4 || tip.text.length < 15) return [400, { error: 'Add a title (4+ chars) and a few sentences (15+ chars).' }];
  if (BAD.test(tip.title + ' ' + tip.text + ' ' + tip.author)) return [400, { error: 'Links and abusive language are not allowed.' }];
  const rec = { id: 't' + crypto.randomBytes(4).toString('hex'), ...tip, votes: 0, createdAt: new Date().toISOString() };
  db.tips.unshift(rec); saveTips();
  return [201, { tip: rec }];
});
route('POST', '/api/tips/:id/upvote', ({ params, ip }) => {
  if (limited(ip, 'vote', 60, 3600000)) return [429, { error: 'Too many votes - try later.' }];
  const t = db.tips.find((x) => x.id === params.id);
  if (!t) return [404, { error: 'Tip not found' }];
  t.votes += 1; saveTips();
  return { tip: t };
});

// ---------- static files ----------
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(data);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com; connect-src 'self'");
  const url = new URL(req.url, 'http://localhost');
  const ip = req.socket.remoteAddress || 'x';
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const body = req.method === 'POST' ? await readBody(req) : {};
        const out = await r.handler({ params: m.groups || {}, query: Object.fromEntries(url.searchParams), body, ip });
        return Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
      }
      return send(res, 404, { error: 'Unknown endpoint' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`\n  Namma Bengaluru is running -> http://localhost:${PORT}\n  AI mode: ${process.env.ANTHROPIC_API_KEY ? 'Claude (live)' : 'local engine (set ANTHROPIC_API_KEY to enable Claude)'}\n`));
}
module.exports = server;
