-- Bank CSV Import (PR6A): batches, transactions, categories, category memory.
-- Additive only. Does not store raw CSV files.

-- =============================================================================
-- TRANSACTION_CATEGORIES (seed)
-- =============================================================================
CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  direction_hint VARCHAR(20) DEFAULT 'both',
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE transaction_categories IS 'Master list of bank transaction categories (deterministic, no free text).';

INSERT INTO transaction_categories (code, label, direction_hint, sort_order) VALUES
  ('payroll', 'Payroll / Wages', 'outflow', 10),
  ('supplier', 'Supplier', 'outflow', 20),
  ('tax', 'Tax / ATO', 'outflow', 30),
  ('super', 'Superannuation', 'outflow', 40),
  ('rent', 'Rent', 'outflow', 50),
  ('fuel', 'Fuel', 'outflow', 60),
  ('vehicle', 'Vehicle', 'outflow', 70),
  ('transfer', 'Internal transfer', 'both', 80),
  ('owner_draw', 'Owner draw', 'outflow', 90),
  ('software', 'Software / Subscriptions', 'outflow', 100),
  ('insurance', 'Insurance', 'outflow', 110),
  ('customer_payment', 'Customer payment', 'inflow', 120),
  ('unknown', 'Unclassified', 'both', 999)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- BANK_IMPORT_BATCHES
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_profile VARCHAR(30) NOT NULL,
  file_name VARCHAR(255),
  period_start DATE,
  period_end DATE,
  row_count INT NOT NULL DEFAULT 0,
  imported_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  errors JSONB NOT NULL DEFAULT '[]',
  imported_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bank_import_batches_created_at
  ON bank_import_batches(created_at DESC);

COMMENT ON TABLE bank_import_batches IS 'One row per CSV import run; no raw CSV blob stored.';

-- =============================================================================
-- TRANSACTION_CATEGORY_MEMORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS transaction_category_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_key VARCHAR(200) UNIQUE NOT NULL,
  category_id UUID NOT NULL REFERENCES transaction_categories(id),
  match_type VARCHAR(20) NOT NULL DEFAULT 'exact',
  confirmed_by VARCHAR(100),
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notes TEXT,
  hit_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_transaction_category_memory_key
  ON transaction_category_memory(counterparty_key);

COMMENT ON TABLE transaction_category_memory IS 'Founder-confirmed counterparty → category (applied on future imports).';

-- =============================================================================
-- BANK_TRANSACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES bank_import_batches(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2),
  description_raw TEXT,
  description_norm VARCHAR(500),
  counterparty_key VARCHAR(200),
  direction VARCHAR(10) NOT NULL,
  category_id UUID REFERENCES transaction_categories(id),
  category_status VARCHAR(20) NOT NULL DEFAULT 'suggested',
  suggested_category_id UUID REFERENCES transaction_categories(id),
  suggestion_source VARCHAR(30),
  suggestion_confidence NUMERIC(4, 3),
  is_transfer BOOLEAN NOT NULL DEFAULT false,
  recurring_pattern_id UUID,
  external_hash VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_external_hash
  ON bank_transactions(external_hash);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_txn_date
  ON bank_transactions(txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_counterparty_key
  ON bank_transactions(counterparty_key);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_category_status
  ON bank_transactions(category_status);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_import_batch_id
  ON bank_transactions(import_batch_id);

COMMENT ON TABLE bank_transactions IS 'Normalized bank lines; outflows negative, inflows positive.';
COMMENT ON COLUMN bank_transactions.amount IS 'Negative = outflow, positive = inflow (AUD).';
COMMENT ON COLUMN bank_transactions.category_status IS 'suggested | confirmed | ignored';
