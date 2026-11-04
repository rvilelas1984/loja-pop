-- Central Pop Live: equipamentos, sessões independentes e metas.
CREATE TABLE IF NOT EXISTS pop_live_devices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reference_number TEXT NOT NULL,
 device_type TEXT NOT NULL CHECK(device_type IN ('moovz','rpm')),
 display_name TEXT NOT NULL,
 ble_identifier TEXT,
 ble_name TEXT,
 unit_bike INTEGER NOT NULL DEFAULT 0,
 unit_gym INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(device_type,reference_number)
);
CREATE TABLE IF NOT EXISTS pop_live_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source TEXT NOT NULL CHECK(source IN ('d1','manual')),
 source_class_id TEXT,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 class_name TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 duration_minutes INTEGER NOT NULL DEFAULT 60,
 teacher_name TEXT,
 goal_type TEXT NOT NULL DEFAULT 'ranking' CHECK(goal_type IN ('ranking','collective','zone')),
 goal_value REAL,
 goal_zone INTEGER,
 status TEXT NOT NULL DEFAULT 'planned',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pop_live_sessions_unit_date ON pop_live_sessions(unit,starts_at);
CREATE TABLE IF NOT EXISTS pop_live_session_devices (
 session_id INTEGER NOT NULL REFERENCES pop_live_sessions(id),
 device_id INTEGER NOT NULL REFERENCES pop_live_devices(id),
 member_id TEXT,
 connected_at TEXT,
 PRIMARY KEY(session_id,device_id)
);
