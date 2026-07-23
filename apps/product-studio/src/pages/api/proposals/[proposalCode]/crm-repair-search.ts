import type {NextApiRequest,NextApiResponse} from "next";
import {requireSalesStudioActor} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="GET")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  try{const actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE");}catch(error){return res.status((error as {statusCode?:number}).statusCode||403).json({error:"CRM_REPAIR_FORBIDDEN"});}
  const base=String(process.env.BETTER_HOME_CRM_INTERNAL_URL||"").replace(/\/$/,""),secret=String(process.env.BETTER_HOME_HANDOFF_INTERNAL_SECRET||""),query=String(req.query.q||"").trim();
  if(!base||!secret)return res.status(503).json({error:"HANDOFF_CONNECTION_NOT_CONFIGURED"});
  if(query.length<2)return res.status(400).json({error:"Enter a customer, email, phone or address"});
  try{const response=await fetch(`${base}/api/internal/better-home-handoffs/crm-contexts/search?q=${encodeURIComponent(query)}`,{headers:{"x-bh-handoff-secret":secret},signal:AbortSignal.timeout(15000)});const result=await response.json();return res.status(response.ok?200:response.status).json(response.ok?{contexts:result.results||[]}:result);}catch(error){return res.status(502).json({error:error instanceof Error?error.message:"LIVE_CRM_SEARCH_UNAVAILABLE"});}
}
