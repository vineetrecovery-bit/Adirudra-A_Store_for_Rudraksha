// Store settings. Values come from environment variables (.env) with sensible defaults.
import crypto from 'node:crypto';
import { defaultDataDir } from '../database/index.js';

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(env.PORT, 3000),
  isProd: env.NODE_ENV === 'production',
  // Where JSON data (if MySQL isn't set up), store settings, website content and local
  // product media are saved (default: database/data/).
  dataDir: env.DATA_DIR || defaultDataDir(),

  // MySQL / MariaDB (on Hostinger: hPanel > Databases > MySQL Databases; host is usually localhost).
  // Leave DB_HOST empty to use JSON files instead.
  mysql: {
    host: env.DB_HOST || '',
    port: num(env.DB_PORT, 3306),
    database: env.DB_NAME || '',
    user: env.DB_USER || '',
    password: env.DB_PASSWORD || '',
    ssl: env.DB_SSL === 'true'
  },

  // Cloudflare R2 for product photos and videos (not linked yet, see database/media/r2.js).
  r2: {
    accountId: env.R2_ACCOUNT_ID || '',
    accessKeyId: env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
    bucket: env.R2_BUCKET || '',
    publicUrl: env.R2_PUBLIC_URL || ''
  },

  // Upload limits for product media.
  media: {
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: num(env.MAX_VIDEO_MB, 50) * 1024 * 1024,
    maxPerProduct: 12
  },

  // Parcel details stored on each order for Shiprocket (integration comes later).
  shipping: {
    pickupLocation: env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    defaultItemGrams: num(env.SHIP_DEFAULT_ITEM_GRAMS, 50),   // when a product has no weight set
    packagingGrams: num(env.SHIP_PACKAGING_GRAMS, 100),       // box + padding
    defaultBox: {                                           // cm, when products have no size set
      lengthCm: num(env.SHIP_BOX_LENGTH_CM, 15),
      breadthCm: num(env.SHIP_BOX_BREADTH_CM, 12),
      heightCm: num(env.SHIP_BOX_HEIGHT_CM, 8)
    }
  },

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
