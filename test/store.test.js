// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.ADMIN_PHONE = '9000000001';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.RAZORPAY_KEY_ID = '';
const { config } = await import('../backend/config.js');
const { quote } = await import('../backend/pricing.js');
const { validateCustomer } = await import('../backend/validate.js');
const { openDatabase } = await import('../database/index.js');
const { createApp } = await import('../backend/app.js');
const { createSiteStore, DEFAULTS } = await import('../backend/site.js');
const { ensureAdmin } = await import('../backend/auth.js');

const customer = { name: 'Asha Verma', phone: '+91 98765 43210', email: 'asha@example.com', address: '12 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };

let server, base, dataDir, db, siteStore;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'adirudra-test-'));
  await copyFile(new URL('../database/seed-products.json', import.meta.url), path.join(dataDir, 'seed-products.json'));
  // TEST_DB_* runs the same tests against a real (empty) MySQL database instead of JSON files.
  const mysql = process.env.TEST_DB_HOST ? {
    host: process.env.TEST_DB_HOST, port: Number(process.env.TEST_DB_PORT || 3306), database: process.env.TEST_DB_NAME,
    user: process.env.TEST_DB_USER, password: process.env.TEST_DB_PASSWORD || ''
  } : null;
  db = openDatabase({ dataDir, mysql });
  await db.load();
  await ensureAdmin(db);
  process.env.DATA_DIR = dataDir;
  config.dataDir = dataDir;
  siteStore = createSiteStore(db);
  await siteStore.load();
  server = createApp(db, siteStore).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); await rm(dataDir, { recursive: true, force: true }); });
const stockOf = async (id) => (await db.products.get(id)).stock;

const call = async (p, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
let customerCookie;
const customerSession = async () => {
  if (!customerCookie) {
    const r = await call('/api/auth/signup', { method: 'POST', body: { name: 'Asha Verma', phone: customer.phone, password: 'asha-secret-1' } });
    customerCookie = cookieOf(r);
  }
  return customerCookie;
};
const adminLogin = (password = 'test-password') => call('/api/auth/login', { method: 'POST', body: { phone: '9000000001', password } });

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
  const before = await stockOf('AR-001');
  const cookie = await customerSession();
  const r = await call('/api/orders', { method: 'POST', cookie, body: { items: [{ id: 'AR-001', qty: 2, price: 1 }], payment: 'cod', customer } });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, 1499 * 2 + config.shop.codFee); // client-sent price ignored
  assert.equal(await stockOf('AR-001'), before - 2);

  // Stored with everything the courier needs: customer, address, SKUs and the parcel.
  const saved = await db.orders.get(r.body.id);
  assert.equal(saved.userId, (await db.users.byPhone('9876543210')).id);
  assert.deepEqual(saved.customer, { ...customer, phone: '9876543210', address2: '', country: 'India', notes: '' });
  assert.equal(saved.shippingAddress, null);
  assert.deepEqual(saved.items[0], { id: 'AR-001', sku: 'AR-001', name: 'Five Mukhi Nepal Rudraksha', hsn: '', price: 1499, qty: 2, total: 2998, weightGrams: 8.2 });
  assert.equal(saved.package.weightKg, Math.round(8.2 * 2 + config.shipping.packagingGrams) / 1000);
  assert.deepEqual(saved.shipment.awb, null);
  // Times are Indian Standard Time, and the order ID carries the Indian date.
  assert.match(saved.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+05:30$/);
  assert.ok(Math.abs(Date.parse(saved.createdAt) - Date.now()) < 60_000);
  assert.match(saved.history[0].at, /\+05:30$/);
  assert.equal(saved.id.slice(4, 10), saved.createdAt.slice(2, 10).replace(/-/g, ''));

  assert.equal((await call(`/api/orders/${r.body.id}`)).status, 404); // no token
  assert.equal((await call(`/api/orders/${r.body.id}?token=wrong`)).status, 404);
  const ok = await call(`/api/orders/${r.body.id}?token=${r.body.token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'confirmed');
  assert.equal(ok.body.token, undefined);
});

test('POST /api/orders rejects invalid customer details and overselling', async () => {
  const cookie = await customerSession();
  const bad = await call('/api/orders', { method: 'POST', cookie, body: { items: [{ id: 'AR-002', qty: 1 }], payment: 'cod', customer: { ...customer, phone: '123' } } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.phone);
  const over = await call('/api/orders', { method: 'POST', cookie, body: { items: [{ id: 'AR-002', qty: 999 }], payment: 'cod', customer } });
  assert.equal(over.status, 409);
});

test('admin: requires login, updates orders, cancel restocks', async () => {
  assert.equal((await call('/api/admin/orders')).status, 401);
  assert.equal((await adminLogin('nope')).status, 401);
  const login = await adminLogin();
  assert.equal(login.status, 200);
  const cookie = cookieOf(login);

  const orders = await call('/api/admin/orders', { cookie });
  assert.equal(orders.status, 200);
  const order = orders.body[0];
  assert.equal(order.token, undefined);

  const stock = await stockOf('AR-001');
  const shipped = await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'shipped', note: 'AWB 123' } });
  assert.equal(shipped.body.status, 'shipped');
  await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'cancelled' } });
  assert.equal(await stockOf('AR-001'), stock + 2);
  // Saving the cancelled order again doesn't restock twice.
  await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'cancelled', note: 'again' } });
  assert.equal(await stockOf('AR-001'), stock + 2);
  const reopen = await call(`/api/admin/orders/${order.id}`, { method: 'PATCH', cookie, body: { status: 'confirmed' } });
  assert.equal(reopen.status, 400);
});

test('admin: create, edit and delete products with validation', async () => {
  const cookie = cookieOf(await adminLogin());
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
  const { verifyPaymentSignature } = await import('../backend/razorpay.js');
  const signature = crypto.createHmac('sha256', 'secret').update('order_1|pay_1').digest('hex');
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }), true);
  assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature }), false);
  config.razorpay.keySecret = '';
});

// ---------- Website editor ----------
const adminCookie = async () => cookieOf(await adminLogin());

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
  // Kept in the settings table: the live site under 'site', the previous version under 'site_history'.
  assert.equal((await db.settings.get('site')).theme.colors.walnut, '#123456');
  assert.equal((await db.settings.get('site_history')).length, 1);
  assert.match((await db.settings.get('site_history'))[0].savedAt, /\+05:30$/);

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

test('product media: photos and videos are checked, saved, listed and served', async () => {
  const cookie = await adminCookie();
  const upload = (body, type) => fetch(base + '/api/admin/media', { method: 'POST', headers: { 'Content-Type': type, Cookie: cookie }, body });
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const mp4 = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypisom'), Buffer.alloc(32)]);

  const photo = await (await upload(png, 'image/png')).json();
  assert.equal(photo.type, 'image');
  assert.match(photo.url, /^\/uploads\/[\w-]+\.png$/);
  assert.equal(photo.storage, 'local');
  const video = await (await upload(mp4, 'video/mp4')).json();
  assert.equal(video.type, 'video');
  assert.equal(video.mime, 'video/mp4');
  assert.equal((await fetch(base + video.url)).status, 200);

  assert.equal((await upload('<svg onload="alert(1)"/>', 'image/svg+xml')).status, 400);
  assert.equal((await upload(Buffer.from('not a video at all'), 'video/mp4')).status, 400);
  assert.equal((await fetch(base + '/api/admin/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })).status, 401);

  // Attach both to a product; the store lists them, with the first photo as the card image.
  const saved = await call('/api/admin/products/AR-004', { method: 'PATCH', cookie, body: { media: [video, photo] } });
  assert.equal(saved.status, 200);
  const pub = (await call('/api/products/AR-004')).body;
  assert.deepEqual(pub.media.map((m) => m.type), ['video', 'image']);
  assert.equal(pub.image, photo.url);
  assert.equal((await call('/api/admin/products/AR-004', { method: 'PATCH', cookie, body: { media: [{ type: 'image', url: 'javascript:alert(1)' }] } })).status, 400);

  // Removing a photo from the product deletes its file.
  await call('/api/admin/products/AR-004', { method: 'PATCH', cookie, body: { media: [video] } });
  assert.equal((await fetch(base + photo.url)).status, 404);
  await call('/api/admin/products/AR-004', { method: 'PATCH', cookie, body: { media: [] } });
});

test('products: shipping details (SKU, HSN, weight, size) are validated and saved', async () => {
  const cookie = await adminCookie();
  const ok = await call('/api/admin/products/AR-005', { method: 'PATCH', cookie, body: { sku: 'RUD-5M-NP', hsnCode: '1404 90', weightGrams: '12.5', lengthCm: 6, breadthCm: 6, heightCm: '' } });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.sku, ok.body.hsnCode, ok.body.weightGrams, ok.body.lengthCm, ok.body.heightCm], ['RUD-5M-NP', '140490', 12.5, 6, null]);
  const dup = await call('/api/admin/products/AR-006', { method: 'PATCH', cookie, body: { sku: 'RUD-5M-NP' } });
  assert.equal(dup.body.fields.sku, 'Another product already uses this SKU.');
  const bad = await call('/api/admin/products/AR-006', { method: 'PATCH', cookie, body: { hsnCode: 'abc', weightGrams: -1 } });
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['hsnCode', 'weightGrams']);
  await call('/api/admin/products/AR-005', { method: 'PATCH', cookie, body: { sku: '' } }); // back to the product ID
  assert.equal((await db.products.get('AR-005')).sku, 'AR-005');
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
  assert.equal((await db.settings.get('store')).shippingFee, 150);

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

// ---------- Accounts ----------
test('accounts: sign up with phone + password, sign in, sign out', async () => {
  const bad = await call('/api/auth/signup', { method: 'POST', body: { name: 'R', phone: '123', password: 'short' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['name', 'password', 'phone']);

  const up = await call('/api/auth/signup', { method: 'POST', body: { name: 'Ravi Kumar', phone: '+91 91234 56789', password: 'ravi-pass-123' } });
  assert.equal(up.status, 201);
  assert.deepEqual(up.body.user, { id: up.body.user.id, name: 'Ravi Kumar', phone: '9123456789', role: 'user' });
  assert.match(up.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await call('/api/auth/me', { cookie: cookieOf(up) })).body.user.phone, '9123456789');

  // The same number can't register twice, and the stored password is hashed.
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { name: 'Other', phone: '9123456789', password: 'another-pass' } })).status, 409);
  const stored = await db.users.byPhone('9123456789');
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.ok(!JSON.stringify(stored).includes('ravi-pass-123'));

  assert.equal((await call('/api/auth/login', { method: 'POST', body: { phone: '9123456789', password: 'wrong-pass' } })).status, 401);
  const login = await call('/api/auth/login', { method: 'POST', body: { phone: '09123456789', password: 'ravi-pass-123' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'user');

  const out = await call('/api/auth/logout', { method: 'POST', cookie: cookieOf(login) });
  assert.match(out.headers.get('set-cookie'), /adr_session=;/);
  assert.equal((await call('/api/auth/me')).body.user, null);
  // A forged cookie is rejected.
  assert.equal((await call('/api/auth/me', { cookie: `adr_session=${up.body.user.id}.9999999999999.forged` })).body.user, null);
});

test('accounts: orders need sign-in and are listed under the account', async () => {
  const anon = await call('/api/orders', { method: 'POST', body: { items: [{ id: 'AR-003', qty: 1 }], payment: 'cod', customer } });
  assert.equal(anon.status, 401);
  assert.equal((await call('/api/account/orders')).status, 401);

  const cookie = await customerSession();
  const placed = await call('/api/orders', { method: 'POST', cookie, body: { items: [{ id: 'AR-003', qty: 1 }], payment: 'cod', customer } });
  assert.equal(placed.status, 201);
  const mine = await call('/api/account/orders', { cookie });
  assert.ok(mine.body.some((o) => o.id === placed.body.id && o.token === placed.body.token));
  // The owner can open the order without the token; another customer can't see it.
  assert.equal((await call(`/api/orders/${placed.body.id}`, { cookie })).status, 200);
  const other = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { name: 'Neha', phone: '9988776655', password: 'neha-pass-123' } }));
  assert.equal((await call(`/api/orders/${placed.body.id}`, { cookie: other })).status, 404);
  assert.ok(!(await call('/api/account/orders', { cookie: other })).body.some((o) => o.id === placed.body.id));
});

test('orders: two customers buying the last item at once — only one gets it', async () => {
  const admin = await adminCookie();
  await call('/api/admin/products/AR-007', { method: 'PATCH', cookie: admin, body: { stock: 1 } });
  const a = await customerSession();
  const b = cookieOf(await call('/api/auth/signup', { method: 'POST', body: { name: 'Kiran', phone: '9811112222', password: 'kiran-pass-1' } }));
  const order = (cookie) => call('/api/orders', { method: 'POST', cookie, body: { items: [{ id: 'AR-007', qty: 1 }], payment: 'cod', customer } });
  const results = (await Promise.all([order(a), order(b), order(a)])).map((r) => r.status).sort();
  assert.deepEqual(results, [201, 409, 409]);
  assert.equal(await stockOf('AR-007'), 0);
});

test('accounts: only the one admin account can use the admin API', async () => {
  const cust = await customerSession();
  assert.equal((await call('/api/admin/orders', { cookie: cust })).status, 403);
  assert.equal((await call('/api/admin/me', { cookie: cust })).body.admin, false);
  // Nobody can sign up with the admin's phone number.
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { name: 'Fake', phone: '9000000001', password: 'fake-admin-1' } })).status, 409);

  const cookie = await adminCookie();
  assert.equal((await call('/api/admin/me', { cookie })).body.admin, true);
  const users = (await call('/api/admin/users', { cookie })).body;
  assert.equal(users.filter((u) => u.role === 'admin').length, 1);
  assert.ok(users.every((u) => u.passwordHash === undefined));
  assert.ok(users.find((u) => u.phone === '9876543210').orders >= 1);

  // Changing ADMIN_PHONE moves admin rights: the old admin becomes a normal user.
  config.admin.phone = '9876543210'; config.admin.password = 'new-admin-pass';
  await ensureAdmin(db);
  assert.deepEqual((await db.users.list()).filter((u) => u.role === 'admin').map((u) => u.phone), ['9876543210']);
  assert.deepEqual((await db.groups.list()).map((g) => g.name), ['admin', 'user']);
  assert.equal((await call('/api/admin/orders', { cookie })).status, 403); // the old admin's session
  config.admin.phone = '9000000001'; config.admin.password = 'test-password';
  await ensureAdmin(db);
  customerCookie = null; // that customer's password was replaced while they were admin
});
