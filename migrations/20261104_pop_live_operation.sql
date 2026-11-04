-- Additive migration. Existing TV, devices, tokens and session IDs are retained.
ALTER TABLE pop_live_sessions ADD COLUMN rules_json TEXT;
ALTER TABLE pop_live_sessions ADD COLUMN operation_key TEXT;
ALTER TABLE pop_live_sessions ADD COLUMN started_at INTEGER;
ALTER TABLE pop_live_sessions ADD COLUMN finished_at INTEGER;
ALTER TABLE pop_live_sessions ADD COLUMN closed_at INTEGER;
ALTER TABLE pop_live_sessions ADD COLUMN close_key TEXT;
ALTER TABLE pop_live_sessions ADD COLUMN results_json TEXT;
ALTER TABLE pop_live_session_devices ADD COLUMN result_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pop_live_official_class ON pop_live_sessions(unit,source_class_id,starts_at) WHERE source='d1';
CREATE UNIQUE INDEX IF NOT EXISTS pop_live_member_session ON pop_live_session_devices(session_id,member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pop_live_active_number ON pop_live_devices(reference_number) WHERE active=1;
CREATE UNIQUE INDEX IF NOT EXISTS pop_live_active_address ON pop_live_devices(upper(ble_identifier)) WHERE active=1 AND ble_identifier IS NOT NULL AND ble_identifier<>'';
