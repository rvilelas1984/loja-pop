-- Club Pop: relatos beta (aplicar no D1 antes de ativar endpoints)
CREATE TABLE IF NOT EXISTS student_issue_reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 member_id TEXT NOT NULL,
 evo_member_id TEXT,
 member_name TEXT NOT NULL,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')),
 area TEXT NOT NULL,
 description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','em_analise','aguardando_aluno','resolvido','encerrado')),
 priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('baixa','media','alta','critica')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_issue_reports_unit_status ON student_issue_reports(unit,status,created_at);
CREATE INDEX IF NOT EXISTS idx_student_issue_reports_member ON student_issue_reports(member_id,created_at);
CREATE TABLE IF NOT EXISTS student_issue_report_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 report_id INTEGER NOT NULL REFERENCES student_issue_reports(id),
 actor_type TEXT NOT NULL CHECK(actor_type IN ('student','admin')),
 actor_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_issue_report_events_report ON student_issue_report_events(report_id,created_at);
