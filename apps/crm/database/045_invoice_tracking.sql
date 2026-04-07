-- Migration 045: Invoice tracking on pre_purchase_inspections + shared invoices table
-- Idempotent — safe to re-run

-- Add invoice columns to pre_purchase_inspections
ALTER TABLE pre_purchase_inspections
  ADD COLUMN IF NOT EXISTS invoice_number       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS invoice_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS invoice_status       VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_session_id   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS payment_link_url     TEXT,
  ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMPTZ;

-- Shared inspection_invoices table for both product types
CREATE TABLE IF NOT EXISTS inspection_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    VARCHAR(50) UNIQUE NOT NULL,
  product_type      VARCHAR(30) NOT NULL,   -- pre_purchase | rental
  inspection_id     UUID NOT NULL,          -- references pre_purchase_inspections OR rental_inspections
  contact_phone     VARCHAR(50),
  contact_email     VARCHAR(200),
  contact_name      VARCHAR(200),
  amount_cents      INTEGER NOT NULL,
  currency          VARCHAR(3) DEFAULT 'AUD',
  description       TEXT,
  status            VARCHAR(20) DEFAULT 'pending',  -- pending | paid | cancelled
  payment_session_id VARCHAR(200),
  payment_link_url  TEXT,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_inspection_id  ON inspection_invoices(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inv_product_type   ON inspection_invoices(product_type);
CREATE INDEX IF NOT EXISTS idx_inv_status         ON inspection_invoices(status);
CREATE INDEX IF NOT EXISTS idx_inv_number         ON inspection_invoices(invoice_number);
