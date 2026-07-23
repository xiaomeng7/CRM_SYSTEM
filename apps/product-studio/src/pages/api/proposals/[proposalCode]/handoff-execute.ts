import type {NextApiRequest,NextApiResponse} from "next";import {requireSalesStudioActor} from "@/server/sales-auth";
const ENABLE="ENABLE_DEV_BETTER_HOME_HANDOFF_PROXY";
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  let actor;try{actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE");}catch(error){return res.status((error as {statusCode?:number}).statusCode||403).json({error:"HANDOFF_EXECUTION_FORBIDDEN"});}
  if(process.env.PRODUCT_OS_DATABASE_ENV!=="neon_dev"||process.env.BETTER_HOME_HANDOFF_PROXY_ENABLED!==ENABLE)return res.status(503).json({error:"HANDOFF_EXECUTION_DISABLED"});
  const base=String(process.env.BETTER_HOME_CRM_INTERNAL_URL||"").replace(/\/$/,""),secret=String(process.env.BETTER_HOME_HANDOFF_INTERNAL_SECRET||""),handoffId=String(req.body?.handoffId||""),proposalCode=String(req.query.proposalCode||"");
  if(!base||!secret||!/^[0-9a-f-]{36}$/i.test(handoffId))return res.status(503).json({error:"HANDOFF_EXECUTION_NOT_CONFIGURED"});
  const {readContext,operationalHandoffService}=require("@bht/product-os/v2"),os=readContext.createProductOsV2ReadContext(),service=operationalHandoffService.createOperationalHandoffService(os.prisma);
  try{
    const begun=await service.beginExecution(actor,proposalCode,{handoffId});
    if(begun.alreadyCompleted)return res.status(200).json({ok:true,already_completed:true,handoff_status:"COMPLETED",job_uuid:begun.jobUuid});
    let response,result;
    try{response=await fetch(`${base}/api/internal/better-home-handoffs/${encodeURIComponent(handoffId)}/execute`,{method:"POST",headers:{"x-bh-handoff-secret":secret,"Content-Type":"application/json"},body:JSON.stringify(begun.envelope),signal:AbortSignal.timeout(30000)});result=await response.json();}catch(error){result={ok:false,error:error instanceof Error?error.message:"CRM_HANDOFF_UNAVAILABLE",error_code:"crm_handoff_unavailable"};}
    const finished=await service.finishExecution(actor,handoffId,result);
    return res.status(result.ok?200:(response?.status||502)).json({...result,handoff_status:finished.status});
  }catch(error){return res.status(400).json({error:error instanceof Error?error.message:"HANDOFF_EXECUTION_FAILED"});}finally{await os.disconnect();}
}
