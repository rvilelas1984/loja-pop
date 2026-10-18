-- Club Pop | desafios criados por alunos (schema aditivo; executar antes de ativar as rotas)
CREATE TABLE IF NOT EXISTS community_challenges (
 id TEXT PRIMARY KEY,
 unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),
 creator_member_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL CHECK(visibility IN ('private','friends','public')),
 metric TEXT NOT NULL CHECK(metric IN ('total_classes','distinct_days','weekly_consistency','modality_classes')),
 target INTEGER NOT NULL CHECK(target > 0),
 modality TEXT,
 start_at TEXT NOT NULL,
 end_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','completed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(creator_member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_community_challenges_discover ON community_challenges(unit,visibility,status,end_at);
CREATE TABLE IF NOT EXISTS community_challenge_participants (
 challenge_id TEXT NOT NULL,
 member_id INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('invited','accepted','declined','left')),
 joined_at TEXT,
 invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(challenge_id,member_id),
 FOREIGN KEY(challenge_id) REFERENCES community_challenges(id),
 FOREIGN KEY(member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_community_participants_member ON community_challenge_participants(member_id,status);
