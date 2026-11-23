// Entry point: open the database, start the HTTP server.
// No top-level await here: Hostinger's LiteSpeed runner (lsnode.js) loads this
// file with require(), which fails on ES modules that use top-level await.
//
// If the store can't start (most often: wrong database details), the server still answers,
// with a "temporarily unavailable" page that says what's wrong, and retries every 30 seconds.
// That way the problem is visible without digging through host logs.
import http from 'node:http';
import { config } from './config.js';
import { openDatabase, createMediaStore } from '../database/index.js';
import { createApp } from './app.js';
import { createSiteStore } from './site.js';
import { createSettingsStore } from './settings.js';
import { ensureAdmin } from './auth.js';

const RETRY_MS = 30_000;

// A plain-language reason for a startup failure. Never includes passwords.
export function explainStartupError(err) {
  const code = err && (err.code || err.errno);
  const hints = {
    ER_ACCESS_DENIED_ERROR: 'The database rejected the username or password. Check DB_USER (including the u123456789_ prefix) and DB_PASSWORD in the environment variables.',
    ER_DBACCESS_DENIED_ERROR: 'This database user isn\'t allowed to use that database. Check that DB_USER and DB_NAME are the pair shown together in hPanel.',
    ER_BAD_DB_ERROR: 'The database name wasn\'t found. Check DB_NAME matches hPanel exactly, including the u123456789_ prefix.',
    ER_TABLEACCESS_DENIED_ERROR: 'The database user isn\'t allowed to create tables. Give the user all privileges on the database in hPanel.',
    ER_SPECIFIC_ACCESS_DENIED_ERROR: 'The database user is missing a permission. Give the user all privileges on the database in hPanel.',
    ECONNREFUSED: 'Nothing answered at the database address. Set DB_HOST to localhost (and DB_PORT to 3306).',
    ENOTFOUND: 'The database host name doesn\'t exist. Set DB_HOST to localhost.',
    ETIMEDOUT: 'The database didn\'t answer in time. Set DB_HOST to localhost; if it already is, the database server may be down.',
    EHOSTUNREACH: 'The database server can\'t be reached. Set DB_HOST to localhost.',
    PROTOCOL_CONNECTION_LOST: 'The database closed the connection. It may be restarting; this page retries automatically.'
  };
  if (hints[code]) return { code, hint: hints[code] };
  if ((code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && /mysql2/.test(err.message)) {
    return { code, hint: 'The mysql2 package isn\'t installed. Redeploy so the build runs npm install.' };
  }
  return { code: code || 'UNKNOWN', hint: 'The store hit an unexpected error while starting. The full error is in the app\'s logs.' };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unavailablePage = ({ code, hint }, at) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="30">
<title>Store temporarily unavailable</title>
<style>body{margin:0;font:15px/1.6 system-ui,Arial,sans-serif;background:#f8f5ef;color:#241b15;display:grid;place-items:center;min-height:100vh;padding:16px}
main{max-width:560px;background:#fffdf9;border:1px solid #e4d9cc;padding:32px}h1{font:500 30px Georgia,serif;margin:0 0 8px}
.fix{background:#f3ebe0;border-left:3px solid #80552a;padding:12px 14px;margin:18px 0}code{font-size:13px}small{color:#6f6258}</style></head>
<body><main><h1>We'll be right back</h1><p>The store is temporarily unavailable. Please try again in a few minutes.</p>
<div class="fix"><strong>For the site owner:</strong> ${esc(hint)}<br><small>Error code: <code>${esc(code)}</code> · last try ${esc(at)} · retrying every 30 seconds</small></div>
<small>After changing environment variables in hPanel, redeploy the app.</small></main></body></html>`;

async function startStore() {
  const db = openDatabase({ dataDir: config.dataDir, mysql: config.mysql });
  try {
    await db.load();
    const adminUser = await ensureAdmin(db);
    const media = createMediaStore({ dataDir: config.dataDir, r2: config.r2 });
    const siteStore = createSiteStore(db);
    await siteStore.load();
    const settingsStore = createSettingsStore(db);
    await settingsStore.load();
    return { db, media, adminUser, app: createApp(db, siteStore, settingsStore, media) };
  } catch (err) {
    await db.close().catch(() => {});
    throw err;
  }
}

function main() {
  let handler = null;
  let failure = null;
  let store = null;

  // One HTTP server for the whole life of the process; the handler is swapped once the store is up.
  const server = http.createServer((req, res) => {
    if (handler) return handler(req, res);
    const body = failure ? unavailablePage(failure.info, failure.at) : '<!doctype html><title>Starting…</title><meta http-equiv="refresh" content="3"><p>The store is starting, one moment…</p>';
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  server.listen(config.port, () => console.log(`Listening on port ${config.port}`));

  async function attempt() {
    try {
      store = await startStore();
      handler = store.app;
      failure = null;
      const { db, media, adminUser } = store;
      console.log(`Adirudra store running at http://localhost:${config.port}`);
      console.log(`Database:               ${db.driver === 'mysql' ? `MySQL (${config.mysql.database} on ${config.mysql.host})` : `JSON files in ${config.dataDir} (set DB_HOST etc. to use MySQL)`}`);
      console.log(`Product media:          ${media.driver === 'r2' ? 'Cloudflare R2' : `server disk (${media.localDir})`}`);
      console.log(`Admin panel:            http://localhost:${config.port}/admin${adminUser ? `  (admin phone: ${adminUser.phone})` : '  (no admin: set ADMIN_PHONE and ADMIN_PASSWORD in .env)'}`);
      console.log(`Online payments:        ${config.razorpay.enabled ? 'Razorpay enabled' : 'off (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to enable)'}`);
    } catch (err) {
      const info = explainStartupError(err);
      failure = { info, at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' };
      console.error(`Failed to start the store (${info.code}): ${info.hint}`);
      console.error(err);
      setTimeout(attempt, RETRY_MS).unref();
    }
  }
  attempt();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => (store ? store.db.close() : Promise.resolve()).finally(() => process.exit(0))));
  }
}

main();
