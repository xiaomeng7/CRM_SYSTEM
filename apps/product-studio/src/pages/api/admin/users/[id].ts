import type {NextApiRequest,NextApiResponse} from "next";
import {randomBytes} from "node:crypto";
import {hashSalesPassword,requireSalesStudioActor} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="PATCH")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  let actor;try{actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"USER_ADMIN");}catch{return res.status(403).json({error:"USER_ADMIN_REQUIRED"});}
  const id=String(req.query.id||""),action=String(req.body?.action||"");
  const {readContext}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{
    const current=await os.prisma.pos2SalesUser.findUnique({where:{id}});if(!current)return res.status(404).json({error:"USER_NOT_FOUND"});
    if(current.externalSubject===actor.userId&&["SUSPEND","ARCHIVE"].includes(action))return res.status(400).json({error:"CANNOT_DISABLE_SELF"});
    let data:Record<string,unknown>={},temporaryPassword:string|undefined;
    if(action==="RESET_PASSWORD"){temporaryPassword=`BH-${randomBytes(12).toString("base64url")}`;data={passwordHash:hashSalesPassword(temporaryPassword),mustChangePassword:true,passwordChangedAt:null,status:"ACTIVE"};}
    else if(action==="SUSPEND")data={status:"SUSPENDED"};
    else if(action==="ACTIVATE")data={status:"ACTIVE"};
    else if(action==="UPDATE"){const displayName=String(req.body?.displayName||"").trim(),role=String(req.body?.role||"").toUpperCase();if(!displayName||!["SALES","MANAGER","ADMIN"].includes(role))return res.status(400).json({error:"INVALID_USER"});data={displayName,role};}
    else return res.status(400).json({error:"INVALID_ACTION"});
    const user=await os.prisma.pos2SalesUser.update({where:{id},data,select:{id:true,email:true,displayName:true,role:true,status:true,mustChangePassword:true,lastLoginAt:true}});
    await os.prisma.pos2AuditLog.create({data:{actor:actor.userId,action:`SALES_USER_${action}`,entityType:"Pos2SalesUser",entityId:user.id,beforeJson:{role:current.role,status:current.status},afterJson:{role:user.role,status:user.status,mustChangePassword:user.mustChangePassword}}});
    return res.status(200).json({user,temporaryPassword});
  }catch{return res.status(400).json({error:"USER_ADMIN_FAILED"});}finally{await os.disconnect();}
}
