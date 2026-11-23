// Razorpay integration using its REST API directly (no SDK needed).
// Docs: https://razorpay.com/docs/payments/server-integration/nodejs/
import crypto from 'node:crypto';
import { config } from './config.js';

export async function createRazorpayOrder({ amountRupees, receipt, notes }) {
  const { keyId, keySecret } = config.razorpay;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    },
    body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt, notes }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status}): ${body?.error?.description || 'unknown error'}`);
  return body; // { id, amount, currency, ... }
}

// Checkout signature = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
