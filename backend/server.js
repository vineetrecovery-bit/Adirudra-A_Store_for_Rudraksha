// Entry point: load data, start the HTTP server.
// No top-level await here: Hostinger's LiteSpeed runner (lsnode.js) loads this
// file with require(), which fails on ES modules that use top-level await.
import { config } from './config.js';
import { createDb } from '../database/index.js';
import { createApp } from './app.js';
import { createSiteStore } from './site.js';
import { createSettingsStore } from './settings.js';
import { ensureAdmin } from './auth.js';

async function main() {
  const db = createDb(config.dataDir);
  await db.load();
  const adminUser = await ensureAdmin(db);

  const siteStore = createSiteStore(config.dataDir);
  await siteStore.load();

  const settingsStore = createSettingsStore(config.dataDir);
  await settingsStore.load();

  const app = createApp(db, siteStore, settingsStore);
  const server = app.listen(config.port, () => {
    console.log(`Adirudra store running at http://localhost:${config.port}`);
    console.log(`Admin panel:            http://localhost:${config.port}/admin${adminUser ? `  (admin phone: ${adminUser.phone})` : '  (no admin: set ADMIN_PHONE and ADMIN_PASSWORD in .env)'}`);
    console.log(`Online payments:        ${config.razorpay.enabled ? 'Razorpay enabled' : 'off (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to enable)'}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
