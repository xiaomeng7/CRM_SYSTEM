-- Add intent classification fields to activities
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intent_confidence FLOAT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intent_classified BOOLEAN DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intent_source TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP WITH TIME ZONE;
