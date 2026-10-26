'use strict';
/* ==========================================================================
   Namma Bengaluru — Modern Single-Page App Logic (Vanilla JS, Zero Dependencies)
   ========================================================================== */

(() => {
  // ---------- Helpers & Utilities ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FULLM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const ls = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* storage full or private mode */
      }
    },
  };

  async function api(path, opts) {
    const o = opts ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts) } : undefined;
    const r = await fetch('/api' + path, o);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const debounce = (fn, ms = 250) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const rupee = (n) => {
    n = Math.max(1, Math.min(3, n || 1));
    return '<span style="color:var(--brand);font-weight:700">' + '₹'.repeat(n) + '</span><span style="opacity:.25">' + '₹'.repeat(3 - n) + '</span>';
  };

  const copy = async (text, msg = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg + ' ✓');
    } catch {
      toast('Please select and copy manually');
    }
  };

  // ---------- Application State ----------
  const S = {
    meta: null,
    places: [],
    agencies: [],
    issues: [],
    saved: new Set(ls.get('nb-saved', [])),
    voted: new Set(ls.get('nb-voted', [])),
    chat: ls.get('nb-chat', []),
  };

  const CAT = {};
  const saveSaved = () => {
    ls.set('nb-saved', [...S.saved]);
    const b = $('#savedCount');
    if (b) {
      b.hidden = !S.saved.size;
      b.textContent = S.saved.size;
    }
    const mb = $('#savedCountMobile');
    if (mb) {
      mb.hidden = !S.saved.size;
      mb.textContent = S.saved.size;
    }
    const ml = $('#menuSavedLabel');
    if (ml) {
      ml.textContent = S.saved.size ? `${S.saved.size} place${S.saved.size === 1 ? '' : 's'} saved` : 'View your shortlisted spots';
    }
  };

  const placeById = (id) => S.places.find((p) => p.id === id);
  const catIcon = (c) => (CAT[c] ? CAT[c].icon : '📍');
  const catLabel = (c) => (CAT[c] ? CAT[c].label : c);

  // ---------- Live City Clock & Greeting ----------
  function updateCityPulse() {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    const hrs = ist.getHours();
    const mins = String(ist.getMinutes()).padStart(2, '0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const displayHrs = ((hrs + 11) % 12) + 1;

    const el = $('#pulseTime');
    if (el) {
      el.textContent = `Bengaluru · 24°C · ${displayHrs}:${mins} ${ampm} IST`;
    }
  }
  setInterval(updateCityPulse, 30000);

  function getGreeting() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    const h = ist.getHours();
    if (h >= 5 && h < 12) return { kn: 'ಶುಭ ಮುಂಜಾನೆ', en: 'Good Morning' };
    if (h >= 12 && h < 16) return { kn: 'ಶುಭ ಮಧ್ಯಾಹ್ನ', en: 'Good Afternoon' };
    if (h >= 16 && h < 21) return { kn: 'ಶುಭ ಸಂಜೆ', en: 'Good Evening' };
    return { kn: 'ಶುಭ ರಾತ್ರಿ', en: 'Namaskara' };
  }

  // ---------- Reusable Renderers ----------
  function placeCard(p) {
    const on = S.saved.has(p.id);
    return `
    <div class="pwrap fade">
      <button class="pcard cat-${esc(p.category)}" data-action="place" data-id="${esc(p.id)}" aria-label="View details for ${esc(p.name)}">
        <div class="band">
          <span aria-hidden="true">${catIcon(p.category)}</span>
          <span class="pill">${esc(catLabel(p.category))}</span>
        </div>
        <div class="body">
          <h3>${esc(p.name)}</h3>
          <div class="meta">
            <span>📍 ${esc(p.area)}</span>
            <span>${rupee(p.price)}</span>
            ${p.best ? `<span>🕒 ${esc(p.best)}</span>` : ''}
          </div>
          <p>${esc(p.blurb)}</p>
          ${p.tip ? `<div class="tip-pill"><b>Tip:</b> <span class="small">${esc(p.tip)}</span></div>` : ''}
        </div>
      </button>
      <button class="save" data-action="save" data-id="${esc(p.id)}" aria-pressed="${on}" title="${on ? 'Remove from saved' : 'Save place'}" aria-label="${on ? 'Unsave' : 'Save'} ${esc(p.name)}">
        ${on ? '♥' : '♡'}
      </button>
    </div>`;
  }

  const skeletons = (n = 6) => `<div class="grid">${'<div class="skeleton"></div>'.repeat(n)}</div>`;

  function md(text) {
    const lines = esc(text).split('\n');
    let out = '', list = false;
    for (const l of lines) {
      if (/^\s*[-*] /.test(l)) {
        if (!list) { out += '<ul>'; list = true; }
        out += '<li>' + l.replace(/^\s*[-*] /, '') + '</li>';
      } else {
        if (list) { out += '</ul>'; list = false; }
        if (l.trim()) out += '<p>' + l + '</p>';
      }
    }
    return (out + (list ? '</ul>' : '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

  // ---------- Modal Management ----------
  function openModal(html) {
    const m = $('#modal');
    $('#modalCard').innerHTML = `
      <button class="icon-btn modal-x" data-action="close-modal" aria-label="Close dialog">✕</button>
      ${html}
    `;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#modalCard').scrollTop = 0;
    const closeBtn = $('.modal-x');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    const m = $('#modal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  }

  function showPlace(id) {
    const p = placeById(id);
    if (!p) return;
    const on = S.saved.has(id);
    const rel = S.places
      .filter((x) => x.id !== id && (x.category === p.category || x.tags.some((t) => p.tags.includes(t))))
      .slice(0, 3);

    openModal(`
      <div class="pcard cat-${esc(p.category)}" style="cursor:default;border:0;box-shadow:none;background:none;margin-bottom:8px">
        <div class="band" style="border-radius:16px;height:110px">
          <span style="font-size:2.8rem">${catIcon(p.category)}</span>
          <span class="pill">${esc(catLabel(p.category))}</span>
        </div>
      </div>
      <h2 style="margin-top:14px;font-size:1.8rem">${esc(p.name)}</h2>
      <div class="kv" style="margin:10px 0 16px">
        <span>📍 ${esc(p.area)}</span>
        <span>${rupee(p.price)}</span>
        <span>🕒 Best time: ${esc(p.best)}</span>
      </div>
      <p style="font-size:1.06rem;color:var(--ink);font-weight:600">${esc(p.blurb)}</p>
      <p style="line-height:1.65">${esc(p.story)}</p>
      <div class="warn" style="margin:18px 0">
        💡 <b>Insider Tip:</b> ${esc(p.tip)}
      </div>
      <div class="kv" style="margin-bottom:18px">
        ${p.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}
      </div>
      <div class="chips" style="margin:18px 0;gap:10px">
        <button class="btn btn-primary" data-action="save" data-id="${esc(p.id)}">${on ? '♥ Saved' : '♡ Save'}</button>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}">↗ Google Maps</a>
        <button class="btn" data-action="plan-from" data-area="${esc(p.area)}">🗺️ Plan Day From Here</button>
        <button class="btn" data-action="who-corp" data-area="${esc(p.area)}">🏛️ City Corporation</button>
      </div>
      ${rel.length ? `
        <h3 style="margin-top:24px;margin-bottom:10px">You might also like</h3>
        <div class="chips">${rel.map((r) => `<button class="chip" data-action="place" data-id="${esc(r.id)}">${catIcon(r.category)} ${esc(r.name)}</button>`).join('')}</div>
      ` : ''}
    `);
  }

  // ---------- Interactive Leaflet Map (Lazy Loader) ----------
  let leafletPromise;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = () => {
        leafletPromise = null;
        reject(new Error('Failed to load map library'));
      };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  let mapInstance = null;
  async function drawMap(el, points, { line = false } = {}) {
    try {
      const L = await loadLeaflet();
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
      el.innerHTML = '';
      const map = L.map(el, { scrollWheelZoom: false }).setView([12.9716, 77.5946], 12);
      mapInstance = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const bounds = [];
      points.forEach((p, i) => {
        const pinHtml = `<div class="emoji-pin">${p.label || catIcon(p.category)}</div>`;
        const icon = L.divIcon({
          className: '',
          html: pinHtml,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:var(--font);font-size:0.9rem">
            <b>${esc(p.name)}</b><br>
            <span style="color:#666">📍 ${esc(p.area)}</span><br>
            <a href="#" data-popup="${esc(p.id)}" style="color:#e0531c;font-weight:600;display:inline-block;margin-top:4px">View Details →</a>
          </div>
        `);
        bounds.push([p.lat, p.lng]);
      });

      if (line && bounds.length > 1) {
        L.polyline(bounds, { color: '#e0531c', weight: 4, dashArray: '4, 8' }).addTo(map);
      }
      if (bounds.length) {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
      }

      map.on('popupopen', (e) => {
        const a = e.popup.getElement().querySelector('[data-popup]');
        if (a) {
          a.onclick = (ev) => {
            ev.preventDefault();
            showPlace(a.dataset.popup);
          };
        }
      });
    } catch {
      el.innerHTML = '<div class="map-note">Map requires an internet connection.<br>The directory list works offline.</div>';
    }
  }

  // ---------- Application Views ----------
  const V = {};

  // ----- 1. Home View -----
  V.home = async (view) => {
    const month = new Date().getMonth() + 1;
    const greet = getGreeting();

    view.innerHTML = `
    <!-- Hero Section -->
    <section class="hero fade">
      <div class="hero-left">
        <div class="eyebrow">
          <span>ನಮ್ಮ ಬೆಂಗಳೂರು</span>
          <span>·</span>
          <span>Namma Bengaluru</span>
        </div>
        <h1>The city is vast.<br>Finding your way <em>shouldn't be.</em></h1>
        <p class="lead">
          Which civic office handles potholes and water? Where is the crispest benne dosa? What's happening this month? Ask in plain words or explore curated trails.
        </p>

        <!-- Unified Fast Search -->
        <div class="search">
          <form id="heroForm" autocomplete="off">
            <input id="heroQ" type="search" placeholder="Try: potholes, BWSSB water, best dosa, startup meetups…" aria-label="Search Bengaluru resources">
            <button class="btn btn-primary" type="submit">Ask ✦</button>
          </form>
          <div class="dropdown" id="heroDD" hidden></div>
        </div>

        <!-- Quick Query Suggestion Chips -->
        <div class="chips">
          ${[
            'Who fixes potholes?',
            'No water since morning',
            'Best dosa in Malleshwaram',
            'Plan a heritage morning',
            'Events in ' + FULLM[month - 1],
          ].map((q) => `<button class="chip" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>
      </div>

      <!-- Hero Interactive Right Card -->
      <div class="hero-right">
        <div class="hero-widget">
          <div class="widget-head">
            <div>
              <span class="widget-greeting">${esc(greet.kn)}</span>
              <div style="font-size:0.8rem;color:var(--ink2)">${esc(greet.en)} from Bengaluru</div>
            </div>
            <span class="widget-time" id="widgetTime">IST</span>
          </div>

          <div class="stats-grid" id="statsGrid"></div>

          <div class="widget-actions">
            <a class="btn btn-primary" href="#/civic">🚨 Civic Compass &amp; Helplines</a>
            <a class="btn btn-ghost" href="#/plan">🗺️ Build Today's Day Plan</a>
          </div>
        </div>
      </div>
    </section>

    <!-- Path Selector Section -->
    <section class="sec">
      <div class="sec-head">
        <div>
          <h2>Pick your path</h2>
          <p>Six curated ways to explore, understand, and navigate the city.</p>
        </div>
      </div>
      <div class="grid">
        <a class="tile" href="#/civic">
          <div class="tile-icon-wrap">🏛️</div>
          <h3>Civic Compass</h3>
          <p>Describe any problem: we name the exact office, numbered steps, official helpline, and draft your complaint letter.</p>
          <span class="arrow">→</span>
        </a>
        <a class="tile" href="#/explore">
          <div class="tile-icon-wrap">🧭</div>
          <h3>Explore Places</h3>
          <p>44+ heritage eateries, lakes, bustling markets, theatre stages, and startup hubs with the stories behind them.</p>
          <span class="arrow">→</span>
        </a>
        <a class="tile" href="#/plan">
          <div class="tile-icon-wrap">🗺️</div>
          <h3>Day Planner</h3>
          <p>Select your moods and budget: get a time-boxed route with realistic traffic-aware travel times and map polyline.</p>
          <span class="arrow">→</span>
        </a>
        <a class="tile" href="#/events">
          <div class="tile-icon-wrap">🎪</div>
          <h3>Events &amp; Festivals</h3>
          <p>From Karaga to Kadalekai Parishe — a month-by-month calendar of the city's living traditions and tech summits.</p>
          <span class="arrow">→</span>
        </a>
        <a class="tile" href="#/kannada">
          <div class="tile-icon-wrap" style="font-family:var(--kn);font-weight:700">ಕ</div>
          <h3>Kannada Corner</h3>
          <p>Key phrases with audio pronunciation, phonetic guide, and a fast quiz. Say <i>swalpa adjust maadi</i> like a local.</p>
          <span class="arrow">→</span>
        </a>
        <a class="tile" href="#/community">
          <div class="tile-icon-wrap">💬</div>
          <h3>Community Tips</h3>
          <p>The neighbourhood knowledge out in the open: share your hidden discoveries and upvote trusted local tips.</p>
          <span class="arrow">→</span>
        </a>
      </div>
    </section>

    <!-- Civic Agencies Showcase -->
    <section class="sec">
      <div class="sec-head">
        <div>
          <h2>Who handles what</h2>
          <p>The quick 3-minute civic cheat sheet across GBA, BESCOM, BWSSB, and RTO.</p>
        </div>
        <a class="btn" href="#/civic">Open Civic Compass →</a>
      </div>
      <div class="grid" id="homeAg"></div>
    </section>

    <!-- Happenings This Month -->
    <section class="sec">
      <div class="sec-head">
        <div>
          <h2>Happening in ${FULLM[month - 1]}</h2>
          <p>Seasonal celebrations, flower shows, and cultural gatherings.</p>
        </div>
        <a class="btn" href="#/events">Full Calendar →</a>
      </div>
      <div class="grid" id="homeEv"></div>
    </section>

    <!-- Hidden Gems Carousel / Shuffle -->
    <section class="sec">
      <div class="sec-head">
        <div>
          <h2>Featured spots</h2>
          <p>A fresh handpicked trio every visit.</p>
        </div>
        <button class="btn" data-action="shuffle">🎲 Shuffle Picks</button>
      </div>
      <div class="grid" id="homeGems"></div>
    </section>`;

    // Populate Hero Stats
    const m = S.meta.counts;
    $('#statsGrid').innerHTML = [
      ['44', 'Places & Eateries', '🧭'],
      ['27', 'Civic Issues', '🏛️'],
      ['11', 'Civic Agencies', '⚡'],
      ['26', 'Festivals & Events', '🎪'],
    ].map(([n, l, ic]) => `
      <div class="stat-box">
        <span class="stat-icon">${ic}</span>
        <div><b>${n}</b><span>${l}</span></div>
      </div>
    `).join('');

    // Update Widget Time
    const updateTime = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const ist = new Date(utc + 3600000 * 5.5);
      const h = ((ist.getHours() + 11) % 12) + 1;
      const mins = String(ist.getMinutes()).padStart(2, '0');
      const am = ist.getHours() >= 12 ? 'PM' : 'AM';
      const wt = $('#widgetTime');
      if (wt) wt.textContent = `${h}:${mins} ${am} IST`;
    };
    updateTime();

    // Populate Agencies
    $('#homeAg').innerHTML = S.agencies.slice(0, 6).map((a) => `
      <a class="tile" style="border-top:4px solid ${a.color}" href="#/civic/agency-${esc(a.id)}">
        <h3>${esc(a.short)}</h3>
        <p style="font-size:0.86rem;margin-bottom:6px">${esc(a.role)}</p>
        <p class="muted small">${esc(a.handles.slice(0, 3).join(' · '))}</p>
        ${a.helpline ? `<b style="color:${a.color};margin-top:auto">☎ ${esc(a.helpline)}</b>` : ''}
      </a>
    `).join('');

    // Populate Events
    const ev = await api('/events?month=' + month);
    const evList = ev.events.filter((e) => e.month === month || e.month === 0).slice(0, 4);
    $('#homeEv').innerHTML = evList.length
      ? evList.map(eventCard).join('')
      : '<p class="muted">No major festivals listed for this month. Check the full calendar.</p>';

    // Gems Shuffle
    const shuffleGems = () => {
      const sh = [...S.places].sort(() => Math.random() - 0.5).slice(0, 3);
      $('#homeGems').innerHTML = sh.map(placeCard).join('');
    };
    shuffleGems();
    view._gems = shuffleGems;

    // Search Autocomplete
    const q = $('#heroQ'), dd = $('#heroDD');
    const liveSearch = debounce(async () => {
      const v = q.value.trim();
      if (v.length < 2) {
        dd.hidden = true;
        return;
      }
      const { results } = await api('/search?q=' + encodeURIComponent(v));
      dd.innerHTML = results.length
        ? results.slice(0, 7).map((r) => `
          <button type="button" data-action="hit" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}">
            <span class="tag-k">${esc(r.kind)}</span>
            <span>
              <b>${esc(r.title)}</b>
              <small>${esc(r.subtitle)}</small>
            </span>
          </button>
        `).join('')
        : '<div class="empty">No direct match — click "Ask ✦" to ask the AI assistant.</div>';
      dd.hidden = false;
    });

    q.addEventListener('input', liveSearch);
    q.addEventListener('blur', () => setTimeout(() => { dd.hidden = true; }, 250));
    $('#heroForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (q.value.trim()) {
        openChat(q.value.trim());
        dd.hidden = true;
      }
    });
  };

  function eventCard(e) {
    return `
    <div class="card ev fade">
      <div class="date">
        <small>${e.month ? MONTHS[e.month - 1] : 'Year'}</small>
        ${e.month ? '🗓️' : '♾️'}
      </div>
      <div>
        <h3>${esc(e.name)}</h3>
        <div class="muted small">📍 ${esc(e.where)} · <span style="text-transform:capitalize">${esc(e.type)}</span></div>
        <p class="small" style="margin:8px 0 0;line-height:1.5">${esc(e.blurb)}</p>
        ${e.verify ? '<div class="small warn" style="margin-top:8px;padding:4px 8px">Dates follow the lunar calendar — verify before you visit.</div>' : ''}
      </div>
    </div>`;
  }

  // ----- 2. Civic Compass View -----
  V.civic = async (view, arg) => {
    view.innerHTML = `
    <h1 class="page-title">Civic Compass</h1>
    <p class="page-sub">
      Bengaluru's municipal services are shared across the Greater Bengaluru Authority (GBA) and 5 city corporations, BESCOM, BWSSB, the Traffic Police, and RTO. Describe what went wrong and we'll point you to the right door.
    </p>

    <!-- Emergency SOS Helplines -->
    <div class="sos">
      <a href="tel:112">🚨 112 Emergency</a>
      <a href="tel:101">🔥 101 Fire</a>
      <a href="tel:108">🚑 108 Ambulance</a>
      <a href="tel:1930" class="alt">💳 1930 Cyber Fraud</a>
      <a href="tel:1912" class="alt">⚡ 1912 BESCOM (Power)</a>
      <a href="tel:1916" class="alt">🚰 1916 BWSSB (Water)</a>
      <a href="tel:1533" class="alt">🏙️ 1533 GBA Sahaya</a>
    </div>

    <div class="civic">
      <div>
        <div class="card">
          <label for="cq">Describe what's going wrong</label>
          <textarea id="cq" placeholder="e.g. Broken streetlight on 12th Main, pothole outside my house, or no water supply since morning…" maxlength="400"></textarea>

          <label for="carea" style="margin-top:14px">Your area (optional)</label>
          <input id="carea" list="areas" placeholder="Indiranagar, Malleshwaram, Whitefield, Jayanagar…" maxlength="60">
          <datalist id="areas">
            ${S.meta.areas.map((a) => `<option value="${esc(a)}">`).join('')}
          </datalist>

          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="cgo">Find the right office →</button>
            <button class="btn btn-ghost" id="ccorp">Which city corporation am I in?</button>
          </div>

          <div style="margin-top:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label style="margin:0">Common Civic Issues (Categorized):</label>
            </div>
            <div class="issue-cat-tabs" id="issueTabs">
              <button class="issue-cat-btn on" data-icat="all">All (27)</button>
              <button class="issue-cat-btn" data-icat="road">🛣️ Roads &amp; Traffic</button>
              <button class="issue-cat-btn" data-icat="bescom">⚡ BESCOM Power</button>
              <button class="issue-cat-btn" data-icat="bwssb">🚰 BWSSB Water</button>
              <button class="issue-cat-btn" data-icat="gba">🗑️ Sanitation &amp; Waste</button>
              <button class="issue-cat-btn" data-icat="docs">📄 Khata &amp; Permits</button>
            </div>
            <input type="search" id="issueFilterInput" placeholder="Quick filter issues (e.g. pothole, meter, dog, garbage)…" style="padding:9px 14px;font-size:0.86rem;margin-bottom:10px">
            <div class="issue-grid" id="issueGrid"></div>
          </div>
        </div>
      </div>

      <div id="cout">
        <div class="card empty">
          <span style="font-size:2.5rem;display:block;margin-bottom:8px">🏛️</span>
          <b>Your civic solution will appear here.</b><br>
          <span class="small">Describe your problem on the left or select a common issue to see the exact department, required documents, and complaint steps.</span>
        </div>
      </div>
    </div>

    <!-- Agency Directory Section -->
    <section class="sec">
      <div class="sec-head">
        <div>
          <h2>Who handles what: Agency Directory</h2>
          <p>Expand any agency to see its jurisdictions, exclusions, and escalation tips.</p>
        </div>
      </div>
      <div id="agList">
        ${S.agencies.map((a) => `
          <details class="ag" id="agency-${esc(a.id)}">
            <summary>
              <span style="width:14px;height:14px;border-radius:50%;background:${a.color};display:inline-block"></span>
              <b>${esc(a.name)} (${esc(a.short)})</b>
            </summary>
            <p class="muted" style="margin-top:6px">${esc(a.role)}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0">
              <div>
                <b class="small" style="color:var(--emerald)">✓ Handles</b>
                <ul style="margin-top:6px">${a.handles.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
              </div>
              <div>
                ${a.notHandles.length ? `
                  <b class="small" style="color:var(--rose)">✕ Does not handle</b>
                  <ul style="margin-top:6px">${a.notHandles.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
                ` : ''}
              </div>
            </div>
            <div class="warn" style="margin-bottom:12px">💡 <b>Escalation Tip:</b> ${esc(a.tip)}</div>
            <div class="chips" style="margin-bottom:8px">
              ${a.helpline ? `<a class="helpline" href="tel:${esc(a.helpline)}">☎ Call ${esc(a.helpline)}</a>` : ''}
              <a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(a.web)}">Official Portal ↗</a>
            </div>
            ${a.helplineNote ? `<p class="small muted">${esc(a.helplineNote)}</p>` : ''}
          </details>
        `).join('')}
      </div>
    </section>`;

    const out = $('#cout');
    const showResults = (data, area) => {
      if (!data.results.length) {
        out.innerHTML = `
          <div class="card">
            <h3>We couldn't match a specific civic category.</h3>
            <p class="muted">Try using plain keywords like "pothole", "water pipe", "garbage", or "transformer". In an urgent situation, call <a href="tel:112">112</a>.</p>
          </div>`;
        return;
      }
      const top = data.results[0];
      out.innerHTML = answerCard(top, area || (data.corporation ? data.corporation.matched : '')) +
        (data.results.length > 1
          ? `<p class="small muted" style="margin:16px 0 8px">Could also be related to:</p>
             <div class="chips">${data.results.slice(1).map((r) => `
               <button class="chip" data-action="issue" data-id="${esc(r.issue.id)}">${r.issue.icon} ${esc(r.issue.title)}</button>
             `).join('')}</div>`
          : '') +
        (data.corporation
          ? `<div class="warn" style="margin-top:16px">📍 <b>${esc(data.corporation.matched)}</b> falls under <b>${esc(data.corporation.corporation)} City Corporation</b>. Mapping is indicative — confirm your ward number on the official GBA portal.</div>`
          : '');
    };

    $('#cgo').onclick = async () => {
      const text = $('#cq').value.trim();
      if (text.length < 3) return toast('Please describe the issue in a few words');
      out.innerHTML = skeletons(1);
      try {
        const res = await api('/triage', { text, area: $('#carea').value });
        showResults(res, $('#carea').value);
      } catch (e) {
        out.innerHTML = `<div class="card">${esc(e.message)}</div>`;
      }
    };

    $('#ccorp').onclick = async () => {
      const a = $('#carea').value.trim();
      if (!a) return toast('Please enter your area name first');
      try {
        const r = await api('/corporation?area=' + encodeURIComponent(a));
        out.innerHTML = `
          <div class="card answer fade" style="--ac:var(--brand)">
            <h3>📍 ${esc(r.matched)} → ${esc(r.corporation)} City Corporation</h3>
            <p style="margin-top:8px">${esc(r.note)}</p>
            <p class="small muted" style="margin-top:8px">Bengaluru is divided into 5 city corporations (Central, North, South, East, West) under the Greater Bengaluru Authority.</p>
          </div>`;
      } catch (e) {
        out.innerHTML = `<div class="card warn">${esc(e.message)}</div>`;
      }
    };

    let curIcat = 'all', curIsearch = '';
    const getIssueCat = (i) => {
      if (i.agency === 'bescom') return 'bescom';
      if (i.agency === 'bwssb') return 'bwssb';
      if (i.agency === 'rto' || i.agency === 'btp' || ['pothole', 'streetlight', 'flooding'].includes(i.id)) return 'road';
      if (['property-tax', 'certificate', 'trade-licence'].includes(i.id)) return 'docs';
      return 'gba';
    };

    const renderIssues = () => {
      const q = curIsearch.toLowerCase().trim();
      const filtered = S.issues.filter((i) => {
        const catMatch = curIcat === 'all' || getIssueCat(i) === curIcat;
        const textMatch = !q || i.title.toLowerCase().includes(q) || (i.keywords && i.keywords.some((k) => k.toLowerCase().includes(q)));
        return catMatch && textMatch;
      });
      const grid = $('#issueGrid');
      if (grid) {
        grid.innerHTML = filtered.length
          ? filtered.map((i) => `
            <button class="issue-btn" data-action="issue" data-id="${esc(i.id)}">
              <span>${i.icon}</span>
              ${esc(i.title)}
            </button>
          `).join('')
          : '<p class="muted small" style="grid-column:1/-1;padding:12px">No issues match that filter.</p>';
      }
    };
    renderIssues();

    const tabs = $('#issueTabs');
    if (tabs) {
      tabs.onclick = (e) => {
        const b = e.target.closest('[data-icat]');
        if (!b) return;
        curIcat = b.dataset.icat;
        $$('#issueTabs .issue-cat-btn').forEach((x) => x.classList.toggle('on', x === b));
        renderIssues();
      };
    }

    const ifilter = $('#issueFilterInput');
    if (ifilter) {
      ifilter.addEventListener('input', debounce((e) => {
        curIsearch = e.target.value;
        renderIssues();
      }));
    }

    if (arg && arg.startsWith('agency-')) {
      const d = $('#' + arg);
      if (d) {
        d.open = true;
        d.scrollIntoView({ block: 'center' });
      }
    } else if (arg) {
      selectIssue(arg);
    }
  };

  function answerCard(r, area) {
    const a = r.agency, i = r.issue;
    return `
    <div class="card answer fade" style="--ac:${a.color}">
      <div class="who">
        <div class="dot">${esc(a.short)}</div>
        <div>
          <div class="small muted">Responsible Agency</div>
          <h3 style="margin:0">${esc(a.name)}</h3>
        </div>
      </div>
      <p style="font-size:1.1rem;font-weight:700;margin:12px 0 6px">
        ${i.icon} ${esc(i.title)}
      </p>
      <ol class="steps">
        ${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ol>
      <div class="kv">
        ${i.docs.map((d) => `<span>📎 ${esc(d)}</span>`).join('')}
      </div>
      <p class="small muted" style="margin-top:8px">⏱️ Estimated resolution time: <b>${esc(i.sla)}</b></p>
      ${r.also && r.also.length ? `<p class="small">Also involved: ${r.also.map((x) => `<b>${esc(x.short)}</b>`).join(', ')}</p>` : ''}
      <div class="chips" style="margin-top:16px">
        ${a.helpline ? `<a class="helpline" href="tel:${esc(a.helpline)}">☎ Call ${esc(a.helpline)}</a>` : ''}
        <button class="btn btn-sm btn-primary" data-action="draft" data-id="${esc(i.id)}" data-area="${esc(area)}">✍️ Draft Complaint Letter</button>
        <a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(a.web)}">Official Site ↗</a>
      </div>
      <p class="small muted" style="margin-top:14px">💡 ${esc(a.tip)}</p>
    </div>`;
  }

  async function selectIssue(id) {
    const out = $('#cout');
    if (!out) return;
    try {
      const d = await api('/issues/' + id);
      $$('.issue-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      out.innerHTML = answerCard({ issue: d.issue, agency: d.agency, also: d.also }, ($('#carea') || {}).value || '');
      if (innerWidth < 860) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      toast(e.message);
    }
  }

  function draftModal(id, area) {
    openModal(`
      <h2>Draft Your Official Complaint</h2>
      <p class="muted small">We'll generate a formal letter you can copy into the BBMP Sahaya app, email to officials, or print for submission.</p>
      <div class="form-grid">
        <div>
          <label for="dn">Your Name</label>
          <input id="dn" placeholder="e.g. Rahul Sharma" maxlength="60">
        </div>
        <div>
          <label for="da">Locality / Area</label>
          <input id="da" list="areas" value="${esc(area.replace(/\b\w/g, (c) => c.toUpperCase()))}" placeholder="e.g. Jayanagar 4th Block" maxlength="60">
        </div>
        <div>
          <label for="dl">Nearest Landmark</label>
          <input id="dl" placeholder="e.g. Near Post Office / 9th Cross" maxlength="80">
        </div>
        <div>
          <label for="dt">Previous Ticket No. (if any)</label>
          <input id="dt" placeholder="e.g. 102948" maxlength="40">
        </div>
      </div>
      <label for="dd">Specific Details</label>
      <textarea id="dd" placeholder="Describe the duration, how many residents are affected, any safety risks or accidents…" maxlength="600"></textarea>
      <div style="margin:18px 0">
        <button class="btn btn-primary" id="dgo">Generate Formal Letter →</button>
      </div>
      <div id="dout"></div>
    `);

    $('#dgo').onclick = async () => {
      try {
        const r = await api('/complaint', {
          issueId: id,
          area: $('#da').value,
          details: $('#dd').value,
          name: $('#dn').value,
          landmark: $('#dl').value,
          ticket: $('#dt').value,
        });
        $('#dout').innerHTML = `
          <div class="letter" id="letterTxt">${esc(r.letter)}</div>
          <div class="chips" style="margin-top:14px;gap:8px">
            <button class="btn btn-primary btn-sm" id="dcopy">Copy Letter</button>
            <button class="btn btn-sm" onclick="window.print()">Print / Save PDF</button>
            <a class="btn btn-sm" href="https://api.whatsapp.com/send?text=${encodeURIComponent(r.letter)}" target="_blank" rel="noopener">Share via WhatsApp</a>
            ${r.helpline ? `<a class="btn btn-sm" href="tel:${esc(r.helpline)}">Call Helpline (${esc(r.helpline)})</a>` : ''}
          </div>
        `;
        $('#dcopy').onclick = () => copy(r.letter, 'Complaint letter copied');
      } catch (e) {
        toast(e.message);
      }
    };
  }

  // ----- 3. Explore View -----
  V.explore = async (view, arg) => {
    const f = { category: arg || 'all', q: '', price: 3, area: 'all', mode: 'grid' };

    view.innerHTML = `
    <h1 class="page-title">Explore Bengaluru</h1>
    <p class="page-sub">
      Heritage eateries, lakes, ancient markets, performing arts stages, nightlife, and deep-tech startup hubs — each with the story and insider tips most guidebooks miss.
    </p>

    <!-- Filter Toolbar -->
    <div class="toolbar">
      <input class="grow" id="eq" type="search" placeholder="Search places: filter coffee, birds, dosa, founders, books…" aria-label="Search places">
      
      <select id="earea" aria-label="Select Area" style="width:auto">
        <option value="all">All Localities</option>
        ${[...new Set(S.places.map((p) => p.area))].sort().map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
      </select>

      <select id="ep" aria-label="Budget filter" style="width:auto">
        <option value="3">Any Budget</option>
        <option value="1">₹ Shoestring (under ₹200)</option>
        <option value="2">₹₹ Moderate (under ₹600)</option>
      </select>

      <div class="seg" role="group" aria-label="View Mode">
        <button data-mode="grid" class="on">Cards Grid</button>
        <button data-mode="map">Map View</button>
      </div>
    </div>

    <!-- Category Pills -->
    <div class="chips" id="ecats" style="margin-bottom:20px"></div>

    <!-- Map Container -->
    <div id="mapWrap" hidden>
      <div id="map"></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p class="muted small" id="ecount" style="margin:0"></p>
    </div>

    <!-- Cards Grid -->
    <div class="grid" id="egrid"></div>`;

    const cats = [{ id: 'all', label: 'All', icon: '✨' }, ...S.meta.categories];
    $('#ecats').innerHTML = cats.map((c) => `
      <button class="chip ${c.id === f.category ? 'on' : ''}" data-cat="${esc(c.id)}">
        ${c.icon} ${esc(c.label)}
      </button>
    `).join('');

    const run = async () => {
      const qs = new URLSearchParams({ category: f.category, price: f.price, q: f.q });
      const { places } = await api('/places?' + qs);
      const filtered = f.area === 'all' ? places : places.filter((p) => p.area === f.area);

      $('#ecount').textContent = `Showing ${filtered.length} place${filtered.length === 1 ? '' : 's'}`;
      $('#egrid').hidden = f.mode === 'map';
      $('#mapWrap').hidden = f.mode !== 'map';

      $('#egrid').innerHTML = filtered.length
        ? filtered.map(placeCard).join('')
        : '<div class="empty" style="grid-column:1/-1">No places match your search. Try different filters or clear your keywords.</div>';

      if (f.mode === 'map') {
        drawMap($('#map'), filtered);
      }
    };

    $('#ecats').onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      f.category = b.dataset.cat;
      $$('#ecats .chip').forEach((c) => c.classList.toggle('on', c === b));
      run();
    };

    $('#eq').addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); run(); }));
    $('#earea').onchange = (e) => { f.area = e.target.value; run(); };
    $('#ep').onchange = (e) => { f.price = +e.target.value; run(); };

    $$('.seg button').forEach((b) => {
      b.onclick = () => {
        f.mode = b.dataset.mode;
        $$('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        run();
      };
    });

    run();
  };

  // ----- 4. Day Planner View -----
  V.plan = async (view, arg) => {
    const MOODS = [
      ['foodie', '🍛 Foodie'],
      ['heritage', '🏛️ Heritage'],
      ['nature', '🌳 Nature & Lakes'],
      ['culture', '🎭 Culture'],
      ['shopping', '🛍️ Markets'],
      ['nightlife', '🍻 Nightlife'],
      ['startup', '🚀 Startups'],
    ];

    const PRESETS = [
      {
        title: 'The Heritage & Filter Coffee Trail',
        desc: 'Crisp benne dose, ancient temples, Lalbagh rock, and iconic Gandhi Bazaar.',
        moods: ['foodie', 'heritage'],
        area: 'Basavanagudi',
        hours: 5,
        budget: 1,
      },
      {
        title: 'Green Lakes & Morning Breeze',
        desc: 'Sankey Tank, Cubbon Park, and Malleshwaram morning idli-vada.',
        moods: ['nature', 'foodie'],
        area: 'Malleshwaram',
        hours: 4,
        budget: 1,
      },
      {
        title: 'Tech Founders & Craft Brews',
        desc: 'Explore startup clusters, coworking hubs, and celebrated microbreweries.',
        moods: ['startup', 'nightlife'],
        area: 'Indiranagar',
        hours: 6,
        budget: 3,
      },
      {
        title: 'Old Pete & Silk Markets',
        desc: 'The dawn flower chaos of KR Market, Chickpet sarees, and street holige.',
        moods: ['shopping', 'heritage', 'foodie'],
        area: 'Chickpet',
        hours: 5,
        budget: 1,
      },
    ];

    const st = ls.get('nb-plan', { moods: ['foodie', 'heritage'], budget: 2, hours: 5, startHour: 8, vegOnly: false });
    if (arg) st.startArea = decodeURIComponent(arg);

    view.innerHTML = `
    <h1 class="page-title">Day Planner</h1>
    <p class="page-sub">
      Choose your moods and let our engine assemble a route — nearest-neighbour stops, realistic city-traffic travel estimates, and time-of-day fit (breakfast spots in the morning, pubs at night).
    </p>

    <!-- Curated Preset Trails -->
    <div style="margin-bottom:14px">
      <label>Popular Curated Trails (1-Click Presets):</label>
      <div class="preset-trails">
        ${PRESETS.map((p, idx) => `
          <button class="preset-card" data-preset="${idx}">
            <h4>${esc(p.title)}</h4>
            <p>${esc(p.desc)}</p>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <label>Select Moods</label>
      <div class="chips" id="pm">
        ${MOODS.map(([k, l]) => `
          <button class="chip ${st.moods.includes(k) ? 'on' : ''}" data-mood="${k}" aria-pressed="${st.moods.includes(k)}">${l}</button>
        `).join('')}
      </div>

      <div class="form-grid">
        <div>
          <label for="pb">Budget</label>
          <select id="pb">
            <option value="1">₹ Shoestring</option>
            <option value="2">₹₹ Comfortable</option>
            <option value="3">₹₹₹ Treat myself</option>
          </select>
        </div>
        <div>
          <label for="ph">Time Available</label>
          <select id="ph">
            ${[3, 4, 5, 6, 8, 10].map((h) => `<option value="${h}">${h} hours</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="ps">Start Time</label>
          <select id="ps">
            ${[6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 18].map((h) => `
              <option value="${h}">${((h + 11) % 12) + 1}:00 ${h >= 12 ? 'PM' : 'AM'}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label for="pa">Starting Area</label>
          <input id="pa" list="areas2" placeholder="Basavanagudi, Indiranagar…" value="${esc(st.startArea || '')}" maxlength="50">
          <datalist id="areas2">
            ${S.meta.areas.map((a) => `<option value="${esc(a)}">`).join('')}
          </datalist>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:12px">
        <label style="margin:0;display:flex;gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" id="pv" style="width:auto"> Vegetarian only
        </label>
        <button class="btn btn-ghost btn-sm" id="pgeo">📍 Use my location</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" id="pgo">Build My Day →</button>
      </div>
    </div>

    <div id="pout" style="margin-top:28px"></div>`;

    $('#pb').value = st.budget;
    $('#ph').value = st.hours;
    $('#ps').value = st.startHour;
    $('#pv').checked = st.vegOnly;

    let geo = null;
    $('#pm').onclick = (e) => {
      const b = e.target.closest('[data-mood]');
      if (!b) return;
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on'));
    };

    $('#pgeo').onclick = () => {
      if (!navigator.geolocation) return toast('Geolocation not supported');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          geo = { lat: p.coords.latitude, lng: p.coords.longitude };
          $('#pa').value = '';
          toast('Using current GPS coordinates');
        },
        () => toast('Location permission denied — type your starting area instead')
      );
    };

    // Preset Clicks
    $$('.preset-card').forEach((btn) => {
      btn.onclick = () => {
        const p = PRESETS[btn.dataset.preset];
        $$('#pm .chip').forEach((c) => c.classList.toggle('on', p.moods.includes(c.dataset.mood)));
        $('#pa').value = p.area;
        $('#ph').value = p.hours;
        $('#pb').value = p.budget;
        go();
      };
    });

    const go = async () => {
      const cur = {
        moods: $$('#pm .on').map((b) => b.dataset.mood),
        budget: +$('#pb').value,
        hours: +$('#ph').value,
        startHour: +$('#ps').value,
        vegOnly: $('#pv').checked,
      };
      ls.set('nb-plan', cur);
      const out = $('#pout');
      out.innerHTML = skeletons(3);

      const r = await api('/plan', { ...cur, startArea: $('#pa').value, ...(geo || {}) });
      if (!r.stops.length) {
        out.innerHTML = '<div class="card empty">No stops matched. Try selecting more moods or widening your budget.</div>';
        return;
      }

      const text = `My Bengaluru Itinerary (${r.summary.stops} stops):\n` +
        r.stops.map((s, i) => `${i + 1}. [${s.arrive} - ${s.leave}] ${s.name} (${s.area})`).join('\n');

      out.innerHTML = `
      <div class="sec-head">
        <div>
          <h2>Your Custom Itinerary</h2>
          <p>${r.summary.stops} curated stops · ~${r.summary.totalKm} km travel · wraps up around ${r.summary.ends} · starting near ${esc(r.start.label)}</p>
        </div>
        <div class="chips">
          <button class="btn btn-sm" id="pcopy">Copy Itinerary</button>
          <button class="btn btn-sm btn-primary" id="psave">♥ Save All Places</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="timeline">
          ${r.stops.map((s, i) => `
            ${i ? `<div class="travel">🚗 ~${s.travelMinutes} mins drive (${s.travelKm} km)</div>` : ''}
            <div class="stop" data-n="${i + 1}">
              <div class="card pcard" style="padding:18px;width:100%">
                <div class="t">${s.arrive} – ${s.leave}</div>
                <h3 style="margin:4px 0">${catIcon(s.category)} ${esc(s.name)}</h3>
                <div class="meta" style="margin-bottom:6px">
                  <span>📍 ${esc(s.area)}</span>
                  <span>${rupee(s.price)}</span>
                </div>
                <p style="font-size:0.92rem">${esc(s.blurb)}</p>
                ${s.note ? `<div class="note">⏰ ${esc(s.note)}</div>` : ''}
                <div class="note">💡 <b>Insider tip:</b> ${esc(s.tip)}</div>
                <div style="margin-top:10px">
                  <button class="btn btn-sm" data-action="place" data-id="${esc(s.id)}">Details &amp; Map →</button>
                </div>
              </div>
            </div>
          `).join('')}
          <div class="warn" style="margin-top:16px">
            💡 <b>Bengaluru Traffic Hint:</b> ${esc(r.summary.tip)}
          </div>
        </div>

        <div>
          <div id="map" class="minimap" style="height:440px;position:sticky;top:80px"></div>
        </div>
      </div>`;

      $('#pcopy').onclick = () => copy(text, 'Itinerary copied');
      $('#psave').onclick = () => {
        r.stops.forEach((s) => S.saved.add(s.id));
        saveSaved();
        toast(`Saved ${r.stops.length} places to your collection ♥`);
      };

      drawMap($('#map'), r.stops.map((s, i) => ({ ...s, label: i + 1 })), { line: true });
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    $('#pgo').onclick = () => go().catch((e) => toast(e.message));
    if (arg) go().catch(() => {});
  };

  // ----- 5. Events View -----
  V.events = async (view) => {
    let month = new Date().getMonth() + 1;
    const now = month;

    view.innerHTML = `
    <h1 class="page-title">Events &amp; Festivals</h1>
    <p class="page-sub">
      The city's rhythm, month by month. From centuries-old Karaga and Kadalekai Parishe to modern flower shows and tech summits.
    </p>

    <!-- Month Navigation Ribbon -->
    <div class="months" id="mths">
      ${MONTHS.map((m, i) => `
        <button data-m="${i + 1}" class="${i + 1 === month ? 'on' : ''} ${i + 1 === now ? 'now' : ''}">${m}</button>
      `).join('')}
    </div>

    <div class="grid" id="evg"></div>`;

    const run = async () => {
      const { events } = await api('/events?month=' + month);
      $('#evg').innerHTML = events.length
        ? events.map(eventCard).join('')
        : '<div class="empty">A quieter month for major festivals — check Community Tips for local meetups!</div>';
    };

    $('#mths').onclick = (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      month = +b.dataset.m;
      $$('#mths button').forEach((x) => x.classList.toggle('on', x === b));
      run();
    };

    run();
  };

  // ----- 6. Kannada Corner View -----
  V.kannada = async (view) => {
    const { phrases } = await api('/phrases');
    const cats = ['All', ...new Set(phrases.map((p) => p.cat))];
    let cat = 'All';

    view.innerHTML = `
    <h1 class="page-title">Kannada Corner</h1>
    <p class="page-sub">
      You don't need complete fluency — a warm greeting, a polite thank you, and <i>swalpa adjust maadi</i> will open doors anywhere in Bengaluru. Tap 🔊 to hear pronunciation.
    </p>

    <div class="toolbar">
      <div class="chips" id="kcats" style="flex:1">
        ${cats.map((c) => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="seg">
        <button class="on" data-k="list">Phrasebook</button>
        <button data-k="quiz">Flashcard Quiz</button>
      </div>
    </div>

    <div id="kout"></div>`;

    const list = () => {
      const filtered = phrases.filter((p) => cat === 'All' || p.cat === cat);
      $('#kout').innerHTML = `
        <div class="grid">
          ${filtered.map((p) => `
            <div class="card phrase fade">
              <span class="eyebrow" style="margin-bottom:6px;width:fit-content">${esc(p.cat)}</span>
              <span class="kn">${esc(p.kn)}</span>
              <span class="rom">${esc(p.rom)}</span>
              <span class="muted small">${esc(p.en)}</span>
              <div class="row">
                <button class="btn btn-sm btn-primary" data-action="speak" data-t="${esc(p.kn)}">
                  🔊 Listen
                </button>
                <button class="btn btn-sm btn-ghost" data-action="copy" data-t="${esc(p.rom)}">
                  Copy
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    };

    let score = 0, asked = 0, streak = 0;
    const quiz = () => {
      const pool = phrases;
      const q = pool[Math.floor(Math.random() * pool.length)];
      const opts = [
        q.en,
        ...pool.filter((x) => x.en !== q.en).sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.en),
      ].sort(() => Math.random() - 0.5);

      $('#kout').innerHTML = `
        <div class="card quiz-card fade">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <span class="eyebrow">${esc(q.cat)}</span>
            <span class="small muted" style="font-weight:700">Score: ${score}/${asked} · Streak: ${streak} 🔥</span>
          </div>
          <div class="phrase" style="text-align:center;margin:18px 0">
            <span class="kn" style="font-size:2.6rem">${esc(q.kn)}</span>
            <span class="rom" style="font-size:1.25rem">${esc(q.rom)}</span>
          </div>
          <p style="font-weight:700;margin-bottom:12px">What does this mean?</p>
          ${opts.map((o) => `<button class="quiz-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}
          <div id="kfb" style="margin-top:16px"></div>
        </div>
      `;

      $$('.quiz-opt').forEach((b) => {
        b.onclick = () => {
          if ($('#kfb').dataset.done) return;
          $('#kfb').dataset.done = '1';
          asked++;
          const ok = b.dataset.o === q.en;
          if (ok) {
            score++;
            streak++;
          } else {
            streak = 0;
          }

          $$('.quiz-opt').forEach((x) => {
            if (x.dataset.o === q.en) x.classList.add('ok');
          });
          if (!ok) b.classList.add('bad');

          $('#kfb').innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center">
              <p style="margin:0;font-weight:700">${ok ? '🎉 Sakkath! (Spot on!)' : 'Not quite — now you know!'}</p>
              <button class="btn btn-primary btn-sm" id="knext">Next Question →</button>
            </div>
          `;
          $('#knext').onclick = quiz;
        };
      });
    };

    let mode = 'list';
    $('#kcats').onclick = (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      cat = b.dataset.c;
      $$('#kcats .chip').forEach((x) => x.classList.toggle('on', x === b));
      if (mode === 'list') list();
    };

    $$('.seg button').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.k;
        $$('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        mode === 'list' ? list() : quiz();
      };
    });

    list();
  };

  // ----- 7. Community Tips View -----
  V.community = async (view) => {
    let cat = 'all', sort = 'top';

    view.innerHTML = `
    <h1 class="page-title">Community Tips</h1>
    <p class="page-sub">
      The best Bengaluru knowledge lives in WhatsApp groups and neighbourhood chats. Share yours here so it stays preserved and findable.
    </p>

    <div class="civic">
      <div>
        <div class="toolbar">
          <div class="chips" id="tc" style="flex:1">
            ${['all', 'food', 'heritage', 'nature', 'market', 'startup', 'nightlife', 'civic'].map((c) => `
              <button class="chip ${c === 'all' ? 'on' : ''}" data-c="${c}">
                ${c[0].toUpperCase() + c.slice(1)}
              </button>
            `).join('')}
          </div>
          <select id="ts" style="width:auto">
            <option value="top">Most Upvoted</option>
            <option value="new">Newest First</option>
          </select>
        </div>

        <div id="tl" class="grid" style="grid-template-columns:1fr"></div>
      </div>

      <form class="card" id="tf">
        <h3>Share a Local Tip</h3>
        <p class="small muted" style="margin-bottom:14px">Discovered an incredible sunrise spot, quiet reading cafe, or secret dosa counter? Tell your neighbours.</p>
        <div style="display:grid;gap:14px">
          <div>
            <label for="tt">Tip Headline</label>
            <input id="tt" maxlength="80" required placeholder="e.g. Sunday sunrise at Lalbagh rock">
          </div>
          <div>
            <div style="display:flex;justify-content:space-between">
              <label for="tx">Your Advice / Insight</label>
              <span class="small muted" id="charCount">500</span>
            </div>
            <textarea id="tx" maxlength="500" required placeholder="What's special, best arrival time, what to order, what to avoid…"></textarea>
          </div>
          <div class="form-grid" style="margin:0">
            <div>
              <label for="tcat">Category</label>
              <select id="tcat">
                ${['food', 'heritage', 'nature', 'market', 'startup', 'nightlife', 'culture', 'civic', 'other'].map((c) => `
                  <option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label for="tar">Area / Locality</label>
              <input id="tar" maxlength="50" placeholder="e.g. Jayanagar 4th Block">
            </div>
          </div>
          <div>
            <label for="tau">Your Name / Handle (optional)</label>
            <input id="tau" maxlength="40" placeholder="A Fellow Bengalurean">
          </div>
          <button class="btn btn-primary" type="submit">Post Tip to Community</button>
        </div>
      </form>
    </div>`;

    const tx = $('#tx');
    if (tx) {
      tx.oninput = () => {
        $('#charCount').textContent = 500 - tx.value.length;
      };
    }

    const run = async () => {
      const { tips } = await api(`/tips?category=${cat}&sort=${sort}`);
      $('#tl').innerHTML = tips.length
        ? tips.map((t) => `
          <div class="card tip fade">
            <button class="vote" data-action="vote" data-id="${esc(t.id)}" ${S.voted.has(t.id) ? 'disabled' : ''} aria-label="Upvote tip">
              <span>▲</span>
              <span>${t.votes}</span>
            </button>
            <div>
              <h3 style="margin:0 0 6px">${esc(t.title)}</h3>
              <div class="kv">
                <span class="eyebrow" style="margin:0;padding:2px 8px;font-size:0.75rem">${esc(t.category)}</span>
                ${t.area ? `<span>📍 ${esc(t.area)}</span>` : ''}
              </div>
              <p style="margin:8px 0 6px;line-height:1.55">${esc(t.text)}</p>
              <span class="small muted">— ${esc(t.author)}</span>
            </div>
          </div>
        `).join('')
        : '<div class="empty">No tips in this category yet. Be the first to share one!</div>';
    };

    $('#tc').onclick = (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      cat = b.dataset.c;
      $$('#tc .chip').forEach((x) => x.classList.toggle('on', x === b));
      run();
    };

    $('#ts').onchange = (e) => {
      sort = e.target.value;
      run();
    };

    $('#tf').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/tips', {
          title: $('#tt').value,
          text: $('#tx').value,
          category: $('#tcat').value,
          area: $('#tar').value,
          author: $('#tau').value,
        });
        toast('Thanks for sharing your tip! 🙏');
        e.target.reset();
        $('#charCount').textContent = '500';
        sort = 'new';
        $('#ts').value = 'new';
        run();
      } catch (err) {
        toast(err.message);
      }
    };

    run();
  };

  // ----- 8. Saved View -----
  V.saved = async (view) => {
    const items = [...S.saved].map(placeById).filter(Boolean);

    view.innerHTML = `
    <h1 class="page-title">Saved Places</h1>
    <p class="page-sub">Your personal shortlist of Bengaluru eateries, lakes, and heritage spots. Stored locally on this device.</p>
    ` + (items.length
      ? `
      <div class="chips" style="margin-bottom:20px;gap:10px">
        <button class="btn btn-sm" id="sexp">Copy Place List</button>
        <a class="btn btn-sm btn-primary" href="#/plan/${encodeURIComponent(items[0].area)}">Plan Itinerary from ${esc(items[0].area)}</a>
        <button class="btn btn-sm btn-ghost" id="sclr">Clear All Bookmarks</button>
      </div>
      <div class="grid">${items.map(placeCard).join('')}</div>
      `
      : `
      <div class="card empty">
        <span style="font-size:3rem;display:block;margin-bottom:8px">♥</span>
        <b>No places saved yet.</b><br>
        <span class="small">Tap the heart icon ♡ on any spot in Explore to bookmark it here for offline reference.</span><br><br>
        <a class="btn btn-primary" href="#/explore">Explore Bengaluru Places →</a>
      </div>
      `);

    const e = $('#sexp');
    if (e) {
      e.onclick = () => copy(items.map((p) => `${p.name} (${p.area})`).join('\n'), 'Saved places copied');
      $('#sclr').onclick = () => {
        if (!confirm('Clear all saved places?')) return;
        S.saved.clear();
        saveSaved();
        V.saved(view);
      };
    }
  };

  // ---------- AI Assistant ("Ask Namma") ----------
  const SUGGESTIONS = [
    'Who handles road potholes?',
    'Best filter coffee near Basavanagudi',
    'Plan a half day of lakes & birds',
    'What happens in November?',
    'How do I say "put the meter on"?',
    'Startup meetups in HSR Layout',
  ];

  function renderChat() {
    const log = $('#chatLog');
    if (!log) return;
    if (!S.chat.length) {
      S.chat = [{
        role: 'assistant',
        content: "Namaskara! 🙏 I'm your local guide to Namma Bengaluru. Ask me who to contact for civic issues, where to find legendary dosas, how to plan your day, or what's happening around town.",
        cards: [],
      }];
    }
    log.innerHTML = S.chat.map((m) => `
      <div class="msg ${m.role === 'user' ? 'user' : 'bot'}">
        ${m.role === 'user' ? esc(m.content) : md(m.content)}
        ${m.cards && m.cards.length ? `<div class="mini-cards">${m.cards.map(cardHtml).join('')}</div>` : ''}
      </div>
    `).join('');
    $('#chatChips').hidden = S.chat.length > 2;
    log.scrollTop = log.scrollHeight;
  }

  function cardHtml(c) {
    if (c.type === 'place') {
      return `
      <button class="mini" data-action="place" data-id="${esc(c.id)}">
        <span style="font-size:1.4rem">${catIcon(c.category)}</span>
        <span><b>${esc(c.name)}</b><small>📍 ${esc(c.area)}</small></span>
      </button>`;
    }
    if (c.type === 'issue') {
      return `
      <button class="mini" data-action="goto-issue" data-id="${esc(c.id)}">
        <span style="font-size:1.4rem">${c.icon}</span>
        <span><b>${esc(c.title)}</b><small>${esc(c.agency)}${c.helpline ? ' · ☎ ' + esc(c.helpline) : ''}</small></span>
      </button>`;
    }
    if (c.type === 'event') {
      return `
      <a class="mini" href="#/events" data-action="close-chat" style="text-decoration:none;color:inherit">
        <span style="font-size:1.4rem">🗓️</span>
        <span><b>${esc(c.name)}</b><small>📍 ${esc(c.where)}</small></span>
      </a>`;
    }
    if (c.type === 'phrase') {
      return `
      <button class="mini" data-action="speak" data-t="${esc(c.kn)}">
        <span style="font-family:var(--kn);font-size:1.3rem">${esc(c.kn)}</span>
        <span><b>${esc(c.rom)}</b><small>${esc(c.en)}</small></span>
      </button>`;
    }
    return '';
  }

  function openChat(q) {
    $('#chat').hidden = false;
    $('#scrim').hidden = false;
    $('#chatChips').innerHTML = SUGGESTIONS.slice(0, 4).map((s) => `
      <button class="chip" data-action="ask" data-q="${esc(s)}">${esc(s)}</button>
    `).join('');
    renderChat();
    setTimeout(() => $('#chatInput').focus(), 60);
    if (q) sendChat(q);
  }

  function closeChat() {
    $('#chat').hidden = true;
    if ($('#menuDrawer') && $('#menuDrawer').hidden) {
      $('#scrim').hidden = true;
    }
  }

  function openMenu() {
    closeChat();
    const md = $('#menuDrawer');
    if (!md) return;
    md.hidden = false;
    $('#scrim').hidden = false;
    const inp = $('#menuSearchInput');
    if (inp) {
      inp.value = '';
      filterMenu('');
      setTimeout(() => inp.focus(), 60);
    }
  }

  function closeMenu() {
    const md = $('#menuDrawer');
    if (md) md.hidden = true;
    if ($('#chat') && $('#chat').hidden) {
      $('#scrim').hidden = true;
    }
  }

  function filterMenu(query) {
    const q = query.toLowerCase().trim();
    $$('.menu-card').forEach((card) => {
      const tags = (card.dataset.tags || '').toLowerCase();
      const txt = card.textContent.toLowerCase();
      const match = !q || txt.includes(q) || tags.includes(q);
      card.hidden = !match;
    });
    $$('.menu-section').forEach((sec) => {
      if (sec.dataset.section === 'emergency') return;
      const visible = sec.querySelectorAll('.menu-card:not([hidden])');
      sec.hidden = visible.length === 0;
    });
  }

  async function sendChat(text) {
    text = text.trim();
    if (!text) return;
    S.chat.push({ role: 'user', content: text });
    $('#chatInput').value = '';
    renderChat();

    const log = $('#chatLog');
    log.insertAdjacentHTML('beforeend', '<div class="msg bot typing" id="typing"><span></span><span></span><span></span></div>');
    log.scrollTop = log.scrollHeight;

    try {
      const r = await api('/chat', {
        messages: S.chat.map(({ role, content }) => ({ role, content })),
      });
      S.chat.push({ role: 'assistant', content: r.reply, cards: r.cards });
      $('#chatMode').textContent = r.mode === 'claude' ? 'Powered by Claude' : 'Local AI Engine';
    } catch (e) {
      S.chat.push({ role: 'assistant', content: 'Apologies — ' + e.message, cards: [] });
    }
    ls.set('nb-chat', S.chat.slice(-20).map(({ role, content }) => ({ role, content })));
    renderChat();
  }

  // ---------- Delegated Event Listeners ----------
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const d = t.dataset;

    switch (d.action) {
      case 'open-menu':
        openMenu();
        break;
      case 'close-menu':
        closeMenu();
        break;
      case 'menu-link':
        closeMenu();
        break;
      case 'open-chat':
        openChat();
        break;
      case 'close-chat':
        closeChat();
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'quick-search': {
        const hq = $('#heroQ');
        if (hq) {
          hq.focus();
          hq.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          openChat();
        }
        break;
      }
      case 'ask':
        openChat(d.q);
        break;
      case 'place':
        showPlace(d.id);
        break;
      case 'save': {
        e.stopPropagation();
        S.saved.has(d.id) ? S.saved.delete(d.id) : S.saved.add(d.id);
        saveSaved();
        const on = S.saved.has(d.id);
        toast(on ? 'Saved to bookmarks ♥' : 'Removed from bookmarks');
        $$(`[data-action=save][data-id="${d.id}"]`).forEach((b) => {
          if (b.classList.contains('save')) {
            b.textContent = on ? '♥' : '♡';
            b.setAttribute('aria-pressed', on);
          } else {
            b.textContent = on ? '♥ Saved' : '♡ Save';
          }
        });
        break;
      }
      case 'speak': {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(d.t);
          u.lang = 'kn-IN';
          u.rate = 0.85;
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
          toast(`Pronouncing: "${d.t}" 🔊`);
        } else {
          toast('Speech synthesis is not supported on this browser');
        }
        break;
      }
      case 'copy':
        copy(d.t);
        break;
      case 'issue':
        selectIssue(d.id);
        break;
      case 'draft':
        draftModal(d.id, d.area || '');
        break;
      case 'goto-issue':
        closeChat();
        location.hash = '#/civic/' + d.id;
        break;
      case 'plan-from':
        closeModal();
        location.hash = '#/plan/' + encodeURIComponent(d.area);
        break;
      case 'who-corp': {
        try {
          const r = await api('/corporation?area=' + encodeURIComponent(d.area));
          toast(`${r.matched} → ${r.corporation} City Corporation`);
        } catch (er) {
          toast(er.message);
        }
        break;
      }
      case 'shuffle': {
        const v = $('#view');
        if (v._gems) v._gems();
        break;
      }
      case 'hit': {
        if (d.kind === 'place') showPlace(d.id);
        else if (d.kind === 'issue') location.hash = '#/civic/' + d.id;
        else if (d.kind === 'event') location.hash = '#/events';
        else location.hash = '#/community';
        break;
      }
      case 'vote': {
        if (S.voted.has(d.id)) return;
        try {
          await api('/tips/' + d.id + '/upvote', {});
          S.voted.add(d.id);
          ls.set('nb-voted', [...S.voted]);
          t.disabled = true;
          t.lastElementChild.textContent = +t.lastElementChild.textContent + 1;
          toast('Upvoted! Thank you 🙏');
        } catch (er) {
          toast(er.message);
        }
        break;
      }
    }
  });

  // Modal & Drawer Dismissals
  $('#scrim').addEventListener('click', () => {
    closeChat();
    closeMenu();
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeChat();
      closeMenu();
    }
    // Ctrl + K or Cmd + K or / to search / ask
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openChat();
    }
  });

  // Live Menu Search Filtering
  const mSearch = $('#menuSearchInput');
  if (mSearch) {
    mSearch.addEventListener('input', debounce((e) => filterMenu(e.target.value), 80));
  }

  // Chat Form Submission
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat($('#chatInput').value);
  });

  // Clear Chat History
  const clrBtn = $('#clearChatBtn');
  if (clrBtn) {
    clrBtn.onclick = () => {
      S.chat = [];
      ls.set('nb-chat', []);
      renderChat();
      toast('Chat history cleared');
    };
  }

  // Theme Toggle
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    ls.set('nb-theme', next);
    try {
      localStorage.setItem('nb-theme', next);
    } catch {
      /* ignore */
    }
  });

  // ---------- Single-Page Router ----------
  async function route() {
    const [, name = 'home', ...rest] = (location.hash || '#/home').split('/');
    const arg = rest.join('/') || undefined;
    const view = $('#view');
    const fn = V[name] || V.home;

    $$('[data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === (V[name] ? name : 'home')));
    closeModal();
    view.innerHTML = skeletons(6);

    try {
      await fn(view, arg);
    } catch (e) {
      view.innerHTML = `
        <div class="card empty">
          <h3>Failed to load content</h3>
          <p class="muted">${esc(e.message)}</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload Application</button>
        </div>`;
      console.error(e);
    }

    if (!arg || name !== 'civic') window.scrollTo({ top: 0 });
    document.title = (name === 'home' ? '' : name[0].toUpperCase() + name.slice(1) + ' · ') + 'Namma Bengaluru · ನಮ್ಮ ಬೆಂಗಳೂರು';
  }

  // ---------- Application Boot ----------
  (async function boot() {
    try {
      updateCityPulse();
      const [meta, pl, ag, is] = await Promise.all([
        api('/meta'),
        api('/places'),
        api('/agencies'),
        api('/issues'),
      ]);
      S.meta = meta;
      S.places = pl.places;
      S.agencies = ag.agencies;
      S.issues = is.issues;

      meta.categories.forEach((c) => {
        CAT[c.id] = c;
      });

      saveSaved();
      window.addEventListener('hashchange', route);
      route();
    } catch (e) {
      $('#view').innerHTML = '<div class="card empty">Could not connect to the backend server. Please verify <code>node server.js</code> is running.</div>';
    }
  })();
})();
