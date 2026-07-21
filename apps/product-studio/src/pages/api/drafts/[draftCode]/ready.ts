import type {NextApiRequest,NextApiResponse} from "next";
import {requireSalesStudioActor} from "@/server/sales-auth";
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  if(process.env.PRODUCT_STUDIO_ALLOW_DEV_DRAFT_WRITES!=="true")return res.status(503).json({error:"DEV_DRAFT_WRITES_DISABLED"});
  let actor;try{actor=requireSalesStudioActor(req);}catch(error){return res.status((error as {statusCode?:number}).statusCode||401).json({error:"SALES_STUDIO_AUTH_REQUIRED"});}
  const {readContext,salesLifecycleService}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{return res.status(200).json(await salesLifecycleService.createSalesLifecycleService(os.prisma).markReady(actor,String(req.query.draftCode||"")));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:"DRAFT_TRANSITION_FAILED"});}finally{await os.disconnect();}
}
