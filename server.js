// Entry point: load data, start the HTTP server.
import { config } from './src/config.js';
import { createDb } from './src/db.js';
import { createApp } from './src/app.js';
import { createSiteStore } from './src/site.js';
import { createSettingsStore } from './src/settings.js';

const db = createDb(config.dataDir);
await db.load();
const siteStore = createSiteStore(config.dataDir);
await siteStore.load();

const settingsStore = createSettingsStore(config.dataDir);
await settingsStore.load();

const app = createApp(db, siteStore, settingsStore);
const server = app.listen(config.port, () => {
  console.log(`Adirudra store running at http://localhost:${config.port}`);
  console.log(`Admin panel:            http://localhost:${config.port}/admin${config.admin.password ? '' : '  (disabled: set ADMIN_PASSWORD in .env)'}`);
  console.log(`Online payments:        ${config.razorpay.enabled ? 'Razorpay enabled' : 'off (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to enable)'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
