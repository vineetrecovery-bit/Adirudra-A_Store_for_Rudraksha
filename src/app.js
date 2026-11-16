// Express application: static storefront + JSON API.
import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { quote, PricingError } from './pricing.js';
import { validateCustomer, validateProduct, INDIAN_STATES } from './validate.js';
import { createRazorpayOrder, verifyPaymentSignature } from './razorpay.js';
import { requireAdmin, isAdmin, login, logout } from './auth.js';
import { DEFAULTS, HEADING_FONTS, BODY_FONTS, TRUST_ICONS, validateSite, themeCss, fontsUrl } from './site.js';
import { saveUpload, uploadsDir, MAX_UPLOAD_BYTES } from './uploads.js';
import { createSettingsStore, validateSettings } from './settings.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'cod', 'refunded'];
const PAYMENT_METHODS = ['upi', 'cod', 'whatsapp'];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Fields the storefront is allowed to see.
const publicProduct = ({ id, slug, name, category, type, origin, mukhi, size, weight, price, rarity, featured, certified, verification, stock, image, description, keywords }) =>
  ({ id, slug, name, category, type, origin, mukhi, size, weight, price, rarity, featured, certified, verification, inStock: stock > 0, maxQty: Math.min(stock, config.shop.maxQtyPerItem), image, description, keywords });

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
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ADR-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Wrap async handlers so thrown errors reach the error middleware.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db, siteStore, settingsStore = createSettingsStore(config.dataDir)) {
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

  const getProduct = (id) => db.products.get(id);

  function restock(order) {
    if (order.stockRestored) return;
    for (const item of order.items) {
      const p = db.products.get(item.id);
      if (p) p.stock += item.qty;
    }
    order.stockRestored = true;
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

  api.get('/products', (req, res) => {
    res.json(db.products.all().filter((p) => p.active !== false).map(publicProduct));
  });

  api.get('/products/:id', (req, res) => {
    const p = db.products.get(req.params.id);
    if (!p || p.active === false) return res.status(404).json({ error: 'Product not found.' });
    res.json(publicProduct(p));
  });

  // Cart preview: authoritative prices, discount and totals.
  api.post('/quote', (req, res) => {
    const { items = [], coupon = '', payment = '' } = req.body || {};
    res.json(quote(items, { coupon, payment, getProduct }));
  });

  api.post('/orders', route(async (req, res) => {
    const { items, coupon = '', payment, customer } = req.body || {};
    if (!PAYMENT_METHODS.includes(payment)) return res.status(400).json({ error: 'Choose a payment method.' });
    const cust = validateCustomer(customer);
    if (cust.errors) return res.status(400).json({ error: 'Please check your details.', fields: cust.errors });

    // Price and reserve stock synchronously (no await in between) so two orders can't oversell.
    const q = quote(items, { coupon, payment, getProduct, strict: true });
    if (!q.lines.length) return res.status(400).json({ error: 'Your cart is empty.' });
    if (coupon && q.couponError) return res.status(400).json({ error: q.couponError, fields: { coupon: q.couponError } });
    for (const line of q.lines) db.products.get(line.id).stock -= line.qty;

    const now = new Date().toISOString();
    const order = {
      id: newOrderId(),
      token: crypto.randomBytes(24).toString('base64url'),
      createdAt: now,
      updatedAt: now,
      status: payment === 'cod' ? 'confirmed' : 'pending',
      paymentStatus: payment === 'cod' ? 'cod' : 'unpaid',
      payment,
      customer: cust.value,
      items: q.lines.map(({ id, name, price, qty, total }) => ({ id, name, price, qty, total })),
      subtotal: q.subtotal, discount: q.discount, coupon: q.coupon, shipping: q.shipping, codFee: q.codFee, total: q.total,
      history: [{ at: now, status: payment === 'cod' ? 'confirmed' : 'pending', note: 'Order placed' }]
    };

    let razorpay = null;
    if (payment === 'upi' && config.razorpay.enabled) {
      try {
        const rp = await createRazorpayOrder({ amountRupees: order.total, receipt: order.id, notes: { orderId: order.id } });
        order.razorpayOrderId = rp.id;
        razorpay = { keyId: config.razorpay.keyId, orderId: rp.id, amount: rp.amount, currency: rp.currency };
      } catch (err) {
        restock(order);
        await db.products.save();
        console.error(err);
        return res.status(502).json({ error: 'Payment service is unavailable right now. Please try again or choose cash on delivery.' });
      }
    }

    await db.products.save();
    await db.orders.create(order);
    res.status(201).json({ id: order.id, token: order.token, total: order.total, razorpay });
  }));

  // Look up an order: needs the private token issued at checkout (or an admin session).
  function loadOrderForCustomer(req, res) {
    const order = db.orders.get(req.params.id);
    const token = String(req.query.token || req.body?.token || '');
    const ok = order && (isAdmin(req) || (token.length === order.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(order.token))));
    if (!ok) { res.status(404).json({ error: 'Order not found.' }); return null; }
    return order;
  }

  api.get('/orders/:id', (req, res) => {
    const order = loadOrderForCustomer(req, res);
    if (order) res.json(publicOrder(order));
  });

  // Razorpay checkout success callback: verify the signature before marking paid.
  api.post('/orders/:id/pay', route(async (req, res) => {
    const order = loadOrderForCustomer(req, res);
    if (!order) return;
    if (order.paymentStatus === 'paid') return res.json(publicOrder(order));
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!config.razorpay.enabled || orderId !== order.razorpayOrderId || !verifyPaymentSignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ error: 'Payment could not be verified. If money was deducted, contact us with your order number.' });
    }
    const now = new Date().toISOString();
    await db.orders.update(order.id, {
      paymentStatus: 'paid', status: 'confirmed', razorpayPaymentId: paymentId,
      history: [...order.history, { at: now, status: 'confirmed', note: `Paid online (${paymentId})` }]
    });
    res.json(publicOrder(order));
  }));

  // ---------------- Admin API ----------------
  const admin = express.Router();
  admin.post('/login', login);
  admin.post('/logout', logout);
  admin.get('/me', (req, res) => res.json({ admin: isAdmin(req), enabled: Boolean(config.admin.password) }));
  admin.use(requireAdmin);

  admin.get('/orders', (req, res) => {
    res.json(db.orders.all().map(({ token, ...o }) => o));
  });

  admin.patch('/orders/:id', route(async (req, res) => {
    const order = db.orders.get(req.params.id);
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
    if (changes.status === 'cancelled' && order.status !== 'cancelled') {
      restock(order);
      await db.products.save();
    }
    const entry = { at: new Date().toISOString(), status: changes.status || order.status, note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : 'Updated by admin' };
    const { token, ...updated } = await db.orders.update(order.id, { ...changes, stockRestored: order.stockRestored, history: [...order.history, entry] });
    res.json(updated);
  }));

  admin.get('/products', (req, res) => res.json(db.products.all()));

  admin.post('/products', route(async (req, res) => {
    const v = validateProduct(req.body);
    if (v.errors) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: v.errors });
    const nextNum = db.products.all().reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0) + 1;
    const product = { id: `AR-${String(nextNum).padStart(3, '0')}`, category: 'Rudraksha', ...v.value, slug: slugify(v.value.name) };
    res.status(201).json(await db.products.create(product));
  }));

  admin.patch('/products/:id', route(async (req, res) => {
    if (!db.products.get(req.params.id)) return res.status(404).json({ error: 'Product not found.' });
    const v = validateProduct(req.body, { partial: true });
    if (v.errors) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: v.errors });
    if (v.value.name) v.value.slug = slugify(v.value.name);
    res.json(await db.products.update(req.params.id, v.value));
  }));

  admin.delete('/products/:id', route(async (req, res) => {
    // Products that appear in orders are hidden instead of deleted, so order history stays intact.
    const used = db.orders.findBy((o) => o.items.some((i) => i.id === req.params.id));
    if (used) {
      const p = await db.products.update(req.params.id, { active: false });
      return p ? res.json({ archived: true }) : res.status(404).json({ error: 'Product not found.' });
    }
    (await db.products.remove(req.params.id)) ? res.json({ deleted: true }) : res.status(404).json({ error: 'Product not found.' });
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

  admin.post('/uploads', express.raw({ type: 'image/*', limit: MAX_UPLOAD_BYTES }), route(async (req, res) => {
    const r = await saveUpload(config.dataDir, req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    res.status(201).json(r);
  }));

  app.use('/api/admin', admin);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------------- Uploaded images ----------------
  app.use('/uploads', express.static(uploadsDir(config.dataDir), {
    maxAge: '30d', immutable: true, fallthrough: false,
    setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'")
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
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large (max 5 MB).' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
