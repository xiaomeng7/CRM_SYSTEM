-- Landing Page Version Library: registered LP versions for analytics (lpv param alignment).
-- Distinct from landing_page_variants (040 AI-generated copy rows).

CREATE TABLE IF NOT EXISTS landing_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line VARCHAR(50) NOT NULL,
  version VARCHAR(128) NOT NULL,
  page_name VARCHAR(255) NOT NULL,
  route_path VARCHAR(512) NOT NULL,
  headline TEXT,
  subheadline TEXT,
  cta_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_landing_page_versions_route_version UNIQUE (route_path, version),
  CONSTRAINT chk_landing_page_versions_status CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_landing_page_versions_product_line ON landing_page_versions (product_line);
CREATE INDEX IF NOT EXISTS idx_landing_page_versions_status ON landing_page_versions (status);
CREATE INDEX IF NOT EXISTS idx_landing_page_versions_version ON landing_page_versions (version);

COMMENT ON TABLE landing_page_versions IS
  'Human-registered landing page versions; URL param lpv should match version for funnel joins.';
COMMENT ON COLUMN landing_page_versions.version IS
  'Slug/label passed as lpv= on the live page (e.g. hero_v2).';
COMMENT ON COLUMN landing_page_versions.route_path IS
  'Site path served by static host, e.g. /index.html or /rental-lite.html.';

DROP TRIGGER IF EXISTS update_landing_page_versions_updated_at ON landing_page_versions;
CREATE TRIGGER update_landing_page_versions_updated_at
  BEFORE UPDATE ON landing_page_versions
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
