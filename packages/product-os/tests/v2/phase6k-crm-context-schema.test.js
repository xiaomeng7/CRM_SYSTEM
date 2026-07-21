const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"../../prisma/migrations/20260720120000_add_crm_sales_context_links/migration.sql"),"utf8");
test("CRM sales-context migration is additive boundary linking only",()=>{assert.match(sql,/crm_account_id/);assert.match(sql,/crm_asset_id/);assert.match(sql,/crm_opportunity_id/);assert.doesNotMatch(sql,/REFERENCES\s+(accounts|contacts|assets|opportunities)/i);assert.doesNotMatch(sql,/DROP\s+(TABLE|COLUMN|TYPE)/i);});
