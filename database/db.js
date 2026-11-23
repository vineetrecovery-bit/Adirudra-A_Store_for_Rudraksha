// Products, orders and user accounts. Data is held in memory and saved to JSON files in the data folder.
// Good for a single-server shop; swap this module for Postgres/SQLite when you outgrow it.
// The rest of the app only uses the small interface returned by createDb().
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonFile } from './json-file.js';

// Starting catalogue, copied in the first time the store runs.
export const SEED_PRODUCTS = fileURLToPath(new URL('./seed-products.json', import.meta.url));

export function createDb(dataDir) {
  const files = {
    products: createJsonFile(path.join(dataDir, 'products.json')),
    orders: createJsonFile(path.join(dataDir, 'orders.json')),
    users: createJsonFile(path.join(dataDir, 'users.json'))
  };
  const state = { products: [], orders: [], users: [] };

  async function load() {
    const products = await files.products.read();
    if (products === undefined) {
      state.products = await createJsonFile(SEED_PRODUCTS).read([]);
      await files.products.write(state.products);
    } else {
      state.products = products;
    }

    const orders = await files.orders.read();
    state.orders = orders ?? [];
    if (orders === undefined) await files.orders.write(state.orders);

    state.users = (await files.users.read()) ?? [];
  }

  const persist = (name) => files[name].write(state[name]);

  return {
    load,
    products: {
      all: () => state.products,
      get: (id) => state.products.find((p) => p.id === id),
      async create(product) { state.products.push(product); await persist('products'); return product; },
      async update(id, changes) {
        const p = state.products.find((x) => x.id === id);
        if (!p) return null;
        Object.assign(p, changes);
        await persist('products');
        return p;
      },
      async remove(id) {
        const i = state.products.findIndex((p) => p.id === id);
        if (i === -1) return false;
        state.products.splice(i, 1);
        await persist('products');
        return true;
      },
      save: () => persist('products')
    },
    orders: {
      all: () => state.orders,
      get: (id) => state.orders.find((o) => o.id === id),
      findBy: (fn) => state.orders.find(fn),
      async create(order) { state.orders.unshift(order); await persist('orders'); return order; },
      async update(id, changes) {
        const o = state.orders.find((x) => x.id === id);
        if (!o) return null;
        Object.assign(o, changes, { updatedAt: new Date().toISOString() });
        await persist('orders');
        return o;
      }
    },
    // { id, name, phone, role: 'admin' | 'user', passwordHash, createdAt, updatedAt }
    users: {
      all: () => state.users,
      get: (id) => state.users.find((u) => u.id === id),
      byPhone: (phone) => state.users.find((u) => u.phone === phone),
      async create(user) { state.users.push(user); await persist('users'); return user; },
      async update(id, changes) {
        const u = state.users.find((x) => x.id === id);
        if (!u) return null;
        Object.assign(u, changes, { updatedAt: new Date().toISOString() });
        await persist('users');
        return u;
      }
    }
  };
}
