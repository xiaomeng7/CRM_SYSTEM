-- Product Owner approved 2026-07-27: water leak monitoring runtime inventory.
-- Additive only. Catalogue facts are imported through the governed ImportPlan.

CREATE TYPE "Pos2DeviceOnlineStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE');
CREATE TYPE "Pos2WaterLeakAlarmStatus" AS ENUM ('CLEAR', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "Pos2WaterShutoffUpgradeStatus" AS ENUM ('FUTURE_OPTION', 'SITE_REVIEW_REQUIRED', 'APPROVED', 'INSTALLED', 'NOT_SUITABLE');

CREATE TABLE "pos2_water_leak_points" (
  "id" UUID NOT NULL,
  "site_reference" TEXT NOT NULL,
  "collection_product_id" UUID NOT NULL,
  "room_name" TEXT NOT NULL,
  "installation_location" TEXT NOT NULL,
  "customer_display_name" TEXT NOT NULL,
  "sensor_device_id" TEXT NOT NULL,
  "gateway_reference" TEXT,
  "online_status" "Pos2DeviceOnlineStatus" NOT NULL DEFAULT 'UNKNOWN',
  "battery_percent" INTEGER,
  "last_seen_at" TIMESTAMPTZ(6),
  "last_tested_at" TIMESTAMPTZ(6),
  "alarm_status" "Pos2WaterLeakAlarmStatus" NOT NULL DEFAULT 'CLEAR',
  "alarm_at" TIMESTAMPTZ(6),
  "is_away_extended_protection" BOOLEAN NOT NULL DEFAULT false,
  "automatic_shutoff_configured" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_water_leak_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_water_leak_points_sensor_device_id_key" UNIQUE ("sensor_device_id"),
  CONSTRAINT "pos2_water_leak_points_battery_percent_chk" CHECK ("battery_percent" IS NULL OR ("battery_percent" >= 0 AND "battery_percent" <= 100))
);

CREATE TABLE "pos2_water_shutoff_upgrades" (
  "id" UUID NOT NULL,
  "water_leak_point_id" UUID,
  "site_reference" TEXT NOT NULL,
  "status" "Pos2WaterShutoffUpgradeStatus" NOT NULL DEFAULT 'FUTURE_OPTION',
  "valve_type" TEXT,
  "site_assessment_notes" TEXT,
  "has_manual_operation" BOOLEAN NOT NULL DEFAULT false,
  "has_position_feedback" BOOLEAN NOT NULL DEFAULT false,
  "automatic_reopen_permitted" BOOLEAN NOT NULL DEFAULT false,
  "gas_installation" BOOLEAN NOT NULL DEFAULT false,
  "qualified_installer_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_water_shutoff_upgrades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_water_shutoff_upgrades_water_leak_point_id_key" UNIQUE ("water_leak_point_id"),
  CONSTRAINT "pos2_water_shutoff_no_auto_reopen_chk" CHECK ("automatic_reopen_permitted" = false)
);

CREATE INDEX "pos2_water_leak_points_site_reference_room_name_idx" ON "pos2_water_leak_points"("site_reference", "room_name");
CREATE INDEX "pos2_water_leak_points_gateway_reference_online_status_idx" ON "pos2_water_leak_points"("gateway_reference", "online_status");
CREATE INDEX "pos2_water_leak_points_alarm_status_alarm_at_idx" ON "pos2_water_leak_points"("alarm_status", "alarm_at");
CREATE INDEX "pos2_water_leak_points_collection_product_id_is_away_extended_protection_idx" ON "pos2_water_leak_points"("collection_product_id", "is_away_extended_protection");
CREATE INDEX "pos2_water_shutoff_upgrades_site_reference_status_idx" ON "pos2_water_shutoff_upgrades"("site_reference", "status");

ALTER TABLE "pos2_water_leak_points" ADD CONSTRAINT "pos2_water_leak_points_collection_product_id_fkey" FOREIGN KEY ("collection_product_id") REFERENCES "pos2_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos2_water_shutoff_upgrades" ADD CONSTRAINT "pos2_water_shutoff_upgrades_water_leak_point_id_fkey" FOREIGN KEY ("water_leak_point_id") REFERENCES "pos2_water_leak_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
