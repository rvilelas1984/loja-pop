-- Pop Live -> Pop Fit: resultados individuais por aula.
-- Migracao aditiva, ja aplicada em club-pop-db em 2026-11-05.
-- Nao modifica presencas, entradas manuais nem dados historicos.
CREATE TABLE IF NOT EXISTS pop_live_member_performance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 session_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 attendance_key TEXT,
 sensor_types_json TEXT NOT NULL DEFAULT '[]',
 duration_seconds INTEGER,
 hr_avg REAL,
 hr_max REAL,
 calories_estimated REAL,
 zones_seconds_json TEXT,
 rpm_avg REAL,
 rpm_max REAL,
 speed_avg_kmh REAL,
 speed_max_kmh REAL,
 distance_km REAL,
 metric_quality_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'final' CHECK(status IN ('final','partial')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(session_id,member_id),
 FOREIGN KEY(session_id) REFERENCES pop_live_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_pop_live_member_performance_member
 ON pop_live_member_performance(member_id,unit,session_id);
