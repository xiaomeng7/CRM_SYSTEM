-- BHT Revenue OS — Domain Model Migration (additive only)
-- Creates new tables for CRM domain model. Does NOT modify existing tables:
--   customers, jobs, communications, automations

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ACCOUNTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  address_line TEXT,
  suburb VARCHAR(100),
  postcode VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at);

-- =============================================================================
-- CONTACTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);

-- =============================================================================
-- ASSETS
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name VARCHAR(255),
  asset_type VARCHAR(100),
  address TEXT,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_assets_account_id ON assets(account_id);

-- =============================================================================
-- LEADS
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  source VARCHAR(100),
  status VARCHAR(50) DEFAULT 'new',
  converted_opportunity_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_account_id ON leads(account_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- =============================================================================
-- OPPORTUNITIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  stage VARCHAR(50) DEFAULT 'discovery',
  value_estimate DECIMAL(12, 2),
  closed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id ON opportunities(lead_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON opportunities(created_at);

-- FK: leads.converted_opportunity_id -> opportunities.id (add after opportunities exists)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS fk_leads_converted_opportunity;
ALTER TABLE leads
  ADD CONSTRAINT fk_leads_converted_opportunity
  FOREIGN KEY (converted_opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;

-- =============================================================================
-- ACTIVITIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  activity_type VARCHAR(50),
  summary TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activities_occurred_at ON activities(occurred_at);

-- =============================================================================
-- COMMUNICATION_THREADS
-- =============================================================================
CREATE TABLE IF NOT EXISTS communication_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  subject VARCHAR(500),
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_communication_threads_contact_id ON communication_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_communication_threads_account_id ON communication_threads(account_id);

-- =============================================================================
-- CRM_COMMUNICATIONS (domain model messages; existing "communications" unchanged)
-- =============================================================================
CREATE TABLE IF NOT EXISTS crm_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  channel VARCHAR(20) DEFAULT 'sms',
  template_name VARCHAR(100),
  message_content TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivery_status VARCHAR(50) DEFAULT 'pending',
  external_id VARCHAR(100),
  status VARCHAR(50) DEFAULT 'sent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_crm_communications_contact_id ON crm_communications(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_communications_thread_id ON crm_communications(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_communications_lead_id ON crm_communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_communications_opportunity_id ON crm_communications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_communications_sent_at ON crm_communications(sent_at);

-- =============================================================================
-- TASKS
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  inspection_id UUID,
  title VARCHAR(255),
  due_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'open',
  assigned_to VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

-- inspection_id FK added after inspections table
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_opportunity_id ON tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);

-- =============================================================================
-- INSPECTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  inspection_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_inspections_opportunity_id ON inspections(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_inspections_account_id ON inspections(account_id);
CREATE INDEX IF NOT EXISTS idx_inspections_asset_id ON inspections(asset_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_at ON inspections(scheduled_at);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_inspection_id;
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_inspection_id
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL;

-- =============================================================================
-- REPORTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  report_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft',
  generated_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  storage_ref VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_reports_inspection_id ON reports(inspection_id);
CREATE INDEX IF NOT EXISTS idx_reports_opportunity_id ON reports(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- =============================================================================
-- EXTERNAL_LINKS
-- =============================================================================
CREATE TABLE IF NOT EXISTS external_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system VARCHAR(50) NOT NULL,
  external_entity_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (system, external_entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_links_system_external ON external_links(system, external_entity_type, external_id);
CREATE INDEX IF NOT EXISTS idx_external_links_entity ON external_links(entity_type, entity_id);

-- =============================================================================
-- DOMAIN_EVENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB DEFAULT '{}',
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate ON domain_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_occurred_at ON domain_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_domain_events_processed_at ON domain_events(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_domain_events_event_type ON domain_events(event_type);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_domain_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY['accounts','contacts','assets','leads','opportunities','activities','communication_threads','crm_communications','tasks','inspections','reports','external_links','domain_events'];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_domain_updated_at()', t, t);
  END LOOP;
END $$;
