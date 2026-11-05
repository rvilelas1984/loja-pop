-- Teacher-selected monitoring participants, distinct from official attendance.
CREATE TABLE IF NOT EXISTS pop_live_selected_members (
 session_id INTEGER NOT NULL,
 member_id INTEGER NOT NULL,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 evo_member_id TEXT NOT NULL,
 selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id,member_id)
);
CREATE INDEX IF NOT EXISTS idx_pop_live_selected_members_unit ON pop_live_selected_members(unit,session_id);
