-- Anonymous landing-page behavior events (V1): funnel before lead conversion.

CREATE TABLE IF NOT EXISTS lp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'scroll_50', 'form_start', 'form_submit')),
  landing_page_version TEXT,
  creative_version TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lp_events_created_at ON lp_events (created_at);
CREATE INDEX IF NOT EXISTS idx_lp_events_lpv_created ON lp_events (landing_page_version, created_at);
CREATE INDEX IF NOT EXISTS idx_lp_events_session ON lp_events (session_id);

COMMENT ON TABLE lp_events IS
  'Client-sent LP engagement events; session_id is browser sessionStorage-scoped, not PII.';
