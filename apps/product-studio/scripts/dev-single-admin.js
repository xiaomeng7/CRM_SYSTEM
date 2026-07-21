const path = require("node:path");

if (process.env.NODE_ENV === "production") {
  throw new Error("The single-admin launcher is for local development only.");
}

if (typeof process.loadEnvFile !== "function") {
  throw new Error("This launcher requires a Node.js version with process.loadEnvFile().");
}

process.loadEnvFile(path.resolve(__dirname, "../../../.env"));
process.env.SALES_STUDIO_AUTH_MODE = "single_admin_dev";
process.env.SALES_STUDIO_SINGLE_ADMIN_EMAIL = "meng.z@bhtechnology.com.au";
process.env.PRODUCT_STUDIO_ALLOW_DEV_DRAFT_WRITES = "true";

process.argv = [process.argv[0], "next", "dev", "-p", "3010"];
require("next/dist/bin/next");
