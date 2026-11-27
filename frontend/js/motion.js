// Motion: opening intro, hero entrance, scroll reveals, header shadow.
// Loaded in <head> so the intro cover is in place before the first paint.
(function () {
  'use strict';
  const html = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // No motion for reduced-motion users or inside the admin's live preview: everything stays static and visible.
  if (reduceMotion || new URLSearchParams(location.search).has('preview')) return;

  html.classList.add('motion');

  // The intro plays on the first page opened in a browser session.
  let playIntro = false;
  try { playIntro = !sessionStorage.getItem('adr_intro_seen'); } catch { /* storage blocked: skip intro */ }
  if (playIntro) html.classList.add('intro-play');

  const ready = () => html.classList.add('is-ready');

  // ---------- Opening intro ----------
  function runIntro() {
    try { sessionStorage.setItem('adr_intro_seen', '1'); } catch { /* ignore */ }
    const el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'presentation');
    el.innerHTML = `<div class="intro__inner">
        <svg class="intro__logo" viewBox="0 0 64 64" aria-hidden="true">
          <path pathLength="1" d="M32 8v41M21 20c0 9 4 14 11 14s11-5 11-14M21 20v-7m22 7v-7M25 50h14"/>
          <path pathLength="1" d="M16 53l16-37 16 37M22 41h20"/>
        </svg>
        <div class="intro__word" aria-hidden="true">${'ADIRUDRA'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
        <p class="intro__tag">Sacred beads, honestly sourced</p>
        <span class="intro__bar"></span>
      </div>
      <span class="intro__skip">Click to skip</span>`;
    document.body.prepend(el);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('is-leaving');
      html.classList.remove('intro-play');
      // Start the hero animation as the curtain lifts.
      setTimeout(ready, 250);
      setTimeout(() => el.remove(), 1000);
    };
    const timer = setTimeout(finish, 2300);
    el.addEventListener('click', () => { clearTimeout(timer); finish(); });
    document.addEventListener('keydown', () => { clearTimeout(timer); finish(); }, { once: true });
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
  // Each .product-grid is split into vertical columns inside a stage that pins below the header.
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
    document.querySelectorAll('.product-grid').forEach(watch);

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
