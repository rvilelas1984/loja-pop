-- EVO product catalog isolated from Club Pop's existing /api/content products.
-- Apply only after reviewing the target D1 schema; this file does not execute automatically.
CREATE TABLE IF NOT EXISTS evo_product_catalog (
 tenant_key TEXT NOT NULL DEFAULT 'default',
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 evo_product_id TEXT NOT NULL,
 name TEXT NOT NULL,
 sku TEXT,
 barcode TEXT,
 price_cents INTEGER,
 stock_quantity REAL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 raw_json TEXT NOT NULL,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_key,unit,evo_product_id)
);
CREATE INDEX IF NOT EXISTS idx_evo_product_catalog_unit_name ON evo_product_catalog(tenant_key,unit,name);
CREATE TABLE IF NOT EXISTS evo_product_sync (
 tenant_key TEXT NOT NULL DEFAULT 'default',
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 last_attempt_at TEXT,
 last_success_at TEXT,
 last_count INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 request_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_key,unit)
);
