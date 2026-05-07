-- Migration 060: rental_inspections table
-- Idempotent — safe to re-run even if table already exists in production.
-- The table was created manually in Neon prior to this migration being written.

CREATE TABLE IF NOT EXISTS rental_inspections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number            VARCHAR(50),
  servicem8_job_uuid    UUID,
  opportunity_id        UUID REFERENCES opportunities(id) ON DELETE SET NULL,

  -- Contact / agency
  contact_phone         VARCHAR(50),
  contact_email         VARCHAR(255),
  contact_name          VARCHAR(255),
  agency_name           VARCHAR(255),

  -- Module data (JSONB) — mirrors technician-rental.html wizard steps
  property_info         JSONB DEFAULT '{}',
  safety_switches       JSONB DEFAULT '{}',
  smoke_alarms          JSONB DEFAULT '{}',
  switchboard           JSONB DEFAULT '{}',
  outlets_lighting      JSONB DEFAULT '{}',
  hot_water             JSONB DEFAULT '{}',
  general_findings      JSONB DEFAULT '{}',

  -- Decision engine output
  verdict               VARCHAR(20),          -- PASS | ADVISORY | FAIL
  risk_items            JSONB DEFAULT '[]',
  advisory_items        JSONB DEFAULT '[]',

  -- Engineer review workflow
  status                VARCHAR(30) DEFAULT 'submitted',
  -- submitted | review | approved | sent
  engineer_notes        TEXT,

  -- Invoice (populated after ServiceM8 invoice is created)
  invoice_number        VARCHAR(100),
  invoice_amount_cents  INTEGER,
  invoice_status        VARCHAR(30),
  payment_session_id    VARCHAR(255),

  sent_at               TIMESTAMPTZ,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rental_inspections_job_number  ON rental_inspections(job_number);
CREATE INDEX IF NOT EXISTS idx_rental_inspections_verdict     ON rental_inspections(verdict);
CREATE INDEX IF NOT EXISTS idx_rental_inspections_status      ON rental_inspections(status);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_rental_inspections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rental_inspections_updated_at ON rental_inspections;
CREATE TRIGGER trg_rental_inspections_updated_at
  BEFORE UPDATE ON rental_inspections
  FOR EACH ROW EXECUTE FUNCTION update_rental_inspections_updated_at();
