-- Pop Games: events and their rounds. Each round is a manual Bike Pop Live session (pop_live_sessions).
-- The worker also creates these tables on demand (CREATE IF NOT EXISTS), so this file documents the schema.
CREATE TABLE IF NOT EXISTS pop_live_game_events(id INTEGER PRIMARY KEY,name TEXT NOT NULL,event_date TEXT NOT NULL,location TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pop_live_game_rounds(session_id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL,game_type TEXT NOT NULL,
 config_json TEXT NOT NULL,result_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS pop_live_game_rounds_event ON pop_live_game_rounds(event_id);
