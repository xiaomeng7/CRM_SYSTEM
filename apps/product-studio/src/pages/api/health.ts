import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const databaseEnvironment = String(process.env.PRODUCT_OS_DATABASE_ENV || "").trim();
  const configured = Boolean(databaseEnvironment);

  res.status(configured ? 200 : 503).json({
    service: "better-home-sales-studio",
    status: configured ? "ready" : "configuration_required",
    databaseEnvironment: configured ? databaseEnvironment : null,
  });
}
