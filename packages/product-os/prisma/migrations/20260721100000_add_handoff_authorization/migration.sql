ALTER TABLE "pos2_operational_handoffs"
  ADD COLUMN "authorized_by_user_id" UUID,
  ADD COLUMN "authorized_payload_hash" TEXT,
  ADD COLUMN "authorized_at" TIMESTAMPTZ(6);

ALTER TABLE "pos2_operational_handoffs"
  ADD CONSTRAINT "pos2_operational_handoffs_authorizer_fkey"
  FOREIGN KEY ("authorized_by_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos2_operational_handoffs_authorization_chk"
  CHECK (("authorized_by_user_id" IS NULL AND "authorized_payload_hash" IS NULL AND "authorized_at" IS NULL)
    OR ("authorized_by_user_id" IS NOT NULL AND "authorized_payload_hash" IS NOT NULL AND "authorized_at" IS NOT NULL));

CREATE INDEX "pos2_operational_handoffs_authorized_idx"
  ON "pos2_operational_handoffs"("status","authorized_at") WHERE "authorized_at" IS NOT NULL;
