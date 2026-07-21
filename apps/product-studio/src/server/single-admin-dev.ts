export function getSingleAdminDevActor(){
  if(process.env.SALES_STUDIO_AUTH_MODE!=="single_admin_dev")return null;
  if(process.env.NODE_ENV==="production"&&process.env.SALES_STUDIO_ALLOW_SINGLE_ADMIN_PRODUCTION!=="true")return null;
  const email=String(process.env.SALES_STUDIO_SINGLE_ADMIN_EMAIL||"").trim().toLowerCase();
  if(!email)return null;
  return {userId:`dev:${email}`,email,role:"ADMIN" as const};
}
