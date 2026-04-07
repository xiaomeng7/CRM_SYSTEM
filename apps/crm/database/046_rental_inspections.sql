-- Migration 046: rental_inspections table
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS rental_inspections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number            VARCHAR(50),
  servicem8_job_uuid    UUID,
  opportunity_id        UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  contact_phone         VARCHAR(50),
  contact_email         VARCHAR(200),
  contact_name          VARCHAR(200),
  agency_name           VARCHAR(200),

  -- Module data (JSONB)
  property_info         JSONB DEFAULT '{}',   -- address, type, year_built
  safety_switches       JSONB DEFAULT '{}',   -- rcd count, test result
  smoke_alarms          JSONB DEFAULT '{}',   -- count, hardwired, compliant
  switchboard           JSONB DEFAULT '{}',   -- type, condition, labelled
  outlets_lighting      JSONB DEFAULT '{}',   -- damaged outlets, flickering
  hot_water             JSONB DEFAULT '{}',   -- HWS type, condition
  general_findings      JSONB DEFAULT '{}',   -- technician notes, extras

  -- Decision output
  verdict               VARCHAR(20),          -- PASS | ADVISORY | FAIL
  risk_items            JSONB DEFAULT '[]',   -- list of flagged items
  advisory_items        JSONB DEFAULT '[]',   -- list of advisory items

  -- Engineer review
  status                VARCHAR(30) DEFAULT 'submitted',
  -- submitted | review | approved | sent
  engineer_notes        TEXT,
  sent_at               TIMESTAMPTZ,

  -- Invoice
  invoice_number        VARCHAR(50),
  invoice_amount_cents  INTEGER,
  invoice_status        VARCHAR(20) DEFAULT 'pending',
  payment_session_id    VARCHAR(200),
  payment_link_url      TEXT,
  paid_at               TIMESTAMPTZ,

  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rental_insp_job       ON rental_inspections(job_number);
CREATE INDEX IF NOT EXISTS idx_rental_insp_verdict   ON rental_inspections(verdict);
CREATE INDEX IF NOT EXISTS idx_rental_insp_status    ON rental_inspections(status);
CREATE INDEX IF NOT EXISTS idx_rental_insp_phone     ON rental_inspections(contact_phone);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_rental_inspections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rental_inspections_updated_at ON rental_inspections;
CREATE TRIGGER trg_rental_inspections_updated_at
  BEFORE UPDATE ON rental_inspections
  FOR EACH ROW EXECUTE FUNCTION update_rental_inspections_updated_at();
