-- ServiceM8 full history sync: jobs, invoices, job_materials (additive only)
-- Drop existing tables if schema mismatch (e.g. old jobs without account_id)
DROP TABLE IF EXISTS job_materials;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS jobs;

-- =============================================================================
-- JOBS (from ServiceM8 job.json)
-- =============================================================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  servicem8_job_uuid VARCHAR(36) UNIQUE,
  job_number VARCHAR(100),
  description TEXT,
  address_line TEXT,
  suburb VARCHAR(100),
  status VARCHAR(50),
  job_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_jobs_account_id ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_contact_id ON jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_servicem8_uuid ON jobs(servicem8_job_uuid);
CREATE INDEX IF NOT EXISTS idx_jobs_job_date ON jobs(job_date);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- =============================================================================
-- INVOICES (from ServiceM8 invoice.json)
-- =============================================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  servicem8_invoice_uuid VARCHAR(36) UNIQUE,
  invoice_number VARCHAR(100),
  amount DECIMAL(12, 2),
  invoice_date DATE,
  status VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_invoices_account_id ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_servicem8_uuid ON invoices(servicem8_invoice_uuid);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);

-- =============================================================================
-- JOB_MATERIALS (from ServiceM8 jobmaterial.json)
-- =============================================================================
CREATE TABLE job_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  servicem8_job_material_uuid VARCHAR(36) UNIQUE,
  material_name VARCHAR(500),
  quantity DECIMAL(12, 4) DEFAULT 1,
  unit_price DECIMAL(12, 2),
  total_price DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_job_materials_job_id ON job_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_job_materials_servicem8_uuid ON job_materials(servicem8_job_material_uuid);

-- updated_at triggers for new tables
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY['jobs','invoices','job_materials'];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_domain_updated_at()', t, t);
  END LOOP;
END $$;
