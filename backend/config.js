// Store settings. Values come from environment variables (.env) with sensible defaults.
import crypto from 'node:crypto';
import { defaultDataDir } from '../database/index.js';

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(env.PORT, 3000),
  isProd: env.NODE_ENV === 'production',
  // Where products, orders, settings and uploads are saved (default: database/data/).
  dataDir: env.DATA_DIR || defaultDataDir(),

  shop: {
    freeShippingOver: num(env.FREE_SHIPPING_OVER, 999),
    shippingFee: num(env.SHIPPING_FEE, 99),
    codFee: num(env.COD_FEE, 49),
    whatsappNumber: (env.WHATSAPP_NUMBER || '918527810632').replace(/\D/g, ''),
    email: env.STORE_EMAIL || 'adirudra.info@gmail.com',
    maxQtyPerItem: 10
  },

  // Coupon codes live on the server only; the browser never sees the full list.
  coupons: {
    ADIRUDRA10: { type: 'percent', value: 10, label: '10% off your order' },
    WELCOME200: { type: 'flat', value: 200, min: 1500, label: '₹200 off orders over ₹1,500' }
  },

  // The one admin account. It signs in on the normal login page with this phone + password.
  // Leave either empty to have no admin (the admin panel then can't be opened).
  admin: {
    phone: (env.ADMIN_PHONE || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''),
    password: env.ADMIN_PASSWORD || '',
    // A random secret means sessions reset on restart; set SESSION_SECRET to keep them.
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    sessionHours: 12
  },

  // Customer accounts (sign up with phone number + password).
  users: {
    sessionDays: 30,
    minPasswordLength: 8
  },

  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    get enabled() { return Boolean(this.keyId && this.keySecret); }
  }
};
