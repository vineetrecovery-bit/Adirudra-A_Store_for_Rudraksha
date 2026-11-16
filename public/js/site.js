// Applies website settings (window.SITE, injected by the server) to the page:
// text bindings, lists, section order, announcement bar, brand.
// In the admin's live preview (?preview=1) it also takes unsaved settings from the editor.
(function () {
  'use strict';

  const ICON_PATHS = {
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    return: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 10h18"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z"/><path d="M5 19 13 11"/>',
    gift: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M12 9v11M3 13h18M12 9C9 9 7 7.5 7 6s2-2 3 0l2 3m0 0c3 0 5-1.5 5-3s-2-2-3 0l-2 3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const isPreview = new URLSearchParams(location.search).has('preview');

  let site = window.SITE || null;

  // {freeShippingOver}, {shippingFee}, {codFee} come from Admin > Settings; pages can pass more (e.g. {name}).
  const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  function fill(text, vars = {}) {
    const shop = (window.Store && Store.CONFIG && Store.CONFIG.codFee !== undefined) ? Store.CONFIG : (window.SHOP || {});
    const all = { freeShippingOver: money(shop.freeShippingOver), shippingFee: money(shop.shippingFee), codFee: money(shop.codFee), ...vars };
    return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in all ? String(all[k]) : m));
  }
  // Plain text for a setting, e.g. Site.t('pages.cart.title'); returns '' if missing.
  const t = (path, vars) => fill(site ? get(site, path) : '', vars);

  const LISTS = {
    'trust.items': (items) => items.map((x) => `<div class="trust__item"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[x.icon] || ICON_PATHS.shield}</svg><div><strong>${esc(fill(x.title))}</strong><span>${esc(fill(x.text))}</span></div></div>`).join(''),
    'authenticity.steps': (items) => items.map((s, i) => `<div><span class="step-number">${String(i + 1).padStart(2, '0')}</span><h3>${esc(fill(s.title))}</h3><p>${esc(fill(s.text))}</p></div>`).join(''),
    'faq.items': (items) => items.map((f) => `<div><span class="step-number">Q</span><h3>${esc(fill(f.q))}</h3><p>${esc(fill(f.a))}</p></div>`).join('')
  };

  function applyTheme(theme) {
    const root = document.documentElement.style;
    const map = { paper: '--paper', surface: '--surface', ink: '--ink', muted: '--muted', line: '--line', walnut: '--walnut', bronze: '--bronze', gold: '--gold', dark: '--dark', onPrimary: '--on-primary' };
    Object.entries(theme.colors).forEach(([k, v]) => root.setProperty(map[k], v));
    root.setProperty('--serif', `'${theme.fonts.heading}', Georgia, serif`);
    root.setProperty('--sans', `'${theme.fonts.body}', Arial, sans-serif`);
    root.setProperty('--radius', `${theme.radius}px`);
    const fam = (n) => `family=${n.replace(/ /g, '+')}:wght@400;500;600`;
    const href = `https://fonts.googleapis.com/css2?${[...new Set([theme.fonts.heading, theme.fonts.body])].map(fam).join('&')}&display=swap`;
    const link = document.querySelector('link[href^="https://fonts.googleapis.com/css2"]');
    if (link && link.href !== href) link.href = href;
  }

  function applyAnnouncement() {
    let bar = document.getElementById('announcement');
    const a = site.announcement;
    if (!a.enabled || !a.text) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'announcement';
      bar.className = 'announcement';
      const skip = document.querySelector('.skip-link');
      (skip ? skip.after(bar) : document.body.prepend(bar));
    }
    bar.innerHTML = a.link ? `<a href="${esc(a.link)}">${esc(fill(a.text))}</a>` : esc(fill(a.text));
  }

  function apply(root = document) {
    if (!site) return;
    root.querySelectorAll('[data-site]').forEach((el) => {
      let v = get(site, el.dataset.site);
      if (typeof v !== 'string') return;
      v = fill(v);
      if (el.textContent !== v) el.textContent = v;
      // Menu and footer links with an empty label are hidden.
      if (el.hasAttribute('data-site-hide-empty')) (el.closest('li') || el).hidden = !v;
    });
    root.querySelectorAll('[data-site-placeholder]').forEach((el) => {
      const v = get(site, el.dataset.sitePlaceholder);
      if (typeof v === 'string') el.setAttribute('placeholder', fill(v));
    });
    root.querySelectorAll('[data-site-href]').forEach((el) => {
      const v = get(site, el.dataset.siteHref);
      if (typeof v === 'string') el.setAttribute('href', v || '#');
    });
    root.querySelectorAll('[data-site-src]').forEach((el) => {
      let v = get(site, el.dataset.siteSrc);
      // Pages served at any path (404) need root-relative asset links.
      if (v && el.hasAttribute('data-site-abs') && /^assets\//.test(v)) v = `/${v}`;
      if (v && el.getAttribute('src') !== v) el.setAttribute('src', v);
    });
    root.querySelectorAll('[data-site-bg]').forEach((el) => {
      const v = get(site, el.dataset.siteBg);
      if (v) el.style.backgroundImage = `url(${JSON.stringify(v)})`;
    });
    root.querySelectorAll('[data-list]').forEach((el) => {
      const items = get(site, el.dataset.list);
      const render = LISTS[el.dataset.list];
      if (Array.isArray(items) && render) {
        const html = render(items);
        if (el.dataset.rendered !== html) { el.innerHTML = html; el.dataset.rendered = html; }
        if (el.dataset.list === 'trust.items') el.style.setProperty('--cols', String(items.length));
      }
    });
    // Home page section order and visibility.
    const container = document.getElementById('homeSections');
    if (container) {
      site.sections.forEach(({ id, enabled }) => {
        const sec = container.querySelector(`[data-section="${id}"]`);
        if (!sec) return;
        sec.hidden = !enabled;
        container.appendChild(sec); // re-append in configured order
      });
    }
    // Hero headline: when motion.js has split it into words, keep the label in sync.
    const h1 = document.querySelector('.hero h1[data-split]');
    if (h1) h1.setAttribute('aria-label', site.hero.title);
    applyAnnouncement();
  }

  // Category tiles and featured products (needs products from the API, via Store).
  function renderHome() {
    if (!site || !window.Store || !Store.products.length) return;
    const { products, productCard } = Store;
    const types = [['Loose Bead', 'looseBead'], ['Mala', 'mala'], ['Bracelet', 'bracelet'], ['Pendant', 'pendant']];
    const cats = document.getElementById('categories');
    if (cats) {
      cats.innerHTML = types.map(([type, key]) => {
        const n = products.filter((p) => p.type === type).length;
        return `<a class="category-tile" href="shop.html?type=${encodeURIComponent(type)}"><h3>${esc(site.categories.labels[key])}</h3><span>${n} product${n === 1 ? '' : 's'} →</span></a>`;
      }).join('');
    }
    const feat = document.getElementById('featured');
    if (feat) {
      const list = products.filter((p) => p.featured || p.rarity === 'Extremely Rare' || p.rarity === 'Rare').slice(0, site.featured.count);
      feat.innerHTML = list.map(productCard).join('');
    }
  }

  // ---------- Live preview from the admin editor ----------
  if (isPreview) {
    document.documentElement.classList.add('is-preview');
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'adr-site-preview') return;
      site = e.data.site;
      window.SITE = site;
      applyTheme(site.theme);
      apply();
      renderHome();
      // Pages that build text with scripts (cart, product, shop, checkout) re-render on this.
      window.dispatchEvent(new Event('site:update'));
    });
    // Tell the editor we're ready to receive the current draft.
    window.addEventListener('load', () => { if (window.parent !== window) window.parent.postMessage({ type: 'adr-preview-ready' }, location.origin); });
  }

  window.Site = { apply, renderHome, t, fill, get data() { return site; } };
  apply(); // the page content above this script is already parsed
})();
