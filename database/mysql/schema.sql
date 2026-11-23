-- Adirudra store: MySQL / MariaDB schema (5 tables).
-- The server runs this automatically on start (every statement is "IF NOT EXISTS"),
-- so you never need to run it by hand. It's kept here as readable documentation.
-- JSON values are stored in LONGTEXT so the same schema works on MySQL 5.7+, 8.x and MariaDB.
-- All DATETIME values are Indian Standard Time (the app sets the connection to +05:30).

-- 1. User groups: "admin" (exactly one account) and "user" (customers who sign up).
CREATE TABLE IF NOT EXISTS user_groups (
  id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  name        VARCHAR(32)      NOT NULL UNIQUE,
  description VARCHAR(255)     NOT NULL DEFAULT '',
  created_at  DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_groups (id, name, description) VALUES
  (1, 'admin', 'Store administrator. Can open the admin panel. Only one account.'),
  (2, 'user',  'Customers who create an account on the website.');

-- 2. Users: everyone signs in with phone number + password.
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(32)      NOT NULL PRIMARY KEY,
  group_id      TINYINT UNSIGNED NOT NULL,
  name          VARCHAR(80)      NOT NULL,
  phone         VARCHAR(15)      NOT NULL UNIQUE,
  email         VARCHAR(160)     NULL,
  password_hash VARCHAR(255)     NOT NULL,            -- scrypt$salt$hash, never the password
  created_at    DATETIME(3)      NOT NULL,
  updated_at    DATETIME(3)      NOT NULL,
  KEY idx_users_group (group_id),
  CONSTRAINT fk_users_group FOREIGN KEY (group_id) REFERENCES user_groups (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Products. Photos and videos are listed in `media`; the files themselves live in
--    media storage (the server's disk today, Cloudflare R2 once it's linked).
CREATE TABLE IF NOT EXISTS products (
  id           VARCHAR(32)   NOT NULL PRIMARY KEY,   -- AR-001
  sku          VARCHAR(64)   NOT NULL UNIQUE,        -- sent to Shiprocket
  slug         VARCHAR(160)  NOT NULL,
  name         VARCHAR(120)  NOT NULL,
  category     VARCHAR(60)   NOT NULL DEFAULT 'Rudraksha',
  type         VARCHAR(40)   NOT NULL,               -- Loose Bead, Mala, Bracelet, Pendant
  origin       VARCHAR(80)   NOT NULL DEFAULT '',
  mukhi        SMALLINT      NOT NULL,
  size         VARCHAR(80)   NOT NULL DEFAULT '',
  weight_label VARCHAR(80)   NOT NULL DEFAULT '',    -- shown on the product page, e.g. "8.2 G"
  price        DECIMAL(10,2) NOT NULL,
  rarity       VARCHAR(40)   NOT NULL DEFAULT 'Common',
  featured     TINYINT(1)    NOT NULL DEFAULT 0,
  certified    TINYINT(1)    NOT NULL DEFAULT 0,
  verification VARCHAR(80)   NOT NULL DEFAULT '',
  stock        INT           NOT NULL DEFAULT 0,
  active       TINYINT(1)    NOT NULL DEFAULT 1,     -- 0 = hidden from the store
  description  TEXT          NULL,
  keywords     LONGTEXT      NULL,                   -- JSON array of search words
  media        LONGTEXT      NULL,                   -- JSON array: [{ id, type: image|video, url, storage, key, mime, size }]
  -- Shipping details used for Shiprocket:
  hsn_code     VARCHAR(16)   NOT NULL DEFAULT '',
  weight_grams DECIMAL(10,2) NULL,                   -- shipping weight of one unit
  length_cm    DECIMAL(8,2)  NULL,
  breadth_cm   DECIMAL(8,2)  NULL,
  height_cm    DECIMAL(8,2)  NULL,
  created_at   DATETIME(3)   NOT NULL,
  updated_at   DATETIME(3)   NOT NULL,
  KEY idx_products_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Orders: everything about an order, including the full customer details and the
--    fields Shiprocket needs (addresses, item SKUs/HSN, parcel weight and size) and returns
--    (Shiprocket order/shipment IDs, AWB, courier, tracking, label).
CREATE TABLE IF NOT EXISTS orders (
  id                  VARCHAR(32)   NOT NULL PRIMARY KEY,   -- ADR-261123-AB12CD
  user_id             VARCHAR(32)   NULL,                   -- the account that placed it
  token               VARCHAR(64)   NOT NULL,               -- private link for the order page
  status              VARCHAR(20)   NOT NULL,               -- pending, confirmed, shipped, delivered, cancelled
  payment_method      VARCHAR(20)   NOT NULL,               -- upi (online), cod, whatsapp
  payment_status      VARCHAR(20)   NOT NULL,               -- unpaid, paid, cod, refunded
  razorpay_order_id   VARCHAR(64)   NULL,
  razorpay_payment_id VARCHAR(64)   NULL,

  -- Customer and billing address
  customer_name       VARCHAR(100)  NOT NULL,
  customer_phone      VARCHAR(15)   NOT NULL,
  customer_email      VARCHAR(160)  NOT NULL,
  billing_address     VARCHAR(300)  NOT NULL,
  billing_address_2   VARCHAR(300)  NULL,
  billing_city        VARCHAR(80)   NOT NULL,
  billing_state       VARCHAR(80)   NOT NULL,
  billing_pincode     VARCHAR(10)   NOT NULL,
  billing_country     VARCHAR(60)   NOT NULL DEFAULT 'India',
  customer_notes      TEXT          NULL,

  -- Shipping address (same as billing unless shipping_is_billing = 0)
  shipping_is_billing TINYINT(1)    NOT NULL DEFAULT 1,
  shipping_name       VARCHAR(100)  NULL,
  shipping_phone      VARCHAR(15)   NULL,
  shipping_address    VARCHAR(300)  NULL,
  shipping_address_2  VARCHAR(300)  NULL,
  shipping_city       VARCHAR(80)   NULL,
  shipping_state      VARCHAR(80)   NULL,
  shipping_pincode    VARCHAR(10)   NULL,
  shipping_country    VARCHAR(60)   NULL,

  -- What was ordered and what it cost (rupees)
  items               LONGTEXT      NOT NULL,               -- JSON: [{ id, sku, name, hsn, price, qty, total, weightGrams }]
  subtotal            DECIMAL(10,2) NOT NULL,
  discount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code         VARCHAR(40)   NULL,
  shipping_charges    DECIMAL(10,2) NOT NULL DEFAULT 0,
  cod_fee             DECIMAL(10,2) NOT NULL DEFAULT 0,
  total               DECIMAL(10,2) NOT NULL,

  -- Parcel, for the courier
  package_weight_kg   DECIMAL(8,3)  NOT NULL,
  package_length_cm   DECIMAL(8,2)  NOT NULL,
  package_breadth_cm  DECIMAL(8,2)  NOT NULL,
  package_height_cm   DECIMAL(8,2)  NOT NULL,

  -- Filled in once the order is pushed to Shiprocket
  shipping_provider      VARCHAR(30)  NULL,                 -- 'shiprocket'
  shiprocket_order_id    VARCHAR(40)  NULL,
  shiprocket_shipment_id VARCHAR(40)  NULL,
  awb_code               VARCHAR(40)  NULL,
  courier_company_id     INT          NULL,
  courier_name           VARCHAR(80)  NULL,
  shipping_status        VARCHAR(40)  NULL,
  tracking_url           VARCHAR(500) NULL,
  label_url              VARCHAR(500) NULL,
  manifest_url           VARCHAR(500) NULL,
  invoice_url            VARCHAR(500) NULL,
  pickup_scheduled_at    DATETIME(3)  NULL,
  shipped_at             DATETIME(3)  NULL,
  delivered_at           DATETIME(3)  NULL,

  history             LONGTEXT      NOT NULL,               -- JSON: [{ at, status, note }]
  stock_restored      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          DATETIME(3)   NOT NULL,
  updated_at          DATETIME(3)   NOT NULL,
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status),
  KEY idx_orders_created (created_at),
  KEY idx_orders_awb (awb_code),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Settings: one row per setting group, the value stored as JSON.
--    store        fees, free-shipping threshold, contact details, coupon codes (Admin > Settings)
--    site         website theme and all page text (Admin > Website)
--    site_history the last 15 published website versions (Admin > Website > Version history)
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64)  NOT NULL PRIMARY KEY,
  value       LONGTEXT     NOT NULL,
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
