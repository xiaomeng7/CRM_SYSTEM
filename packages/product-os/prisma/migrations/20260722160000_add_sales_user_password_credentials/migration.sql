-- Additive database-backed credentials for Sales Studio users.
-- Passwords are stored only as versioned scrypt hashes; plaintext is never persisted.
ALTER TABLE "pos2_sales_users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);

