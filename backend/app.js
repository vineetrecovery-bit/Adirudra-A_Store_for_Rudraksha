// Express application: static storefront + JSON API.
import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { quote, PricingError } from './pricing.js';
import { validateCustomer, validateProduct, INDIAN_STATES } from './validate.js';
import { createRazorpayOrder, verifyPaymentSignature } from './razorpay.js';
import { createAuth } from './auth.js';
import { DEFAULTS, HEADING_FONTS, BODY_FONTS, TRUST_ICONS, validateSite, themeCss, fontsUrl } from './site.js';
import { saveProductMedia } from './uploads.js';
import { createSettingsStore, validateSettings } from './settings.js';
import { createMediaStore } from '../database/index.js';
import { nowIst } from '../database/time.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = fileURLToPath(new URL('../frontend/', import.meta.url));

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'cod', 'refunded'];
const PAYMENT_METHODS = ['upi', 'cod', 'whatsapp'];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Fields the storefront is allowed to see.
// `image` is the first photo (used on product cards); `media` is every photo and video in order.
const publicProduct = ({ id, slug, name, category, type, origin, mukhi, size, weight, price, rarity, featured, certified, verification, stock, media, description, keywords }) => ({
  id, slug, name, category, type, origin, mukhi, size, weight, price, rarity, featured, certified, verification,
  inStock: stock > 0, maxQty: Math.min(stock, config.shop.maxQtyPerItem),
  image: (media.find((m) => m.type === 'image') || {}).url || '',
  media: media.map(({ type, url, mime }) => ({ type, url, mime })),
  description, keywords
});

// Parcel weight and size for the courier: item weights + packaging, in the largest item's box.
function parcelFor(lines, productsById) {
  const s = config.shipping;
  let grams = s.packagingGrams;
  const box = { ...s.defaultBox };
  for (const l of lines) {
    const p = productsById.get(l.id) || {};
    grams += (p.weightGrams || s.defaultItemGrams) * l.qty;
    if (p.lengthCm) box.lengthCm = Math.max(box.lengthCm, p.lengthCm);
    if (p.breadthCm) box.breadthCm = Math.max(box.breadthCm, p.breadthCm);
    if (p.heightCm) box.heightCm = Math.max(box.heightCm, p.heightCm);
  }
  return { weightKg: Math.round(grams) / 1000, ...box };
}

// What a customer sees about their own order (no internal fields, no access token).
const publicOrder = (o) => ({
  id: o.id, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, payment: o.payment,
  customer: o.customer, items: o.items, subtotal: o.subtotal, discount: o.discount, coupon: o.coupon,
  shipping: o.shipping, codFee: o.codFee, total: o.total,
  // Lets the customer retry an abandoned online payment from the order page.
  razorpay: o.payment === 'upi' && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && o.razorpayOrderId && config.razorpay.enabled
    ? { keyId: config.razorpay.keyId, orderId: o.razorpayOrderId, amount: Math.round(o.total * 100), currency: 'INR' } : null
});

function newOrderId() {
  // The date part is the Indian date (the server's own clock may be in UTC).
  const ymd = nowIst().slice(2, 10).replace(/-/g, '');
  return `ADR-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Wrap async handlers so thrown errors reach the error middleware.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db, siteStore, settingsStore = createSettingsStore(db), media = createMediaStore({ dataDir: config.dataDir, r2: config.r2 })) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '100kb' }));

  // Basic security headers.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN'
    });
    next();
  });

  const { currentUser, isAdmin, requireUser, requireAdmin, signup, login, logout, me } = createAuth(db);

  // Pricing reads products synchronously, so load them first and hand it a lookup.
  async function productLookup() {
    const byId = new Map((await db.products.list()).map((p) => [p.id, p]));
    return { byId, getProduct: (id) => byId.get(id) };
  }

  // ---------------- Public API ----------------
  const api = express.Router();

  api.get('/config', (req, res) => {
    res.json({
      freeShippingOver: config.shop.freeShippingOver,
      shippingFee: config.shop.shippingFee,
      codFee: config.shop.codFee,
      whatsappNumber: config.shop.whatsappNumber,
      email: config.shop.email,
      states: INDIAN_STATES,
      razorpay: config.razorpay.enabled ? { keyId: config.razorpay.keyId } : null
    });
  });

  api.get('/products', route(async (req, res) => {
    res.json((await db.products.list()).filter((p) => p.active !== false).map(publicProduct));
  }));

  api.get('/products/:id', route(async (req, res) => {
    const p = await db.products.get(req.params.id);
    if (!p || p.active === false) return res.status(404).json({ error: 'Product not found.' });
    res.json(publicProduct(p));
  }));

  // Cart preview: authoritative prices, discount and totals.
  api.post('/quote', route(async (req, res) => {
    const { items = [], coupon = '', payment = '' } = req.body || {};
    const { getProduct } = await productLookup();
    res.json(quote(items, { coupon, payment, getProduct }));
  }));

  // ---------------- Accounts ----------------
  api.post('/auth/signup', route(signup));
  api.post('/auth/login', route(login));
  api.post('/auth/logout', logout);
  api.get('/auth/me', route(me));

  // The signed-in customer's own orders, newest first (token included so the order page opens).
  api.get('/account/orders', requireUser, route(async (req, res) => {
    res.json((await db.orders.listByUser(req.user.id)).map((o) => ({ ...publicOrder(o), token: o.token })));
  }));

  // Placing an order needs a signed-in account; the order is saved against it.
  api.post('/orders', requireUser, route(async (req, res) => {
    const { items, coupon = '', payment, customer } = req.body || {};
    if (!PAYMENT_METHODS.includes(payment)) return res.status(400).json({ error: 'Choose a payment method.' });
    const cust = validateCustomer(customer);
    if (cust.errors) return res.status(400).json({ error: 'Please check your details.', fields: cust.errors });

    const { byId, getProduct } = await productLookup();
    const q = quote(items, { coupon, payment, getProduct, strict: true });
    if (!q.lines.length) return res.status(400).json({ error: 'Your cart is empty.' });
    if (coupon && q.couponError) return res.status(400).json({ error: q.couponError, fields: { coupon: q.couponError } });
    // Take the stock in one step (a database transaction with MySQL), so two orders can't oversell.
    const lines = q.lines.map(({ id, qty }) => ({ id, qty }));
    if (!(await db.products.reserveStock(lines))) {
      return res.status(409).json({ error: 'Some items just sold out. Please review your cart.' });
    }
    const releaseStock = () => db.products.releaseStock(lines);

    const now = nowIst();
    const order = {
      id: newOrderId(),
      userId: req.user.id,
      token: crypto.randomBytes(24).toString('base64url'),
      createdAt: now,
      updatedAt: now,
      status: payment === 'cod' ? 'confirmed' : 'pending',
      paymentStatus: payment === 'cod' ? 'cod' : 'unpaid',
      payment,
      customer: cust.value,
      shippingAddress: null, // ship to the billing address
      // SKU, HSN and weight are copied onto each line, so the order still has them for the
      // courier even if the product is edited or removed later.
      items: q.lines.map(({ id, name, price, qty, total }) => {
        const p = byId.get(id);
        return { id, sku: p.sku, name, hsn: p.hsnCode || '', price, qty, total, weightGrams: p.weightGrams || null };
      }),
      subtotal: q.subtotal, discount: q.discount, coupon: q.coupon, shipping: q.shipping, codFee: q.codFee, total: q.total,
      package: parcelFor(q.lines, byId),
      history: [{ at: now, status: payment === 'cod' ? 'confirmed' : 'pending', note: 'Order placed' }]
    };

    let razorpay = null;
    if (payment === 'upi' && config.razorpay.enabled) {
      try {
        const rp = await createRazorpayOrder({ amountRupees: order.total, receipt: order.id, notes: { orderId: order.id } });
        order.razorpayOrderId = rp.id;
        razorpay = { keyId: config.razorpay.keyId, orderId: rp.id, amount: rp.amount, currency: rp.currency };
      } catch (err) {
        await releaseStock();
        console.error(err);
        return res.status(502).json({ error: 'Payment service is unavailable right now. Please try again or choose cash on delivery.' });
      }
    }

    try {
      await db.orders.create(order);
    } catch (err) {
      await releaseStock();
      throw err;
    }
    res.status(201).json({ id: order.id, token: order.token, total: order.total, razorpay });
  }));

  // Look up an order: needs the private token issued at checkout, the account that placed it, or the admin.
  async function loadOrderForCustomer(req, res) {
    const order = await db.orders.get(req.params.id);
    const token = String(req.query.token || req.body?.token || '');
    const user = order && (await currentUser(req));
    const ok = order && (
      user?.role === 'admin' || (order.userId && user?.id === order.userId) ||
      (token.length === order.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(order.token)))
    );
    if (!ok) { res.status(404).json({ error: 'Order not found.' }); return null; }
    return order;
  }

  api.get('/orders/:id', route(async (req, res) => {
    const order = await loadOrderForCustomer(req, res);
    if (order) res.json(publicOrder(order));
  }));

  // Razorpay checkout success callback: verify the signature before marking paid.
  api.post('/orders/:id/pay', route(async (req, res) => {
    const order = await loadOrderForCustomer(req, res);
    if (!order) return;
    if (order.paymentStatus === 'paid') return res.json(publicOrder(order));
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!config.razorpay.enabled || orderId !== order.razorpayOrderId || !verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ error: 'Payment could not be verified. If money was deducted, contact us with your order number.' });
    }
    const now = nowIst();
    const updated = await db.orders.update(order.id, {
      paymentStatus: 'paid', status: 'confirmed', razorpayPaymentId: paymentId,
      history: [...order.history, { at: now, status: 'confirmed', note: `Paid online (${paymentId})` }]
    });
    res.json(publicOrder(updated));
  }));

  // ---------------- Admin API ----------------
  const admin = express.Router();
  // The old shared-password login is gone: the admin signs in with their account (POST /api/auth/login).
  admin.get('/me', route(async (req, res) => {
    const user = await currentUser(req);
    res.json({ admin: user?.role === 'admin', signedIn: Boolean(user), enabled: (await db.users.list()).some((u) => u.role === 'admin') });
  }));
  admin.use(requireAdmin);

  // Accounts with their group (read-only list; passwords are never sent).
  admin.get('/users', route(async (req, res) => {
    const counts = await db.orders.countByUser();
    res.json((await db.users.list())
      .map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, createdAt: u.createdAt, orders: counts.get(u.id) || 0 }))
      .sort((a, b) => (a.role === b.role ? b.createdAt.localeCompare(a.createdAt) : a.role === 'admin' ? -1 : 1)));
  }));

  admin.get('/groups', route(async (req, res) => res.json(await db.groups.list())));

  admin.get('/orders', route(async (req, res) => {
    res.json((await db.orders.list()).map(({ token, ...o }) => o));
  }));

  admin.patch('/orders/:id', route(async (req, res) => {
    const order = await db.orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const { status, paymentStatus, note } = req.body || {};
    const changes = {};
    if (status !== undefined) {
      if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
      if (order.status === 'cancelled' && status !== 'cancelled') return res.status(400).json({ error: 'A cancelled order cannot be reopened.' });
      changes.status = status;
    }
    if (paymentStatus !== undefined) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) return res.status(400).json({ error: 'Invalid payment status.' });
      changes.paymentStatus = paymentStatus;
    }
    // Cancelling puts the items back in stock (once).
    if (changes.status === 'cancelled' && order.status !== 'cancelled' && !order.stockRestored) {
      await db.products.releaseStock(order.items.map(({ id, qty }) => ({ id, qty })));
      changes.stockRestored = true;
    }
    const entry = { at: nowIst(), status: changes.status || order.status, note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : 'Updated by admin' };
    const { token, ...updated } = await db.orders.update(order.id, { ...changes, history: [...order.history, entry] });
    res.json(updated);
  }));

  admin.get('/products', route(async (req, res) => res.json(await db.products.list())));

  // Removes media files that a product no longer lists (ignores files still used elsewhere).
  async function deleteUnusedMedia(before, after = []) {
    const keep = new Set(after.map((m) => m.url));
    const dropped = before.filter((m) => !keep.has(m.url));
    if (!dropped.length) return;
    // A file can be listed on more than one product; keep it while any product still uses it.
    const inUse = new Set((await db.products.list()).flatMap((p) => p.media.map((m) => m.url)));
    for (const m of dropped) {
      if (!inUse.has(m.url)) await media.remove(m).catch((err) => console.warn(`Could not delete ${m.url}: ${err.message}`));
    }
  }

  admin.post('/products', route(async (req, res) => {
    const v = validateProduct(req.body);
    if (v.errors) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: v.errors });
    const all = await db.products.list();
    const nextNum = all.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0) + 1;
    const id = `AR-${String(nextNum).padStart(3, '0')}`;
    const sku = v.value.sku || id;
    if (all.some((p) => p.sku === sku)) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: { sku: 'Another product already uses this SKU.' } });
    const product = { id, category: 'Rudraksha', ...v.value, sku, slug: slugify(v.value.name) };
    res.status(201).json(await db.products.create(product));
  }));

  admin.patch('/products/:id', route(async (req, res) => {
    const current = await db.products.get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Product not found.' });
    const v = validateProduct(req.body, { partial: true });
    if (v.errors) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: v.errors });
    if (v.value.name) v.value.slug = slugify(v.value.name);
    if ('sku' in v.value) {
      v.value.sku = v.value.sku || current.id;
      if ((await db.products.list()).some((p) => p.id !== current.id && p.sku === v.value.sku)) {
        return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: { sku: 'Another product already uses this SKU.' } });
      }
    }
    const updated = await db.products.update(req.params.id, v.value);
    if (v.value.media) await deleteUnusedMedia(current.media, updated.media);
    res.json(updated);
  }));

  admin.delete('/products/:id', route(async (req, res) => {
    // Products that appear in orders are hidden instead of deleted, so order history stays intact.
    if (await db.orders.usesProduct(req.params.id)) {
      const p = await db.products.update(req.params.id, { active: false });
      return p ? res.json({ archived: true }) : res.status(404).json({ error: 'Product not found.' });
    }
    const p = await db.products.get(req.params.id);
    if (!p || !(await db.products.remove(req.params.id))) return res.status(404).json({ error: 'Product not found.' });
    await deleteUnusedMedia(p.media);
    res.json({ deleted: true });
  }));

  // Upload one product photo or video (raw file body). Returns a media item to add to the
  // product's `media` list; the product is saved separately (PATCH /products/:id).
  admin.post('/media', express.raw({ type: ['image/*', 'video/*', 'application/octet-stream'], limit: config.media.maxVideoBytes }), route(async (req, res) => {
    const r = await saveProductMedia(media, req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    res.status(201).json(r.item);
  }));

  // ---------------- Store settings (fees, contact, coupons) ----------------
  admin.get('/settings', (req, res) => res.json(settingsStore.get()));

  admin.put('/settings', route(async (req, res) => {
    const v = validateSettings(req.body);
    if (v.error) return res.status(400).json({ error: v.error, field: v.field });
    res.json(await settingsStore.save(v.value));
  }));

  // ---------------- Website editor ----------------
  admin.get('/site', (req, res) => {
    res.json({
      site: siteStore.get(),
      defaults: DEFAULTS,
      history: siteStore.history(),
      options: { headingFonts: HEADING_FONTS, bodyFonts: BODY_FONTS, icons: TRUST_ICONS }
    });
  });

  admin.put('/site', route(async (req, res) => {
    const v = validateSite(req.body);
    if (v.error) return res.status(400).json({ error: v.error, field: v.field });
    await siteStore.save(v.value, 'Before save');
    res.json({ site: siteStore.get(), history: siteStore.history() });
  }));

  admin.post('/site/restore', route(async (req, res) => {
    const site = await siteStore.restore(String(req.body?.id || ''));
    if (!site) return res.status(404).json({ error: 'That version no longer exists.' });
    res.json({ site, history: siteStore.history() });
  }));

  admin.post('/site/reset', route(async (req, res) => {
    await siteStore.reset();
    res.json({ site: siteStore.get(), history: siteStore.history() });
  }));

  app.use('/api/admin', admin);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------------- Product photos and videos saved on this server ----------------
  // (Website images such as the logo and hero background are in frontend/assets with the code.)
  // Range requests are supported, so videos can be scrubbed.
  app.use('/uploads', express.static(media.localDir, {
    maxAge: '30d', immutable: true, fallthrough: false,
    setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'")
  }));

  // ---------------- Storefront pages (themed on the server) ----------------
  // Each page gets the current theme, fonts and site content injected, so there's no flash of
  // default styles. The admin page is served as-is so a bad colour choice can't make it unusable.
  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // JSON safe to embed in a <script> tag (no '</script>' breakout, no raw line separators).
  const LINE_SEP = String.fromCharCode(0x2028); const PARA_SEP = String.fromCharCode(0x2029);
  const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').split(LINE_SEP).join('\\u2028').split(PARA_SEP).join('\\u2029');
  const pageCache = new Map();

  async function renderPage(name) {
    let html = pageCache.get(name);
    if (!html || !config.isProd) {
      try { html = await readFile(path.join(PUBLIC_DIR, `${name}.html`), 'utf8'); } catch { return null; }
      pageCache.set(name, html);
    }
    const site = siteStore.get();
    // Fee amounts let texts like "{codFee} handling fee" render before the API has loaded.
    const shop = { freeShippingOver: config.shop.freeShippingOver, shippingFee: config.shop.shippingFee, codFee: config.shop.codFee };
    const head = `<style id="site-theme">${themeCss(site.theme)}</style>\n<script>window.SITE=${safeJson(site)};window.SHOP=${safeJson(shop)};</script>\n`;
    html = html
      .replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/, escHtml(fontsUrl(site.theme)))
      .replace('</head>', `${head}</head>`);
    if (name === 'index') {
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(site.seo.title)}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escHtml(site.seo.description)}">`);
    }
    return html;
  }

  app.get(/^\/(?:([a-z0-9-]+)(?:\.html)?)?\/?$/, route(async (req, res, next) => {
    const name = req.params[0] || 'index';
    if (name === 'admin') return next();
    const html = await renderPage(name);
    if (!html) return next();
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  }));

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));
  app.use(route(async (req, res) => {
    res.status(404).type('html').send((await renderPage('404')) || 'Not found');
  }));

  // ---------------- Errors ----------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof PricingError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: `That file is too large (photos max ${config.media.maxImageBytes / 1048576} MB, videos max ${config.media.maxVideoBytes / 1048576} MB).` });
    // e.g. a missing /uploads/ file (express.static with fallthrough: false).
    if (err.status === 404 || err.statusCode === 404) return res.status(404).type('text').send('Not found');
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
