-- Migration 062: SEO Control Center Phase 1 (minimal)
-- Scope (strict):
--   1) seo_keywords
--   2) seo_content_tasks
-- No dashboard/performance/AI/drafts/assets/weekly_reports tables.

-- =========================================================
-- 1) seo_keywords
-- =========================================================
CREATE TABLE IF NOT EXISTS seo_keywords (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword      VARCHAR(255) NOT NULL,
  intent       VARCHAR(32) NOT NULL
               CHECK (intent IN ('pre_purchase', 'builder', 'service', 'suburb', 'advisory', 'informational')),
  priority     VARCHAR(16) NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('high', 'medium', 'low')),
  status       VARCHAR(16) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'paused', 'used')),
  target_page_hint TEXT,
  notes        TEXT,
  created_by   VARCHAR(100) NOT NULL DEFAULT 'seo-control-center',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_seo_keywords_keyword_not_blank
    CHECK (char_length(btrim(keyword)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_keyword
  ON seo_keywords (keyword);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_status
  ON seo_keywords (status);

-- =========================================================
-- 2) seo_content_tasks
-- =========================================================
CREATE TABLE IF NOT EXISTS seo_content_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id      UUID REFERENCES seo_keywords(id) ON DELETE SET NULL,
  week_start_date DATE NOT NULL,
  task_type       VARCHAR(64),
  title           VARCHAR(255) NOT NULL,
  target_page     TEXT,
  intent          VARCHAR(32) NOT NULL
                  CHECK (intent IN ('pre_purchase', 'builder', 'service', 'suburb', 'advisory', 'informational')),
  priority        VARCHAR(16) NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('high', 'medium', 'low')),
  status          VARCHAR(32) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_approval', 'approved', 'in_progress', 'done', 'rejected')),
  owner_id        VARCHAR(100),
  created_by      VARCHAR(100) NOT NULL DEFAULT 'seo-control-center',
  approved_by     VARCHAR(100),
  approved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_seo_content_tasks_title_not_blank
    CHECK (char_length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_seo_content_tasks_status
  ON seo_content_tasks (status);

CREATE INDEX IF NOT EXISTS idx_seo_content_tasks_priority
  ON seo_content_tasks (priority);

CREATE INDEX IF NOT EXISTS idx_seo_content_tasks_intent
  ON seo_content_tasks (intent);

CREATE INDEX IF NOT EXISTS idx_seo_content_tasks_owner_id
  ON seo_content_tasks (owner_id);

CREATE INDEX IF NOT EXISTS idx_seo_content_tasks_week_start_date
  ON seo_content_tasks (week_start_date);

-- =========================================================
-- updated_at triggers
-- =========================================================
CREATE OR REPLACE FUNCTION update_seo_keywords_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_keywords_updated_at ON seo_keywords;
CREATE TRIGGER trg_seo_keywords_updated_at
  BEFORE UPDATE ON seo_keywords
  FOR EACH ROW
  EXECUTE FUNCTION update_seo_keywords_updated_at();

CREATE OR REPLACE FUNCTION update_seo_content_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_content_tasks_updated_at ON seo_content_tasks;
CREATE TRIGGER trg_seo_content_tasks_updated_at
  BEFORE UPDATE ON seo_content_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_seo_content_tasks_updated_at();

