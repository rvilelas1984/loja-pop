-- Additive history, existing records remain untouched.
CREATE TABLE IF NOT EXISTS pop_fit_weight_history (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, weight_kg REAL NOT NULL CHECK(weight_kg BETWEEN 20 AND 350), recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, source TEXT NOT NULL CHECK(source IN ('pop_fit','pop_live_teacher','pop_live_student')), session_id INTEGER, actor_id TEXT, idempotency_key TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS idx_pop_fit_weight_member_date ON pop_fit_weight_history(member_id, recorded_at DESC, id DESC);
