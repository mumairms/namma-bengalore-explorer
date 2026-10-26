'use strict';
const { db, corporationFor, AREAS } = require('./store');
const { search } = require('./search');
const { triage } = require('./triage');
const { plan, MOOD_CATS } = require('./planner');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

const SYSTEM = `You are "Namma Guide", a warm, concise assistant for people living in or visiting Bengaluru (Bangalore).
You help with: (1) civic questions - which office handles what (GBA and its five city corporations, BESCOM, BWSSB, RTO, Traffic Police, KSPCB and others); (2) food, heritage, lakes, markets, culture, nightlife, events and the startup scene.
Rules:
- Ground answers in the CONTEXT JSON when it is relevant. Do not invent phone numbers, URLs, prices, opening hours or dates. If unsure, say so and tell the user to verify on the official site/app.
- Emergencies: 112 (all), 101 fire, 108 ambulance, 181 women, 1098 child, 1930 cyber-fraud. BESCOM 1912, BWSSB 1916.
- Civic answers: name the agency first, then 3-5 practical steps. Mention that ward/corporation mapping should be verified on the official ward map.
- Keep replies under about 170 words, friendly, with an occasional Kannada word (with meaning) when natural. Use short paragraphs or "-" bullets. No markdown headings.`;

function detectMonth(text) {
  const t = text.toLowerCase();
  for (let i = 0; i < 12; i++) if (t.includes(MONTHS[i]) || t.includes(MONTHS[i].slice(0, 3) + ' ')) return i + 1;
  if (/this month|now|currently|upcoming|coming up|next/.test(t)) return new Date().getMonth() + 1;
  return null;
}
function detectArea(text) {
  const t = text.toLowerCase();
  return AREAS.filter((a) => t.includes(a)).sort((a, b) => b.length - a.length)[0] || null;
}

/** Local (offline) intent engine. */
function localAnswer(text) {
  const t = text.toLowerCase();
  const cards = [];
  let reply = '';

  const tri = triage(text, 2);
  const civicWords = /(complain|complaint|who (do|should)|which (office|department)|report|issue|not working|no water|power cut|pothole|garbage|licence|license|tax|khata|challan|connection|bill|helpline|office)/.test(t);
  const wantsPlan = /(plan|itinerary|day out|spend a day|weekend|half day|full day|things to do|what to do|trip)/.test(t);
  const wantsPhrase = /(kannada|phrase|\bsay\b|speak|translate|learn)/.test(t);
  const wantsEvent = /(event|festival|happening|calendar|fair|celebrat|mela|jatre|habba|concert)/.test(t);
  const area = detectArea(t);

  if (/\b(corporation|ward)\b/.test(t) && area) {
    const c = corporationFor(area);
    reply = c ? `${area[0].toUpperCase() + area.slice(1)} generally falls under ${c.corporation} City Corporation (indicative - confirm your exact ward on the official GBA ward map).`
      : `I couldn't map "${area}" confidently. Look up your ward on the official GBA ward map.`;
    return { reply, cards, intent: 'corporation' };
  }

  if (tri.length && tri[0].score >= 3 && (civicWords || tri[0].score >= 5) && !wantsPlan) {
    const top = tri[0];
    reply = `That's a job for ${top.agency.name}.` + (top.agency.helpline ? ` Helpline: ${top.agency.helpline}.` : '') +
      `\n\n${top.issue.steps.slice(0, 4).map((s) => '- ' + s).join('\n')}` +
      (top.also.length ? `\n\nAlso involved: ${top.also.map((a) => a.short).join(', ')}.` : '');
    tri.forEach((x) => cards.push({ type: 'issue', id: x.issue.id, title: x.issue.title, icon: x.issue.icon, agency: x.agency.short, helpline: x.agency.helpline }));
    return { reply, cards, intent: 'civic' };
  }

  if (wantsPhrase) {
    const qt = new Set(t.split(/[^a-z]+/).filter((w) => w.length > 3 && !['kannada', 'phrase', 'phrases', 'speak', 'translate', 'learn', 'say', 'how'].includes(w)));
    const scored = db.phrases.map((p) => ({ p, n: (p.en + ' ' + p.rom + ' ' + p.cat).toLowerCase().split(/[^a-z]+/).filter((w) => qt.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const hits = scored.map((x) => x.p);
    const pick = (hits.length ? hits : db.phrases.filter((p) => ['Greetings', 'Local flavour', 'Getting around'].includes(p.cat))).slice(0, 5);
    reply = 'A few Kannada phrases to start with. Locals love it when you try, even badly.';
    pick.forEach((p) => cards.push({ type: 'phrase', ...p }));
    return { reply, cards, intent: 'phrases' };
  }

  if (wantsPlan) {
    const moods = Object.keys(MOOD_CATS).filter((m) => t.includes(m) || (MOOD_CATS[m].some((c) => t.includes(c))) || (m === 'foodie' && /(food|eat|breakfast|dosa|coffee|biryani)/.test(t)) || (m === 'startup' && /(startup|founder|tech)/.test(t)) || (m === 'nature' && /(lake|park|garden|bird)/.test(t)) || (m === 'heritage' && /(history|temple|palace|old)/.test(t)) || (m === 'shopping' && /(market|shop)/.test(t)));
    const hours = /full day|all day/.test(t) ? 8 : /half day|morning|few hours/.test(t) ? 4 : 5;
    const veg = /\bveg(etarian)?\b/.test(t) && !/non[- ]?veg/.test(t);
    const p = plan({ moods, hours, vegOnly: veg, startArea: area || undefined, budget: /cheap|budget|low cost/.test(t) ? 1 : /luxury|fine dining|splurge/.test(t) ? 3 : 2 });
    reply = `Here's a ${hours}-hour route${p.moods.length ? ' for ' + p.moods.join(' + ') : ''} starting near ${p.start.label}: ` + p.stops.map((s) => `${s.arrive} ${s.name}`).join(' -> ') + '. Open the Day Planner to tweak it.';
    p.stops.forEach((s) => cards.push({ type: 'place', id: s.id, name: s.name, area: s.area, category: s.category, blurb: s.blurb }));
    return { reply, cards, intent: 'plan' };
  }

  if (wantsEvent) {
    const m = detectMonth(t);
    let evs = db.events.filter((e) => e.month === 0 || !m || e.month === m);
    if (m) evs = evs.sort((a, b) => (a.month === 0) - (b.month === 0));
    evs = evs.slice(0, 5);
    reply = (m ? `Typical happenings in ${MONTHS[m - 1]}` : 'Some recurring Bengaluru events') + ' - dates move with the lunar calendar, so verify before you go.';
    evs.forEach((e) => cards.push({ type: 'event', id: e.id, name: e.name, where: e.where, month: e.month, blurb: e.blurb }));
    return { reply, cards, intent: 'events' };
  }

  const hits = search(text, { kinds: ['place', 'tip', 'event'], limit: 5 });
  if (hits.length) {
    const places = hits.filter((h) => h.kind === 'place');
    const top = places[0] || hits[0];
    reply = top.kind === 'place'
      ? `${top.item.name} (${top.item.area}) is a strong match: ${top.item.blurb} ${top.item.tip}`
      : `${top.item.name || top.item.title}: ${top.item.blurb || top.item.text}`;
    if (places.length > 1) reply += `\n\nAlso consider: ${places.slice(1, 4).map((h) => h.item.name).join(', ')}.`;
    hits.forEach((h) => {
      if (h.kind === 'place') cards.push({ type: 'place', id: h.id, name: h.item.name, area: h.item.area, category: h.item.category, blurb: h.item.blurb });
      else if (h.kind === 'event') cards.push({ type: 'event', id: h.id, name: h.item.name, where: h.item.where, month: h.item.month, blurb: h.item.blurb });
    });
    return { reply, cards, intent: 'search' };
  }

  return {
    reply: "I'm not sure I have that yet. Try asking something like \"who fixes potholes?\", \"best dosa in Malleshwaram\", \"plan a heritage day\" or \"events in November\".",
    cards, intent: 'fallback',
  };
}

async function claudeAnswer(messages, local) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof fetch !== 'function') return null;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const ctx = {
    civic: triage(last.content, 2).map((x) => ({ issue: x.issue.title, agency: x.agency.name, helpline: x.agency.helpline, steps: x.issue.steps, documents: x.issue.docs })),
    places: search(last.content, { kinds: ['place'], limit: 5 }).map((h) => ({ name: h.item.name, area: h.item.area, category: h.item.category, blurb: h.item.blurb, tip: h.item.tip, best: h.item.best })),
    events: search(last.content, { kinds: ['event'], limit: 3 }).map((h) => ({ name: h.item.name, month: h.item.month, where: h.item.where, blurb: h.item.blurb })),
    today: new Date().toISOString().slice(0, 10),
  };
  const msgs = messages.slice(-8).map((m, i, arr) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: i === arr.length - 1 ? `CONTEXT: ${JSON.stringify(ctx)}\n\nQUESTION: ${m.content}` : m.content,
  }));
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: SYSTEM, messages: msgs }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return text ? { reply: text, cards: local.cards, intent: local.intent, mode: 'claude' } : null;
  } catch (e) {
    console.warn('[assistant] Claude call failed, using local engine:', e.message);
    return null;
  } finally { clearTimeout(to); }
}

async function chat(messages) {
  const safe = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 1200) }))
    .slice(-12);
  const last = [...safe].reverse().find((m) => m.role === 'user');
  if (!last) return { reply: 'Namaskara! Ask me about civic problems, food, heritage, events or startups.', cards: [], intent: 'greeting', mode: 'local' };
  const local = localAnswer(last.content);
  const ai = await claudeAnswer(safe, local);
  return ai || { ...local, mode: 'local' };
}

module.exports = { chat, localAnswer };
