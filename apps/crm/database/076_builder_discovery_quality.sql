-- PR9B.3 — Discovery candidate quality score + band

ALTER TABLE builder_discovery_candidates
  ADD COLUMN IF NOT EXISTS quality_score INT NOT NULL DEFAULT 0;

ALTER TABLE builder_discovery_candidates
  ADD COLUMN IF NOT EXISTS quality_band VARCHAR(1);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_quality
  ON builder_discovery_candidates (run_id, quality_score DESC);
