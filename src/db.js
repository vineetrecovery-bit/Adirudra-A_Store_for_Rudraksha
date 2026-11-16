// Tiny JSON-file database. Data is held in memory and written to disk atomically
// (write to a temp file, then rename) through a single queue so writes never interleave.
// Good for a single-server shop; swap this module for Postgres/SQLite when you outgrow it.
import { readFile, writeFile, rename, copyFile, access, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function createDb(dataDir) {
  const files = {
    products: path.join(dataDir, 'products.json'),
    orders: path.join(dataDir, 'orders.json')
  };
  const state = { products: [], orders: [] };
  let queue = Promise.resolve();

  async function exists(file) {
    try { await access(file); return true; } catch { return false; }
  }

  async function load() {
    await mkdir(dataDir, { recursive: true });
    if (!(await exists(files.products))) await copyFile(path.join(dataDir, 'seed-products.json'), files.products);
    if (!(await exists(files.orders))) await writeFile(files.orders, '[]\n');
    state.products = JSON.parse(await readFile(files.products, 'utf8'));
    state.orders = JSON.parse(await readFile(files.orders, 'utf8'));
  }

  function persist(name) {
    const snapshot = JSON.stringify(state[name], null, 2) + '\n';
    queue = queue.then(async () => {
      const tmp = `${files[name]}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, files[name]);
    });
    return queue;
  }

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
    }
  };
}
