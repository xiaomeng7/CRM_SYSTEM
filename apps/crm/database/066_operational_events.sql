-- PR7A: Operational events — unified store for future detectors (no auto-detection in this migration).

CREATE TABLE IF NOT EXISTS operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  attention_score INT NOT NULL DEFAULT 0,
  source VARCHAR(50),
  entity_type VARCHAR(50),
  entity_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  payload JSONB NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT operational_events_severity_check
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT operational_events_status_check
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT operational_events_attention_score_check
    CHECK (attention_score >= 0 AND attention_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_operational_events_status_detected
  ON operational_events (status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_severity
  ON operational_events (severity)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_operational_events_event_type
  ON operational_events (event_type)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_operational_events_entity
  ON operational_events (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

COMMENT ON TABLE operational_events IS 'Operational anomalies surfaced by detectors; CEO Daily reads open events.';
COMMENT ON COLUMN operational_events.attention_score IS '0–100; higher = more urgent for founder attention.';
COMMENT ON COLUMN operational_events.payload IS 'Detector-specific context (amounts, ids, thresholds).';
COMMENT ON COLUMN operational_events.status IS 'open | resolved | dismissed';
