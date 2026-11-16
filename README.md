# Adirudra store

An e-commerce store for Adirudra Rudraksha, built with **Node.js + Express**. The storefront uses the colour palette and fonts from the Adirudra catalogue.

## Quick start

Needs Node.js 22.9 or newer.

```sh
npm install
cp .env.example .env      # then set ADMIN_PASSWORD (and Razorpay keys if you have them)
npm start                 # or: npm run dev   (restarts on file changes)
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin
- Tests: `npm test`

## How it works

```
server.js            Starts the server
src/
  app.js             Express app: API routes + static files
  config.js          Settings from .env, coupon codes
  pricing.js         Cart pricing: discounts, shipping, COD fee (server is the source of truth)
  validate.js        Customer + product validation
  razorpay.js        Razorpay order creation + signature verification
  settings.js        Store settings edited in the admin (fees, contact, coupons)
  auth.js            Admin password login, signed httpOnly cookie, login rate limit
  db.js              JSON-file storage (data/products.json, data/orders.json)
data/
  seed-products.json Starting catalogue, copied to products.json on first run
public/              Storefront + admin panel (HTML/CSS/JS, no build step)
test/                API and pricing tests (node:test)
```

### Customer flow
1. Products load from `GET /api/products`. The cart (IDs + quantities only) is kept in the browser.
2. The cart and checkout call `POST /api/quote`, so every price, discount and fee is computed on the server.
3. `POST /api/orders` validates the customer details, re-prices the cart, reserves stock and saves the order. It returns an order ID and a private token. The confirmation page uses the token to show the order.
4. Payment options:
   - **Online (Razorpay):** opens Razorpay Checkout. The server verifies the payment signature before marking the order paid. If the customer closes the payment window, the order page shows a "Pay now" button.
   - **Cash on delivery:** the order is confirmed straight away (₹49 fee).
   - **WhatsApp:** the order is saved and a pre-filled WhatsApp message opens.

### Admin (`/admin`)
- **Orders:** search, filter by status, totals at a glance, full order details, change status or payment status, and add notes such as tracking numbers. Cancelling an order puts its items back in stock.
- **Settings:** free-shipping threshold, shipping fee, cash-on-delivery fee, max quantity per product, WhatsApp number, store email, and coupon codes (add, edit, pause or remove; % or ₹ off, optional minimum order). Changes apply to new orders immediately, no restart needed. They're saved in `data/settings.json`; the `.env` values are only the starting defaults.
- **Products:** add, edit or delete products. Price, stock, featured and visibility can be edited directly in the table. A product that appears in past orders is hidden instead of deleted.

### Website editor (`/admin` → Website)
Edit the storefront's look and content with a live preview, then press **Publish**:
- **Colours & fonts:** 10 base colours (all other shades are blended from these), 5 ready-made palettes, heading and body fonts from a curated Google Fonts list, and corner rounding. A readability check warns when text colours are too hard to read.
- **Content:** brand name and logo, an announcement bar, the header menu labels, the hero banner (text, links, background image), trust badges, the category, featured, authenticity and FAQ sections (add, remove and reorder items, and where their links go), the footer (text, column headings and link labels), and the SEO title and description.
- **Other pages:** the text on the shop, product, cart, checkout, order-confirmation and 404 pages. Leave a menu or footer link label empty to hide that link.
- **Amounts in text:** write `{freeShippingOver}`, `{shippingFee}` or `{codFee}` in any text to show the current amount from Admin → Settings. Order-page text can also use `{name}`, `{email}`, `{phone}` and `{total}`.
- **Layout:** show, hide or reorder the homepage sections.
- **Images:** upload JPG/PNG/WebP/GIF (max 5 MB). Files are stored in `data/uploads/`. Product photos can be uploaded from the product form too.
- **Safety:** every value is checked on the server (colours, allowed fonts, safe links only, image paths). The last 15 published versions are kept under **Version history**, and **Reset** returns to the original design.

How it works: settings live in `data/site.json` (defaults in `src/site.js`). The server injects the theme and content into each page before sending it, so there's no flash of the old design. `public/js/site.js` fills in text marked with `data-site="…"`. The admin page itself is never themed, so a bad colour choice can't lock you out.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/config` | Public store settings |
| GET | `/api/products`, `/api/products/:id` | Visible products |
| POST | `/api/quote` | `{items, coupon, payment}` → priced cart |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/:id?token=` | Customer's order |
| POST | `/api/orders/:id/pay` | Verify Razorpay payment |
| POST | `/api/admin/login` / `logout` | Admin session |
| GET/PATCH | `/api/admin/orders[/:id]` | Manage orders |
| GET/POST/PATCH/DELETE | `/api/admin/products[/:id]` | Manage products |
| GET/PUT | `/api/admin/settings` | Store settings (fees, contact, coupons) |
| GET/PUT | `/api/admin/site` | Website settings |
| POST | `/api/admin/site/restore`, `/api/admin/site/reset` | Version history |
| POST | `/api/admin/uploads` | Upload an image (raw body) |

## Configuration

The admin password, session secret and Razorpay keys are set in `.env` (see `.env.example`). The WhatsApp number, store email, shipping/COD fees and coupon codes can be set there and in `src/config.js` as starting defaults, but once you save **Admin → Settings**, the values in `data/settings.json` are used instead.

## Before going live

- Use **Razorpay live keys** and set `NODE_ENV=production`. Run the site behind HTTPS (for example nginx or Caddy, or a host like Render or Railway).
- Set a **strong `ADMIN_PASSWORD`** and a fixed `SESSION_SECRET`.
- **Back up the `data/` folder.** It holds products, orders, store and website settings, and uploaded images.
  JSON files suit a single server with modest traffic. For more traffic, swap `src/db.js` for SQLite or Postgres; the rest of the code only uses its small interface.
- Set up a **Razorpay webhook** (`payment.captured`) as a backup to the browser callback.
- Add **order emails** (for example with Nodemailer or Resend) to notify you and the customer.
- Online orders reserve stock even if the customer never pays. Cancel stale "Pending / Unpaid" orders from the admin panel to release that stock.
