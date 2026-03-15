-- Quote Acceptance Automation: opportunity probability (forecast), task_type for job_preparation.

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS probability NUMERIC(5, 2);

COMMENT ON COLUMN opportunities.probability IS 'Revenue forecast probability 0-100. Set to 100 when quote accepted.';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(50);

COMMENT ON COLUMN tasks.task_type IS 'Task type e.g. job_preparation for quote-accepted automation.';

CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type) WHERE task_type IS NOT NULL;
