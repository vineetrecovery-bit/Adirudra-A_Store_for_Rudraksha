// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.ADMIN_PASSWORD = 'test-password';
process.env.RAZORPAY_KEY_ID = '';
const { config } = await import('../src/config.js');
const { quote } = await import('../src/pricing.js');
const { validateCustomer } = await import('../src/validate.js');
const { createDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createSiteStore, DEFAULTS } = await import('../src/site.js');

const customer = { name: 'Asha Verma', phone: '+91 98765 43210', email: 'asha@example.com', address: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };

let server, base, dataDir, db, siteStore;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'adirudra-test-'));
  await copyFile(new URL('../data/seed-products.json', import.meta.url), path.join(dataDir, 'seed-products.json'));
  db = createDb(dataDir);
  await db.load();
  process.env.DATA_DIR = dataDir;
  config.dataDir = dataDir;
  siteStore = createSiteStore(dataDir);
  await siteStore.load();
  server = createApp(db, siteStore).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await rm(dataDir, { recursive: true, force: true }); });

const call = async (p, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

// ---------- Unit ----------
test('pricing: percent coupon, free shipping threshold, COD fee', () => {
  const getProduct = (id) => ({ A: { id: 'A', name: 'A', price: 500, stock: 5 } })[id];
  const q = quote([{ id: 'A', qty: 2 }], { coupon: 'adirudra10', payment: 'cod', getProduct });
  assert.equal(q.subtotal, 1000);
  assert.equal(q.discount, 100);
  assert.equal(q.shipping, config.shop.shippingFee); // 900 is under ₹999
  assert.equal(q.codFee, config.shop.codFee);
  assert.equal(q.total, 900 + config.shop.shippingFee + config.shop.codFee);
});

test('pricing: coupon minimum and stock limits', () => {
  const getProduct = (id) => ({ A: { id: 'A', name: 'A', price: 500, stock: 2 } })[id];
  const q = quote([{ id: 'A', qty: 5 }, { id: 'nope', qty: 1 }], { coupon: 'WELCOME200', getProduct });
  assert.equal(q.lines[0].qty, 2);
  assert.equal(q.issues.length, 2);
  assert.match(q.couponError, /more to use this code/);
  assert.throws(() => quote([{ id: 'A', qty: 5 }], { getProduct, strict: true }), /Only 2/);
});

test('validation: normalises Indian phone numbers and rejects bad PIN', () => {
  assert.equal(validateCustomer(customer).value.phone, '9876543210');
  assert.ok(validateCustomer({ ...customer, pincode: '012345' }).errors.pincode);
});

// ---------- API ----------
test('GET /api/products hides stock counts and internal fields', async () => {
  const r = await call('/api/products');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 14);
  assert.equal(r.body[0].stock, undefined);
  assert.equal(typeof r.body[0].inStock, 'boolean');
});

test('POST /api/orders prices on the server, reserves stock and protects order lookup', async () => {
  const before = db.products.get('AR-001').stock;
  const r = await call('/api/orders', { method: 'POST', body: { items: [{ id: 'AR-001', qty: 2, price: 1 }], payment: 'cod', customer } });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, 1499 * 2 + config.shop.codFee); // client-sent price ignored
  assert.equal(db.products.get('AR-001').stock, before - 2);

  const saved = JSON.parse(await readFile(path.join(dataDir, 'orders.json'), 'utf8'));
  assert.equal(saved[0].id, r.body.id);

  assert.equal((await call(`/api/orders/${r.body.id}`)).status, 404); // no token
  assert.equal((await call(`/api/orders/${r.body.id}?token=wrong`)).status, 404);
  const ok = await call(`/api/orders/${r.body.id}?token=${r.body.token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'confirmed');
  assert.equal(ok.body.token, undefined);
});

test('POST /api/orders rejects invalid customer details and overselling', async () => {
  const bad = await call('/api/orders', { method: 'POST', body: { items: [{ id: 'AR-002', qty: 1 }], payment: 'cod', customer: { ...customer, phone: '123' } } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.phone);
  const over = await call('/api/orders', { method: 'POST', body: { items: [{ id: 'AR-002', qty: 999 }], payment: 'cod', customer } });
  assert.equal(over.status, 409);
});

test('admin: requires login, updates orders, cancel restocks', async () => {
  assert.equal((await call('/api/admin/orders')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'test-password' } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const orders = await call('/api/admin/orders', { cookie });
  assert.equal(orders.status, 200);
  const order = orders.body[0];
  assert.equal(order.token, undefined);

  const stock = db.products.get('AR-001').stock;
  const shipped = await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'shipped', note: 'AWB 123' } });
  assert.equal(shipped.body.status, 'shipped');
  await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'cancelled' } });
  assert.equal(db.products.get('AR-001').stock, stock + 2);
  const reopen = await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'confirmed' } });
  assert.equal(reopen.status, 400);
});

test('admin: create, edit and delete products with validation', async () => {
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'test-password' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bad = await call('/api/admin/products', { method: 'POST', cookie, body: { name: 'X', price: 0 } });
  assert.equal(bad.status, 400);
  const created = await call('/api/admin/products', { method: 'POST', cookie, body: { name: 'Ten Mukhi Nepal Rudraksha', price: 9500, stock: 3, type: 'Loose Bead', mukhi: 10, origin: 'Nepal', rarity: 'Rare' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 'AR-015');
  const edited = await call(`/api/admin/products/${created.body.id}`, { method: 'PATCH', cookie, body: { price: 9900 } });
  assert.equal(edited.body.price, 9900);
  assert.equal((await call('/api/products/AR-015')).body.price, 9900);
  const del = await call('/api/admin/products/AR-015', { method: 'DELETE', cookie });
  assert.equal(del.body.deleted, true);
});

test('verifies Razorpay signatures', async () => {
  config.razorpay.keySecret = 'secret';
  const { verifyPaymentSignature } = await import('../src/razorpay.js');
  const signature = crypto.createHmac('sha256', 'secret').update('order_1|pay_1').digest('hex');
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }), true);
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature }), false);
  config.razorpay.keySecret = '';
});

// ---------- Website editor ----------
const adminCookie = async () => (await call('/api/admin/login', { method: 'POST', body: { password: 'test-password' } })).headers.get('set-cookie').split(';')[0];

test('site: pages are served with the saved theme and content injected', async () => {
  const cookie = await adminCookie();
  assert.equal((await call('/api/admin/site', { method: 'PUT', body: DEFAULTS })).status, 401);
  const site = structuredClone(DEFAULTS);
  site.theme.colors.walnut = '#123456';
  site.theme.fonts.heading = 'Playfair Display';
  site.hero.title = 'New </script><b>headline</b>';
  site.seo.title = 'My "Store"';
  const saved = await call('/api/admin/site', { method: 'PUT', cookie, body: site });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.history.length, 1);

  const html = await (await fetch(base + '/')).text();
  assert.match(html, /--walnut:#123456/);
  assert.match(html, /family=Playfair\+Display/);
  assert.match(html, /<title>My &quot;Store&quot;<\/title>/);
  assert.ok(!html.includes('</script><b>headline'), 'script breakout must be escaped');
  assert.ok(html.includes('New ' + String.fromCharCode(92) + 'u003c/script>'), 'title is embedded as escaped JSON');
  // Other pages are themed too; admin is not.
  assert.match(await (await fetch(base + '/shop.html')).text(), /--walnut:#123456/);
  assert.match(await (await fetch(base + '/shop')).text(), /--walnut:#123456/);
  assert.ok(!(await (await fetch(base + '/admin')).text()).includes('site-theme'));
});

test('site: rejects unsafe or invalid values', async () => {
  const cookie = await adminCookie();
  const bad = (mutate) => { const s = structuredClone(DEFAULTS); mutate(s); return call('/api/admin/site', { method: 'PUT', cookie, body: s }); };
  assert.equal((await bad((s) => { s.hero.primaryLink = 'javascript:alert(1)'; })).status, 400);
  assert.equal((await bad((s) => { s.theme.colors.ink = 'red; background:url(x)'; })).status, 400);
  assert.equal((await bad((s) => { s.theme.fonts.body = 'Comic Sans'; })).status, 400);
  assert.equal((await bad((s) => { s.hero.image = '../../etc/passwd'; })).status, 400);
  assert.equal((await bad((s) => { s.sections = s.sections.slice(1); })).status, 400);
  assert.equal((await bad((s) => { s.trust.items = []; })).status, 400);
  const r = await bad((s) => { s.faq.items.push({ q: 'New?', a: 'Yes.' }); s.sections.reverse(); s.sections[0].enabled = false; });
  assert.equal(r.status, 200);
  assert.equal(r.body.site.faq.items.length, 4);
  assert.equal(r.body.site.sections[0].id, 'faq');
});

test('site: restore a previous version and reset to defaults', async () => {
  const cookie = await adminCookie();
  const { body } = await call('/api/admin/site', { cookie });
  const oldest = body.history[body.history.length - 1];
  const restored = await call('/api/admin/site/restore', { method: 'POST', cookie, body: { id: oldest.id } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.site.theme.colors.walnut, DEFAULTS.theme.colors.walnut);
  const reset = await call('/api/admin/site/reset', { method: 'POST', cookie });
  assert.deepEqual(reset.body.site, DEFAULTS);
});

test('uploads: accepts real images only and serves them', async () => {
  const cookie = await adminCookie();
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await fetch(base + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'image/png', Cookie: cookie }, body: png });
  assert.equal(up.status, 201);
  const { url } = await up.json();
  assert.match(url, /^\/uploads\/[\w-]+\.png$/);
  const img = await fetch(base + url);
  assert.equal(img.status, 200);
  const svg = await fetch(base + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'image/svg+xml', Cookie: cookie }, body: '<svg onload="alert(1)"/>' });
  assert.equal(svg.status, 400);
  const anon = await fetch(base + '/api/admin/uploads', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(anon.status, 401);
});

test('settings: admin edits fees, contact and coupons; pricing uses them at once', async () => {
  assert.equal((await call('/api/admin/settings')).status, 401);
  const cookie = await adminCookie();
  const original = (await call('/api/admin/settings', { cookie })).body;
  assert.equal(original.shippingFee, config.shop.shippingFee);
  assert.ok(original.coupons.some((c) => c.code === 'ADIRUDRA10'));

  const next = {
    ...original, freeShippingOver: 5000, shippingFee: 150, codFee: 0, maxQtyPerItem: 3, whatsappNumber: '98765 43210', email: 'Shop@Example.com',
    coupons: [{ code: 'diwali25', type: 'percent', value: 25, min: '', label: '', active: true }, { code: 'PAUSED', type: 'flat', value: 100, min: 0, label: 'Paused', active: false }]
  };
  const saved = await call('/api/admin/settings', { method: 'PUT', body: next, cookie });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.whatsappNumber, '919876543210');
  assert.equal(saved.body.email, 'shop@example.com');
  assert.equal(saved.body.coupons[0].code, 'DIWALI25');
  assert.equal(saved.body.coupons[0].label, '25% off your order');

  const pub = (await call('/api/config')).body;
  assert.equal(pub.shippingFee, 150);
  assert.equal(pub.whatsappNumber, '919876543210');
  const q = (await call('/api/quote', { method: 'POST', body: { items: [{ id: 'AR-001', qty: 1 }], coupon: 'DIWALI25', payment: 'cod' } })).body;
  assert.equal(q.shipping, 150);
  assert.equal(q.codFee, 0);
  assert.equal(q.discount, Math.round(q.subtotal * 0.25));
  assert.equal((await call('/api/quote', { method: 'POST', body: { items: [{ id: 'AR-001', qty: 1 }], coupon: 'ADIRUDRA10' } })).body.couponError, 'That code is not valid.');
  assert.equal((await call('/api/quote', { method: 'POST', body: { items: [{ id: 'AR-001', qty: 1 }], coupon: 'PAUSED' } })).body.couponError, 'That code is not valid.');
  assert.equal(JSON.parse(await readFile(path.join(dataDir, 'settings.json'), 'utf8')).shippingFee, 150);

  const bad = [
    [{ shippingFee: -1 }, 'shippingFee'], [{ codFee: 'abc' }, 'codFee'], [{ email: 'not-an-email' }, 'email'], [{ whatsappNumber: '123' }, 'whatsappNumber'],
    [{ coupons: [{ code: 'X', type: 'percent', value: 10 }] }, 'coupons.0.code'],
    [{ coupons: [{ code: 'BIG', type: 'percent', value: 95 }] }, 'coupons.0.value'],
    [{ coupons: [{ code: 'DUP', type: 'flat', value: 5 }, { code: 'dup', type: 'flat', value: 5 }] }, 'coupons.1.code']
  ];
  for (const [patch, field] of bad) {
    const r = await call('/api/admin/settings', { method: 'PUT', body: { ...next, ...patch }, cookie });
    assert.equal(r.status, 400, field);
    assert.equal(r.body.field, field);
  }

  assert.equal((await call('/api/admin/settings', { method: 'PUT', body: original, cookie })).status, 200);
  assert.equal(config.shop.shippingFee, original.shippingFee);
});

test('site: page text, menu labels and link targets are editable and validated', async () => {
  const cookie = await adminCookie();
  const site = structuredClone(DEFAULTS);
  site.pages.cart.title = 'Your basket';
  site.pages.checkout.codText = 'Pay at your door ({codFee}).';
  site.nav.bracelets = '';
  site.featured.link = 'shop.html?type=Mala';
  const r = await call('/api/admin/site', { method: 'PUT', body: site, cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.site.pages.cart.title, 'Your basket');
  assert.equal(r.body.site.nav.bracelets, '');
  const page = await (await fetch(base + '/cart.html')).text();
  assert.match(page, /"Your basket"/);
  assert.match(page, /window\.SHOP=\{"freeShippingOver":\d+,"shippingFee":\d+,"codFee":\d+\}/);

  const bad = structuredClone(site); bad.featured.link = 'javascript:alert(1)';
  assert.equal((await call('/api/admin/site', { method: 'PUT', body: bad, cookie })).body.field, 'featured.link');
  const long = structuredClone(site); long.pages.shop.title = 'x'.repeat(200);
  assert.equal((await call('/api/admin/site', { method: 'PUT', body: long, cookie })).body.field, 'pages.shop.title');
  await call('/api/admin/site/reset', { method: 'POST', cookie });
});
