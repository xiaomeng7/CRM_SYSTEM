-- Optional plan payload for executors (e.g. OpenClaw): snapshot at approval time.

ALTER TABLE campaign_action_plan_executions
  ADD COLUMN IF NOT EXISTS details JSONB;

COMMENT ON COLUMN campaign_action_plan_executions.details IS
  'JSON snapshot (e.g. percentage_change, suggested_new_daily_budget) from dashboard when approving.';
