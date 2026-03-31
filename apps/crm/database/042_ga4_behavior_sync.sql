-- GA4 behavior sync (page + key events daily grain). Idempotent.
-- Prereq: 004 sync_runs (optional audit), 028 update_domain_updated_at().
--
-- Key dimensions use '' instead of NULL for source/medium/campaign so UNIQUE + ON CONFLICT work.

CREATE TABLE IF NOT EXISTS ga4_page_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,
  sessions INTEGER NOT NULL DEFAULT 0,
  total_users INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(8, 4),
  average_session_duration NUMERIC(12, 2),
  bounce_rate NUMERIC(8, 4),
  source VARCHAR(100) NOT NULL DEFAULT '',
  medium VARCHAR(100) NOT NULL DEFAULT '',
  campaign VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) NOT NULL DEFAULT 'ga4-sync',
  UNIQUE (date, page_path, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS idx_ga4_page_metrics_daily_date ON ga4_page_metrics_daily (date DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_page_metrics_daily_page_path ON ga4_page_metrics_daily (page_path);
CREATE INDEX IF NOT EXISTS idx_ga4_page_metrics_daily_campaign ON ga4_page_metrics_daily (campaign);

COMMENT ON TABLE ga4_page_metrics_daily IS 'Daily GA4 page-level metrics synced from Data API (v1).';

CREATE TABLE IF NOT EXISTS ga4_event_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  page_path TEXT NOT NULL DEFAULT '',
  event_name VARCHAR(100) NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(100) NOT NULL DEFAULT '',
  medium VARCHAR(100) NOT NULL DEFAULT '',
  campaign VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) NOT NULL DEFAULT 'ga4-sync',
  UNIQUE (date, page_path, event_name, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS idx_ga4_event_metrics_daily_date ON ga4_event_metrics_daily (date DESC);
CREATE INDEX IF NOT EXISTS idx_ga4_event_metrics_daily_page_path ON ga4_event_metrics_daily (page_path);
CREATE INDEX IF NOT EXISTS idx_ga4_event_metrics_daily_event_name ON ga4_event_metrics_daily (event_name);
CREATE INDEX IF NOT EXISTS idx_ga4_event_metrics_daily_campaign ON ga4_event_metrics_daily (campaign);

COMMENT ON TABLE ga4_event_metrics_daily IS 'Daily GA4 event counts (form_start, form_submit, click_cta, etc.).';

DROP TRIGGER IF EXISTS update_ga4_page_metrics_daily_updated_at ON ga4_page_metrics_daily;
CREATE TRIGGER update_ga4_page_metrics_daily_updated_at
  BEFORE UPDATE ON ga4_page_metrics_daily
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();

DROP TRIGGER IF EXISTS update_ga4_event_metrics_daily_updated_at ON ga4_event_metrics_daily;
CREATE TRIGGER update_ga4_event_metrics_daily_updated_at
  BEFORE UPDATE ON ga4_event_metrics_daily
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
