// Shiprocket integration using its REST API directly (no SDK needed).
// Docs: https://apidocs.shiprocket.in/
// Flow for one order: create the order → assign a courier (AWB) → book the pickup → get the label.
// Each step is saved on the order as it succeeds, so a failed step can simply be retried.
import { config } from './config.js';
import { nowIst } from '../database/time.js';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // tokens last 10 days; renew a day early

export class ShiprocketError extends Error {}

// Public tracking page for an AWB number.
export const trackingUrlFor = (awb) => (awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null);

// Shiprocket's shipment status text → our order status (null = no change).
export function orderStatusFor(srStatus) {
  const s = String(srStatus || '').toUpperCase();
  if (s === 'DELIVERED') return 'delivered';
  if (/PICKED UP|IN TRANSIT|SHIPPED|OUT FOR DELIVERY|REACHED|DESTINATION|DELAYED/.test(s)) return 'shipped';
  return null;
}

// Shiprocket's error replies come in a few shapes; pull out something readable.
function errorText(body) {
  if (!body || typeof body !== 'object') return '';
  if (body.errors && typeof body.errors === 'object') return Object.values(body.errors).flat().join(' ');
  return body.message || body.response?.data || body.data?.message || '';
}

// "2026-11-28T14:05:00.000+05:30" → "2026-11-28 14:05"
const srDate = (iso) => String(iso).slice(0, 16).replace('T', ' ');

// The Shiprocket "adhoc order" body for one of our orders.
export function orderPayload(o, pickupLocation) {
  const c = o.customer;
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const body = {
    order_id: o.id,
    order_date: srDate(o.createdAt),
    pickup_location: pickupLocation,
    billing_customer_name: first,
    billing_last_name: rest.join(' '),
    billing_address: c.address,
    billing_address_2: c.address2 || '',
    billing_city: c.city,
    billing_pincode: c.pincode,
    billing_state: c.state,
    billing_country: c.country || 'India',
    billing_email: c.email,
    billing_phone: c.phone,
    shipping_is_billing: !o.shippingAddress,
    order_items: o.items.map((i) => ({ name: i.name, sku: i.sku || i.id, units: i.qty, selling_price: i.price, hsn: i.hsn || '' })),
    payment_method: o.payment === 'cod' && o.paymentStatus !== 'paid' ? 'COD' : 'Prepaid',
    // Shiprocket's total = sub_total + shipping_charges + transaction_charges − total_discount,
    // which matches our order total (and is the amount collected on COD).
    sub_total: o.subtotal,
    shipping_charges: o.shipping,
    transaction_charges: o.codFee,
    total_discount: o.discount,
    length: o.package.lengthCm,
    breadth: o.package.breadthCm,
    height: o.package.heightCm,
    weight: o.package.weightKg
  };
  const s = o.shippingAddress;
  if (s) {
    const [sf, ...sr] = String(s.name || c.name).trim().split(/\s+/);
    Object.assign(body, {
      shipping_customer_name: sf, shipping_last_name: sr.join(' '), shipping_address: s.address, shipping_address_2: s.address2 || '',
      shipping_city: s.city, shipping_pincode: s.pincode, shipping_state: s.state, shipping_country: s.country || 'India',
      shipping_email: c.email, shipping_phone: s.phone || c.phone
    });
  }
  return body;
}

export function createShiprocket({ fetchFn = (...a) => fetch(...a), settings = config.shiprocket } = {}) {
  let token = null;
  let tokenAt = 0;

  async function login() {
    const res = await fetchFn(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: settings.email, password: settings.password }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new ShiprocketError(`Shiprocket sign-in failed: ${errorText(body) || res.status}. Check SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.`);
    token = body.token; tokenAt = Date.now();
  }

  async function call(method, path, body, retried = false) {
    if (!settings.enabled) throw new ShiprocketError('Shiprocket is not set up. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to .env.');
    if (!token || Date.now() - tokenAt > TOKEN_TTL_MS) await login();
    const res = await fetchFn(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000)
    });
    if (res.status === 401 && !retried) { token = null; return call(method, path, body, true); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ShiprocketError(`Shiprocket: ${errorText(data) || `request failed (${res.status})`}`);
    return data;
  }

  return {
    get enabled() { return settings.enabled; },

    // Runs whichever steps are still missing on `shipment` and returns the updated shipment.
    // `save(shipment)` is called after every step, so progress is kept even if a later step fails.
    async ship(order, save) {
      const sh = { ...order.shipment, provider: 'shiprocket' };
      if (!sh.shipmentId) {
        const r = await call('POST', '/orders/create/adhoc', orderPayload(order, settings.pickupLocation));
        if (!r.shipment_id) throw new ShiprocketError(`Shiprocket: ${errorText(r) || 'the order was not created'}`);
        Object.assign(sh, { orderId: String(r.order_id), shipmentId: String(r.shipment_id), status: r.status || 'NEW' });
        await save(sh);
      }
      if (!sh.awb) {
        const r = await call('POST', '/courier/assign/awb', { shipment_id: Number(sh.shipmentId) });
        const d = r.response?.data;
        if (!d?.awb_code) throw new ShiprocketError(`Shiprocket could not assign a courier: ${errorText(r) || 'no courier available'}. Check your Shiprocket wallet balance and that the PIN code is serviceable.`);
        Object.assign(sh, { awb: String(d.awb_code), courierId: Number(d.courier_company_id) || null, courierName: d.courier_name || null, trackingUrl: trackingUrlFor(d.awb_code), status: 'AWB ASSIGNED' });
        await save(sh);
      }
      if (!sh.pickupScheduledAt) {
        try {
          await call('POST', '/courier/generate/pickup', { shipment_id: [Number(sh.shipmentId)] });
        } catch (err) {
          // Booking twice is harmless: Shiprocket answers "already in pickup queue".
          if (!/already/i.test(err.message)) throw err;
        }
        Object.assign(sh, { pickupScheduledAt: nowIst(), status: 'PICKUP SCHEDULED' });
        await save(sh);
      }
      if (!sh.labelUrl) {
        const r = await call('POST', '/courier/generate/label', { shipment_id: [Number(sh.shipmentId)] });
        if (r.label_url) { sh.labelUrl = r.label_url; await save(sh); }
      }
      return sh;
    },

    // Latest courier status for an AWB, e.g. "IN TRANSIT" or "DELIVERED".
    async track(awb) {
      const r = await call('GET', `/courier/track/awb/${encodeURIComponent(awb)}`);
      const t = r.tracking_data || {};
      const st = t.shipment_track?.[0] || {};
      return st.current_status || t.shipment_track_activities?.[0]?.['sr-status-label'] || null;
    },

    async cancel(shiprocketOrderId) {
      await call('POST', '/orders/cancel', { ids: [Number(shiprocketOrderId)] });
    }
  };
}
