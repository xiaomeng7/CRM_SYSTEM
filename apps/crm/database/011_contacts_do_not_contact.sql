-- Do Not Contact fields on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT;
