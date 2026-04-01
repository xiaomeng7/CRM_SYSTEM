-- Migration 044: pre_purchase_inspections table + SMS sequence log
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS pre_purchase_inspections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number            VARCHAR(50),
  servicem8_job_uuid    UUID,
  opportunity_id        UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  contact_phone         VARCHAR(50),

  -- Module data (JSONB)
  property_info         JSONB DEFAULT '{}',
  switchboard_data      JSONB DEFAULT '{}',
  safety_data           JSONB DEFAULT '{}',
  wiring_data           JSONB DEFAULT '{}',
  circuits_data         JSONB DEFAULT '{}',
  solar_battery_data    JSONB DEFAULT '{}',
  assessment_notes      TEXT,

  -- Decision engine output
  verdict               VARCHAR(1),      -- A | B | C
  risk_level            VARCHAR(20),     -- low | moderate | high
  cost_low              INTEGER,
  cost_high             INTEGER,
  decision_engine_output JSONB DEFAULT '{}',

  -- Engineer review
  status                VARCHAR(30) DEFAULT 'submitted',
  -- submitted | review | approved | sent
  engineer_notes        TEXT,
  report_url            VARCHAR(500),
  sent_at               TIMESTAMPTZ,

  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_inspections_job_number  ON pre_purchase_inspections(job_number);
CREATE INDEX IF NOT EXISTS idx_pp_inspections_verdict     ON pre_purchase_inspections(verdict);
CREATE INDEX IF NOT EXISTS idx_pp_inspections_status      ON pre_purchase_inspections(status);
CREATE INDEX IF NOT EXISTS idx_pp_inspections_opp         ON pre_purchase_inspections(opportunity_id);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_pp_inspections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pp_inspections_updated_at ON pre_purchase_inspections;
CREATE TRIGGER trg_pp_inspections_updated_at
  BEFORE UPDATE ON pre_purchase_inspections
  FOR EACH ROW EXECUTE FUNCTION update_pp_inspections_updated_at();

-- SMS follow-up schedule log
CREATE TABLE IF NOT EXISTS inspection_sms_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id   UUID NOT NULL REFERENCES pre_purchase_inspections(id) ON DELETE CASCADE,
  sequence_day    INTEGER NOT NULL,   -- 0, 1, 7, 14
  channel         VARCHAR(10) DEFAULT 'sms',
  message_body    TEXT,
  status          VARCHAR(20) DEFAULT 'sent',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_inspection ON inspection_sms_log(inspection_id);
