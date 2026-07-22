import type {NextApiRequest,NextApiResponse} from "next";
import {randomBytes} from "node:crypto";
import {hashSalesPassword,requireSalesStudioActor} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  let actor;try{actor=requireSalesStudioActor(req);const {salesAuthPolicy}=require("@bht/product-os/v2");salesAuthPolicy.assertCan(actor,"USER_ADMIN");}catch{return res.status(403).json({error:"USER_ADMIN_REQUIRED"});}
  const {readContext}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{
    if(req.method==="GET"){const users=await os.prisma.pos2SalesUser.findMany({select:{id:true,email:true,displayName:true,role:true,status:true,mustChangePassword:true,lastLoginAt:true,createdAt:true},orderBy:[{status:"asc"},{displayName:"asc"}]});return res.status(200).json({users});}
    if(req.method==="POST"){
      const email=String(req.body?.email||"").trim().toLowerCase(),displayName=String(req.body?.displayName||"").trim(),role=String(req.body?.role||"SALES").toUpperCase();
      if(!/^\S+@\S+\.\S+$/.test(email)||!displayName||!["SALES","MANAGER","ADMIN"].includes(role))return res.status(400).json({error:"INVALID_USER"});
      const temporaryPassword=`BH-${randomBytes(12).toString("base64url")}`;
      const user=await os.prisma.pos2SalesUser.create({data:{email,displayName,role,status:"ACTIVE",authProvider:"LOCAL_PASSWORD",externalSubject:`sales:${email}`,passwordHash:hashSalesPassword(temporaryPassword),mustChangePassword:true},select:{id:true,email:true,displayName:true,role:true,status:true,mustChangePassword:true}});
      await os.prisma.pos2AuditLog.create({data:{actor:actor.userId,action:"SALES_USER_CREATED",entityType:"Pos2SalesUser",entityId:user.id,afterJson:{email:user.email,displayName:user.displayName,role:user.role,status:user.status}}});
      return res.status(201).json({user,temporaryPassword});
    }
    return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  }catch(error){if((error as {code?:string}).code==="P2002")return res.status(409).json({error:"EMAIL_ALREADY_EXISTS"});return res.status(400).json({error:"USER_ADMIN_FAILED"});}finally{await os.disconnect();}
}
