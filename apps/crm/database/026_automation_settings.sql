-- Admin 可开关的自动化配置（如自动催款）。
CREATE TABLE IF NOT EXISTS automation_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT 'true',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE automation_settings IS 'Runtime toggles for automations (e.g. invoice_overdue_enabled).';

INSERT INTO automation_settings (key, value) VALUES ('invoice_overdue_enabled', 'true')
  ON CONFLICT (key) DO NOTHING;
