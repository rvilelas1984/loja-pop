-- Additive isolated test drafts: no writes to members, EVO, attendance or Pop Fit.
CREATE TABLE IF NOT EXISTS pop_live_manual_drafts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 session_id INTEGER NOT NULL,
 full_name TEXT NOT NULL,
 birth_date TEXT NOT NULL,
 weight_kg REAL NOT NULL CHECK(weight_kg BETWEEN 20 AND 350),
 height_cm REAL NOT NULL CHECK(height_cm BETWEEN 100 AND 230),
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','linked','rejected')),
 idempotency_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pop_live_manual_drafts_unit_session ON pop_live_manual_drafts(unit,session_id,status);
