CREATE TABLE IF NOT EXISTS student_tutorial_videos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL,
 unit TEXT NOT NULL DEFAULT 'all' CHECK(unit IN ('all','bike','gym')),
 drive_file_id TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_tutorial_videos_public ON student_tutorial_videos(published,unit,sort_order);
