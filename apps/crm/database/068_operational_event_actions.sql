-- PR7D: Suggested founder actions for operational events (recommendation-only, no automation).

CREATE TABLE IF NOT EXISTS operational_event_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES operational_events(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  source VARCHAR(30) NOT NULL DEFAULT 'generator',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT operational_event_actions_status_check
    CHECK (status IN ('pending', 'approved', 'completed', 'dismissed')),
  CONSTRAINT operational_event_actions_source_check
    CHECK (source IN ('generator', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_operational_event_actions_event_id
  ON operational_event_actions (event_id);

CREATE INDEX IF NOT EXISTS idx_operational_event_actions_status
  ON operational_event_actions (status);

CREATE INDEX IF NOT EXISTS idx_operational_event_actions_priority
  ON operational_event_actions (event_id, priority DESC);

COMMENT ON TABLE operational_event_actions IS 'Founder-facing suggested actions; status changes only, no auto-execution.';
COMMENT ON COLUMN operational_event_actions.source IS 'generator = deterministic suggestion; manual = founder-added later';
