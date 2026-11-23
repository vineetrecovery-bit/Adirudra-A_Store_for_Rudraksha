// One-time import: copies products, user accounts, orders and settings (store settings, website
// content, website version history) from the JSON data folder into MySQL.
// Safe to run more than once: records already in MySQL are skipped.
//
//   npm run db:import            (uses DB_* and DATA_DIR from .env)
import { config } from '../../backend/config.js';
import { openDatabase, mysqlConfigured } from '../index.js';
import { SETTING_KEYS } from '../documents.js';

async function main() {
  if (!mysqlConfigured(config.mysql)) {
    console.error('Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD first (in .env or the host\'s environment variables).');
    process.exit(1);
  }
  const source = openDatabase({ dataDir: config.dataDir, mysql: null });
  const target = openDatabase({ dataDir: config.dataDir, mysql: config.mysql });
  await source.load();
  await target.load(); // creates the tables if needed

  const counts = { products: 0, users: 0, orders: 0, settings: 0, skipped: 0 };

  for (const key of Object.values(SETTING_KEYS)) {
    const value = await source.settings.get(key);
    if (value === undefined) continue;
    if ((await target.settings.get(key)) !== undefined) { counts.skipped++; continue; }
    await target.settings.set(key, value);
    counts.settings++;
  }

  // The target may already hold the seed catalogue; JSON products replace those seed rows.
  for (const p of await source.products.list()) {
    if (await target.products.get(p.id)) await target.products.update(p.id, p);
    else await target.products.create(p);
    counts.products++;
  }
  for (const u of await source.users.list()) {
    if (await target.users.get(u.id) || await target.users.byPhone(u.phone)) { counts.skipped++; continue; }
    await target.users.create(u);
    counts.users++;
  }
  const userIds = new Set((await target.users.list()).map((u) => u.id));
  // Oldest first, so created_at order matches the original.
  for (const o of (await source.orders.list()).reverse()) {
    if (await target.orders.get(o.id)) { counts.skipped++; continue; }
    await target.orders.create({ ...o, userId: userIds.has(o.userId) ? o.userId : null });
    counts.orders++;
  }

  console.log(`Imported from ${config.dataDir} into MySQL ${config.mysql.database}:`);
  console.log(`  ${counts.products} products, ${counts.users} accounts, ${counts.orders} orders, ${counts.settings} settings (${counts.skipped} already there, skipped)`);
  await target.close();
}

main().catch((err) => { console.error('Import failed:', err.message); process.exit(1); });
