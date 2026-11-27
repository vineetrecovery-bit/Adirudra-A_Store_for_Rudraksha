// Motion: opening intro, hero entrance, scroll reveals, header shadow.
// Loaded in <head> so the intro cover is in place before the first paint.
(function () {
  'use strict';
  const html = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // No motion for reduced-motion users or inside the admin's live preview: everything stays static and visible.
  // Adding ?intro to any page URL always replays the opening intro (handy for checking it).
  const query = new URLSearchParams(location.search);
  const forceIntro = query.has('intro');
  if ((reduceMotion && !forceIntro) || query.has('preview')) return;

  html.classList.add('motion');

  // The intro plays on the first page opened in a browser session and on every reload,
  // but not when moving between pages by clicking links.
  const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  const isReload = nav ? nav.type === 'reload' : (performance.navigation && performance.navigation.type === 1);
  let playIntro = forceIntro || isReload;
  try { playIntro = playIntro || !sessionStorage.getItem('adr_intro_seen'); } catch { /* storage blocked */ }
  if (playIntro) html.classList.add('intro-play');

  const ready = () => html.classList.add('is-ready');

  // ---------- Opening intro ----------
  // A line drawing of Lord Shiva draws itself; a tear falls from his eye and becomes a rudraksha,
  // then the view zooms into the bead and the website opens through its centre.
  // Portrait of Shiva in meditation: face tilted gently up, eyes closed, a tall coiled jata with the crescent moon,
  // long wavy hair falling to the shoulders, hoop earrings and a rudraksha mala. Drawn as a line doodle.
  const f1 = (n) => n.toFixed(1);
  // Mirror a path made of absolute "x y" pairs across the face's centre line (x = 250).
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f1(500 - x)} ${y}`);
  // Smooth curve through points (Catmull-Rom as cubic Béziers).
  const smooth = (pts) => {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let k = 0; k < pts.length - 1; k++) {
      const p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
      d += ` C ${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)}, ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)}, ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  };
  // A wavy lock of hair from the head down to the shoulders, flaring outward at the bottom.
  const lock = ([sx, sy, ex, ey, amp, waves, phase]) => smooth(Array.from({ length: 13 }, (_, k) => {
    const t = k / 12;
    return [sx + (ex - sx) * t ** 1.25 + amp * Math.sin(t * Math.PI * waves + phase) * Math.min(1, t * 2.5), sy + (ey - sy) * t];
  }));
  const LOCKS = [
    [168, 132, 62, 380, 14, 3.6, 2.5], [171, 146, 72, 404, 15, 3.8, 0.5], [173, 160, 88, 420, 14, 4, 0],
    [175, 178, 106, 432, 13, 4.2, 1], [177, 198, 122, 438, 12, 4, 2], [180, 222, 140, 432, 10, 4.4, 1.5], [184, 248, 158, 418, 8, 4, 0.8],
    [170, 140, 118, 300, 10, 3, 1.2], [176, 170, 136, 334, 9, 3.2, 2.2]
  ];
  const leftLocks = LOCKS.map(lock);
  const rightLocks = LOCKS.map(([sx, sy, ex, ey, amp, w, ph]) => lock([500 - sx, sy, 500 - ex, ey + 6, -amp, w, ph + 0.7]));
  const FACE_L = [
    'M200 212 Q 218 222, 238 212', 'M204 205 Q 219 199, 235 205', // closed eye and its crease
    'M207 217 L 205 222 M214 219 L 213 225 M221 220 L 221 226 M228 219 L 229 225', // lashes
    'M176 222 C 162 216, 160 248, 176 260', // ear
    'M240 258 C 237 263, 241 267, 246 265' // nostril
  ];
  const SHIVA = [
    // crescent moon behind the jata
    'M148 50 A 56 56 0 0 0 236 104 A 47 47 0 0 1 148 50 Z',
    // tall coiled jata (filled so it sits in front of the moon)
    ['fill', 'M198 112 C 182 82, 204 50, 232 46 C 226 22, 274 22, 268 46 C 296 50, 318 82, 302 112 Z'],
    'M206 100 C 228 85, 272 85, 294 100', 'M210 86 C 230 73, 270 73, 290 86', 'M218 71 C 236 60, 264 60, 282 71', 'M231 57 C 242 50, 258 50, 269 57',
    'M238 42 C 244 34, 256 34, 262 42', 'M244 36 C 248 31, 252 31, 256 36',
    // crown of hair over the forehead
    'M166 176 C 164 132, 202 104, 250 104 C 298 104, 336 132, 334 176',
    'M178 160 C 192 132, 220 122, 250 122 C 280 122, 308 132, 322 160',
    'M186 146 C 198 124, 224 114, 250 113', 'M314 146 C 302 124, 276 114, 250 113', 'M172 166 C 178 140, 196 122, 214 116', 'M328 166 C 322 140, 304 122, 286 116',
    // long wavy hair falling to the shoulders
    ...leftLocks, ...rightLocks,
    // face
    'M178 160 C 168 212, 172 262, 194 298 C 210 322, 230 334, 250 334 C 270 334, 290 322, 306 298 C 328 262, 332 212, 322 160',
    ...FACE_L, ...FACE_L.map(mirror),
    // hoop earrings (filled so the hair behind them is hidden)
    'M176 260 V 276', 'M324 260 V 276',
    ['fill', 'M162 300 a 14 22 0 1 0 28 0 a 14 22 0 1 0 -28 0'], 'M169 302 a 7 13 0 1 0 14 0 a 7 13 0 1 0 -14 0',
    ['fill', 'M310 300 a 14 22 0 1 0 28 0 a 14 22 0 1 0 -28 0'], 'M317 302 a 7 13 0 1 0 14 0 a 7 13 0 1 0 -14 0',
    // tripundra (three bands of ash) and the third eye
    ['thick', 'M210 150 Q 250 144, 290 150'], ['thick', 'M208 159 Q 250 153, 292 159'], ['thick', 'M210 168 Q 250 162, 290 168'],
    ['fill', 'M250 138 C 259 148, 259 168, 250 178 C 241 168, 241 148, 250 138 Z'],
    ['solid', 'M250 149 C 254 155, 254 161, 250 167 C 246 161, 246 155, 250 149 Z'],
    ['solid', 'M247.5 188 a 2.5 2.5 0 1 0 5 0 a 2.5 2.5 0 1 0 -5 0'],
    // bold arched brows
    ['solid', 'M192 198 C 204 182, 226 178, 242 188 C 226 184, 206 188, 194 202 Z'],
    ['solid', 'M308 198 C 296 182, 274 178, 258 188 C 274 184, 294 188, 306 202 Z'],
    // nose and lips
    'M243 212 C 241 232, 238 246, 233 256', 'M233 256 C 237 266, 244 266, 250 262 C 256 266, 263 266, 267 256',
    'M226 290 C 236 283, 244 283, 250 287 C 256 283, 264 283, 274 290', 'M226 290 Q 250 297, 274 290', 'M231 293 C 239 305, 261 305, 269 293',
    'M245 272 L 243 282 M255 272 L 257 282', 'M240 316 Q 250 320, 260 316',
    // neck and shoulders
    'M212 318 C 214 350, 212 372, 204 392', 'M288 318 C 286 350, 288 372, 296 392', 'M232 362 Q 250 370, 268 362',
    'M204 392 C 168 402, 128 414, 96 444', 'M296 392 C 332 402, 372 414, 404 444',
    // the mala's strings
    'M184 398 C 196 452, 304 452, 316 398', 'M176 412 C 192 482, 308 482, 324 412'
  ];
  // Rudraksha beads strung on the mala
  const MALA = Array.from({ length: 15 }, (_, i) => {
    const t = 0.04 + (i / 14) * 0.92;
    const x = (1 - t) ** 3 * 181 + 3 * (1 - t) ** 2 * t * 194 + 3 * (1 - t) * t * t * 306 + t ** 3 * 319;
    const y = (1 - t) ** 3 * 404 + 3 * (1 - t) ** 2 * t * 466 + 3 * (1 - t) * t * t * 466 + t ** 3 * 404;
    return `<circle class="s" pathLength="1" cx="${f1(x)}" cy="${f1(y)}" r="6.5" style="--d:${1900 + i * 30}ms"/>`;
  }).join('');

  // A rudraksha seen from the top: lobed, knobbly surface split by mukhi grooves radiating from the centre hole.
  function rudraksha(R, mukhi) {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const f = (n) => n.toFixed(1);
    const g0 = -Math.PI / 2;
    const step = (Math.PI * 2) / mukhi;
    const outline = Array.from({ length: 145 }, (_, i) => {
      const a = (i / 144) * Math.PI * 2;
      const r = R * (1 + 0.04 * Math.cos(mukhi * (a - g0) - Math.PI)) + 0.8 * Math.sin(a * 23) + 0.5 * Math.sin(a * 37 + 1);
      return `${f(r * Math.cos(a))} ${f(r * Math.sin(a))}`;
    });
    const outlineD = `M${outline.join('L')}Z`;
    // An irregular, wrinkled lump: a smooth closed curve through 7 points at uneven distances.
    const lump = (x, y, s) => {
      const rot = rnd() * Math.PI;
      const pts = Array.from({ length: 7 }, (_, i) => {
        const a = rot + (i / 7) * Math.PI * 2, r = s * (0.68 + rnd() * 0.5);
        return [x + r * Math.cos(a), y + r * Math.sin(a)];
      });
      const mid = (p, q) => `${f((p[0] + q[0]) / 2)} ${f((p[1] + q[1]) / 2)}`;
      return `M${mid(pts[6], pts[0])}${pts.map((p, i) => `Q${f(p[0])} ${f(p[1])} ${mid(p, pts[(i + 1) % 7])}`).join('')}Z`;
    };
    const tones = ['#8d4c26', '#9c5a30', '#7f421f', '#a8673a'];
    let bumps = '';
    for (let k = 0; k < mukhi; k++) {
      for (const ring of [0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.92]) {
        const rho = ring * R;
        const margin = 2.6 / rho;
        const span = step - margin * 2;
        const n = Math.max(1, Math.round((span * rho) / 4.6));
        for (let j = 0; j < n; j++) {
          const a = g0 + k * step + margin + ((j + 0.5) * span) / n + (rnd() - 0.5) * 0.1;
          const r = rho + (rnd() - 0.5) * 1.8;
          const size = (2.4 + rnd() * 1.2) * (0.8 + ring * 0.3);
          const x = r * Math.cos(a), y = r * Math.sin(a);
          bumps += `<path d="${lump(x, y, size)}" fill="${tones[Math.floor(rnd() * tones.length)]}"/>`;
        }
      }
    }
    let grooves = '';
    for (let k = 0; k < mukhi; k++) {
      const a = g0 + k * step;
      const end = R * 0.97;
      const p = (r, da = 0) => `${f(r * Math.cos(a + da))} ${f(r * Math.sin(a + da))}`;
      grooves += `<path class="groove" d="M${p(6)} Q${p(end * 0.55, 0.07)} ${p(end)}"/>`;
      grooves += `<path class="groove-hl" d="M${p(7, 0.12)} Q${p(end * 0.55, 0.12)} ${p(end, 0.05)}"/>`;
    }
    return `<path class="intro__bead-core" d="${outlineD}" fill="url(#introBead)"/>
      <g class="bumps">${bumps}</g>${grooves}
      <path d="${outlineD}" fill="url(#introBeadShade)"/>
      <circle r="7.5" class="hole-ring"/><circle r="4.2" class="hole"/>
      <path d="${outlineD}" class="intro__bead-rim"/>`;
  }

  function runIntro() {
    try { sessionStorage.setItem('adr_intro_seen', '1'); } catch { /* ignore */ }
    const el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'presentation');
    let i = 0;
    const stroke = (item) => {
      const [cls, d] = Array.isArray(item) ? item : ['', item];
      return `<path class="s ${cls}" pathLength="1" d="${d}" style="--d:${i++ * 24}ms"/>`;
    };
    el.innerHTML = `<div class="intro__inner">
        <svg class="intro__art" viewBox="0 0 500 560" aria-hidden="true">
          <defs>
            <radialGradient id="introBead" cx="40%" cy="36%" r="72%">
              <stop offset="0" stop-color="#5e2c13"/><stop offset="1" stop-color="#2c1207"/>
            </radialGradient>
            <radialGradient id="introBeadShade" cx="34%" cy="30%" r="80%">
              <stop offset="0" stop-color="#ffd9a8" stop-opacity=".22"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
            </radialGradient>
            <radialGradient id="introAura"><stop offset="0" stop-color="var(--gold)" stop-opacity=".16"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></radialGradient>
            <radialGradient id="introEye"><stop offset="0" stop-color="#ffb36b"/><stop offset=".4" stop-color="#e2582b" stop-opacity=".7"/><stop offset="1" stop-color="#e2582b" stop-opacity="0"/></radialGradient>
            <linearGradient id="introFadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="540">
              <stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
            </linearGradient>
            <mask id="introFade" maskUnits="userSpaceOnUse" x="-60" y="-60" width="620" height="680"><rect x="-60" y="-60" width="620" height="680" fill="url(#introFadeGrad)"/></mask>
          </defs>
          <g class="intro__shiva" mask="url(#introFade)">
            <circle class="intro__aura-glow" cx="250" cy="200" r="230" fill="url(#introAura)"/>
            ${SHIVA.map(stroke).join('')}
            <circle class="intro__eye-glow" cx="250" cy="158" r="18" fill="url(#introEye)"/>
            ${MALA}
          </g>
          <g transform="translate(281 218)"><g class="intro__tear"><path class="intro__drop" d="M0 0C5 8 9 14 9 19A9 9 0 1 1-9 19C-9 14-5 8 0 0Z"/></g></g>
          <g transform="translate(281 508)">
            <circle class="intro__halo" r="66"/>
            <g class="intro__bead">${rudraksha(40, 5)}</g>
            <circle class="intro__ripple" r="42"/>
          </g>
        </svg>
        <p class="intro__tag">Born of Shiva&rsquo;s tears</p>
        <div class="intro__word" aria-hidden="true">${'ADIRUDRA'.split('').map((c, n) => `<span style="--i:${n}">${c}</span>`).join('')}</div>
      </div>
      <span class="intro__skip">Click to skip</span>`;
    document.body.prepend(el);

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    let done = false;
    const end = (curtain) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      if (curtain) el.classList.add('is-leaving');
      html.classList.remove('intro-play');
      setTimeout(ready, curtain ? 250 : 150);
      setTimeout(() => el.remove(), curtain ? 1000 : 1300);
    };

    // Zoom in until the bead fills the screen, centred on its hole.
    at(5300, () => {
      const art = el.querySelector('.intro__art');
      const r = el.querySelector('.intro__bead-core').getBoundingClientRect();
      const box = art.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const scale = (Math.hypot(window.innerWidth, window.innerHeight) / r.width) * 1.25;
      art.style.transformOrigin = `${cx - box.left}px ${cy - box.top}px`;
      el.classList.add('is-zooming');
      art.animate([{ transform: 'none' }, { transform: `translate(${window.innerWidth / 2 - cx}px, ${window.innerHeight / 2 - cy}px) scale(${scale})` }],
        { duration: 1200, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' });
    });
    // Open the website through the centre of the bead.
    at(6300, () => { el.classList.add('is-opening'); end(false); });

    const skip = () => end(true);
    el.addEventListener('click', skip);
    document.addEventListener('keydown', skip, { once: true });
  }

  // ---------- Hero headline: wrap each word so it can slide up ----------
  function splitHeadline() {
    const h1 = document.querySelector('.hero h1');
    if (!h1 || h1.dataset.split) return;
    const text = h1.textContent.trim();
    h1.setAttribute('aria-label', text);
    h1.innerHTML = text.split(/\s+/).map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span></span>`).join(' ');
    h1.dataset.split = '1';
  }

  // ---------- Scroll reveal ----------
  // Anything matching these selectors fades up the first time it scrolls into view,
  // including content rendered later (product grids load from the API).
  const REVEAL = [
    '.trust__item', '.section-heading', '.category-tile', '.product-card', '.band__intro', '.steps > div',
    '.page-head', '.pdp__visual', '.pdp__info', '.confirm', '.empty-state', '.site-footer__inner > div', '.stat'
  ].join(',');

  let io;
  function observe(el) {
    if (el.dataset.reveal !== undefined) return;
    // Stagger siblings that appear together (e.g. a row of cards).
    const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(REVEAL)) : [el];
    const idx = Math.max(0, siblings.indexOf(el));
    el.style.setProperty('--reveal-delay', `${(idx % 6) * 80}ms`);
    el.dataset.reveal = '';
    io.observe(el);
  }

  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
        // Clear the delay afterwards so hover transitions aren't slowed by it.
        setTimeout(() => entry.target.style.removeProperty('--reveal-delay'), 1200);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll(REVEAL).forEach(observe);
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches(REVEAL)) observe(node);
          node.querySelectorAll(REVEAL).forEach(observe);
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- Header shadow once the page scrolls ----------
  function setupHeader() {
    let ticking = false;
    const update = () => { html.classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // ---------- Product columns: pinned, counter-scrolling ----------
  // Each .product-grid[data-columns] (the homepage featured list) is split into vertical columns inside a stage that pins below the header.
  // While the page scrolls past it, the outer columns slide up and the middle one slides down.
  const grids = new Set();

  function columnCount() {
    return window.innerWidth <= 600 ? 2 : 3;
  }

  function buildColumns(grid) {
    const cards = [...grid.children].filter((c) => c.classList.contains('product-card'));
    if (!cards.length) { grid.classList.remove('is-columns'); grid.style.removeProperty('height'); return; }
    const n = columnCount();
    const cols = Array.from({ length: n }, (_, i) => {
      const col = document.createElement('div');
      col.className = 'pcol';
      col.dataset.dir = i % 2 ? 'down' : 'up';
      return col;
    });
    cards.forEach((card, i) => { card._order = i; cols[i % n].append(card); });
    // Columns that move down start at their end, so reverse them to keep the first products in view first.
    cols.forEach((col) => { if (col.dataset.dir === 'down') col.append(...[...col.children].reverse()); });
    const stage = document.createElement('div');
    stage.className = 'pcols';
    stage.style.setProperty('--cols', n);
    stage.append(...cols);
    grid.dataset.cols = n;
    grid.classList.add('is-columns');
    grid.replaceChildren(stage);
    measure(grid);
  }

  // Work out how far each column has to travel and how tall the scroll track must be.
  function measure(grid) {
    const stage = grid.querySelector(':scope > .pcols');
    if (!stage) return;
    const header = parseFloat(getComputedStyle(html).getPropertyValue('--header-h')) || 0;
    const stageH = Math.max(320, window.innerHeight - header);
    stage.style.height = `${stageH}px`;
    stage.style.top = `${header}px`;
    let travel = 0;
    stage.querySelectorAll('.pcol').forEach((col) => {
      col._travel = Math.max(0, col.scrollHeight - stageH);
      travel = Math.max(travel, col._travel);
    });
    grid._header = header;
    grid._travel = travel;
    grid.style.height = `${stageH + travel}px`;
    position(grid);
  }

  function position(grid) {
    const stage = grid.querySelector(':scope > .pcols');
    if (!stage) return;
    const scrolled = grid._header - grid.getBoundingClientRect().top;
    const p = grid._travel ? Math.min(1, Math.max(0, scrolled / grid._travel)) : 0;
    stage.querySelectorAll('.pcol').forEach((col) => {
      const y = col.dataset.dir === 'down' ? -(1 - p) * col._travel : -p * col._travel;
      col.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    });
  }

  function setupColumns() {
    const watch = (grid) => {
      if (grids.has(grid)) return;
      grids.add(grid);
      // Product lists are rendered (and re-rendered by shop filters) after load: rebuild whenever raw cards appear.
      new MutationObserver(() => {
        if ([...grid.children].some((c) => !c.classList.contains('pcols'))) buildColumns(grid);
      }).observe(grid, { childList: true });
      buildColumns(grid);
    };
    document.querySelectorAll('.product-grid[data-columns]').forEach(watch);

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { grids.forEach(position); ticking = false; });
    }, { passive: true });

    let lastCols = columnCount();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const n = columnCount();
        grids.forEach((grid) => {
          if (n === lastCols) return measure(grid);
          // Column count changed: put the cards back in order and redistribute them.
          const cards = [...grid.querySelectorAll('.product-card')]
            .sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
          if (cards.length) grid.replaceChildren(...cards);
        });
        lastCols = n;
      }, 150);
    });
    // Images and fonts change card heights after the first measurement.
    window.addEventListener('load', () => grids.forEach(measure));
    let remeasure = 0;
    document.addEventListener('load', (e) => {
      if (e.target.tagName !== 'IMG' || !e.target.closest('.pcols')) return;
      cancelAnimationFrame(remeasure);
      remeasure = requestAnimationFrame(() => grids.forEach(measure));
    }, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    splitHeadline();
    setupReveal();
    setupHeader();
    setupColumns();
    if (playIntro) runIntro(); else requestAnimationFrame(ready);
  });
})();
