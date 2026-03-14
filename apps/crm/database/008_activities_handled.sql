-- Add handled column to activities for Reply Inbox
-- Used to mark inbound SMS replies as manually handled
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS handled BOOLEAN DEFAULT FALSE;
