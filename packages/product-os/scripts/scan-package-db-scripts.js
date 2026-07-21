#!/usr/bin/env node
/**
 * Fail if @bht/product-os package.json reintroduces unguarded DB-changing Prisma commands.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const scripts = pkg.scripts || {};

const forbiddenPatterns = [
  { re: /migrate\s+deploy/i, why: "unguarded prisma migrate deploy" },
  { re: /migrate\s+dev/i, why: "unguarded prisma migrate dev" },
  { re: /migrate\s+reset/i, why: "unguarded prisma migrate reset" },
  { re: /db\s+push/i, why: "unguarded prisma db push" },
  { re: /db\s+execute/i, why: "unguarded prisma db execute" }
];

let failures = 0;
for (const [name, cmd] of Object.entries(scripts)) {
  const text = String(cmd);
  // Allowed: prisma:migrate -> safe-prisma-migrate.js only
  if (name === "prisma:migrate") {
    if (!/safe-prisma-migrate\.js/.test(text)) {
      console.error(`FAIL script ${name}: must invoke safe-prisma-migrate.js`);
      failures += 1;
    }
    continue;
  }
  if (name === "prisma:migration-history:bootstrap-dev") {
    if (!/bootstrap-empty-prisma-migration-history\.js/.test(text)) {
      console.error(
        `FAIL script ${name}: must invoke bootstrap-empty-prisma-migration-history.js`
      );
      failures += 1;
    }
    continue;
  }
  if (/unguarded/i.test(name)) {
    console.error(`FAIL script ${name}: unguarded migration alias forbidden`);
    failures += 1;
  }
  for (const { re, why } of forbiddenPatterns) {
    if (re.test(text)) {
      console.error(`FAIL script ${name}: ${why} -> ${text}`);
      failures += 1;
    }
  }
}

if (failures) {
  process.exitCode = 1;
  console.error(`Package DB script scan failed (${failures}).`);
} else {
  console.log("Package DB script scan passed (no unguarded Product OS migrate/push).");
}
