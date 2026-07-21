ALTER TABLE "pos2_operational_handoffs"
  ADD COLUMN "authorized_payload_snapshot" JSONB;

ALTER TABLE "pos2_operational_handoffs"
  ADD CONSTRAINT "pos2_operational_handoffs_authorized_snapshot_chk"
  CHECK (("authorized_at" IS NULL AND "authorized_payload_snapshot" IS NULL)
    OR ("authorized_at" IS NOT NULL AND "authorized_payload_snapshot" IS NOT NULL));
