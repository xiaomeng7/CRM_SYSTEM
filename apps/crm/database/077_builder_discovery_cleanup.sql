-- PR9B.4A — Discovery cleanup: candidate_type, hidden, hide_reason

ALTER TABLE builder_discovery_candidates
  ADD COLUMN IF NOT EXISTS candidate_type VARCHAR(20) NOT NULL DEFAULT 'builder';

ALTER TABLE builder_discovery_candidates
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE builder_discovery_candidates
  ADD COLUMN IF NOT EXISTS hide_reason VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_hidden
  ON builder_discovery_candidates (run_id, hidden);
