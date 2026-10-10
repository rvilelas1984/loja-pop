CREATE TABLE IF NOT EXISTS club_pix_orders (id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, unit TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'created', provider_order_id TEXT UNIQUE, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_club_pix_orders_member ON club_pix_orders(member_id, unit, created_at);

-- The current Pix checkout is sandbox-only. No Fitcoins ledger or automatic fulfillment exists yet.
CREATE TABLE IF NOT EXISTS club_pix_delivery_audit (order_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'awaiting_implementation', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Each paid order has one durable, auditable fulfillment record.
CREATE TABLE IF NOT EXISTS club_pix_fulfillment (
 order_id TEXT PRIMARY KEY REFERENCES club_pix_orders(id),
 member_id INTEGER NOT NULL,
 unit TEXT NOT NULL,
 fitcoins_requested INTEGER NOT NULL DEFAULT 0,
 debit_state TEXT NOT NULL DEFAULT 'not_started'
   CHECK(debit_state IN ('not_started','in_flight','confirmed','review','failed')),
 debit_reference TEXT UNIQUE,
 delivery_state TEXT NOT NULL DEFAULT 'blocked'
   CHECK(delivery_state IN ('blocked','ready','in_flight','completed','review')),
 delivery_reference TEXT UNIQUE,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_club_pix_fulfillment_unit ON club_pix_fulfillment(unit,delivery_state);
