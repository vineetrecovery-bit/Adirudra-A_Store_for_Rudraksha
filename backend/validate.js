// Input validation for customers and products.

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const INDIAN_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

/** Returns { value } or { errors: {field: message} } */
export function validateCustomer(input = {}) {
  const c = {
    name: str(input.name, 100),
    phone: str(input.phone, 20).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''),
    email: str(input.email, 150).toLowerCase(),
    address: str(input.address, 300),
    address2: str(input.address2, 300),
    city: str(input.city, 80),
    state: str(input.state, 80),
    pincode: str(input.pincode, 10).replace(/\D/g, ''),
    country: 'India',
    notes: str(input.notes, 500)
  };
  const errors = {};
  if (c.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[6-9]\d{9}$/.test(c.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.email = 'Enter a valid email address.';
  if (c.address.length < 5) errors.address = 'Please enter your delivery address.';
  if (c.city.length < 2) errors.city = 'Please enter your city.';
  if (!INDIAN_STATES.includes(c.state)) errors.state = 'Please select your state.';
  if (!/^[1-9]\d{5}$/.test(c.pincode)) errors.pincode = 'Enter a valid 6-digit PIN code.';
  return Object.keys(errors).length ? { errors } : { value: c };
}

const MAX_MEDIA = 12;
// A media URL must be an uploaded file, an R2/https link, or a file shipped with the code.
const SAFE_MEDIA_URL = /^(https:\/\/[^\s"'<>]+|\/?assets\/[\w./-]+|\/uploads\/[\w.-]+)$/;

/** Validates a product's photo/video list. Returns { value } or { error }. */
export function validateMedia(list) {
  if (!Array.isArray(list)) return { error: 'Media must be a list.' };
  if (list.length > MAX_MEDIA) return { error: `A product can have up to ${MAX_MEDIA} photos and videos.` };
  const value = [];
  for (const m of list) {
    const url = str(m && m.url, 500);
    if (!url || !SAFE_MEDIA_URL.test(url) || url.includes('..')) return { error: 'Upload a photo or video, or use an https:// link.' };
    const type = m.type === 'video' ? 'video' : 'image';
    const storage = ['local', 'r2', 'external'].includes(m.storage) ? m.storage : (url.startsWith('/uploads/') ? 'local' : 'external');
    const key = typeof m.key === 'string' && /^[\w./-]{1,200}$/.test(m.key) && !m.key.includes('..') ? m.key : null;
    const mime = typeof m.mime === 'string' && /^(image|video)\/[\w.+-]+$/.test(m.mime) ? m.mime : null;
    const size = Number.isFinite(Number(m.size)) && Number(m.size) > 0 ? Math.floor(Number(m.size)) : null;
    value.push({ id: str(m.id, 60) || `m${value.length + 1}`, type, url, storage, key, mime, size });
  }
  return { value };
}

const PRODUCT_TYPES = ['Loose Bead', 'Mala', 'Bracelet', 'Pendant'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Extremely Rare'];

/**
 * Validates a product payload. With partial=true only the provided fields are checked
 * (for PATCH). Returns { value } or { errors }.
 */
export function validateProduct(input = {}, { partial = false } = {}) {
  const out = {};
  const errors = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const need = (k) => !partial || has(k);

  if (need('name')) { out.name = str(input.name, 120); if (out.name.length < 2) errors.name = 'Name is required.'; }
  if (need('price')) { out.price = Math.round(Number(input.price)); if (!Number.isFinite(out.price) || out.price < 1) errors.price = 'Price must be at least ₹1.'; }
  if (need('stock')) { out.stock = Math.floor(Number(input.stock)); if (!Number.isFinite(out.stock) || out.stock < 0) errors.stock = 'Stock must be 0 or more.'; }
  if (need('type')) { out.type = str(input.type); if (!PRODUCT_TYPES.includes(out.type)) errors.type = `Type must be one of: ${PRODUCT_TYPES.join(', ')}.`; }
  if (need('mukhi')) { out.mukhi = Math.floor(Number(input.mukhi)); if (!Number.isFinite(out.mukhi) || out.mukhi < 1 || out.mukhi > 30) errors.mukhi = 'Mukhi must be 1–30.'; }
  if (need('rarity')) { out.rarity = str(input.rarity) || 'Common'; if (!RARITIES.includes(out.rarity)) errors.rarity = `Rarity must be one of: ${RARITIES.join(', ')}.`; }

  for (const k of ['origin', 'size', 'weight', 'verification']) if (need(k)) out[k] = str(input[k], 80);
  if (need('description')) out.description = str(input.description, 2000);
  // Photos and videos. Older clients send a single `image`; it becomes a one-item media list.
  if (has('media') || (has('image') && !has('media')) || !partial) {
    const list = has('media') ? input.media : (str(input.image, 500) ? [{ type: 'image', url: str(input.image, 500) }] : []);
    const m = validateMedia(list);
    if (m.error) errors.media = m.error; else out.media = m.value;
  }
  if (need('sku')) {
    out.sku = str(input.sku, 64);
    if (out.sku && !/^[\w-]+$/.test(out.sku)) errors.sku = 'Use letters, numbers, - and _ only.';
  }
  if (need('hsnCode')) {
    out.hsnCode = str(input.hsnCode, 16).replace(/\s/g, '');
    if (out.hsnCode && !/^\d{4,8}$/.test(out.hsnCode)) errors.hsnCode = 'HSN code is 4–8 digits.';
  }
  // Shipping weight (grams) and size (cm) of one unit. Empty = use the store defaults.
  for (const [k, label, max] of [['weightGrams', 'Weight', 50000], ['lengthCm', 'Length', 300], ['breadthCm', 'Breadth', 300], ['heightCm', 'Height', 300]]) {
    if (!need(k)) continue;
    const raw = input[k];
    if (raw === undefined || raw === null || raw === '') { out[k] = null; continue; }
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0 || v > max) errors[k] = `${label} must be a number above 0.`;
    else out[k] = Math.round(v * 100) / 100;
  }
  if (need('keywords')) {
    const kw = Array.isArray(input.keywords) ? input.keywords : String(input.keywords || '').split(',');
    out.keywords = kw.map((k) => str(k, 40).toLowerCase()).filter(Boolean).slice(0, 20);
  }
  for (const k of ['featured', 'certified', 'active']) if (has(k) || (!partial && k !== 'active')) out[k] = Boolean(input[k]);
  if (!partial && !has('active')) out.active = true;

  return Object.keys(errors).length ? { errors } : { value: out };
}
