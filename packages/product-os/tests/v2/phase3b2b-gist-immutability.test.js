/**
 * Phase 3B.2b — forbid non-immutable enum::text casts in V2 price GiST exclusion.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MIGRATION = path.join(
  __dirname,
  "../../prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql"
);

describe("Phase 3B.2b GiST exclusion immutability", () => {
  it("does not cast fulfilment_mode or tax_basis to text in EXCLUDE", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    assert.doesNotMatch(sql, /\(\(\"fulfilment_mode\"\)::text\)/);
    assert.doesNotMatch(sql, /\(\(\"tax_basis\"\)::text\)/);
    assert.match(
      sql,
      /EXCLUDE USING gist \([\s\S]*?"fulfilment_mode" WITH =,[\s\S]*?"tax_basis" WITH =,/
    );
  });

  it("records expected checksum after 3B.2b patch", () => {
    const sha = crypto
      .createHash("sha256")
      .update(fs.readFileSync(MIGRATION))
      .digest("hex");
    assert.equal(
      sha,
      "13ac20736dff5538432987fcb0d5d1518432e9968b8037b96fefd6bd99a31a55"
    );
  });
});
