import type {NextApiRequest} from "next";
import {timingSafeEqual} from "node:crypto";

function equalSecret(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}

export function requireSalesStudioActor(req:NextApiRequest){
  if(process.env.SALES_STUDIO_AUTH_MODE==="single_admin_dev"&&process.env.NODE_ENV!=="production"){
    const email=String(process.env.SALES_STUDIO_SINGLE_ADMIN_EMAIL||"").trim().toLowerCase();
    if(!email)throw Object.assign(new Error("Single admin is not configured"),{statusCode:503});
    const {salesAuthPolicy}=require("@bht/product-os/v2");
    return salesAuthPolicy.normalizeActor({userId:`dev:${email}`,email,role:"ADMIN"});
  }
  if(process.env.SALES_STUDIO_AUTH_MODE!=="dev_token")throw Object.assign(new Error("Sales Studio authentication is not configured"),{statusCode:503});
  const expected=process.env.SALES_STUDIO_DEV_TOKEN||"";
  const supplied=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!expected||!supplied||!equalSecret(supplied,expected))throw Object.assign(new Error("Unauthorized"),{statusCode:401});
  const {salesAuthPolicy}=require("@bht/product-os/v2");
  return salesAuthPolicy.normalizeActor({userId:req.headers["x-sales-user-id"],email:req.headers["x-sales-user-email"],role:req.headers["x-sales-user-role"]});
}
