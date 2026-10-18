-- Campos opcionais de personalização e prêmio da missão (sem premiação automática)
ALTER TABLE community_challenges ADD COLUMN theme TEXT NOT NULL DEFAULT 'violet';
ALTER TABLE community_challenges ADD COLUMN prize_description TEXT;
ALTER TABLE community_challenges ADD COLUMN prize_terms TEXT;
