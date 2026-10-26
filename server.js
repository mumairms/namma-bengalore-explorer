'use strict';
/* Namma Bengaluru - zero-dependency Node.js server (Node 18+) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./lib/api');

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

// ---------- static files ----------
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, must-revalidate',
    });
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
      const body = () => (req.method === 'POST' ? readBody(req) : {});
      const [code, out] = await handleApi({ method: req.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), body, ip });
      return send(res, code, out);
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
