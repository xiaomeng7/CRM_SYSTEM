-- Opportunity Stage Automation: stage_locked + audit log columns.

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_locked BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN opportunities.stage_locked IS 'When true, automation must not change stage (manual override).';

-- Extend automation_audit_log for stage automation (optional columns; payload still usable)
ALTER TABLE automation_audit_log ADD COLUMN IF NOT EXISTS action_type VARCHAR(100);
ALTER TABLE automation_audit_log ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE automation_audit_log ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE automation_audit_log ADD COLUMN IF NOT EXISTS trigger_event VARCHAR(100);
ALTER TABLE automation_audit_log ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_automation_audit_trigger_event ON automation_audit_log(trigger_event) WHERE trigger_event IS NOT NULL;
