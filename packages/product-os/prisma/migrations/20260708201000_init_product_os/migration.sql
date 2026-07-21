CREATE TYPE product_type AS ENUM ('INFRASTRUCTURE', 'COLLECTION', 'EXPERIENCE_PACK');
CREATE TYPE record_status AS ENUM ('DRAFT', 'ACTIVE', 'FROZEN', 'ARCHIVED');
CREATE TYPE included_type AS ENUM ('STANDARD', 'OPTIONAL', 'UPGRADE');

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  numeric_value DECIMAL(12,4),
  text_value TEXT,
  boolean_value BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type product_type NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  status record_status NOT NULL DEFAULT 'DRAFT',
  core_value TEXT,
  primary_emotion TEXT,
  coverage TEXT,
  hero TEXT,
  subtitle TEXT,
  story TEXT,
  final_installed_price DECIMAL(12,2) NOT NULL,
  requires_foundation BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX product_catalog_type_status_idx ON product_catalog(type, status);

CREATE TABLE sku_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  supplier TEXT,
  unit_cost_ex_gst DECIMAL(12,2) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT
);

CREATE TABLE labour_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_item TEXT NOT NULL UNIQUE,
  hours DECIMAL(10,2) NOT NULL,
  category TEXT,
  notes TEXT
);

CREATE TABLE product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_library(id) ON DELETE RESTRICT,
  qty DECIMAL(12,3) NOT NULL,
  included_type included_type NOT NULL DEFAULT 'STANDARD',
  notes TEXT,
  UNIQUE(product_id, sku_id)
);

CREATE TABLE product_labour (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  labour_item_id UUID NOT NULL REFERENCES labour_library(id) ON DELETE RESTRICT,
  qty DECIMAL(10,2) NOT NULL,
  notes TEXT,
  UNIQUE(product_id, labour_item_id)
);

CREATE TABLE product_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(product_id, sequence)
);

CREATE TABLE product_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  included_qty DECIMAL(12,3),
  customer_layer TEXT,
  notes TEXT
);

CREATE TABLE product_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  notes TEXT,
  UNIQUE(product_id, rule_key)
);

CREATE TABLE product_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_key TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  body TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, content_type, content_key, sequence)
);

CREATE TABLE product_icons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  icon_key TEXT NOT NULL,
  title TEXT,
  asset_url TEXT,
  sequence INTEGER NOT NULL DEFAULT 1,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, icon_key, sequence)
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sequence INTEGER NOT NULL DEFAULT 1,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, image_type, sequence)
);

CREATE TABLE product_theme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL,
  primary_color TEXT,
  secondary_color TEXT,
  typography_scheme TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, theme_key)
);

CREATE TABLE product_layout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  layout_key TEXT NOT NULL,
  render_target TEXT,
  definition JSONB,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, layout_key)
);

CREATE TABLE product_automation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_catalog(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  automation_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  UNIQUE(product_id, automation_key, sequence)
);

CREATE TABLE change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  changed_by TEXT,
  change_type TEXT NOT NULL,
  change_summary TEXT,
  previous_version TEXT,
  new_version TEXT,
  metadata JSONB,
  changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX change_log_product_id_changed_at_idx ON change_log(product_id, changed_at);

CREATE OR REPLACE VIEW product_pricing_summary AS
WITH setting_values AS (
  SELECT
    COALESCE(MAX(CASE WHEN setting_key = 'loaded_labour_rate' THEN numeric_value END), 0)::DECIMAL(12,4) AS loaded_labour_rate
  FROM settings
),
material AS (
  SELECT
    pb.product_id,
    COALESCE(SUM(pb.qty * s.unit_cost_ex_gst), 0)::DECIMAL(14,2) AS material_cost
  FROM product_bom pb
  JOIN sku_library s ON s.id = pb.sku_id
  GROUP BY pb.product_id
),
labour AS (
  SELECT
    pl.product_id,
    COALESCE(SUM(pl.qty * l.hours), 0)::DECIMAL(14,2) AS labour_hours
  FROM product_labour pl
  JOIN labour_library l ON l.id = pl.labour_item_id
  GROUP BY pl.product_id
)
SELECT
  p.id AS product_id,
  p.code AS product_code,
  p.name AS product_name,
  COALESCE(m.material_cost, 0)::DECIMAL(14,2) AS material_cost,
  (COALESCE(lb.labour_hours, 0) * sv.loaded_labour_rate)::DECIMAL(14,2) AS labour_cost,
  (COALESCE(m.material_cost, 0) + (COALESCE(lb.labour_hours, 0) * sv.loaded_labour_rate))::DECIMAL(14,2) AS direct_cost,
  p.final_installed_price::DECIMAL(14,2) AS installed_price,
  (p.final_installed_price - (COALESCE(m.material_cost, 0) + (COALESCE(lb.labour_hours, 0) * sv.loaded_labour_rate)))::DECIMAL(14,2) AS gross_profit,
  CASE
    WHEN p.final_installed_price = 0 THEN 0::DECIMAL(7,2)
    ELSE (((p.final_installed_price - (COALESCE(m.material_cost, 0) + (COALESCE(lb.labour_hours, 0) * sv.loaded_labour_rate))) / p.final_installed_price) * 100)::DECIMAL(7,2)
  END AS gross_margin
FROM product_catalog p
CROSS JOIN setting_values sv
LEFT JOIN material m ON m.product_id = p.id
LEFT JOIN labour lb ON lb.product_id = p.id;
