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
  // A line doodle of Lord Shiva draws itself; a tear falls from his eye and becomes a rudraksha,
  // then the view zooms into the bead and the website opens through it.
  const SHIVA = [
    // matted hair (jata) with coils, and the Ganga springing from it
    'M168 118C160 90 170 52 200 40C230 52 240 90 232 118', 'M176 100C188 92 212 92 224 100', 'M180 78C192 70 208 70 220 78', 'M188 58C196 53 204 53 212 58',
    'M200 40C196 28 204 20 200 8', 'M200 22C190 14 182 18 178 26', 'M200 22C210 14 218 18 222 26',
    // crescent moon
    'M156 70A15 15 0 1 0 178 96A12 12 0 1 1 156 70Z',
    // face, hairline, locks of hair
    'M200 112C238 112 262 142 262 186C262 232 236 268 200 272C164 268 138 232 138 186C138 142 162 112 200 112Z',
    'M142 168C146 134 172 120 200 122C228 120 254 134 258 168',
    'M146 140C120 170 124 230 112 290C106 320 112 350 104 380', 'M156 124C132 150 138 200 128 250',
    'M254 140C280 170 276 230 288 290C294 320 288 350 296 380', 'M244 124C268 150 262 200 272 250',
    // tripundra (three lines of ash)
    'M172 146Q200 141 228 146', 'M170 153Q200 148 230 153', 'M172 160Q200 155 228 160',
    // brows, eyes closed in meditation, lashes, nose, lips
    'M164 176Q178 168 192 174', 'M208 174Q222 168 236 176',
    'M166 190Q179 198 192 190', 'M208 190Q221 198 234 190',
    'M172 194l-2 5M179 196v5M186 194l2 5', 'M214 194l-2 5M221 196v5M228 194l2 5',
    'M200 182C198 196 196 206 194 214C197 218 203 218 206 214',
    'M184 234Q192 230 200 234Q208 230 216 234', 'M188 238Q200 246 212 238',
    // ears and earrings
    'M138 180C128 178 126 200 140 206', 'M262 180C272 178 274 200 260 206',
    'M128 214a6 6 0 1 0 12 0a6 6 0 1 0-12 0', 'M260 214a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
    // neck and shoulders
    'M180 266L178 296', 'M220 266L222 296',
    'M178 296C150 302 112 312 92 340C80 360 76 400 74 470', 'M222 296C250 302 288 312 308 340C320 360 324 400 326 470',
    // serpent (Vasuki) around the neck
    'M150 306C152 296 160 292 168 300C180 318 220 318 232 300C244 290 252 272 258 264',
    'M252 266C250 248 274 248 272 266C268 272 256 272 252 266Z',
    // trishul with damaru
    'M340 470L340 100', 'M318 100Q340 112 362 100', 'M318 100C314 84 318 70 324 60', 'M362 100C366 84 362 70 356 60',
    'M340 100V52M334 62L340 50L346 62', 'M328 138H352L340 152ZM328 166H352L340 152Z'
  ];
  // Rudraksha mala on the chest
  const MALA = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const x = (1 - t) ** 2 * 160 + 2 * (1 - t) * t * 200 + t * t * 240;
    const y = (1 - t) ** 2 * 318 + 2 * (1 - t) * t * 410 + t * t * 318;
    return `<circle class="s" pathLength="1" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" style="--d:${1700 + i * 40}ms"/>`;
  }).join('');

  function runIntro() {
    try { sessionStorage.setItem('adr_intro_seen', '1'); } catch { /* ignore */ }
    const el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'presentation');
    el.innerHTML = `<div class="intro__inner">
        <svg class="intro__art" viewBox="0 0 400 500" aria-hidden="true">
          <defs>
            <radialGradient id="introBead" cx="38%" cy="34%" r="70%">
              <stop offset="0" stop-color="#b47a4c"/><stop offset=".55" stop-color="#7a4022"/><stop offset="1" stop-color="#3a1b0c"/>
            </radialGradient>
          </defs>
          <g class="intro__shiva">
            ${SHIVA.map((d, i) => `<path class="s" pathLength="1" d="${d}" style="--d:${i * 42}ms"/>`).join('')}
            <path class="s intro__third-eye" pathLength="1" d="M200 142C205 147 205 159 200 164C195 159 195 147 200 142Z" style="--d:${SHIVA.length * 42}ms"/>
            ${MALA}
          </g>
          <g transform="translate(214 199)"><g class="intro__tear"><path class="intro__drop" d="M0 0C4 6 7 11 7 15A7 7 0 1 1-7 15C-7 11-4 6 0 0Z"/></g></g>
          <g transform="translate(214 446)">
            <circle class="intro__halo" r="36"/>
            <g class="intro__bead">
              <circle class="intro__bead-core" r="22" fill="url(#introBead)"/>
              <path d="M0-22C-9-12-9 12 0 22M0-22C9-12 9 12 0 22M0-22V22M-7-20C-17-8-17 8-7 20M7-20C17-8 17 8 7 20"/>
              <circle r="22" class="intro__bead-rim"/>
            </g>
            <circle class="intro__ripple" r="22"/>
          </g>
        </svg>
        <p class="intro__tag">Born of Shiva&rsquo;s tears</p>
        <div class="intro__word" aria-hidden="true">${'ADIRUDRA'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
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

    // Zoom in until the bead fills the screen, centred.
    at(4700, () => {
      const art = el.querySelector('.intro__art');
      const r = el.querySelector('.intro__bead-core').getBoundingClientRect();
      const box = art.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const scale = (Math.hypot(window.innerWidth, window.innerHeight) / r.width) * 1.2;
      art.style.transformOrigin = `${cx - box.left}px ${cy - box.top}px`;
      el.classList.add('is-zooming');
      art.animate([{ transform: 'none' }, { transform: `translate(${window.innerWidth / 2 - cx}px, ${window.innerHeight / 2 - cy}px) scale(${scale})` }],
        { duration: 1100, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' });
    });
    // Open the website through the centre of the bead.
    at(5650, () => { el.classList.add('is-opening'); end(false); });

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
