// Entry point: open the database, start the HTTP server.
// No top-level await here: Hostinger's LiteSpeed runner (lsnode.js) loads this
// file with require(), which fails on ES modules that use top-level await.
import { config } from './config.js';
import { openDatabase, createMediaStore } from '../database/index.js';
import { createApp } from './app.js';
import { createSiteStore } from './site.js';
import { createSettingsStore } from './settings.js';
import { ensureAdmin } from './auth.js';

async function main() {
  const db = openDatabase({ dataDir: config.dataDir, mysql: config.mysql });
  await db.load();
  const adminUser = await ensureAdmin(db);
  const media = createMediaStore({ dataDir: config.dataDir, r2: config.r2 });

  const siteStore = createSiteStore(db);
  await siteStore.load();

  const settingsStore = createSettingsStore(db);
  await settingsStore.load();

  const app = createApp(db, siteStore, settingsStore, media);
  const server = app.listen(config.port, () => {
    console.log(`Adirudra store running at http://localhost:${config.port}`);
    console.log(`Database:               ${db.driver === 'mysql' ? `MySQL (${config.mysql.database} on ${config.mysql.host})` : `JSON files in ${config.dataDir} (set DB_HOST etc. to use MySQL)`}`);
    console.log(`Product media:          ${media.driver === 'r2' ? 'Cloudflare R2' : `server disk (${media.localDir})`}`);
    console.log(`Admin panel:            http://localhost:${config.port}/admin${adminUser ? `  (admin phone: ${adminUser.phone})` : '  (no admin: set ADMIN_PHONE and ADMIN_PASSWORD in .env)'}`);
    console.log(`Online payments:        ${config.razorpay.enabled ? 'Razorpay enabled' : 'off (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to enable)'}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => db.close().finally(() => process.exit(0))));
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
