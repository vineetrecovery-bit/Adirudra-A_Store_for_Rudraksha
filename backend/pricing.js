// Server-side pricing. The browser only sends product IDs and quantities;
// every price, discount, fee and total is computed here from the product database.
import { config } from './config.js';

export class PricingError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function findCoupon(code) {
  const key = String(code || '').trim().toUpperCase();
  return key && config.coupons[key] ? { code: key, ...config.coupons[key] } : null;
}

/**
 * @param {{id:string, qty:number}[]} items
 * @param {{coupon?:string, payment?:string, getProduct:(id:string)=>object|undefined, strict?:boolean}} opts
 * strict=true rejects unknown products / out-of-stock lines (used when placing an order);
 * strict=false drops them and reports issues (used for cart previews).
 */
export function quote(items, { coupon, payment, getProduct, strict = false }) {
  if (!Array.isArray(items)) throw new PricingError('Cart items must be a list.');
  if (items.length > 50) throw new PricingError('Too many items in cart.');

  const merged = new Map();
  for (const raw of items) {
    const id = String(raw?.id || '');
    const qty = Math.floor(Number(raw?.qty));
    if (!id || !Number.isFinite(qty) || qty < 1) {
      if (strict) throw new PricingError('Invalid cart item.');
      continue;
    }
    merged.set(id, (merged.get(id) || 0) + qty);
  }

  const lines = [];
  const issues = [];
  for (const [id, wanted] of merged) {
    const p = getProduct(id);
    if (!p || p.active === false) {
      if (strict) throw new PricingError('A product in your cart is no longer available.', 409);
      issues.push({ id, message: 'No longer available' });
      continue;
    }
    const limit = Math.min(p.stock, config.shop.maxQtyPerItem);
    if (limit < 1) {
      if (strict) throw new PricingError(`${p.name} is out of stock.`, 409);
      issues.push({ id, message: 'Out of stock' });
      continue;
    }
    let qty = wanted;
    if (wanted > limit) {
      if (strict) throw new PricingError(`Only ${limit} of ${p.name} available.`, 409);
      issues.push({ id, message: `Only ${limit} available` });
      qty = limit;
    }
    lines.push({ id: p.id, name: p.name, price: p.price, qty, total: p.price * qty, maxQty: limit });
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  let discount = 0;
  let couponCode = '';
  let couponError = '';
  if (coupon) {
    const c = findCoupon(coupon);
    if (!c) couponError = 'That code is not valid.';
    else if (c.min && subtotal < c.min) couponError = `Add ₹${(c.min - subtotal).toLocaleString('en-IN')} more to use this code.`;
    else {
      discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
      couponCode = c.code;
    }
  }

  const afterDiscount = subtotal - discount;
  const shipping = subtotal === 0 || afterDiscount >= config.shop.freeShippingOver ? 0 : config.shop.shippingFee;
  const codFee = payment === 'cod' && subtotal > 0 ? config.shop.codFee : 0;

  return {
    lines,
    issues,
    subtotal,
    discount,
    coupon: couponCode,
    couponLabel: couponCode ? findCoupon(couponCode).label : '',
    couponError,
    shipping,
    codFee,
    total: afterDiscount + shipping + codFee
  };
}
