-- BHT Revenue OS — CRM Schema
-- PostgreSQL (Neon / Railway). Source of truth for CRM; ServiceM8 is synced into here.

-- Customers table (synced from ServiceM8, with computed aggregates)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  servicem8_uuid VARCHAR(36) UNIQUE NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  suburb VARCHAR(100),
  postcode VARCHAR(20),
  first_job_date DATE,
  last_job_date DATE,
  total_jobs INTEGER DEFAULT 0,
  total_revenue DECIMAL(12, 2) DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_servicem8_uuid ON customers(servicem8_uuid);
CREATE INDEX idx_customers_last_job_date ON customers(last_job_date);
CREATE INDEX idx_customers_tags ON customers USING GIN(tags);

-- Jobs table (synced from ServiceM8)
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  servicem8_uuid VARCHAR(36) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  job_date DATE,
  job_type VARCHAR(100),
  job_value DECIMAL(12, 2),
  status VARCHAR(50),
  address TEXT,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jobs_servicem8_uuid ON jobs(servicem8_uuid);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_job_date ON jobs(job_date);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_completed_at ON jobs(completed_at);

-- Communications table (SMS history)
CREATE TABLE IF NOT EXISTS communications (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  channel VARCHAR(20) DEFAULT 'sms',
  template_name VARCHAR(100),
  message_content TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivery_status VARCHAR(50) DEFAULT 'pending',
  reply_status VARCHAR(50),
  external_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_communications_customer_id ON communications(customer_id);
CREATE INDEX idx_communications_sent_at ON communications(sent_at);
CREATE INDEX idx_communications_template_name ON communications(template_name);

-- Automations table (trigger definitions)
CREATE TABLE IF NOT EXISTS automations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_condition JSONB DEFAULT '{}',
  action_type VARCHAR(50) DEFAULT 'sms',
  template TEXT,
  active BOOLEAN DEFAULT true,
  cooldown_days INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO automations (name, trigger_type, trigger_condition, action_type, template, active, cooldown_days) VALUES
(
  'JOB_COMPLETED_THANKYOU',
  'JOB_COMPLETED',
  '{"days_since_completion": 2}'::jsonb,
  'sms',
  'Hi {{name}},\nThanks for choosing Better Home Technology.\nIf you ever need electrical upgrades, lighting, or EV charger installation, feel free to reach out.\n\nMeng',
  true,
  365
),
(
  'INACTIVE_12_MONTHS',
  'INACTIVE',
  '{"days_inactive": 365}'::jsonb,
  'sms',
  'Hi {{name}},\nIt''s been a while since we last helped with electrical work.\nIf you need help with lighting upgrades, EV chargers or power improvements, feel free to contact us.\n\nMeng',
  true,
  365
)
ON CONFLICT (name) DO NOTHING;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
