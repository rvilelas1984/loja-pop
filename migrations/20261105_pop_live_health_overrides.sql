-- Pop Live health fields entered by the student or teacher are separate from EVO sync.
CREATE TABLE IF NOT EXISTS pop_live_health_overrides (
 member_id INTEGER PRIMARY KEY REFERENCES members(id),
 sex TEXT CHECK(sex IN ('m','f')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
