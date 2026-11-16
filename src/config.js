// Store settings. Values come from environment variables (.env) with sensible defaults.
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(env.PORT, 3000),
  isProd: env.NODE_ENV === 'production',
  dataDir: env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url)),

  shop: {
    freeShippingOver: num(env.FREE_SHIPPING_OVER, 999),
    shippingFee: num(env.SHIPPING_FEE, 99),
    codFee: num(env.COD_FEE, 49),
    whatsappNumber: (env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    email: env.STORE_EMAIL || 'hello@adirudra.com',
    maxQtyPerItem: 10
  },

  // Coupon codes live on the server only; the browser never sees the full list.
  coupons: {
    ADIRUDRA10: { type: 'percent', value: 10, label: '10% off your order' },
    WELCOME200: { type: 'flat', value: 200, min: 1500, label: '₹200 off orders over ₹1,500' }
  },

  admin: {
    password: env.ADMIN_PASSWORD || '',
    // A random secret means sessions reset on restart; set SESSION_SECRET to keep them.
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    sessionHours: 12
  },

  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    get enabled() { return Boolean(this.keyId && this.keySecret); }
  }
};
