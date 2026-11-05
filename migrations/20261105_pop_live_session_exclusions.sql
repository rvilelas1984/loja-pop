CREATE TABLE IF NOT EXISTS pop_live_session_exclusions (
 session_id INTEGER NOT NULL,
 member_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id,member_id)
);
