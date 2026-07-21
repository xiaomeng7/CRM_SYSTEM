#!/usr/bin/env node
const {PrismaClient}=require("@prisma/client");
const {assertProductOsDatabaseTarget,resolveDatabaseUrlForEnv}=require("../src/v2/env-guard");

function arg(name){const prefix=`--${name}=`;return process.argv.find(x=>x.startsWith(prefix))?.slice(prefix.length)||"";}
async function main(){
  if(!process.argv.includes("--execute-approved-dev-user"))throw new Error("Explicit DEV user registration approval flag required");
  const email=arg("email").trim().toLowerCase(),displayName=arg("display-name").trim(),role=arg("role").trim().toUpperCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||!displayName||!["SALES","MANAGER","ADMIN"].includes(role))throw new Error("Valid email, display-name and role required");
  assertProductOsDatabaseTarget({envName:"neon_dev",requireUrl:true,requireFingerprint:true});
  const prisma=new PrismaClient({datasourceUrl:resolveDatabaseUrlForEnv("neon_dev")});
  try{const user=await prisma.pos2SalesUser.upsert({where:{email},update:{displayName,role,status:"ACTIVE"},create:{email,displayName,role,status:"ACTIVE",authProvider:"DEV_PENDING",externalSubject:`dev:${email}`}});console.log(JSON.stringify({registered:true,userId:user.id,email:user.email,role:user.role,status:user.status,authProvider:user.authProvider}));}finally{await prisma.$disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
