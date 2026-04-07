-- Migration 061: inspection_invoices — shared invoice tracking table
-- Used by POST /api/inspections/:id/invoice for both pre_purchase and rental.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS inspection_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Invoice identity
  invoice_number    VARCHAR(100),             -- e.g. SM8-XXXXXXXX
  product_type      VARCHAR(30) NOT NULL,     -- pre_purchase | rental | energy_lite

  -- Link back to the source inspection
  inspection_id     UUID NOT NULL,            -- UUID in pre_purchase_inspections or rental_inspections
                                              -- Not a FK because it can point to two different tables

  -- Client snapshot (denormalised for easy access without joining)
  contact_phone     VARCHAR(50),
  contact_email     VARCHAR(255),
  contact_name      VARCHAR(255),

  -- Financial
  amount_cents      INTEGER NOT NULL,         -- amount in AUD cents
  description       TEXT,

  -- Lifecycle
  status            VARCHAR(30) DEFAULT 'pending',
  -- pending | paid | overdue | cancelled

  -- ServiceM8 UUID stored here as payment_session_id for cross-reference
  payment_session_id VARCHAR(255),            -- ServiceM8 invoice UUID

  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_invoices_inspection ON inspection_invoices(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_invoices_product    ON inspection_invoices(product_type);
CREATE INDEX IF NOT EXISTS idx_inspection_invoices_status     ON inspection_invoices(status);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_inspection_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_invoices_updated_at ON inspection_invoices;
CREATE TRIGGER trg_inspection_invoices_updated_at
  BEFORE UPDATE ON inspection_invoices
  FOR EACH ROW EXECUTE FUNCTION update_inspection_invoices_updated_at();
