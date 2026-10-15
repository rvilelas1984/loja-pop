CREATE TABLE IF NOT EXISTS club_evo_product_sales (
 order_id TEXT PRIMARY KEY, unit TEXT NOT NULL, product_id INTEGER NOT NULL,
 member_evo_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity=1),
 original_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL, pix_cents INTEGER NOT NULL,
 fitcoins INTEGER NOT NULL, provider_order_id TEXT, session_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'waiting', attempts INTEGER NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0,
 evo_sale_id INTEGER, request_json TEXT, response_json TEXT, last_error TEXT,
 stock_before REAL, stock_after REAL, verification_json TEXT,
 sent_at TEXT, checked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(unit,evo_sale_id)
);
CREATE INDEX IF NOT EXISTS idx_evo_product_sales_state ON club_evo_product_sales(state,checked_at);
