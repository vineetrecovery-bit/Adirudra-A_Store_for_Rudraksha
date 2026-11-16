// Store settings edited from Admin > Settings: shipping and COD fees, contact details,
// order limits and coupon codes. Values from .env / config.js are the starting defaults;
// anything saved in the admin is stored in data/settings.json and takes precedence.
// Saved settings are applied to the shared `config` object, so pricing and checkout use
// them straight away (no restart needed).
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const MAX_COUPONS = 50;

class SettingsError extends Error {
  constructor(field, message) { super(message); this.field = field; }
}

const int = (v, field, min, max, label) => {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new SettingsError(field, `${label} must be a whole number from ${min.toLocaleString('en-IN')} to ${max.toLocaleString('en-IN')}.`);
  }
  return n;
};

const money = (n) => `₹${n.toLocaleString('en-IN')}`;
const defaultLabel = (c) => `${c.type === 'percent' ? `${c.value}%` : money(c.value)} off${c.min ? ` orders over ${money(c.min)}` : ' your order'}`;

/** Returns { value } or { error, field }. */
export function validateSettings(input) {
  try {
    const src = input && typeof input === 'object' ? input : {};
    const out = {
      freeShippingOver: int(src.freeShippingOver, 'freeShippingOver', 0, 1000000, 'Free shipping threshold'),
      shippingFee: int(src.shippingFee, 'shippingFee', 0, 10000, 'Shipping fee'),
      codFee: int(src.codFee, 'codFee', 0, 10000, 'Cash on delivery fee'),
      maxQtyPerItem: int(src.maxQtyPerItem, 'maxQtyPerItem', 1, 100, 'Maximum quantity'),
      whatsappNumber: '',
      email: ''
    };

    let wa = String(src.whatsappNumber ?? '').replace(/\D/g, '');
    if (wa.length === 10) wa = `91${wa}`; // a plain Indian mobile number
    if (wa && (wa.length < 11 || wa.length > 15)) throw new SettingsError('whatsappNumber', 'Enter a mobile number with country code, e.g. 91 98765 43210.');
    out.whatsappNumber = wa;

    const email = String(src.email ?? '').trim().toLowerCase();
    if (email && (email.length > 150 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email))) throw new SettingsError('email', 'Enter a valid email address.');
    out.email = email;

    const list = src.coupons ?? [];
    if (!Array.isArray(list)) throw new SettingsError('coupons', 'Coupons must be a list.');
    if (list.length > MAX_COUPONS) throw new SettingsError('coupons', `You can have up to ${MAX_COUPONS} coupons.`);
    const seen = new Set();
    out.coupons = list.map((raw, i) => {
      const c = raw && typeof raw === 'object' ? raw : {};
      const f = (k) => `coupons.${i}.${k}`;
      const code = String(c.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new SettingsError(f('code'), 'Use 3–20 letters, numbers, - or _.');
      if (seen.has(code)) throw new SettingsError(f('code'), 'This code is used twice.');
      seen.add(code);
      const type = c.type === 'flat' ? 'flat' : c.type === 'percent' ? 'percent' : null;
      if (!type) throw new SettingsError(f('type'), 'Choose % off or ₹ off.');
      const value = type === 'percent' ? int(c.value, f('value'), 1, 90, 'Percent off') : int(c.value, f('value'), 1, 100000, 'Amount off');
      const min = c.min === '' || c.min == null ? 0 : int(c.min, f('min'), 0, 1000000, 'Minimum order');
      const coupon = { code, type, value, min, active: c.active !== false };
      const label = String(c.label ?? '').trim();
      if (label.length > 80) throw new SettingsError(f('label'), 'Keep the description under 80 characters.');
      coupon.label = label || defaultLabel(coupon);
      return coupon;
    });
    return { value: out };
  } catch (err) {
    if (err instanceof SettingsError) return { error: err.message, field: err.field };
    throw err;
  }
}

// Current values as the admin sees them (taken from config, which holds the .env defaults).
function fromConfig(inactive = []) {
  const { freeShippingOver, shippingFee, codFee, maxQtyPerItem, whatsappNumber, email } = config.shop;
  const active = Object.entries(config.coupons).map(([code, c]) => ({ code, type: c.type, value: c.value, min: c.min || 0, label: c.label, active: true }));
  return { freeShippingOver, shippingFee, codFee, maxQtyPerItem, whatsappNumber, email, coupons: [...active, ...inactive] };
}

function apply(s) {
  Object.assign(config.shop, {
    freeShippingOver: s.freeShippingOver, shippingFee: s.shippingFee, codFee: s.codFee,
    maxQtyPerItem: s.maxQtyPerItem, whatsappNumber: s.whatsappNumber, email: s.email
  });
  // Only active coupons can be redeemed; the object is replaced in place so imports stay valid.
  for (const k of Object.keys(config.coupons)) delete config.coupons[k];
  for (const c of s.coupons.filter((x) => x.active)) {
    config.coupons[c.code] = { type: c.type, value: c.value, ...(c.min ? { min: c.min } : {}), label: c.label };
  }
}

export function createSettingsStore(dataDir) {
  const file = path.join(dataDir, 'settings.json');
  let current = null; // full settings incl. inactive coupons; null = nothing saved yet
  let queue = Promise.resolve();

  return {
    async load() {
      let stored;
      try { stored = JSON.parse(await readFile(file, 'utf8')); } catch { return; } // no file: keep .env defaults
      const v = validateSettings(stored);
      if (v.error) { console.warn(`settings.json: ${v.error} (${v.field}); using .env defaults.`); return; }
      current = v.value;
      apply(current);
    },
    get: () => current || fromConfig(),
    async save(next) {
      current = next;
      apply(current);
      queue = queue.then(async () => {
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(current, null, 2) + '\n');
        await rename(tmp, file);
      });
      await queue;
      return current;
    }
  };
}
