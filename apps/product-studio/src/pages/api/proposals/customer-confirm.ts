import {createHash} from "crypto";
import type {NextApiRequest,NextApiResponse} from "next";
import {proposalConfirmationSecret,verifyProposalConfirmationToken} from "@/server/proposal-confirmation";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  const token=String(req.body?.token||""),acceptedByName=String(req.body?.acceptedByName||"").trim();
  if(!acceptedByName||req.body?.confirmed!==true)return res.status(400).json({error:"EXPLICIT_CONFIRMATION_REQUIRED"});
  let claim;try{claim=verifyProposalConfirmationToken(token,proposalConfirmationSecret());}catch(error){return res.status(400).json({error:error instanceof Error?error.message:"INVALID_CONFIRMATION_LINK"});}
  const {readContext,salesLifecycleService}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{
    const proposal=await os.prisma.pos2Proposal.findUnique({where:{proposalCode:claim.proposalCode},include:{draftVersion:{include:{draft:{include:{ownerUser:true,customerLink:true}}}},acceptance:true}});
    if(!proposal)return res.status(404).json({error:"PROPOSAL_NOT_FOUND"});
    const draft=proposal.draftVersion.draft,email=String(draft.customerEmail||"").trim().toLowerCase();
    if(proposal.selectionFingerprint!==claim.fingerprint||email!==claim.customerEmail)return res.status(400).json({error:"CONFIRMATION_LINK_DOES_NOT_MATCH"});
    if(!draft.ownerUser)return res.status(409).json({error:"PROPOSAL_OWNER_REQUIRED"});
    const actor={userId:draft.ownerUser.externalSubject,email:draft.ownerUser.email,role:draft.ownerUser.role};
    const evidence=createHash("sha256").update(token).digest("hex").slice(0,24);
    const result=await salesLifecycleService.createSalesLifecycleService(os.prisma).recordProposalAcceptance(actor,proposal.proposalCode,{method:"PORTAL",evidenceReference:`customer-confirmation:${evidence}`,acceptedByName,acceptedByContact:email});
    return res.status(200).json({proposalCode:proposal.proposalCode,status:result.status,acceptedAt:result.acceptedAt||proposal.acceptance?.acceptedAt});
  }catch(error){return res.status(400).json({error:error instanceof Error?error.message:"PROPOSAL_CONFIRMATION_FAILED"});}
  finally{await os.disconnect();}
}
