-- Campaign action plan review (v1): status lifecycle + reviewer fields on executions table.

ALTER TABLE campaign_action_plan_executions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Legacy rows were execution logs (already applied in ads / manual).
UPDATE campaign_action_plan_executions
SET status = 'executed'
WHERE status IS NULL;

-- Default executed for rows that omit status (e.g. legacy apply logs); reviews must set approved/rejected explicitly.
ALTER TABLE campaign_action_plan_executions
  ALTER COLUMN status SET DEFAULT 'executed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cap_exec_status'
  ) THEN
    ALTER TABLE campaign_action_plan_executions
      ADD CONSTRAINT chk_cap_exec_status
      CHECK (
        status IS NULL
        OR status IN ('proposed', 'approved', 'rejected', 'executed')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cap_exec_status_recorded
  ON campaign_action_plan_executions (status, recorded_at DESC);

COMMENT ON COLUMN campaign_action_plan_executions.status IS
  'proposed | approved | rejected | executed (OpenClaw / manual apply).';
COMMENT ON COLUMN campaign_action_plan_executions.reviewed_by IS
  'Who approved or rejected the plan (dashboard user id or name).';
COMMENT ON COLUMN campaign_action_plan_executions.reviewed_at IS
  'When the review decision was recorded.';
