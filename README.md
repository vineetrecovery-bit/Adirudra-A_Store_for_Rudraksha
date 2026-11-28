# Adirudra store

An e-commerce store for Adirudra Rudraksha, built with **Node.js + Express**. The storefront uses the colour palette and fonts from the Adirudra catalogue.

## Quick start

Needs Node.js 22.9 or newer.

```sh
npm install
cp .env.example .env      # then set ADMIN_PHONE + ADMIN_PASSWORD (and Razorpay keys if you have them)
npm start                 # or: npm run dev   (restarts on file changes)
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin
- Tests: `npm test`

## How it works

```
server.js              Entry point (loads backend/server.js; kept at the root for Hostinger)

frontend/              Storefront + admin panel (HTML/CSS/JS, no build step)

backend/               Express server and business logic
  server.js            Loads the data, starts the HTTP server
  app.js               API routes + serves the frontend
  config.js            Settings from .env, coupon codes
  pricing.js           Cart pricing: discounts, shipping, COD fee (server is the source of truth)
  validate.js          Customer + product validation
  razorpay.js          Razorpay order creation + signature verification
  shiprocket.js        Shiprocket: create shipment, assign courier (AWB), pickup, label, tracking
  settings.js          Store settings edited in the admin (fees, contact, coupons)
  site.js              Website theme + content, validation, version history
  uploads.js           Product photo/video upload checks
  auth.js              Accounts: admin + customer groups, phone/password sign-in, sessions, rate limits

database/              All storage
  index.js             What the backend imports; picks MySQL or JSON files
  shapes.js            The shape of a group, user, product and order record
  mysql/schema.sql     The 5 MySQL tables (created automatically on start)
  mysql/db.js          MySQL / MariaDB driver
  mysql/import-json.js One-time copy of JSON data into MySQL (npm run db:import)
  json/db.js           JSON-file driver (same tables, for your computer and tests)
  media/               Product photos/videos: local disk now, Cloudflare R2 later (r2.js)
  documents.js         Store settings, website content, version history (JSON files)
  seed-products.json   Starting catalogue, loaded into an empty products table
  data/                Live data (not in git): JSON files, local product media
test/                  API and pricing tests (node:test)
```

## Database

Five MySQL tables (see `database/mysql/schema.sql`), created automatically when the server starts. **All times are Indian Standard Time (IST, UTC+05:30)**, both in MySQL (what phpMyAdmin shows) and in the app, and order IDs carry the Indian date.

| Table | Holds |
|---|---|
| `user_groups` | `admin` (one account) and `user` (customers) |
| `users` | Name, unique mobile number, group, password hash |
| `products` | Catalogue, stock, the list of photos/videos (`media`), and shipping details: SKU, HSN code, weight (g), packed size (cm) |
| `orders` | Everything about an order: the account, customer name/phone/email, billing and shipping address, items (with SKU, HSN, weight), amounts, payment, parcel weight and size, and the Shiprocket shipment (order/shipment ID, AWB, courier, status, tracking and label links) |
| `settings` | One JSON value per key: `store` (fees, contact, coupons from Admin → Settings), `site` (website theme and text), `site_history` (last 15 published versions) |

**Set it up on Hostinger:** hPanel → Databases → MySQL Databases → create a database and user. Then set `DB_HOST=localhost`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` in the Node.js app's environment variables and restart. Copy existing JSON data in once with `npm run db:import` (safe to re-run).

Without `DB_HOST`, the same tables are kept as JSON files in the data folder, which is handy for local work. Tests run on JSON files; set `TEST_DB_HOST`, `TEST_DB_NAME`, `TEST_DB_USER` and `TEST_DB_PASSWORD` to run them against an empty MySQL database instead.

Locally uploaded product media stays in the data folder (`<data folder>/uploads`). Set `DATA_DIR` to a folder outside the project so redeploys can't remove it.

**Images and videos:** website images (logo, hero background) are part of the code in `frontend/assets/`. Product photos and videos are uploaded from Admin → Products and saved by the media store: the server's disk (`<data folder>/uploads`) for now, Cloudflare R2 once `database/media/r2.js` is written and the `R2_*` settings are filled in. Products only store each file's URL.

### Accounts and user groups
There are two groups, and everyone signs in with **mobile number + password** at `/login`:
- **Admin:** exactly one account, created from `ADMIN_PHONE` and `ADMIN_PASSWORD` in `.env` when the server starts. Only this account can open `/admin`. Changing `ADMIN_PHONE` moves admin rights to that number, and the old admin becomes a normal customer. Changing `ADMIN_PASSWORD` signs the admin out everywhere. Nobody can sign up with the admin's number.
- **Customers:** anyone can create an account on the website (name, mobile number, password of 8+ characters). Customers can't open the admin panel. **My account** (`/account`) shows their orders.

Passwords are stored as salted scrypt hashes in the `users` table. Sessions are signed httpOnly cookies (30 days for customers, 12 hours for the admin). Sign-in and sign-up are rate-limited.

### Customer flow
1. Products load from `GET /api/products`. Adding to the cart or the wishlist needs a signed-in account: signed-out visitors are sent to `/login` and come back afterwards. The cart (IDs + quantities only) and the wishlist (`/wishlist`, product IDs) are kept in the browser, saved separately for each account, so the next person on the same browser doesn't see them.
2. The cart and checkout call `POST /api/quote`, so every price, discount and fee is computed on the server.
3. Checkout needs a signed-in account: signed-out visitors are sent to `/login` and come back afterwards, with their name and phone pre-filled. `POST /api/orders` validates the customer details, re-prices the cart, reserves stock and saves the order against the account. It returns an order ID and a private token. The confirmation page uses the token to show the order.
4. Payment options:
   - **Online (Razorpay):** opens Razorpay Checkout. The server verifies the payment signature before marking the order paid. If the customer closes the payment window, the order page shows a "Pay now" button.
   - **Cash on delivery:** the order is confirmed straight away (₹49 fee).
   - **WhatsApp:** the order is saved and a pre-filled WhatsApp message opens.

### Admin (`/admin`)
Sign in with the admin account's mobile number and password.
- **Customers:** every registered account with its mobile number, join date and number of orders.
- **Orders:** search, filter by status, totals at a glance, full order details, change status or payment status, and add notes such as tracking numbers. Cancelling an order puts its items back in stock (and cancels it on Shiprocket if it was sent there).
- **Shipping (Shiprocket):** open a confirmed order that is paid or COD and press **Ship with Shiprocket**. It creates the order in Shiprocket, assigns the recommended courier (AWB), books a pickup and makes the label (**Print label**). If a step fails (for example a low Shiprocket wallet), press the button again; finished steps are skipped. The customer sees the courier, AWB and a tracking link on their order page. Courier updates arrive by webhook (see Configuration) and move the order to Shipped and Delivered; **Refresh status** checks Shiprocket by hand.
- **Settings:** free-shipping threshold, shipping fee, cash-on-delivery fee, max quantity per product, WhatsApp number, store email, and coupon codes (add, edit, pause or remove; % or ₹ off, optional minimum order). Changes apply to new orders immediately, no restart needed. They're saved in the `settings` table (key `store`); the `.env` values are only the starting defaults.
- **Products:** add, edit or delete products. Price, stock, featured and visibility can be edited directly in the table. Each product can have up to 12 photos and videos (upload or https:// link; reorder them, the first photo is the card image) and shipping details (SKU, HSN, weight, packed size). A product that appears in past orders is hidden instead of deleted.

### Website editor (`/admin` → Website)
Edit the storefront's look and content with a live preview, then press **Publish**:
- **Colours & fonts:** 10 base colours (all other shades are blended from these), 5 ready-made palettes, heading and body fonts from a curated Google Fonts list, and corner rounding. A readability check warns when text colours are too hard to read.
- **Content:** brand name and logo, an announcement bar, the header menu labels, the hero banner (text, links, background image), trust badges, the category, featured, authenticity and FAQ sections (add, remove and reorder items, and where their links go), the footer (text, column headings and link labels), and the SEO title and description.
- **Other pages:** the text on the shop, product, cart, checkout, order-confirmation and 404 pages. Leave a menu or footer link label empty to hide that link.
- **Amounts in text:** write `{freeShippingOver}`, `{shippingFee}` or `{codFee}` in any text to show the current amount from Admin → Settings. Order-page text can also use `{name}`, `{email}`, `{phone}` and `{total}`.
- **Layout:** show, hide or reorder the homepage sections.
- **Images:** the logo and hero background are files in `frontend/assets/` (kept with the code). Add a file there and enter its path, e.g. `assets/hero-new.jpg`, or use an https:// link.
- **Safety:** every value is checked on the server (colours, allowed fonts, safe links only, image paths). The last 15 published versions are kept under **Version history**, and **Reset** returns to the original design.

How it works: the website lives in the `settings` table under `site`, and the version history under `site_history` (defaults in `backend/site.js`). The server injects the theme and content into each page before sending it, so there's no flash of the old design. `frontend/js/site.js` fills in text marked with `data-site="…"`. The admin page itself is never themed, so a bad colour choice can't lock you out.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/config` | Public store settings |
| GET | `/api/products`, `/api/products/:id` | Visible products |
| POST | `/api/quote` | `{items, coupon, payment}` → priced cart |
| POST | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Customer and admin accounts (phone + password) |
| GET | `/api/auth/me` | The signed-in account, or `null` |
| GET | `/api/account/orders` | The signed-in customer's orders |
| POST | `/api/orders` | Place an order (needs sign-in) |
| GET | `/api/orders/:id?token=` | Customer's order |
| POST | `/api/orders/:id/pay` | Verify Razorpay payment |
| GET | `/api/admin/me` | Whether the signed-in account is the admin |
| GET | `/api/admin/users` | Registered accounts |
| GET/PATCH | `/api/admin/orders[/:id]` | Manage orders |
| POST | `/api/admin/orders/:id/ship`, `/api/admin/orders/:id/track` | Send to Shiprocket, refresh courier status |
| POST | `/api/delivery-updates` | Shiprocket tracking webhook (needs the `x-api-key` token) |
| GET/POST/PATCH/DELETE | `/api/admin/products[/:id]` | Manage products |
| GET/PUT | `/api/admin/settings` | Store settings (fees, contact, coupons) |
| GET/PUT | `/api/admin/site` | Website settings |
| POST | `/api/admin/site/restore`, `/api/admin/site/reset` | Version history |
| POST | `/api/admin/media` | Upload a product photo or video (raw body) → media item |
| GET | `/api/admin/groups` | User groups |

## Configuration

The admin account (phone + password), session secret and Razorpay keys are set in `.env` (see `.env.example`). The WhatsApp number, store email, shipping/COD fees and coupon codes can be set there and in `backend/config.js` as starting defaults, but once you save **Admin → Settings**, the values in the `settings` table are used instead.

**Shiprocket:** in Shiprocket → Settings → API, create an API user (a different email from your own login) and put it in `.env` as `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` (single-quote values containing `$`, `&` or `!`). Set `SHIPROCKET_PICKUP_LOCATION` to the pickup address name exactly as in Settings → Pickup Addresses. For automatic tracking, set `SHIPROCKET_WEBHOOK_TOKEN` to a long random string, then in Shiprocket → Settings → API → Webhooks add the URL `https://<your-domain>/api/delivery-updates` with that same token. (Shiprocket rejects webhook URLs containing the word "shiprocket", hence the path.)

## Before going live

- Use **Razorpay live keys** and set `NODE_ENV=production`. Run the site behind HTTPS (for example nginx or Caddy, or a host like Render or Railway).
- Set `ADMIN_PHONE`, a **strong `ADMIN_PASSWORD`** and a fixed `SESSION_SECRET` (without it, everyone is signed out whenever the server restarts).
- **Back up the `database/data/` folder** (or set `DATA_DIR` to a folder outside the project, so redeploys never touch it). It holds products, orders, store and website settings, and uploaded images.
  JSON files suit a single server with modest traffic. For more traffic, replace the modules in `database/` with SQLite or Postgres versions; the backend only uses their small interface.
- Set up a **Razorpay webhook** (`payment.captured`) as a backup to the browser callback.
- Add **order emails** (for example with Nodemailer or Resend) to notify you and the customer.
- Online orders reserve stock even if the customer never pays. Cancel stale "Pending / Unpaid" orders from the admin panel to release that stock.
