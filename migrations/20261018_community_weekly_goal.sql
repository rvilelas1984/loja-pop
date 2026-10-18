ALTER TABLE community_challenges ADD COLUMN weekly_min_classes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE community_challenges ADD COLUMN weekly_distinct_days INTEGER NOT NULL DEFAULT 0;
