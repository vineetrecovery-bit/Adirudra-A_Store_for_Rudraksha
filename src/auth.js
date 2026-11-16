// Admin authentication: one password (ADMIN_PASSWORD) and an HMAC-signed, httpOnly session cookie.
import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'adr_admin';

const sign = (value) => crypto.createHmac('sha256', config.admin.sessionSecret).update(value).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function isAdmin(req) {
  const raw = readCookie(req, COOKIE);
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || !safeEqual(sign(exp), sig)) return false;
  return Number(exp) > Date.now();
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Please sign in.' });
}

// Simple in-memory brute-force protection: 5 failed attempts per IP per 15 minutes.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

export function login(req, res) {
  if (!config.admin.password) {
    return res.status(503).json({ error: 'Admin is disabled. Set ADMIN_PASSWORD in .env and restart.' });
  }
  const ip = req.ip;
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= 5) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  // Compare HMACs so the comparison is constant-time regardless of length.
  if (!safeEqual(sign(password), sign(config.admin.password))) {
    const fresh = !rec || now - rec.first >= WINDOW_MS;
    attempts.set(ip, fresh ? { first: now, count: 1 } : { ...rec, count: rec.count + 1 });
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  attempts.delete(ip);
  const exp = String(now + config.admin.sessionHours * 3600 * 1000);
  res.cookie(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.admin.sessionHours * 3600 * 1000,
    path: '/'
  });
  res.json({ ok: true });
}

export function logout(req, res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}
