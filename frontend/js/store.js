// Shared storefront logic: API client, cart, header/footer, product cards, toast.
// The cart (product IDs + quantities) lives in the browser; prices and totals always come from the server.
(function () {
  'use strict';

  const CART_KEY = 'adirudra_cart';
  const COUPON_KEY = 'adirudra_coupon';
  const ORDERS_KEY = 'adirudra_my_orders';

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  class ApiError extends Error {
    constructor(message, status, body) { super(message); this.status = status; this.body = body || {}; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
      });
    } catch {
      throw new ApiError('Could not reach the store. Check your connection and try again.', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status, data);
    return data;
  }

  // ---------- State loaded from the server ----------
  let products = [];
  let CONFIG = {};
  const byId = (id) => products.find((p) => p.id === id);

  // ---------- Cart ----------
  const Cart = {
    items() {
      const raw = readJSON(CART_KEY, []);
      return Array.isArray(raw) ? raw.filter((i) => i && typeof i.id === 'string' && i.qty > 0 && (!products.length || byId(i.id))) : [];
    },
    save(items) { writeJSON(CART_KEY, items.map(({ id, qty }) => ({ id, qty }))); updateCartCount(); },
    qtyOf(id) { return (this.items().find((i) => i.id === id) || {}).qty || 0; },
    add(id, qty = 1) {
      const p = byId(id); if (!p || !p.inStock) return 0;
      const items = this.items();
      const line = items.find((i) => i.id === id);
      const next = Math.min((line ? line.qty : 0) + qty, p.maxQty);
      if (line) line.qty = next; else items.push({ id, qty: next });
      this.save(items);
      return next;
    },
    setQty(id, qty) {
      const p = byId(id);
      let items = this.items();
      if (qty <= 0) items = items.filter((i) => i.id !== id);
      else { const line = items.find((i) => i.id === id); if (line) line.qty = Math.min(qty, p ? p.maxQty : qty); }
      this.save(items);
    },
    remove(id) { this.save(this.items().filter((i) => i.id !== id)); },
    clear() { this.save([]); setCoupon(''); },
    count() { return this.items().reduce((s, i) => s + i.qty, 0); }
  };

  function getCoupon() { try { return localStorage.getItem(COUPON_KEY) || ''; } catch { return ''; } }
  function setCoupon(code) { try { code ? localStorage.setItem(COUPON_KEY, code) : localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ } }

  // Ask the server to price the cart. Lines come back with product details attached.
  async function quote({ payment = '', coupon = getCoupon() } = {}) {
    const q = await api('/quote', { method: 'POST', body: { items: Cart.items(), coupon, payment } });
    q.lines = q.lines.map((l) => ({ ...l, product: byId(l.id) || { id: l.id, name: l.name, mukhi: '' } }));
    return q;
  }

  // Remember orders placed from this browser so the confirmation link keeps working.
  const MyOrders = {
    all() { const o = readJSON(ORDERS_KEY, []); return Array.isArray(o) ? o : []; },
    add(id, token) { writeJSON(ORDERS_KEY, [{ id, token }, ...this.all().filter((o) => o.id !== id)].slice(0, 20)); }
  };


  // ---------- Razorpay checkout ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = () => reject(new ApiError('Could not load the payment window. Check your connection.', 0));
      document.head.appendChild(s);
    });
  }

  // Opens Razorpay for an existing order. Resolves 'paid' or 'dismissed'.
  async function payWithRazorpay({ orderId, token, razorpay, customer }) {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: razorpay.keyId,
        order_id: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency || 'INR',
        name: 'Adirudra',
        description: `Order ${orderId}`,
        image: new URL('assets/logo.svg', location.href).href,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        theme: { color: '#2d211a' },
        handler: (resp) => api(`/orders/${encodeURIComponent(orderId)}/pay`, { method: 'POST', body: { token, ...resp } }).then(() => resolve('paid'), reject),
        modal: { ondismiss: () => resolve('dismissed') }
      });
      rzp.on('payment.failed', () => { /* Razorpay shows the error and lets the customer retry inside the window */ });
      rzp.open();
    });
  }

  // ---------- Rendering ----------
  function visual(p, small) {
    if (p.image) return `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`;
    return `<div class="placeholder${small ? ' placeholder--sm' : ''}" role="img" aria-label="${esc(p.name)}"><span class="placeholder__number">${esc(p.mukhi)}</span><span class="placeholder__label">Mukhi</span></div>`;
  }

  function badge(p) {
    if (!p.inStock) return '<span class="badge">Sold out</span>';
    if (p.rarity === 'Extremely Rare' || p.rarity === 'Rare') return `<span class="badge badge--dark">${esc(p.rarity)}</span>`;
    if (p.featured) return '<span class="badge">Bestseller</span>';
    return '';
  }

  // Card with a details panel that slides up on hover (or via the "+" button on touch screens).
  function productCard(p) {
    const url = `product.html?id=${encodeURIComponent(p.id)}`;
    const specs = [['Mukhi', p.mukhi], ['Origin', p.origin], ['Size', p.size], ['Weight', p.weight], ['Rarity', p.rarity], ['Certificate', p.certified ? 'Lab tested' : '—']];
    const stock = !p.inStock ? 'Sold out' : p.maxQty <= 3 ? `Only ${p.maxQty} left` : 'In stock · ships in 1–2 days';
    return `<article class="product-card">
      <div class="product-card__media">
        <a class="product-card__visual" href="${url}" tabindex="-1" aria-hidden="true">${visual(p)}</a>
        ${badge(p)}
        <div class="product-card__details" id="details-${esc(p.id)}" aria-hidden="true">
          <p class="product-card__details-kicker">${esc(p.type)} · ${esc(p.origin)}</p>
          <p class="product-card__desc">${esc(p.description)}</p>
          <dl class="product-card__specs">${specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          <div class="product-card__details-foot"><span class="${p.inStock && p.maxQty <= 3 ? 'is-low' : ''}">${stock}</span><span>View details →</span></div>
        </div>
        <button class="product-card__info" type="button" aria-expanded="false" aria-controls="details-${esc(p.id)}" aria-label="Show details for ${esc(p.name)}"><span aria-hidden="true">+</span></button>
      </div>
      <a class="product-card__link" href="${url}">
        <div class="product-card__content">
          <div class="product-card__meta"><span>${esc(p.type)}</span><span>·</span><span>${esc(p.origin)}</span></div>
          <h3>${esc(p.name)}</h3>
          <div class="product-card__facts"><span>${esc(p.size)}</span><span>${esc(p.weight)}</span>${p.certified ? '<span>Lab certified</span>' : ''}</div>
        </div>
      </a>
      <div class="product-card__bottom">
        <span class="price">${money(p.price)}</span>
        ${p.inStock
          ? `<button class="add-btn" type="button" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart">Add to cart</button>`
          : '<button class="add-btn" type="button" disabled>Sold out</button>'}
      </div>
    </article>`;
  }

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>'
  };

  function renderHeader() {
    const mount = $('#site-header'); if (!mount) return;
    const page = document.body.dataset.page;
    const link = (href, label, key, path) => `<a href="${href}"${page === key ? ' aria-current="page"' : ''} data-site="nav.${path}" data-site-hide-empty>${label}</a>`;
    mount.outerHTML = `<header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="index.html"><img src="assets/logo.svg" alt="" width="40" height="40" data-site-src="brand.logo"><span data-site="brand.name">ADIRUDRA</span></a>
        <nav class="primary-nav" id="primaryNav" aria-label="Main">
          ${link('index.html', 'Home', 'home', 'home')}
          ${link('shop.html', 'Shop all', 'shop', 'shop')}
          ${link('shop.html?type=Mala', 'Malas', 'mala', 'malas')}
          ${link('shop.html?type=Bracelet', 'Bracelets', 'bracelet', 'bracelets')}
          ${link('index.html#authenticity', 'Authenticity', 'auth', 'authenticity')}
        </nav>
        <div class="header-actions">
          <button class="icon-btn" type="button" id="searchToggle" aria-label="Search" aria-expanded="false" aria-controls="searchBar">${ICONS.search}</button>
          <a class="icon-btn" href="cart.html" aria-label="Cart">${ICONS.bag}<span class="cart-count" id="cartCount"></span></a>
          <button class="icon-btn menu-toggle" type="button" id="menuToggle" aria-label="Menu" aria-expanded="false" aria-controls="primaryNav">${ICONS.menu}</button>
        </div>
      </div>
      <div class="search-bar" id="searchBar" hidden>
        <form action="shop.html" role="search">
          <input class="input" type="search" name="q" placeholder="Search by mukhi, origin, mala, bracelet…" data-site-placeholder="nav.searchPlaceholder" aria-label="Search products">
          <button class="button button--dark" type="submit">Search</button>
        </form>
      </div>
    </header>`;

    $('#menuToggle').addEventListener('click', (e) => {
      const open = $('#primaryNav').classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-expanded', open);
    });
    $('#searchToggle').addEventListener('click', (e) => {
      const bar = $('#searchBar'); bar.hidden = !bar.hidden;
      e.currentTarget.setAttribute('aria-expanded', !bar.hidden);
      if (!bar.hidden) $('input', bar).focus();
    });
    updateCartCount();
  }

  function renderFooter() {
    const mount = $('#site-footer'); if (!mount) return;
    mount.outerHTML = `<footer class="site-footer">
      <div class="shell site-footer__inner">
        <div>
          <a class="brand" href="index.html"><img src="assets/logo.svg" alt="" width="40" height="40" data-site-src="brand.logo"><span data-site="brand.name">ADIRUDRA</span></a>
          <p data-site="footer.about"></p>
        </div>
        <div><h3 data-site="footer.shopTitle">Shop</h3><ul>
          <li><a href="shop.html?type=Loose%20Bead" data-site="categories.labels.looseBead" data-site-hide-empty>Loose beads</a></li>
          <li><a href="shop.html?type=Mala" data-site="categories.labels.mala" data-site-hide-empty>Malas</a></li>
          <li><a href="shop.html?type=Bracelet" data-site="categories.labels.bracelet" data-site-hide-empty>Bracelets</a></li>
          <li><a href="shop.html?type=Pendant" data-site="categories.labels.pendant" data-site-hide-empty>Pendants</a></li>
        </ul></div>
        <div><h3 data-site="footer.helpTitle">Help</h3><ul>
          <li><a href="cart.html" data-site="footer.cartLabel" data-site-hide-empty>Your cart</a></li>
          <li><a href="index.html#authenticity" data-site="footer.authenticityLabel" data-site-hide-empty>Authenticity</a></li>
          <li><a href="index.html#faq" data-site="footer.faqLabel" data-site-hide-empty>Shipping &amp; returns</a></li>
        </ul></div>
        <div><h3 data-site="footer.contactTitle">Contact</h3><ul>
          ${CONFIG.email ? `<li><a href="mailto:${esc(CONFIG.email)}">${esc(CONFIG.email)}</a></li>` : ''}
          <li><a href="${whatsappLink('Namaste, I have a question about Adirudra products.')}" target="_blank" rel="noopener" data-site="footer.whatsappLabel" data-site-hide-empty>WhatsApp us</a></li>
        </ul></div>
      </div>
      <div class="shell site-footer__bottom"><span>© ${new Date().getFullYear()} <span data-site="footer.copyright"></span></span><span data-site="footer.note"></span></div>
    </footer>`;
  }

  function updateCartCount() {
    const el = $('#cartCount'); if (!el) return;
    const n = Cart.count();
    const prev = el.dataset.seen === undefined ? n : Number(el.dataset.seen);
    el.textContent = n ? String(n) : '';
    el.closest('a').setAttribute('aria-label', n ? `Cart, ${n} item${n > 1 ? 's' : ''}` : 'Cart');
    if (n > prev) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } // replay the pop animation
    el.dataset.seen = String(n);
  }

  // Touch screens: the "+" button on a card toggles its details panel.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.product-card__info'); if (!btn) return;
    const card = btn.closest('.product-card');
    const open = !card.classList.contains('is-open');
    $$('.product-card.is-open').forEach((c) => { c.classList.remove('is-open'); $('.product-card__info', c).setAttribute('aria-expanded', 'false'); $('.product-card__details', c).setAttribute('aria-hidden', 'true'); });
    card.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} details for ${$('h3', card).textContent}`);
    $('.product-card__details', card).setAttribute('aria-hidden', String(!open));
  });

  function whatsappLink(text) {
    const base = CONFIG.whatsappNumber ? `https://wa.me/${CONFIG.whatsappNumber}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(text)}`;
  }

  let toastTimer;
  function toast(message, withCartLink = true) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(message)}</span>${withCartLink ? '<a href="cart.html">View cart</a>' : ''}`;
    el.classList.add('is-visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  function showFatal(message) {
    const main = $('main');
    if (main) main.innerHTML = `<div class="shell" style="padding:80px 0"><div class="empty-state"><h3>Store unavailable</h3><p>${esc(message)}</p><button class="button button--dark" type="button" onclick="location.reload()">Try again</button></div></div>`;
  }

  // Global "Add to cart" handler for any [data-add] button.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]'); if (!btn) return;
    const p = byId(btn.dataset.add); if (!p) return;
    const before = Cart.qtyOf(p.id);
    if (Cart.add(p.id, 1) === before) { toast(`You already have the maximum available of ${p.name}.`); return; }
    btn.classList.add('is-added'); btn.textContent = 'Added ✓';
    setTimeout(() => { btn.classList.remove('is-added'); btn.textContent = 'Add to cart'; }, 1500);
    toast(`${p.name} added to cart`);
  });

  window.addEventListener('storage', (e) => { if (e.key === CART_KEY) updateCartCount(); });

  // Everything a page needs is loaded once; pages run their code via Store.onReady().
  const domReady = new Promise((r) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r()));
  const ready = Promise.all([api('/config'), api('/products'), domReady]).then(([cfg, list]) => {
    CONFIG = cfg; products = list;
    window.Store.CONFIG = cfg; window.Store.products = list;
    renderHeader(); renderFooter();
    if (window.Site) Site.apply();
  });
  ready.catch((err) => domReady.then(() => { renderHeader(); renderFooter(); showFatal(err.message); }));

  function onReady(fn) {
    ready.then(fn).catch((err) => { if (!(err instanceof ApiError)) console.error(err); });
  }

  window.Store = { api, ApiError, onReady, products, CONFIG, byId, Cart, MyOrders, quote, payWithRazorpay, getCoupon, setCoupon, money, esc, $, $$, visual, productCard, toast, whatsappLink, ICONS };
})();
