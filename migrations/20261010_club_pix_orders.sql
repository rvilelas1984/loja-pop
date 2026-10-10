CREATE TABLE IF NOT EXISTS club_pix_orders (id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, unit TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'created', provider_order_id TEXT UNIQUE, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_club_pix_orders_member ON club_pix_orders(member_id, unit, created_at);

-- The current Pix checkout is sandbox-only. No Fitcoins ledger or automatic fulfillment exists yet.
CREATE TABLE IF NOT EXISTS club_pix_delivery_audit (order_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'awaiting_implementation', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
