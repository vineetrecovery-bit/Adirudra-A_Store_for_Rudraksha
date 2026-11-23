// JSON-file driver: the same tables as MySQL (user groups, users, products, orders), held in
// memory and saved to JSON files in the data folder. Used when no MySQL database is configured,
// e.g. on your computer and in tests. One server process only.
import path from 'node:path';
import { createJsonFile } from './json-file.js';
import { GROUPS, normalizeProduct, normalizeUser, normalizeOrder } from '../shapes.js';
import { nowIst } from '../time.js';

const clone = (v) => structuredClone(v);

export function createJsonDb(dataDir, { seedProducts }) {
  const files = {
    products: createJsonFile(path.join(dataDir, 'products.json')),
    orders: createJsonFile(path.join(dataDir, 'orders.json')),
    users: createJsonFile(path.join(dataDir, 'users.json'))
  };
  const state = { products: [], orders: [], users: [] };
  const SETTING_FILES = { store: 'settings.json', site: 'site.json', site_history: 'site-history.json' };
  const settingFiles = new Map();
  const settingFile = (key) => {
    if (!/^[a-z_]+$/.test(key)) throw new Error(`Invalid setting key: ${key}`);
    if (!settingFiles.has(key)) settingFiles.set(key, createJsonFile(path.join(dataDir, SETTING_FILES[key] || `${key}.json`)));
    return settingFiles.get(key);
  };
  const persist = (name) => files[name].write(state[name]);
  const find = (name, id) => state[name].find((x) => x.id === id);

  async function load() {
    const products = await files.products.read();
    state.products = (products ?? (await seedProducts())).map(normalizeProduct);
    if (products === undefined) await persist('products');
    const orders = await files.orders.read();
    state.orders = (orders ?? []).map(normalizeOrder);
    if (orders === undefined) await persist('orders');
    state.users = ((await files.users.read()) ?? []).map(normalizeUser);
  }

  // Every read returns a copy, so callers can't change stored data without saving it.
  return {
    driver: 'json',
    load,
    close: async () => {},

    groups: {
      list: async () => clone(GROUPS)
    },

    // Settings: one JSON file per key (same file names as before the settings table existed).
    settings: {
      get: (key) => settingFile(key).read(),
      set: (key, value) => settingFile(key).write(value)
    },

    users: {
      list: async () => clone(state.users),
      get: async (id) => clone(find('users', id) ?? null),
      byPhone: async (phone) => clone(state.users.find((u) => u.phone === phone) ?? null),
      async create(user) {
        const u = normalizeUser(user);
        state.users.push(u);
        await persist('users');
        return clone(u);
      },
      async update(id, changes) {
        const u = find('users', id);
        if (!u) return null;
        Object.assign(u, changes, { updatedAt: nowIst() });
        await persist('users');
        return clone(u);
      }
    },

    products: {
      list: async () => clone(state.products),
      get: async (id) => clone(find('products', id) ?? null),
      async create(product) {
        const p = normalizeProduct(product);
        state.products.push(p);
        await persist('products');
        return clone(p);
      },
      async update(id, changes) {
        const p = find('products', id);
        if (!p) return null;
        Object.assign(p, normalizeProduct({ ...p, ...changes, updatedAt: nowIst() }));
        await persist('products');
        return clone(p);
      },
      async remove(id) {
        const i = state.products.findIndex((p) => p.id === id);
        if (i === -1) return false;
        state.products.splice(i, 1);
        await persist('products');
        return true;
      },
      // Takes stock for every line, or for none of them if any line is short.
      async reserveStock(lines) {
        const short = lines.find((l) => (find('products', l.id)?.stock ?? 0) < l.qty);
        if (short) return false;
        for (const l of lines) find('products', l.id).stock -= l.qty;
        await persist('products');
        return true;
      },
      async releaseStock(lines) {
        for (const l of lines) { const p = find('products', l.id); if (p) p.stock += l.qty; }
        await persist('products');
      }
    },

    orders: {
      list: async () => clone(state.orders),
      listByUser: async (userId) => clone(state.orders.filter((o) => o.userId === userId)),
      get: async (id) => clone(find('orders', id) ?? null),
      usesProduct: async (productId) => state.orders.some((o) => o.items.some((i) => i.id === productId)),
      async countByUser() {
        const counts = new Map();
        for (const o of state.orders) if (o.userId) counts.set(o.userId, (counts.get(o.userId) || 0) + 1);
        return counts;
      },
      async create(order) {
        const o = normalizeOrder(order);
        state.orders.unshift(o);
        await persist('orders');
        return clone(o);
      },
      async update(id, changes) {
        const o = find('orders', id);
        if (!o) return null;
        Object.assign(o, normalizeOrder({ ...o, ...changes, updatedAt: nowIst() }));
        await persist('orders');
        return clone(o);
      }
    }
  };
}
