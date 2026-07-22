import type { NextApiRequest, NextApiResponse } from "next";
import {isProductionAuthenticationConfigured} from "@/server/sales-auth";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const databaseEnvironment = String(process.env.PRODUCT_OS_DATABASE_ENV || "").trim();
  const authMode = String(process.env.SALES_STUDIO_AUTH_MODE || "").trim();
  const authenticationConfigured = authMode === "single_admin_dev"
    ? process.env.NODE_ENV !== "production"
    : isProductionAuthenticationConfigured();
  let databaseConfigured = false;
  try {
    const {envGuard}=require("@bht/product-os/v2");
    envGuard.assertProductOsDatabaseTarget({envName:databaseEnvironment,requireUrl:true,requireFingerprint:true,productionConfirmed:databaseEnvironment==="production",productionConfirmValue:databaseEnvironment==="production"?process.env.PRODUCT_OS_PRODUCTION_CONFIRM:null});
    databaseConfigured = true;
  } catch {}
  let catalogReady=false;
  if(databaseConfigured){try{const {getSalesCatalog}=await import("@/server/catalog-cache");catalogReady=(await getSalesCatalog()).length>0;}catch{catalogReady=false;}}
  const configured = Boolean(databaseConfigured && authenticationConfigured && catalogReady);

  res.status(configured ? 200 : 503).json({
    service: "better-home-sales-studio",
    status: configured ? "ready" : "configuration_required",
    databaseEnvironment: databaseConfigured ? databaseEnvironment : null,
    databaseConfigured,
    authenticationConfigured,
    catalogReady,
  });
}
