// Accounts and sign-in. Two user groups:
//   - admin: exactly one account, created from ADMIN_PHONE + ADMIN_PASSWORD in .env. Can open /admin.
//   - user:  customers who sign up on the website with their phone number and a password.
// Everyone signs in with phone + password. The session is an HMAC-signed, httpOnly cookie.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'adr_session';
const MAX_PASSWORD = 128;

// ---------- Passwords (scrypt, random salt per user) ----------
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Same rule as checkout: a 10-digit Indian mobile, with +91 / 0 prefixes removed.
export const normalizePhone = (v) => String(v ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
const validPhone = (p) => /^[6-9]\d{9}$/.test(p);
// The admin number is only a sign-in name, so any 10 digits are allowed for it.
const validAdminPhone = (p) => /^\d{10}$/.test(p);

// ---------- Sessions ----------
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

// The password hash is part of the signature, so changing a password signs out every old session.
const sessionSig = (user, exp) => sign(`${user.id}.${exp}.${user.passwordHash}`);

function startSession(res, user) {
  const ms = user.role === 'admin' ? config.admin.sessionHours * 3600 * 1000 : config.users.sessionDays * 86400 * 1000;
  const exp = String(Date.now() + ms);
  res.cookie(COOKIE, `${user.id}.${exp}.${sessionSig(user, exp)}`, {
    httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: ms, path: '/'
  });
}

export const publicUser = (u) => (u ? { id: u.id, name: u.name, phone: u.phone, role: u.role } : null);

// ---------- Brute-force protection (in memory) ----------
const WINDOW_MS = 15 * 60 * 1000;
function limiter(max) {
  const hits = new Map();
  return {
    blocked(key) { const r = hits.get(key); return Boolean(r && Date.now() - r.first < WINDOW_MS && r.count >= max); },
    hit(key) {
      const r = hits.get(key); const now = Date.now();
      hits.set(key, !r || now - r.first >= WINDOW_MS ? { first: now, count: 1 } : { ...r, count: r.count + 1 });
    },
    clear(key) { hits.delete(key); }
  };
}

// Creates (or updates) the single admin account from .env, and makes sure no one else is admin.
export async function ensureAdmin(db) {
  const { phone, password } = config.admin;
  const configured = Boolean(phone && password);
  if (configured && !validAdminPhone(phone)) {
    console.warn('ADMIN_PHONE must be 10 digits; admin sign-in is disabled.');
  }
  const adminPhone = configured && validAdminPhone(phone) ? phone : null;

  for (const u of db.users.all()) {
    if (u.role === 'admin' && u.phone !== adminPhone) await db.users.update(u.id, { role: 'user' });
  }
  if (!adminPhone) return null;

  const existing = db.users.byPhone(adminPhone);
  if (existing) {
    const changes = {};
    if (existing.role !== 'admin') changes.role = 'admin';
    if (!(await verifyPassword(password, existing.passwordHash))) changes.passwordHash = await hashPassword(password);
    return Object.keys(changes).length ? db.users.update(existing.id, changes) : existing;
  }
  const now = new Date().toISOString();
  return db.users.create({
    id: `U-${crypto.randomBytes(6).toString('hex')}`, name: 'Admin', phone: adminPhone, role: 'admin',
    passwordHash: await hashPassword(password), createdAt: now, updatedAt: now
  });
}

export function createAuth(db) {
  const loginIp = limiter(10);
  const loginPhone = limiter(5);
  const signupIp = limiter(10);

  function currentUser(req) {
    const [id, exp, sig] = readCookie(req, COOKIE).split('.');
    if (!id || !exp || !sig || Number(exp) <= Date.now()) return null;
    const user = db.users.get(id);
    if (!user || !safeEqual(sessionSig(user, exp), sig)) return null;
    return user;
  }

  const isAdmin = (req) => currentUser(req)?.role === 'admin';

  function requireUser(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    req.user = user;
    next();
  }

  function requireAdmin(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'This account does not have admin access.' });
    req.user = user;
    next();
  }

  async function signup(req, res) {
    if (signupIp.blocked(req.ip)) return res.status(429).json({ error: 'Too many sign-ups from this network. Try again later.' });
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const phone = normalizePhone(body.phone);
    const password = typeof body.password === 'string' ? body.password : '';
    const fields = {};
    if (name.length < 2) fields.name = 'Please enter your name.';
    if (!validPhone(phone)) fields.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (password.length < config.users.minPasswordLength) fields.password = `Use at least ${config.users.minPasswordLength} characters.`;
    else if (password.length > MAX_PASSWORD) fields.password = 'That password is too long.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please check your details.', fields });
    // The admin's phone is reserved, so nobody can sign up as (or get mixed up with) the admin.
    if (db.users.byPhone(phone) || phone === config.admin.phone) {
      return res.status(409).json({ error: 'An account with this phone number already exists. Please sign in.', fields: { phone: 'Already registered.' } });
    }
    signupIp.hit(req.ip);
    const now = new Date().toISOString();
    const user = await db.users.create({
      id: `U-${crypto.randomBytes(6).toString('hex')}`, name, phone, role: 'user',
      passwordHash: await hashPassword(password), createdAt: now, updatedAt: now
    });
    startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  }

  async function login(req, res) {
    const phone = normalizePhone(req.body?.phone);
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, MAX_PASSWORD) : '';
    if (loginIp.blocked(req.ip) || loginPhone.blocked(phone)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    const user = validPhone(phone) || validAdminPhone(phone) ? db.users.byPhone(phone) : null;
    // Hash even when the user doesn't exist, so response time doesn't reveal which numbers are registered.
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
    if (!ok) {
      loginIp.hit(req.ip); loginPhone.hit(phone);
      return res.status(401).json({ error: 'Incorrect phone number or password.' });
    }
    loginIp.clear(req.ip); loginPhone.clear(phone);
    startSession(res, user);
    res.json({ user: publicUser(user) });
  }

  function logout(req, res) {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  const me = (req, res) => res.json({ user: publicUser(currentUser(req)) });

  return { currentUser, isAdmin, requireUser, requireAdmin, signup, login, logout, me };
}
