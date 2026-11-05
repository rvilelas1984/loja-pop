CREATE TABLE IF NOT EXISTS pop_live_profile_sex (
 member_id INTEGER PRIMARY KEY,
 sex TEXT NOT NULL CHECK(sex IN ('f','m')),
 session_id INTEGER NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
