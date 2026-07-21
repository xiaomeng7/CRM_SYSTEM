const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"../../prisma/migrations/20260719190000_add_sales_users_customer_links/migration.sql"),"utf8");
test("sales identity migration is additive and protects customer confirmation",()=>{assert.match(sql,/CREATE TABLE "pos2_sales_users"/);assert.match(sql,/CREATE TABLE "pos2_draft_customer_links"/);assert.match(sql,/confirmation_chk/);assert.doesNotMatch(sql,/DROP\s+(TABLE|TYPE)/i);});
