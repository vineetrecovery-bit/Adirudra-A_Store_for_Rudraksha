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

  // The intro plays on the first page opened in a browser session.
  let playIntro = false;
  try { playIntro = forceIntro || !sessionStorage.getItem('adr_intro_seen'); } catch { playIntro = forceIntro; /* storage blocked */ }
  if (playIntro) html.classList.add('intro-play');

  const ready = () => html.classList.add('is-ready');

  // ---------- Opening intro ----------
  // A line drawing of Lord Shiva draws itself; a tear falls from his eye and becomes a rudraksha,
  // then the view zooms into the bead and the website opens through its centre.
  // Mirror a path (absolute "x y" pairs only) across the face's centre line.
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${600 - x} ${y}`);
  // Long matted locks: tapered strands streaming down behind the shoulders (left side; the right is mirrored).
  const LOCKS = [
    'M240 196 C 196 206, 168 252, 156 318 C 146 372, 128 412, 104 446 C 138 418, 160 380, 172 326 C 184 270, 206 232, 244 214',
    'M236 232 C 204 250, 190 290, 186 340 C 182 384, 168 418, 148 446 C 178 422, 196 390, 202 344 C 206 300, 216 270, 238 254'
  ];
  const SHIVA = [
    // aura behind the head
    ['a', 'M100 250 A 200 200 0 1 0 500 250 A 200 200 0 1 0 100 250'],
    // matted hair (jata) piled high, the Ganga springing from it, the crescent moon
    'M258 172 C 244 140, 252 104, 280 94 C 278 70, 322 70, 320 94 C 348 104, 356 140, 342 172',
    'M262 150 C 280 140, 320 140, 338 150', 'M268 124 C 284 114, 316 114, 332 124', 'M284 100 C 294 94, 306 94, 316 100',
    'M300 76 C 294 58, 306 44, 300 22', 'M300 46 C 286 32, 272 36, 266 50', 'M300 46 C 314 32, 328 36, 334 50',
    'M240 112 A 22 22 0 1 0 274 148 A 17 17 0 1 1 240 112 Z',
    // hair streaming down behind the shoulders
    ...LOCKS, ...LOCKS.map(mirror),
    // a strong face
    'M300 160 C 352 160, 372 196, 372 246 C 372 292, 350 328, 322 342 C 312 348, 288 348, 278 342 C 250 328, 228 292, 228 246 C 228 196, 248 160, 300 160 Z',
    'M232 222 C 236 184, 264 166, 300 168 C 336 166, 364 184, 368 222',
    // tripundra (three lines of ash)
    'M262 205 Q 300 199, 338 205', 'M258 214 Q 300 208, 342 214', 'M262 223 Q 300 217, 338 223',
    // brows, eyes closed in meditation, lashes
    'M252 242 C 264 230, 282 230, 293 237', 'M307 237 C 318 230, 336 230, 348 242',
    'M260 250 Q 274 245, 290 251', 'M310 251 Q 326 245, 340 250',
    'M258 257 Q 274 268, 292 257', 'M308 257 Q 326 268, 342 257',
    'M266 262l-2 6M274 264v6M282 263l2 6', 'M318 263l-2 6M326 264v6M334 262l2 6',
    // nose and lips
    'M300 246 C 298 262, 294 278, 290 290 C 294 296, 306 296, 310 290', 'M286 288 C 284 294, 288 298, 293 297', 'M314 288 C 316 294, 312 298, 307 297',
    'M280 316 Q 290 310, 300 314 Q 310 310, 320 316 Q 300 321, 280 316', 'M285 321 Q 300 332, 315 321', 'M291 340 Q 300 344, 309 340',
    // ears with heavy kundala earrings
    'M230 240 C 216 236, 214 268, 232 278', 'M370 240 C 384 236, 386 268, 368 278',
    'M212 296a12 12 0 1 0 24 0a12 12 0 1 0-24 0', 'M364 296a12 12 0 1 0 24 0a12 12 0 1 0-24 0',
    // thick neck
    'M274 336 L 268 386', 'M326 336 L 332 386',
    // serpent coiled round the neck, hood raised beside it
    'M232 398 C 236 388, 244 384, 256 392 C 270 412, 330 412, 344 392 C 356 386, 378 396, 392 392',
    ['fill', 'M392 392 C 378 384, 364 364, 366 344 C 368 326, 380 318, 392 318 C 404 318, 416 326, 418 344 C 420 364, 406 384, 392 392 Z'],
    'M386 330 C 386 320, 398 320, 398 330', 'M388 326h1M395 326h1', 'M378 348 Q 392 338, 406 348', 'M382 360 Q 392 352, 402 360', 'M387 372 Q 392 368, 397 372',
    'M392 318 V308 l-4 -6 M392 308 l4 -6',
    // broad shoulders and the left arm
    'M268 386 C 222 392, 166 398, 128 428 C 102 450, 92 500, 96 560 C 98 600, 104 640, 110 680',
    'M128 428 C 146 446, 158 466, 162 492', 'M162 492 C 160 560, 158 620, 156 680',
    'M98 524 Q 128 534, 161 525',
    // right arm raised, fist gripping the trishul
    'M332 386 C 378 392, 434 398, 470 426 C 480 434, 486 440, 490 446', 'M470 426 C 462 446, 450 462, 440 476',
    'M490 446 C 512 480, 522 526, 522 572', 'M440 486 C 452 522, 470 556, 486 586', 'M486 586 C 496 604, 522 600, 522 572',
    'M462 512 Q 488 506, 514 500',
    'M522 572 C 538 520, 556 466, 584 422', 'M498 566 C 514 510, 530 460, 548 424',
    'M548 424 C 538 408, 542 388, 558 384 L 578 384 C 592 386, 594 406, 584 424 Z', 'M552 396 H588 M550 406 H590 M552 415 H586',
    // chest
    'M206 470 C 238 508, 282 510, 296 490', 'M304 490 C 318 510, 362 508, 394 470',
    // trishul with damaru
    'M566 384 V112', 'M566 466 V720', 'M566 112 V44', 'M556 64 L 566 40 L 576 64 Z',
    'M534 118 Q 566 136, 598 118', 'M534 118 C 528 94, 532 74, 542 60', 'M598 118 C 604 94, 600 74, 590 60',
    'M536 66 L 543 54 L 548 68', 'M584 68 L 589 54 L 596 66',
    'M552 160 H580 L 566 180 Z M552 200 H580 L 566 180 Z', 'M580 172 C 594 178, 586 190, 600 198'
  ];
  // Sun-like rays around the aura
  const RAYS = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2, r1 = 210, r2 = i % 2 ? 222 : 232;
    const p = (r) => `${(300 + r * Math.cos(a)).toFixed(1)} ${(250 + r * Math.sin(a)).toFixed(1)}`;
    return `M${p(r1)} L${p(r2)}`;
  }).join('');
  // A rudraksha mala on the chest
  const MALA = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    const x = (1 - t) ** 2 * 236 + 2 * (1 - t) * t * 300 + t * t * 364;
    const y = (1 - t) ** 2 * 410 + 2 * (1 - t) * t * 660 + t * t * 410;
    return `<circle class="s" pathLength="1" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" style="--d:${2000 + i * 30}ms"/>`;
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
      return `<path class="s ${cls}" pathLength="1" d="${d}" style="--d:${i++ * 26}ms"/>`;
    };
    el.innerHTML = `<div class="intro__inner">
        <svg class="intro__art" viewBox="0 0 620 720" aria-hidden="true">
          <defs>
            <radialGradient id="introBead" cx="40%" cy="36%" r="72%">
              <stop offset="0" stop-color="#5e2c13"/><stop offset="1" stop-color="#2c1207"/>
            </radialGradient>
            <radialGradient id="introBeadShade" cx="34%" cy="30%" r="80%">
              <stop offset="0" stop-color="#ffd9a8" stop-opacity=".22"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
            </radialGradient>
            <radialGradient id="introAura"><stop offset="0" stop-color="var(--gold)" stop-opacity=".16"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></radialGradient>
            <radialGradient id="introEye"><stop offset="0" stop-color="#ffb36b"/><stop offset=".4" stop-color="#e2582b" stop-opacity=".7"/><stop offset="1" stop-color="#e2582b" stop-opacity="0"/></radialGradient>
            <linearGradient id="introFadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="700">
              <stop offset=".72" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
            </linearGradient>
            <mask id="introFade" maskUnits="userSpaceOnUse" x="-60" y="-60" width="760" height="840"><rect x="-60" y="-60" width="760" height="840" fill="url(#introFadeGrad)"/></mask>
          </defs>
          <g class="intro__shiva" mask="url(#introFade)">
            <circle class="intro__aura-glow" cx="300" cy="250" r="230" fill="url(#introAura)"/>
            <path class="s a" pathLength="1" d="${RAYS}" style="--d:0ms"/>
            ${SHIVA.map(stroke).join('')}
            <path class="s intro__third-eye" pathLength="1" d="M300 200 C 307 207, 307 221, 300 228 C 293 221, 293 207, 300 200 Z M300 208 V220" style="--d:${i * 26}ms"/>
            <circle class="intro__eye-glow" cx="300" cy="214" r="16" fill="url(#introEye)"/>
            ${MALA}
          </g>
          <g transform="translate(326 264)"><g class="intro__tear"><path class="intro__drop" d="M0 0C5 8 9 14 9 19A9 9 0 1 1-9 19C-9 14-5 8 0 0Z"/></g></g>
          <g transform="translate(326 652)">
            <circle class="intro__halo" r="76"/>
            <g class="intro__bead">${rudraksha(46, 5)}</g>
            <circle class="intro__ripple" r="48"/>
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
