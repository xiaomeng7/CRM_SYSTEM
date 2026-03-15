-- Reply Inbox: phone_digits + phone_raw for reliable inbound SMS matching.
-- Backward compatible: keep existing phone column; match by phone_digits or fallback.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_raw VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_digits VARCHAR(32);

-- Index for digits lookup (inbound webhook)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_digits
  ON contacts(phone_digits) WHERE phone_digits IS NOT NULL AND phone_digits <> '';

COMMENT ON COLUMN contacts.phone_raw IS 'Original phone as received (sync/manual).';
COMMENT ON COLUMN contacts.phone_digits IS 'Digits-only normalized for matching (e.g. 0412345678).';
