# Adirudra Store: Architecture Handover

> For an LLM or developer picking up this codebase. Read this first, then `README.md` (user-facing setup and feature docs).
> Snapshot: 2026-11-28, last commit `fcae6e5` ("Require sign-in for the cart and add a wishlist").

## 1. What this is

An e-commerce store for **Adirudra Rudraksha**, selling Rudraksha beads, malas, bracelets and pendants in India. It has:
- a public **storefront** (shop, product, cart, wishlist, checkout, order page, account, login)
- a single-admin **admin panel** at `/admin` (orders, customers, products, store settings, website editor)
- **payments** through Razorpay (online), cash on delivery and WhatsApp orders
- **shipping** through Shiprocket (create order, AWB, pickup, label, tracking webhook)

All amounts are in INR, all times are IST, and phone numbers are 10-digit Indian mobiles.

## 2. Tech stack (deliberately minimal)

| Layer | Choice |
|---|---|
| Runtime | Node.js **>= 22.9**, ES modules (`"type": "module"`) |
| Server | Express 4 (the only runtime dependency besides `mysql2`) |
| DB | MySQL/MariaDB via `mysql2` in production, or **JSON files** when `DB_HOST` is unset (local dev and tests) |
| Frontend | Plain HTML, CSS and vanilla JS. **No framework, no bundler, no build step.** Each JS file is an IIFE that attaches globals (`window.Store`, `window.Site`) |
| Tests | `node:test` (`npm test`) in `test/store.test.js` |
| Hosting | **Hostinger** Node.js app (LiteSpeed `lsnode.js` runner) |
| Env | `.env` loaded with `node --env-file-if-exists=.env`. No dotenv package |

**Hard constraints:**
- **No top-level `await`** in `server.js` or `backend/server.js`. Hostinger loads the entry with `require()`, which fails on ESM files that use top-level await.
- The root `server.js` only exists so the host can find the entry point. It just imports `backend/server.js`.
- Keep dependencies near zero. Shiprocket and Razorpay are called with `fetch` and `crypto`, with no SDKs.

## 3. Repository layout

```
server.js                 Root entry (imports backend/server.js)
backend/
  server.js               Boot: open DB → ensureAdmin → load site + settings stores → createApp. If startup
                          fails, serves a 503 "we'll be right back" page with a plain-language hint and retries every 30s
  app.js                  ALL HTTP routes (public API, admin API, webhook), page rendering/theming, error handler
  config.js               Single mutable `config` object built from env vars (+ default coupons)
  settings.js             Admin-editable store settings (fees, contact, coupons). Saved to DB, then applied
                          IN PLACE onto `config.shop` / `config.coupons`
  pricing.js              quote(): the only place prices, discounts, shipping and COD fee are computed
  validate.js             validateCustomer / validateProduct, INDIAN_STATES
  auth.js                 scrypt passwords, HMAC-signed cookie sessions, in-memory rate limiters, ensureAdmin
  razorpay.js             Create a Razorpay order + verify the payment signature
  shiprocket.js           Shiprocket REST client: ship (resumable multi-step), track, cancel; status mapping
  site.js                 Website theme/content DEFAULTS, validateSite, themeCss, fontsUrl, version history store
  uploads.js              Product media upload check (detects file type from magic bytes; SVG rejected)
database/
  index.js                What the backend imports: openDatabase() picks the MySQL or JSON driver
  shapes.js               normalizeProduct/User/Order/Media: the canonical record shapes for both drivers
  time.js                 toIst()/nowIst(): every timestamp is an IST ISO string "...+05:30"
  documents.js            Key/value docs in the `settings` table: store, site, site_history
  mysql/schema.sql        5 tables, auto-applied on start (IF NOT EXISTS)
  mysql/db.js             MySQL driver (row <-> shape mapping, transactional stock reservation)
  mysql/import-json.js    `npm run db:import`: copies JSON data into MySQL (re-runnable)
  json/db.js, json-file.js  JSON driver: in memory + files, single process only
  media/                  Product media storage: local.js (disk, in use now), r2.js (Cloudflare R2 STUB, not implemented)
  seed-products.json      Starting catalogue, loaded into an empty products table
  data/                   Live JSON data + uploads (gitignored). Override with DATA_DIR
frontend/
  *.html                  One file per page: index, shop, product, cart, wishlist, checkout, order, account, login, admin, 404
  js/store.js             Shared storefront core → window.Store (api client, Cart, Wishlist, Auth, header/footer, product cards, toast, Razorpay)
  js/site.js              Applies window.SITE content to the DOM (data-site bindings, lists, section order)
  js/motion.js            Opening intro animation (Shiva line drawing → tear → rudraksha), scroll reveals
  js/{shop,product,cart,checkout,account,login}.js   Per-page logic
  js/admin.js, admin-settings.js, admin-site.js      Admin panel (orders/products/customers, settings, website editor)
  css/styles.css, motion.css, admin.css
  assets/                 logo.png (brand mark, transparent), logo-full.png, favicon.png, apple-touch-icon.png, logo-source.jpg (original artwork), hero-rudraksha.jpg (site images are part of the code, not uploads)
test/store.test.js        API + pricing + auth + Shiprocket (mocked fetch) tests, using the JSON driver in a temp dir
```

## 4. Request flow and the server-side page rendering

`createApp(db, siteStore, settingsStore, media, shiprocket)` in `backend/app.js` wires up the following, in order:
1. JSON body parser (100kb) and basic security headers (`nosniff`, `SAMEORIGIN`, referrer policy).
2. `/api/admin/*`: admin router. `/api/admin/me` is public. Everything after it needs `requireAdmin`.
3. `/api/*`: public router, then a JSON 404.
4. `/uploads/*`: locally stored product media (static, 30d immutable, strict CSP).
5. **Themed pages:** any `/<name>` or `/<name>.html` (except `admin`) is read from `frontend/<name>.html` and rendered with:
   - `<style id="site-theme">` holding the CSS variables from `themeCss(site.theme)`
   - `<script>window.SITE=…;window.SHOP=…</script>` (site content + fee amounts, escaped with `safeJson`)
   - the Google Fonts URL swapped for the chosen fonts, plus the SEO title/description on `index`
   - Pages are cached only when `NODE_ENV=production`.
   - **`admin.html` is never themed**, so a bad colour choice can't lock the admin out.
6. Static files from `frontend/`, then a themed 404 page.
7. Error handler: `PricingError` → its status; JSON parse errors → 400; too large → 413; anything else → 500 with a generic message.

Async handlers are wrapped with `route(fn)` so rejected promises reach the error middleware. **Use `route()` for every new async handler.**

## 5. Data model

There are five tables (see `database/mysql/schema.sql`). Both drivers return the **same JS shapes** defined in `database/shapes.js`, using camelCase. MySQL columns are snake_case and are mapped in `mysql/db.js`.

| Table | Key points |
|---|---|
| `user_groups` | Fixed: `1 admin`, `2 user` |
| `users` | `id`, `name`, `phone` (unique, 10 digits), `role` (from group_id), `passwordHash` (`scrypt$salt$hash`) |
| `products` | `id` like `AR-001` (auto-increments from the max number), `sku` (unique), `slug`, `mukhi`, `type` (Loose Bead/Mala/Bracelet/Pendant), `price`, `stock`, `active` (false = hidden), `featured`, `certified`, `media[]` (JSON), shipping fields `hsnCode`, `weightGrams`, `lengthCm/breadthCm/heightCm` |
| `orders` | `id` like `ADR-261128-AB12CD` (IST date), `token` (private link), `userId`, `status`, `payment`, `paymentStatus`, `customer{}`, `items[]` (with copies of sku/hsn/weight taken at order time), totals, `package{}`, `shipment{}` (Shiprocket fields), `history[]` (`{at,status,note}`), `stockRestored` |
| `settings` | Key/value JSON: `store`, `site`, `site_history` (last 15 versions) |

**Enums (in `app.js`):**
- order `status`: `pending | confirmed | shipped | delivered | cancelled`
- `paymentStatus`: `unpaid | paid | cod | refunded`
- `payment` method: `upi` (Razorpay online) | `cod` | `whatsapp`

**DB driver interface** (implement every method if you add a driver):
```
driver, load(), close()
groups.list()
settings.get(key), settings.set(key, value)
users.list/get/byPhone/create/update
products.list/get/create/update/remove/reserveStock(lines)->bool/releaseStock(lines)
orders.list/listByUser/get/usesProduct/countByUser/create/update
```
`reserveStock` must be all-or-nothing (a transaction in MySQL), so two buyers can't both get the last item. A test covers this.

**Media item shape:** `{ id, type: 'image'|'video', url, storage: 'local'|'r2'|'external', key, mime, size }`. A product stores URLs only. Files are deleted when no product references them any more.

## 6. Core business rules

- **The server is the source of truth for prices.** The browser sends only `{id, qty}`. `POST /api/quote` previews the cart and `POST /api/orders` re-quotes with `strict: true`. Never trust prices from the client.
- **Pricing (`pricing.js`):** merge duplicate lines → cap at `min(stock, maxQtyPerItem)` → subtotal → coupon (percent or flat, optional minimum) → shipping is free when (subtotal − discount) ≥ `freeShippingOver`, otherwise `shippingFee` → `codFee` is added for COD.
- **Order placement:** needs sign-in → validate the customer → strict quote → reserve stock → (for `upi` with Razorpay enabled) create a Razorpay order → save. Stock is released if a later step fails.
  - COD → `confirmed` / `cod`. UPI and WhatsApp → `pending` / `unpaid`.
- **Payment:** `POST /api/orders/:id/pay` verifies the Razorpay HMAC signature, then marks the order `paid` + `confirmed`. The order page offers "Pay now" again if the customer abandoned the payment.
- **Order access:** the token (constant-time compare), the owning account, or the admin. Anyone else gets a 404, never a 403.
- **Cancel (admin):** cancels on Shiprocket if a shipment exists and restores stock once (`stockRestored`). A cancelled order can't be reopened.
- **Product delete:** if the product appears in any order, it is archived (`active:false`) instead of deleted.
- **Shipping (`shiprocket.js`):** `ship(order, save)` runs the steps create adhoc order → assign AWB → generate pickup → generate label, and calls `save(shipment)` after each step. Pressing the button again resumes where it stopped. The order must be confirmed and `paid` or `cod`. The webhook `POST /api/delivery-updates` checks the `x-api-key` header against `SHIPROCKET_WEBHOOK_TOKEN` and maps courier status text to `shipped`/`delivered` through `orderStatusFor`. (The path avoids the word "shiprocket" because Shiprocket rejects webhook URLs that contain it.) The Shiprocket API token is cached for about 9 days.
- **Settings precedence:** `.env`/`config.js` give the defaults. Once Admin → Settings is saved, the DB `store` doc wins and is applied onto the shared `config` object, so it takes effect immediately with no restart. Code that reads `config.shop.*` or `config.coupons` therefore always sees the current values. Coupons are never sent to the browser.

## 7. Auth

- Two roles. **Exactly one admin**, created and updated on every boot from `ADMIN_PHONE` + `ADMIN_PASSWORD` (`ensureAdmin`). Changing `ADMIN_PHONE` demotes the old admin to a customer. Nobody can sign up with the admin's number.
- Customers sign up with name, phone (`[6-9]\d{9}`) and a password of at least 8 characters. Phone numbers are normalised (`+91`/`0` prefixes stripped).
- Session cookie `adr_session` = `userId.exp.HMAC(userId.exp.passwordHash)`, httpOnly, sameSite strict, secure in production. Customer sessions last 30 days and admin sessions 12 hours. Changing a password invalidates every old session.
- Without `SESSION_SECRET`, a random secret is generated, so everyone is logged out on restart.
- Rate limits are **in memory**, per IP and per phone, over a 15-minute window. They reset on restart and are not shared across processes.
- Middleware from `createAuth(db)`: `currentUser`, `requireUser` (sets `req.user`), `requireAdmin`.

## 8. Frontend conventions

- Every storefront page loads `motion.js` (in `<head>`), then `site.js`, then `store.js`, then its own page script. The `<body data-page="…">` attribute identifies the page.
- `store.js` exposes `window.Store`: `api(path, {method, body})` (throws `ApiError` with `.status`/`.body`), `onReady`, `Cart`, `Wishlist`, `Auth`, `requireSignIn`, `productCard`, `toast`, `money`, `esc`, `$`, `$$`, `payWithRazorpay`, `whatsappLink`, and more. It renders the header and footer into `#site-header` / the footer container.
- **The cart and wishlist live in localStorage, keyed per account** (`adirudra_cart_<userId>`, `adirudra_wishlist_<userId>`). Guests have neither: adding an item sends them to `/login?…` and brings them back afterwards.
- **Editable text:** elements marked `data-site="hero.title"`, `data-site-href`, `data-site-bg` and `data-list="faq.items"` are filled by `site.js` from `window.SITE`. Placeholders `{freeShippingOver}`, `{shippingFee}` and `{codFee}` (plus `{name}`, `{email}`, `{phone}` and `{total}` on the order page) are substituted. **New editable copy must be added to `DEFAULTS` in `backend/site.js` (validation is shape-based against DEFAULTS), to the admin editor in `admin-site.js`, and to the HTML with a `data-site` attribute.**
- Theme: 10 base colours become CSS variables, and other shades are blended from them. Fonts come from the allowlists `HEADING_FONTS` / `BODY_FONTS`. Links must be safe (relative, `#`, or https).
- Shop sort menu: `pages.shop.sort` in the site settings is a list of `{id, label, enabled}` over the fixed ids in `SORT_OPTIONS` (`backend/site.js`), matching `sorters` in `frontend/js/shop.js`. Validation drops unknown ids and appends missing ones, and at least one must stay enabled. The first enabled option is the default sort. To add a sort, add it to both places. Shop filters work the same way: `pages.shop.filters` over `FILTER_OPTIONS` (search, type, origin, rarity, price), applied in `renderFilters()` in `shop.js` through `data-filter` attributes in `shop.html`. Zero enabled filters is allowed. Hiding a filter only hides its UI; URL params still apply.
- Admin live preview loads storefront pages with `?preview=1`. Motion is disabled there. `?intro` on any page replays the opening intro.
- Always escape HTML with `esc()` when interpolating into templates.

## 9. API summary

Public: `GET /api/config`, `GET /api/products[/:id]`, `POST /api/quote`, `POST /api/auth/{signup,login,logout}`, `GET /api/auth/me`, `GET /api/account/orders` (user), `POST /api/orders` (user), `GET /api/orders/:id?token=`, `POST /api/orders/:id/pay`, `POST /api/delivery-updates` (webhook).

Admin (`/api/admin`): `GET me`, `GET users`, `GET groups`, `GET orders`, `PATCH orders/:id` (`status`, `paymentStatus`, `note`), `POST orders/:id/ship`, `POST orders/:id/track`, `GET|POST products`, `PATCH|DELETE products/:id`, `POST media` (raw body upload), `GET|PUT settings`, `GET|PUT site`, `POST site/restore`, `POST site/reset`.

Errors are always `{ error: string, fields?: {name: message} }` (or `field` for settings/site).

## 10. Environment variables

See `.env.example`. The important ones are:
`PORT`, `NODE_ENV`, `DATA_DIR`, `DB_HOST/PORT/NAME/USER/PASSWORD` (`DB_SSL`), `ADMIN_PHONE`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `RAZORPAY_KEY_ID/SECRET`, `SHIPROCKET_EMAIL/PASSWORD/PICKUP_LOCATION/WEBHOOK_TOKEN`, `SHIP_*` (parcel defaults), `R2_*` (unused until R2 is implemented), `MAX_VIDEO_MB`, `WHATSAPP_NUMBER`, `STORE_EMAIL`, `FREE_SHIPPING_OVER`, `SHIPPING_FEE`, `COD_FEE`.
Tests can target MySQL with `TEST_DB_HOST/NAME/USER/PASSWORD`.

## 11. Running and testing

```sh
npm install
cp .env.example .env     # set ADMIN_PHONE + ADMIN_PASSWORD at minimum
npm run dev              # node --watch; http://localhost:3000, admin at /admin
npm test                 # node:test, JSON driver in a temp dir, Shiprocket/Razorpay mocked
```
Run `npm test` after any backend change. The tests exercise the real Express app over HTTP.

## 12. Working conventions for this repo

- **Git:** work and commit directly on `main`. Don't create branches unless asked. Remotes: `origin` (vineetrecovery-bit/Adirudra-A_Store_for_Rudraksha) and `jhalak` (Jhalak6104/Adirudra).
- Commit messages are short, plain-English sentences describing the user-visible change (e.g. "Ship orders with Shiprocket from the admin, with tracking for customers").
- Comments and user-facing text are plain, friendly English with no jargon. Error messages tell the user what to do.
- Keep the README up to date when features, routes or env vars change.
- Keep the two DB drivers in sync. Any new field goes into `shapes.js` (with a default), `schema.sql`, the column mapping in `mysql/db.js`, and `import-json.js` if relevant. The MySQL schema only uses `CREATE TABLE IF NOT EXISTS`, so **adding a column to an existing table needs an explicit migration**. There is no migration system yet: `load()` in `mysql/db.js` only runs `schema.sql`, syncs `user_groups` and seeds products. Add a guarded `ALTER TABLE … ADD COLUMN` there, or document a manual step for phpMyAdmin.

## 13. Known gaps and TODOs

- **Cloudflare R2 isn't implemented.** `database/media/r2.js` is a stub that throws. Leave the `R2_*` variables empty until it is written.
- **There is no Razorpay webhook** (`payment.captured`). Payment confirmation depends on the browser callback.
- **There are no emails or notifications** for orders. Nodemailer or Resend are the suggested options.
- **Unpaid online orders keep their stock reserved** until the admin cancels them. Nothing expires them automatically.
- Rate limits and the JSON driver assume **a single process**.
- `orders.usesProduct` in MySQL uses a `LIKE` match on the items JSON.
- There is no CSRF token. The app relies on `sameSite: 'strict'` cookies plus JSON bodies.
- The opening intro (`motion.js`) is a hand-drawn SVG path animation of Shiva whose tear becomes a rudraksha. It has been iterated on many times, so make small, careful edits to it.
