-- Advisory applications for BHT Energy Decision Advisory (Adelaide Pilot)
-- Run: psql "$NEON_DATABASE_URL" -f migrations/002_advisory_applications.sql

CREATE TABLE IF NOT EXISTS advisory_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  suburb TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('House', 'Townhouse', 'Other')),
  solar_battery_status TEXT NOT NULL CHECK (solar_battery_status IN ('None', 'Considering', 'Already have solar', 'Already have battery')),
  bill_range TEXT NOT NULL CHECK (bill_range IN ('under $2k', '$2–3k', '$3–4k', '$4k+')),
  contact_time TEXT NOT NULL CHECK (contact_time IN ('Morning', 'Afternoon', 'Evening')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'payment_sent', 'booked', 'closed')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  page_url TEXT,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_advisory_applications_created_at ON advisory_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advisory_applications_status ON advisory_applications (status);
