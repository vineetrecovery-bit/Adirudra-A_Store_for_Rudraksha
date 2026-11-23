// Everything the backend needs from storage, in one place.
// Today this is JSON files in a data folder. To move to Postgres, MySQL or similar,
// re-implement these modules with the same functions; the backend doesn't change.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { createDb, SEED_PRODUCTS } from './db.js';
export { createDocuments } from './documents.js';
export { saveFile, uploadsDir } from './files.js';

const DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url));
// Before the frontend/backend/database split, data lived in <project>/data.
const LEGACY_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// The folder that holds live data. Set DATA_DIR in .env to keep it anywhere else
// (recommended on a host that redeploys from git, so deploys can't touch it).
export function defaultDataDir() {
  const hasData = (dir) => existsSync(path.join(dir, 'products.json')) || existsSync(path.join(dir, 'orders.json'));
  if (!hasData(DATA_DIR) && hasData(LEGACY_DATA_DIR)) {
    console.warn(`Using existing data in ${LEGACY_DATA_DIR}. Move it to ${DATA_DIR} or set DATA_DIR.`);
    return LEGACY_DATA_DIR;
  }
  return DATA_DIR;
}
