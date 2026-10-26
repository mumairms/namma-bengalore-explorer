'use strict';
// Run: node test/smoke.js  (starts the server on a random port and exercises the API)
const assert = require('assert');
process.env.TIPS_FILE = require('path').join(require('os').tmpdir(), 'namma-tips-test.json');
const server = require('../server');

const call = (base, path, opts) => fetch(base + path, opts).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (base, path, data) => call(base, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

server.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  try {
    let r = await call(base, '/api/health'); assert.strictEqual(r.body.ok, true);
    r = await call(base, '/api/places?category=food'); assert(r.body.count >= 8, 'food places');
    r = await post(base, '/api/triage', { text: 'huge pothole near my house in Jayanagar' });
    assert.strictEqual(r.body.results[0].issue.id, 'pothole'); assert.strictEqual(r.body.corporation.corporation, 'Bengaluru South');
    r = await post(base, '/api/triage', { text: 'no water supply since morning' }); assert.strictEqual(r.body.results[0].agency.id, 'bwssb');
    r = await post(base, '/api/triage', { text: 'my electricity bill is too high' }); assert.strictEqual(r.body.results[0].agency.id, 'bescom');
    r = await post(base, '/api/complaint', { issueId: 'garbage', area: 'Koramangala', details: 'Not collected for 4 days', name: 'Asha' });
    assert(r.body.letter.includes('Koramangala'));
    r = await post(base, '/api/plan', { moods: ['foodie', 'heritage'], budget: 2, hours: 5, startArea: 'Basavanagudi' });
    assert(r.body.stops.length >= 3, 'plan stops');
    r = await post(base, '/api/chat', { messages: [{ role: 'user', content: 'who handles sewage overflow?' }] });
    assert(/BWSSB|Water/.test(r.body.reply), r.body.reply);
    r = await post(base, '/api/chat', { messages: [{ role: 'user', content: 'who fixes potholes?' }] });
    assert.strictEqual(r.body.intent, 'civic', 'pothole chat intent ' + r.body.intent);
    r = await post(base, '/api/chat', { messages: [{ role: 'user', content: 'best dosa in Malleshwaram' }] });
    assert(r.body.cards.length > 0);
    r = await call(base, '/api/search?q=lake%20birds'); assert(r.body.results.length > 0);
    r = await call(base, '/api/events?month=11'); assert(r.body.events.some((e) => e.id === 'kadalekai'));
    r = await post(base, '/api/tips', { title: 'Test tip here', text: 'This is a long enough tip body for testing.', category: 'food' }); assert.strictEqual(r.status, 201);
    r = await post(base, '/api/tips/' + r.body.tip.id + '/upvote', {}); assert.strictEqual(r.body.tip.votes, 1);
    r = await post(base, '/api/tips', { title: 'Spam', text: 'visit http://spam.example now please ok' }); assert.strictEqual(r.status, 400);
    r = await fetch(base + '/'); assert.strictEqual(r.status, 200);
    r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200);
    console.log('All smoke tests passed');
    server.close(); process.exit(0);
  } catch (e) { console.error('FAILED:', e.message); server.close(); process.exit(1); }
});
