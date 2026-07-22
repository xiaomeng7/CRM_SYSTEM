import type {IncomingMessage, ServerResponse} from "node:http";
import type {NextApiRequest, NextApiResponse} from "next";
import {createHmac, randomBytes, scryptSync, timingSafeEqual} from "node:crypto";

const COOKIE_NAME="bh_sales_session";
const SESSION_SECONDS=60*60*12;
const SCRYPT_N=16384;
const SCRYPT_R=8;
const SCRYPT_P=1;

type SalesRole="SALES"|"MANAGER"|"ADMIN";
type RequestLike=Pick<IncomingMessage,"headers">;
type ResponseLike=Pick<ServerResponse,"setHeader">;
type SessionPayload={sub:string;email:string;role:SalesRole;mustChangePassword:boolean;iat:number;exp:number};

function equalSecret(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function configuredEmail(){return String(process.env.SALES_STUDIO_ADMIN_EMAIL||"").trim().toLowerCase();}
function sessionSecret(){const value=String(process.env.SALES_STUDIO_SESSION_SECRET||"");if(value.length<32)throw Object.assign(new Error("Sales Studio session secret is not configured"),{statusCode:503});return value;}
function encode(value:unknown){return Buffer.from(JSON.stringify(value)).toString("base64url");}
function sign(encoded:string){return createHmac("sha256",sessionSecret()).update(encoded).digest("base64url");}
function cookies(req:RequestLike){return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));}
function tokenFor(payload:Omit<SessionPayload,"iat"|"exp">){const now=Math.floor(Date.now()/1000),encoded=encode({...payload,iat:now,exp:now+SESSION_SECONDS});return `${encoded}.${sign(encoded)}`;}

export function hashSalesPassword(password:string){
  if(password.length<12)throw new Error("Password must contain at least 12 characters");
  const salt=randomBytes(16),hash=scryptSync(password,salt,64,{N:SCRYPT_N,r:SCRYPT_R,p:SCRYPT_P,maxmem:64*1024*1024});
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifySalesPassword(password:string,encodedHash:string){
  try{const [kind,nValue,rValue,pValue,saltValue,hashValue]=encodedHash.split("$");if(kind!=="scrypt")return false;const expected=Buffer.from(hashValue,"base64url"),actual=scryptSync(password,Buffer.from(saltValue,"base64url"),expected.length,{N:Number(nValue),r:Number(rValue),p:Number(pValue),maxmem:64*1024*1024});return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}
}

export function isProductionAuthenticationConfigured(){return Boolean(String(process.env.SALES_STUDIO_SESSION_SECRET||"").length>=32&&(configuredEmail()&&String(process.env.SALES_STUDIO_ADMIN_PASSWORD||"")||process.env.SALES_STUDIO_AUTH_MODE==="database_users"));}

export async function authenticateSalesStudioUser(email:string,password:string){
  const normalizedEmail=email.trim().toLowerCase();
  if(!normalizedEmail||!password||!sessionSecret())throw Object.assign(new Error("Sales Studio authentication is not configured"),{statusCode:503});
  const expectedEmail=configuredEmail(),expectedPassword=String(process.env.SALES_STUDIO_ADMIN_PASSWORD||"");
  if(process.env.SALES_STUDIO_AUTH_MODE!=="database_users"&&expectedEmail&&expectedPassword&&normalizedEmail===expectedEmail&&equalSecret(password,expectedPassword)){
    return {token:tokenFor({sub:`admin:${expectedEmail}`,email:expectedEmail,role:"ADMIN",mustChangePassword:false}),mustChangePassword:false};
  }
  const {readContext}=require("@bht/product-os/v2");const os=readContext.createProductOsV2ReadContext();
  try{
    const user=await os.prisma.pos2SalesUser.findUnique({where:{email:normalizedEmail}});
    if(!user||user.status!=="ACTIVE"||!user.passwordHash||!verifySalesPassword(password,user.passwordHash))throw Object.assign(new Error("Invalid email or password"),{statusCode:401});
    await os.prisma.pos2SalesUser.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
    const mustChangePassword=Boolean(user.mustChangePassword);
    return {token:tokenFor({sub:user.externalSubject||user.id,email:user.email,role:user.role,mustChangePassword}),mustChangePassword};
  }finally{await os.disconnect();}
}

export function issueSalesSession(input:{sub:string;email:string;role:SalesRole;mustChangePassword:boolean}){return tokenFor(input);}

export function actorFromRequest(req:RequestLike){
  if(process.env.SALES_STUDIO_AUTH_MODE==="single_admin_dev"&&process.env.NODE_ENV!=="production"){
    const email=String(process.env.SALES_STUDIO_SINGLE_ADMIN_EMAIL||"").trim().toLowerCase();if(!email)return null;return {userId:`dev:${email}`,email,role:"ADMIN" as const,mustChangePassword:false};
  }
  if(!["single_admin_password","database_users"].includes(String(process.env.SALES_STUDIO_AUTH_MODE||"")))return null;
  try{const token=cookies(req)[COOKIE_NAME];if(!token)return null;const [encoded,suppliedSignature]=token.split(".");if(!encoded||!suppliedSignature||!equalSecret(suppliedSignature,sign(encoded)))return null;const payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as SessionPayload;const now=Math.floor(Date.now()/1000);if(payload.exp<=now||!payload.email||!["SALES","MANAGER","ADMIN"].includes(payload.role))return null;const {salesAuthPolicy}=require("@bht/product-os/v2");return {...salesAuthPolicy.normalizeActor({userId:payload.sub,email:payload.email,role:payload.role}),mustChangePassword:Boolean(payload.mustChangePassword)};}catch{return null;}
}

export function requireSalesStudioActor(req:NextApiRequest){const actor=actorFromRequest(req);if(!actor)throw Object.assign(new Error("Unauthorized"),{statusCode:401});if(actor.mustChangePassword)throw Object.assign(new Error("Password change required"),{statusCode:428});return actor;}
export function setSessionCookie(res:NextApiResponse|ResponseLike,token:string){res.setHeader("Set-Cookie",`${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${process.env.NODE_ENV==="production"?"; Secure":""}`);}
export function clearSessionCookie(res:NextApiResponse|ResponseLike){res.setHeader("Set-Cookie",`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`);}
