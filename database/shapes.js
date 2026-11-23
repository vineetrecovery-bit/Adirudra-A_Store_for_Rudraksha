// The shape of each record as the backend sees it, whichever driver stores it.
// normalize*() fills in defaults, so older JSON data and new MySQL rows look the same.
// Every timestamp is stored in IST (see time.js), including older UTC ones.
import { toIst, nowIst } from './time.js';

export const GROUPS = [
  { id: 1, name: 'admin', description: 'Store administrator. Can open the admin panel. Only one account.' },
  { id: 2, name: 'user', description: 'Customers who create an account on the website.' }
];
export const groupId = (role) => (GROUPS.find((g) => g.name === role) || GROUPS[1]).id;
export const groupName = (id) => (GROUPS.find((g) => g.id === Number(id)) || GROUPS[1]).name;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Parses the display weight ("8.2 G", "42 g", "0.5 kg") into grams, for shipping.
export function gramsFromLabel(label) {
  const m = String(label || '').trim().match(/^([\d.]+)\s*(kg|g|gm|gms|grams?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return /^kg$/i.test(m[2] || '') ? n * 1000 : n;
}

/**
 * Product media item: a photo or video of the product.
 *   { id, type: 'image' | 'video', url, storage: 'local' | 'r2' | 'external', key, mime, size }
 * `url` is what the browser loads; `key` is the file's name inside its storage (for deleting).
 */
export function normalizeMedia(list) {
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m.url === 'string' && m.url)
    .map((m, i) => ({
      id: String(m.id || `m${i + 1}`),
      type: m.type === 'video' ? 'video' : 'image',
      url: m.url,
      storage: ['local', 'r2', 'external'].includes(m.storage) ? m.storage : (m.url.startsWith('/uploads/') ? 'local' : 'external'),
      key: m.key || null,
      mime: m.mime || null,
      size: num(m.size)
    }));
}

export function normalizeProduct(p) {
  const now = nowIst();
  // Older data had a single `image` field; it becomes the first media item.
  const media = normalizeMedia(p.media && p.media.length ? p.media : (p.image ? [{ type: 'image', url: p.image }] : []));
  return {
    id: p.id,
    sku: p.sku || p.id,
    slug: p.slug || '',
    name: p.name,
    category: p.category || 'Rudraksha',
    type: p.type,
    origin: p.origin || '',
    mukhi: Number(p.mukhi),
    size: p.size || '',
    weight: p.weight || '',
    price: Number(p.price),
    rarity: p.rarity || 'Common',
    featured: Boolean(p.featured),
    certified: Boolean(p.certified),
    verification: p.verification || '',
    stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
    active: p.active !== false,
    description: p.description || '',
    keywords: Array.isArray(p.keywords) ? p.keywords : [],
    media,
    hsnCode: p.hsnCode || '',
    weightGrams: num(p.weightGrams) ?? gramsFromLabel(p.weight),
    lengthCm: num(p.lengthCm),
    breadthCm: num(p.breadthCm),
    heightCm: num(p.heightCm),
    createdAt: toIst(p.createdAt) || now,
    updatedAt: toIst(p.updatedAt || p.createdAt) || now
  };
}

export function normalizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email || null,
    role: u.role === 'admin' ? 'admin' : 'user',
    passwordHash: u.passwordHash,
    createdAt: toIst(u.createdAt) || nowIst(),
    updatedAt: toIst(u.updatedAt || u.createdAt) || nowIst()
  };
}

const istDates = (obj, keys) => { for (const k of keys) obj[k] = toIst(obj[k]); return obj; };

const EMPTY_SHIPMENT = {
  provider: null, orderId: null, shipmentId: null, awb: null, courierId: null, courierName: null, status: null,
  trackingUrl: null, labelUrl: null, manifestUrl: null, invoiceUrl: null, pickupScheduledAt: null, shippedAt: null, deliveredAt: null
};

export function normalizeOrder(o) {
  const c = o.customer || {};
  return {
    id: o.id,
    userId: o.userId || null,
    token: o.token,
    createdAt: toIst(o.createdAt) || nowIst(),
    updatedAt: toIst(o.updatedAt || o.createdAt) || nowIst(),
    status: o.status,
    paymentStatus: o.paymentStatus,
    payment: o.payment,
    razorpayOrderId: o.razorpayOrderId || null,
    razorpayPaymentId: o.razorpayPaymentId || null,
    customer: {
      name: c.name || '', phone: c.phone || '', email: c.email || '',
      address: c.address || '', address2: c.address2 || '', city: c.city || '', state: c.state || '',
      pincode: c.pincode || '', country: c.country || 'India', notes: c.notes || ''
    },
    // null = ship to the billing address above.
    shippingAddress: o.shippingAddress || null,
    items: Array.isArray(o.items) ? o.items : [],
    subtotal: Number(o.subtotal) || 0,
    discount: Number(o.discount) || 0,
    coupon: o.coupon || null,
    shipping: Number(o.shipping) || 0,
    codFee: Number(o.codFee) || 0,
    total: Number(o.total) || 0,
    package: {
      weightKg: num(o.package?.weightKg) ?? 0.1,
      lengthCm: num(o.package?.lengthCm) ?? 10,
      breadthCm: num(o.package?.breadthCm) ?? 10,
      heightCm: num(o.package?.heightCm) ?? 5
    },
    shipment: istDates({ ...EMPTY_SHIPMENT, ...(o.shipment || {}) }, ['pickupScheduledAt', 'shippedAt', 'deliveredAt']),
    history: (Array.isArray(o.history) ? o.history : []).map((h) => ({ ...h, at: toIst(h.at) || h.at })),
    stockRestored: Boolean(o.stockRestored)
  };
}
