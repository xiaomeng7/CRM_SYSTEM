import type {NextApiRequest,NextApiResponse} from "next";
import {requireSalesStudioActor} from "@/server/sales-auth";
import {buildProposalEmail} from "@/server/proposal-email";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  let actor;try{actor=requireSalesStudioActor(req);}catch(error){return res.status((error as {statusCode?:number}).statusCode||401).json({error:"SALES_STUDIO_AUTH_REQUIRED"});}
  const {readContext,salesAuthPolicy,salesStudioService,salesLifecycleService}=require("@bht/product-os/v2");
  try{salesAuthPolicy.assertCan(actor,"PROPOSAL_SEND_OWN");}catch{return res.status(403).json({error:"SALES_STUDIO_FORBIDDEN"});}
  const os=readContext.createProductOsV2ReadContext();
  try{
    const proposal=await salesStudioService.createSalesStudioService(os.prisma).proposalDetail(actor,String(req.query.proposalCode||""));
    if(!proposal)return res.status(404).json({error:"PROPOSAL_NOT_FOUND"});
    if(proposal.status!=="APPROVED")return res.status(409).json({error:"PROPOSAL_MUST_BE_APPROVED"});
    const recipient=String(req.body?.recipient||proposal.draft.customerEmail||"").trim().toLowerCase();
    if(!recipient||recipient!==String(proposal.draft.customerEmail||"").trim().toLowerCase())return res.status(400).json({error:"CONFIRMED_CUSTOMER_EMAIL_REQUIRED"});
    const apiKey=String(process.env.RESEND_API_KEY||"").trim(),from=String(process.env.SALES_STUDIO_EMAIL_FROM||"Better Home <sales@bhtechnology.com.au>").trim();
    if(!apiKey)return res.status(503).json({error:"EMAIL_DELIVERY_NOT_CONFIGURED"});
    const email=buildProposalEmail(proposal);
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],reply_to:actor.email||undefined,subject:email.subject,html:email.html})});
    const result=await response.json() as {id?:string;message?:string};
    if(!response.ok||!result.id)return res.status(502).json({error:"EMAIL_DELIVERY_FAILED"});
    const recorded=await salesLifecycleService.createSalesLifecycleService(os.prisma).recordProposalDelivery(actor,proposal.proposalCode,{channel:"EMAIL",recipient,evidenceReference:`resend:${result.id}`});
    return res.status(200).json({proposalCode:proposal.proposalCode,status:recorded.status,recipient,deliveredAt:recorded.deliveredAt});
  }catch(error){return res.status(400).json({error:error instanceof Error?error.message:"EMAIL_DELIVERY_FAILED"});}
  finally{await os.disconnect();}
}
