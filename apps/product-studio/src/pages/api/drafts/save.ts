import type {NextApiRequest,NextApiResponse} from "next";
import {requireSalesStudioActor} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  if(process.env.PRODUCT_STUDIO_ALLOW_DEV_DRAFT_WRITES!=="true")return res.status(503).json({error:"DEV_DRAFT_WRITES_DISABLED"});
  let actor;
  try{actor=requireSalesStudioActor(req);}catch(error){return res.status((error as {statusCode?:number}).statusCode||401).json({error:"SALES_STUDIO_AUTH_REQUIRED"});}
  const {salesAuthPolicy}=require("@bht/product-os/v2");
  try{salesAuthPolicy.assertCan(actor,"DRAFT_CREATE");}catch{return res.status(403).json({error:"SALES_STUDIO_FORBIDDEN"});}
  const {readContext,salesDraftService}=require("@bht/product-os/v2");
  const os=readContext.createProductOsV2ReadContext({envName:"neon_dev"});
  try{const service=salesDraftService.createSalesDraftService(os.prisma);const result=await service.saveProjection({draftCode:req.body?.draftCode,projection:req.body?.projection,actor:actor.userId,actorRole:actor.role});return res.status(200).json(result);}catch(error){return res.status(400).json({error:"DRAFT_SAVE_FAILED"});}finally{await os.disconnect();}
}
