import type {NextApiRequest,NextApiResponse} from "next";import {requireSalesStudioActor} from "@/server/sales-auth";
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  let actor;try{actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE");}catch(error){return res.status((error as {statusCode?:number}).statusCode||403).json({error:"HANDOFF_DRY_RUN_FORBIDDEN"});}
  const base=String(process.env.BETTER_HOME_CRM_INTERNAL_URL||"").replace(/\/$/,""),secret=String(process.env.BETTER_HOME_HANDOFF_INTERNAL_SECRET||""),handoffId=String(req.body?.handoffId||""),proposalCode=String(req.query.proposalCode||"");
  if(!base||!secret||!/^[0-9a-f-]{36}$/i.test(handoffId))return res.status(503).json({error:"HANDOFF_CONNECTION_NOT_CONFIGURED"});
  const {readContext,operationalHandoffService}=require("@bht/product-os/v2"),os=readContext.createProductOsV2ReadContext();
  try{const envelope=await operationalHandoffService.createOperationalHandoffService(os.prisma).executionEnvelope(actor,proposalCode,{handoffId});const response=await fetch(`${base}/api/internal/better-home-handoffs/${encodeURIComponent(handoffId)}/dry-run`,{method:"POST",headers:{"x-bh-handoff-secret":secret,"Content-Type":"application/json"},body:JSON.stringify(envelope),signal:AbortSignal.timeout(15000)});const result=await response.json();return res.status(response.ok?200:response.status).json(result);}catch(error){return res.status(502).json({error:error instanceof Error?error.message:"CRM_HANDOFF_DRY_RUN_UNAVAILABLE"});}finally{await os.disconnect();}
}
