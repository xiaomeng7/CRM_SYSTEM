#!/usr/bin/env node
const fs=require("node:fs");const path=require("node:path");const {Pool}=require("pg");
const {assertProductOsDatabaseTarget,resolveDatabaseUrlForEnv}=require("../../../packages/product-os/src/v2/env-guard");
require("../lib/load-env");
async function main(){
  const verifyOnly=process.argv.includes("--verify-only");
  if(!verifyOnly&&!process.argv.includes("--execute-approved-dev-migration"))throw new Error("DEV migration disabled without --execute-approved-dev-migration");
  const gate=assertProductOsDatabaseTarget({envName:"neon_dev",requireFingerprint:true,requireUrl:true});
  const url=resolveDatabaseUrlForEnv("neon_dev");
  console.log(JSON.stringify({crmMigration:true,env:"neon_dev",hostFingerprint:gate.hostFingerprint,migration:"082_better_home_commercial_channel.sql"}));
  const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:false}});
  try{if(verifyOnly){const result=await pool.query(`SELECT COUNT(*)::int AS column_count FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name IN ('asset_id','commercial_channel')`);const eligible=await pool.query(`SELECT COUNT(*)::int AS eligible_count FROM opportunities WHERE commercial_channel='BETTER_HOME_PROPOSAL'`);console.log(JSON.stringify({verified:result.rows[0].column_count===2,columns:result.rows[0].column_count,eligibleBetterHomeOpportunities:eligible.rows[0].eligible_count}));return;}const sql=fs.readFileSync(path.join(__dirname,"../database/082_better_home_commercial_channel.sql"),"utf8");await pool.query("BEGIN");await pool.query(sql);await pool.query("COMMIT");console.log("082_better_home_commercial_channel.sql applied to Neon DEV");}catch(error){await pool.query("ROLLBACK").catch(()=>{});throw error;}finally{await pool.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
