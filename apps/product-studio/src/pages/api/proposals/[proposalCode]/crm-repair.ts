import type {NextApiRequest,NextApiResponse} from "next";
import {requireSalesStudioActor} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  let actor;try{actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE");}catch(error){return res.status((error as {statusCode?:number}).statusCode||403).json({error:"CRM_REPAIR_FORBIDDEN"});}
  const base=String(process.env.BETTER_HOME_CRM_INTERNAL_URL||"").replace(/\/$/,""),secret=String(process.env.BETTER_HOME_HANDOFF_INTERNAL_SECRET||""),opportunityId=String(req.body?.opportunityId||"");
  if(!base||!secret)return res.status(503).json({error:"HANDOFF_CONNECTION_NOT_CONFIGURED"});
  if(!/^[0-9a-f-]{36}$/i.test(opportunityId))return res.status(400).json({error:"VALID_CRM_OPPORTUNITY_REQUIRED"});
  try{
    const liveResponse=await fetch(`${base}/api/internal/better-home-handoffs/crm-contexts/${encodeURIComponent(opportunityId)}`,{headers:{"x-bh-handoff-secret":secret},signal:AbortSignal.timeout(15000)}),live=await liveResponse.json();
    if(!liveResponse.ok)return res.status(liveResponse.status).json(live);
    const x=live.context,{readContext,operationalHandoffService}=require("@bht/product-os/v2"),os=readContext.createProductOsV2ReadContext();
    try{return res.status(200).json(await operationalHandoffService.createOperationalHandoffService(os.prisma).repairCrmContext(actor,String(req.query.proposalCode||""),{opportunityId:x.opportunity_id,accountId:x.account_id,contactId:x.contact_id,assetId:x.asset_id,accountName:x.account_name,contactName:x.contact_name,assetName:x.asset_name,assetAddress:x.asset_address,email:x.email,phone:x.phone}));}finally{await os.disconnect();}
  }catch(error){return res.status(502).json({error:error instanceof Error?error.message:"CRM_REPAIR_FAILED"});}
}
