'use strict';
const { db } = require('./store');

const MOOD_CATS = {
  foodie: ['food'], heritage: ['heritage'], nature: ['lake', 'heritage'], culture: ['culture'],
  nightlife: ['nightlife'], startup: ['startup'], shopping: ['market'],
};
const DURATION = { food: 50, heritage: 75, market: 60, lake: 45, culture: 75, nightlife: 120, startup: 60 };
const DEFAULT_START = { lat: 12.9763, lng: 77.5929, label: 'Cubbon Park' };

function km(a, b) {
  const R = 6371, r = (d) => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const travelMin = (d) => Math.max(8, Math.round((d * 1.4) / 16 * 60)); // city-traffic average ~16 km/h
const fmt = (min) => { const h = Math.floor(min / 60) % 24, m = Math.round(min % 60); const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`; };

function resolveStart(input) {
  if (input && typeof input.lat === 'number' && typeof input.lng === 'number') return { lat: input.lat, lng: input.lng, label: 'Your location' };
  const name = String((input && input.startArea) || '').toLowerCase().trim();
  if (name) {
    const hit = db.places.find((p) => p.area.toLowerCase().includes(name) || p.name.toLowerCase().includes(name));
    if (hit) return { lat: hit.lat, lng: hit.lng, label: hit.area };
  }
  return DEFAULT_START;
}

function plan(input = {}) {
  const moods = (Array.isArray(input.moods) ? input.moods : []).filter((m) => MOOD_CATS[m]);
  const active = moods.length ? moods : ['foodie', 'heritage'];
  const cats = new Set(active.flatMap((m) => MOOD_CATS[m]));
  const budget = Math.min(3, Math.max(1, +input.budget || 2));
  const hours = Math.min(12, Math.max(2, +input.hours || 5));
  const vegOnly = !!input.vegOnly;
  const start = resolveStart(input);
  const onlyNight = active.length === 1 && active[0] === 'nightlife';
  const startMin = Math.round((Number.isFinite(+input.startHour) && input.startHour !== '' && input.startHour != null ? +input.startHour : (onlyNight ? 18 : 8)) * 60);

  let pool = db.places.filter((p) => cats.has(p.category));
  if (vegOnly) pool = pool.filter((p) => p.category !== 'food' || p.tags.includes('veg'));
  if (!pool.length) pool = db.places.slice();

  const scored = pool.map((p) => {
    let s = 10;
    if (p.price > budget) s -= (p.price - budget) * 4;
    const d = km(start, p);
    s -= Math.min(8, d * 0.6);
    active.forEach((m) => { if (MOOD_CATS[m].includes(p.category)) s += 2; });
    return { p, s };
  }).sort((a, b) => b.s - a.s);

  const total = hours * 60;
  const stops = [];
  let cur = { ...start }, clock = startMin, used = 0;
  const left = scored.slice(0, 14);
  while (left.length) {
    // nearest-neighbour weighted by score
    let bi = -1, bv = -Infinity;
    left.forEach((c, i) => {
      const d0 = km(cur, c.p), h = (clock + (stops.length ? travelMin(d0) : 0)) / 60;
      const v = c.s - d0 * 0.9 * (stops.length ? 1 : 0.3) + timeFit(c.p, h);
      if (v > bv) { bv = v; bi = i; }
    });
    const { p } = left.splice(bi, 1)[0];
    const d = km(cur, p), tm = stops.length ? travelMin(d) : (d > 1 ? travelMin(d) : 0);
    const dur = DURATION[p.category] || 60;
    if (used + tm + dur > total && stops.length >= 2) continue;
    if (used + tm + dur > total + 20 && stops.length >= 1) continue;
    clock += tm; used += tm;
    const arrive = clock;
    const note = timingNote(p, arrive);
    stops.push({ ...p, arrive: fmt(arrive), leave: fmt(arrive + dur), travelMinutes: tm, travelKm: +d.toFixed(1), minutes: dur, note });
    clock += dur; used += dur; cur = p;
    if (stops.length >= 7) break;
  }
  const distance = stops.reduce((s, x) => s + x.travelKm, 0);
  return {
    start, moods: active, budget, hours,
    stops, summary: {
      stops: stops.length, totalKm: +distance.toFixed(1),
      ends: stops.length ? stops[stops.length - 1].leave : fmt(startMin),
      tip: stops.length ? 'Traffic can double travel times at 8-11 am and 5-9 pm; the metro is the safest bet for Central, MG Road, Indiranagar and Majestic hops.' : 'No matching places - try other moods.',
    },
  };
}

/** Reward places that suit the hour they'd be visited. */
function timeFit(p, h) {
  const best = (p.best || '').toLowerCase();
  let f = 0;
  if (/(5-8 am|dawn|early morning|before 9|before 10)/.test(best)) f += h <= 10 ? 4 : -5;
  if (/(evening|night|after 6|after iftar|sunset)/.test(best)) f += h >= 16 ? 4 : -6;
  if (p.category === 'food') {
    const brk = p.tags.includes('breakfast');
    if (h < 10.5) f += brk ? 5 : -3;
    else if (h >= 12 && h < 15) f += brk ? -3 : 3;
    else if (h >= 15 && brk) f -= 2;
  }
  if (p.category === 'nightlife') f += h >= 17 ? 4 : -8;
  return f;
}

function timingNote(p, arriveMin) {
  const h = arriveMin / 60, best = (p.best || '').toLowerCase();
  if (/(5-8 am|dawn|early morning|before 9|before 10)/.test(best) && h > 10) return `Best earlier: ${p.best}.`;
  if (/(evening|night|after 6|after iftar|sunset)/.test(best) && h < 15) return `Comes alive later: ${p.best}.`;
  if (p.category === 'food' && h > 11 && h < 12 && p.tags.includes('breakfast')) return 'Breakfast spot - may be winding down.';
  return '';
}

module.exports = { plan, MOOD_CATS, km };
