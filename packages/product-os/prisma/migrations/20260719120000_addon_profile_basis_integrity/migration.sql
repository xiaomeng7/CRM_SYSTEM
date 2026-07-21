-- Product OS V2: an Add-on may extend an existing capability, an existing
-- equipment SKU, or both. It may never have neither basis.
ALTER TABLE "pos2_addon_profiles"
  ALTER COLUMN "extends_capability_id" DROP NOT NULL;

ALTER TABLE "pos2_addon_profiles"
  ADD CONSTRAINT "pos2_addon_profiles_basis_chk"
  CHECK (
    "extends_capability_id" IS NOT NULL
    OR "expands_sku_id" IS NOT NULL
  );

CREATE TABLE "pos2_addon_equipment_bases" (
  "id" UUID NOT NULL,
  "addon_product_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos2_addon_equipment_bases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_addon_equipment_bases_addon_product_id_fkey"
    FOREIGN KEY ("addon_product_id") REFERENCES "pos2_addon_profiles"("product_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pos2_addon_equipment_bases_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "pos2_equipment_skus"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pos2_addon_equipment_bases_addon_product_id_sku_id_key"
  ON "pos2_addon_equipment_bases"("addon_product_id", "sku_id");
CREATE UNIQUE INDEX "pos2_addon_equipment_bases_addon_product_id_sequence_key"
  ON "pos2_addon_equipment_bases"("addon_product_id", "sequence");
