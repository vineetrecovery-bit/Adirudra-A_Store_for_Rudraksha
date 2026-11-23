// Everything the backend needs from storage, in one place.
//   - Tables (user groups, users, products, orders, settings): MySQL when DB_HOST/DB_NAME are set,
//     otherwise JSON files in the data folder (handy on your computer and in tests).
//   - Product photos/videos: media storage (disk now, Cloudflare R2 later), see media/.
//   - Store settings and website content: the settings table, see documents.js.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonDb } from './json/db.js';
import { createMysqlDb } from './mysql/db.js';

export { createDocuments } from './documents.js';
export { createMediaStore } from './media/index.js';

// Starting catalogue, loaded the first time the store runs with an empty products table.
export const SEED_PRODUCTS = fileURLToPath(new URL('./seed-products.json', import.meta.url));
const seedProducts = async () => JSON.parse(await readFile(SEED_PRODUCTS, 'utf8'));

export const mysqlConfigured = (mysql) => Boolean(mysql && mysql.host && mysql.database && mysql.user);

/** Opens the tables with the right driver. Call `await db.load()` before use. */
export function openDatabase({ dataDir, mysql }) {
  return mysqlConfigured(mysql)
    ? createMysqlDb(mysql, { seedProducts })
    : createJsonDb(dataDir, { seedProducts });
}

const DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url));
// Before the frontend/backend/database split, data lived in <project>/data.
const LEGACY_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// The folder that holds JSON data and local uploads. Set DATA_DIR in .env to keep it anywhere
// else (recommended on a host that redeploys from git, so deploys can't touch it).
export function defaultDataDir() {
  const hasData = (dir) => existsSync(path.join(dir, 'products.json')) || existsSync(path.join(dir, 'orders.json'));
  if (!hasData(DATA_DIR) && hasData(LEGACY_DATA_DIR)) {
    console.warn(`Using existing data in ${LEGACY_DATA_DIR}. Move it to ${DATA_DIR} or set DATA_DIR.`);
    return LEGACY_DATA_DIR;
  }
  return DATA_DIR;
}
