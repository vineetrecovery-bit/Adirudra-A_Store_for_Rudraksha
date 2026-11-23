// MySQL / MariaDB driver for the 5 tables: user_groups, users, products, orders, settings.
// Creates the tables on first start (see schema.sql) and fills in the starting catalogue.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GROUPS, groupId, groupName, normalizeProduct, normalizeUser, normalizeOrder } from '../shapes.js';
import { nowIst, toIst, IST_OFFSET } from '../time.js';

const SCHEMA = fileURLToPath(new URL('./schema.sql', import.meta.url));

// ---------- Value helpers ----------
const toDate = (iso) => (iso ? new Date(iso) : null);
const toIso = (d) => toIst(d);
const json = (v) => JSON.stringify(v ?? null);
const parse = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };
const n = (v) => (v == null ? null : Number(v));

// ---------- Row <-> record ----------
const USER_COLS = ['id', 'group_id', 'name', 'phone', 'email', 'password_hash', 'created_at', 'updated_at'];
const userRow = (u) => [u.id, groupId(u.role), u.name, u.phone, u.email, u.passwordHash, toDate(u.createdAt), toDate(u.updatedAt)];
const userFromRow = (r) => normalizeUser({
  id: r.id, name: r.name, phone: r.phone, email: r.email, role: groupName(r.group_id),
  passwordHash: r.password_hash, createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at)
});

const PRODUCT_COLS = ['id', 'sku', 'slug', 'name', 'category', 'type', 'origin', 'mukhi', 'size', 'weight_label', 'price', 'rarity',
  'featured', 'certified', 'verification', 'stock', 'active', 'description', 'keywords', 'media',
  'hsn_code', 'weight_grams', 'length_cm', 'breadth_cm', 'height_cm', 'created_at', 'updated_at'];
const productRow = (p) => [p.id, p.sku, p.slug, p.name, p.category, p.type, p.origin, p.mukhi, p.size, p.weight, p.price, p.rarity,
  p.featured ? 1 : 0, p.certified ? 1 : 0, p.verification, p.stock, p.active ? 1 : 0, p.description, json(p.keywords), json(p.media),
  p.hsnCode, p.weightGrams, p.lengthCm, p.breadthCm, p.heightCm, toDate(p.createdAt), toDate(p.updatedAt)];
const productFromRow = (r) => normalizeProduct({
  id: r.id, sku: r.sku, slug: r.slug, name: r.name, category: r.category, type: r.type, origin: r.origin, mukhi: r.mukhi,
  size: r.size, weight: r.weight_label, price: n(r.price), rarity: r.rarity, featured: Boolean(r.featured), certified: Boolean(r.certified),
  verification: r.verification, stock: r.stock, active: Boolean(r.active), description: r.description,
  keywords: parse(r.keywords, []), media: parse(r.media, []), hsnCode: r.hsn_code, weightGrams: n(r.weight_grams),
  lengthCm: n(r.length_cm), breadthCm: n(r.breadth_cm), heightCm: n(r.height_cm), createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at)
});

const ORDER_COLS = ['id', 'user_id', 'token', 'status', 'payment_method', 'payment_status', 'razorpay_order_id', 'razorpay_payment_id',
  'customer_name', 'customer_phone', 'customer_email', 'billing_address', 'billing_address_2', 'billing_city', 'billing_state',
  'billing_pincode', 'billing_country', 'customer_notes',
  'shipping_is_billing', 'shipping_name', 'shipping_phone', 'shipping_address', 'shipping_address_2', 'shipping_city',
  'shipping_state', 'shipping_pincode', 'shipping_country',
  'items', 'subtotal', 'discount', 'coupon_code', 'shipping_charges', 'cod_fee', 'total',
  'package_weight_kg', 'package_length_cm', 'package_breadth_cm', 'package_height_cm',
  'shipping_provider', 'shiprocket_order_id', 'shiprocket_shipment_id', 'awb_code', 'courier_company_id', 'courier_name',
  'shipping_status', 'tracking_url', 'label_url', 'manifest_url', 'invoice_url', 'pickup_scheduled_at', 'shipped_at', 'delivered_at',
  'history', 'stock_restored', 'created_at', 'updated_at'];
function orderRow(o) {
  const c = o.customer; const s = o.shippingAddress; const sh = o.shipment; const pk = o.package;
  return [o.id, o.userId, o.token, o.status, o.payment, o.paymentStatus, o.razorpayOrderId, o.razorpayPaymentId,
    c.name, c.phone, c.email, c.address, c.address2 || null, c.city, c.state, c.pincode, c.country, c.notes || null,
    s ? 0 : 1, s?.name ?? null, s?.phone ?? null, s?.address ?? null, s?.address2 ?? null, s?.city ?? null, s?.state ?? null, s?.pincode ?? null, s?.country ?? null,
    json(o.items), o.subtotal, o.discount, o.coupon, o.shipping, o.codFee, o.total,
    pk.weightKg, pk.lengthCm, pk.breadthCm, pk.heightCm,
    sh.provider, sh.orderId, sh.shipmentId, sh.awb, sh.courierId, sh.courierName, sh.status, sh.trackingUrl, sh.labelUrl, sh.manifestUrl,
    sh.invoiceUrl, toDate(sh.pickupScheduledAt), toDate(sh.shippedAt), toDate(sh.deliveredAt),
    json(o.history), o.stockRestored ? 1 : 0, toDate(o.createdAt), toDate(o.updatedAt)];
}
const orderFromRow = (r) => normalizeOrder({
  id: r.id, userId: r.user_id, token: r.token, status: r.status, payment: r.payment_method, paymentStatus: r.payment_status,
  razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id,
  customer: {
    name: r.customer_name, phone: r.customer_phone, email: r.customer_email, address: r.billing_address, address2: r.billing_address_2,
    city: r.billing_city, state: r.billing_state, pincode: r.billing_pincode, country: r.billing_country, notes: r.customer_notes
  },
  shippingAddress: r.shipping_is_billing ? null : {
    name: r.shipping_name, phone: r.shipping_phone, address: r.shipping_address, address2: r.shipping_address_2,
    city: r.shipping_city, state: r.shipping_state, pincode: r.shipping_pincode, country: r.shipping_country
  },
  items: parse(r.items, []), subtotal: n(r.subtotal), discount: n(r.discount), coupon: r.coupon_code, shipping: n(r.shipping_charges),
  codFee: n(r.cod_fee), total: n(r.total),
  package: { weightKg: n(r.package_weight_kg), lengthCm: n(r.package_length_cm), breadthCm: n(r.package_breadth_cm), heightCm: n(r.package_height_cm) },
  shipment: {
    provider: r.shipping_provider, orderId: r.shiprocket_order_id, shipmentId: r.shiprocket_shipment_id, awb: r.awb_code,
    courierId: r.courier_company_id, courierName: r.courier_name, status: r.shipping_status, trackingUrl: r.tracking_url,
    labelUrl: r.label_url, manifestUrl: r.manifest_url, invoiceUrl: r.invoice_url,
    pickupScheduledAt: toIso(r.pickup_scheduled_at), shippedAt: toIso(r.shipped_at), deliveredAt: toIso(r.delivered_at)
  },
  history: parse(r.history, []), stockRestored: Boolean(r.stock_restored), createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at)
});

const insertSql = (table, cols) => `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
const updateSql = (table, cols) => `UPDATE ${table} SET ${cols.slice(1).map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
// Row values for UPDATE: everything except the id, then the id for WHERE.
const updateArgs = (row) => [...row.slice(1), row[0]];

export function createMysqlDb(options, { seedProducts }) {
  let pool = null; // created in load(), so a missing mysql2 package is reported as a startup error
  const q = async (sql, args = []) => (await pool.execute(sql, args))[0];
  const one = async (sql, args) => (await q(sql, args))[0] ?? null;

  async function load() {
    if (pool) { await pool.end().catch(() => {}); pool = null; } // retrying after a failed start
    const { default: mysql } = await import('mysql2/promise');
    pool = mysql.createPool({
      host: options.host, port: options.port, user: options.user, password: options.password, database: options.database,
      ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
      // Dates are written and read as Indian time, so phpMyAdmin shows IST.
      connectionLimit: options.connectionLimit || 5, charset: 'utf8mb4', timezone: IST_OFFSET, multipleStatements: false
    });
    // NOW() / CURRENT_TIMESTAMP on the server use IST too (a fixed offset needs no time zone tables).
    pool.pool.on('connection', (conn) => { conn.query(`SET time_zone = '${IST_OFFSET}'`); });

    // Run each CREATE TABLE / INSERT IGNORE from schema.sql (statements end with ";" on a line end).
    const statements = (await readFile(SCHEMA, 'utf8'))
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    for (const s of statements) await pool.query(s);
    // Keep group names/descriptions in sync with the code.
    for (const g of GROUPS) await q('INSERT INTO user_groups (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)', [g.id, g.name, g.description]);
    if ((await one('SELECT COUNT(*) AS c FROM products')).c === 0) {
      for (const p of (await seedProducts()).map(normalizeProduct)) await q(insertSql('products', PRODUCT_COLS), productRow(p));
    }
  }

  return {
    driver: 'mysql',
    load,
    close: async () => { if (pool) await pool.end(); },

    groups: {
      list: async () => (await q('SELECT id, name, description FROM user_groups ORDER BY id')).map((r) => ({ ...r }))
    },

    // Settings table: one JSON value per key ('store', 'site', 'site_history').
    settings: {
      async get(key) {
        const r = await one('SELECT value FROM settings WHERE setting_key = ?', [key]);
        return r ? parse(r.value, undefined) : undefined;
      },
      async set(key, value) {
        await q('INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, json(value)]);
      }
    },

    users: {
      list: async () => (await q(`SELECT ${USER_COLS.join(', ')} FROM users ORDER BY created_at`)).map(userFromRow),
      get: async (id) => { const r = await one(`SELECT ${USER_COLS.join(', ')} FROM users WHERE id = ?`, [id]); return r && userFromRow(r); },
      byPhone: async (phone) => { const r = await one(`SELECT ${USER_COLS.join(', ')} FROM users WHERE phone = ?`, [phone]); return r && userFromRow(r); },
      async create(user) {
        const u = normalizeUser(user);
        await q(insertSql('users', USER_COLS), userRow(u));
        return u;
      },
      async update(id, changes) {
        const current = await this.get(id);
        if (!current) return null;
        const u = normalizeUser({ ...current, ...changes, updatedAt: nowIst() });
        await q(updateSql('users', USER_COLS), updateArgs(userRow(u)));
        return u;
      }
    },

    products: {
      list: async () => (await q(`SELECT ${PRODUCT_COLS.join(', ')} FROM products ORDER BY id`)).map(productFromRow),
      get: async (id) => { const r = await one(`SELECT ${PRODUCT_COLS.join(', ')} FROM products WHERE id = ?`, [id]); return r && productFromRow(r); },
      async create(product) {
        const p = normalizeProduct(product);
        await q(insertSql('products', PRODUCT_COLS), productRow(p));
        return p;
      },
      async update(id, changes) {
        const current = await this.get(id);
        if (!current) return null;
        const p = normalizeProduct({ ...current, ...changes, id, updatedAt: nowIst() });
        await q(updateSql('products', PRODUCT_COLS), updateArgs(productRow(p)));
        return p;
      },
      async remove(id) {
        return (await q('DELETE FROM products WHERE id = ?', [id])).affectedRows > 0;
      },
      // All-or-nothing: each line only takes stock if enough is left, inside one transaction.
      async reserveStock(lines) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          for (const l of lines) {
            const [r] = await conn.execute('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', [l.qty, l.id, l.qty]);
            if (r.affectedRows !== 1) { await conn.rollback(); return false; }
          }
          await conn.commit();
          return true;
        } catch (err) {
          await conn.rollback().catch(() => {});
          throw err;
        } finally { conn.release(); }
      },
      async releaseStock(lines) {
        for (const l of lines) await q('UPDATE products SET stock = stock + ? WHERE id = ?', [l.qty, l.id]);
      }
    },

    orders: {
      list: async () => (await q(`SELECT ${ORDER_COLS.join(', ')} FROM orders ORDER BY created_at DESC`)).map(orderFromRow),
      listByUser: async (userId) => (await q(`SELECT ${ORDER_COLS.join(', ')} FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(orderFromRow),
      get: async (id) => { const r = await one(`SELECT ${ORDER_COLS.join(', ')} FROM orders WHERE id = ?`, [id]); return r && orderFromRow(r); },
      // Items are stored as JSON, so match the product id inside it.
      usesProduct: async (productId) => Boolean(await one('SELECT id FROM orders WHERE items LIKE ? LIMIT 1', [`%"id":${JSON.stringify(productId)}%`])),
      async countByUser() {
        const rows = await q('SELECT user_id, COUNT(*) AS c FROM orders WHERE user_id IS NOT NULL GROUP BY user_id');
        return new Map(rows.map((r) => [r.user_id, Number(r.c)]));
      },
      async create(order) {
        const o = normalizeOrder(order);
        await q(insertSql('orders', ORDER_COLS), orderRow(o));
        return o;
      },
      async update(id, changes) {
        const current = await this.get(id);
        if (!current) return null;
        const o = normalizeOrder({ ...current, ...changes, id, updatedAt: nowIst() });
        await q(updateSql('orders', ORDER_COLS), updateArgs(orderRow(o)));
        return o;
      }
    }
  };
}
