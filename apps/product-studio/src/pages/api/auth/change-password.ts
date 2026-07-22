import type {NextApiRequest,NextApiResponse} from "next";
import {actorFromRequest,hashSalesPassword,issueSalesSession,setSessionCookie,verifySalesPassword} from "@/server/sales-auth";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  const actor=actorFromRequest(req);if(!actor)return res.status(401).json({error:"AUTH_REQUIRED"});
  const currentPassword=String(req.body?.currentPassword||""),newPassword=String(req.body?.newPassword||"");
  if(newPassword.length<12||newPassword===currentPassword)return res.status(400).json({error:"PASSWORD_REQUIREMENTS"});
  const {readContext}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{
    const user=await os.prisma.pos2SalesUser.findFirst({where:{OR:[{externalSubject:actor.userId},{email:actor.email||""}]}});
    if(!user||user.status!=="ACTIVE"||!user.passwordHash||!verifySalesPassword(currentPassword,user.passwordHash))return res.status(401).json({error:"CURRENT_PASSWORD_INVALID"});
    await os.prisma.pos2SalesUser.update({where:{id:user.id},data:{passwordHash:hashSalesPassword(newPassword),mustChangePassword:false,passwordChangedAt:new Date()}});
    setSessionCookie(res,issueSalesSession({sub:user.externalSubject||user.id,email:user.email,role:user.role,mustChangePassword:false}));
    return res.status(200).json({ok:true});
  }finally{await os.disconnect();}
}
