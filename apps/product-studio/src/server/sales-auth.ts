import type {IncomingMessage, ServerResponse} from "node:http";
import type {NextApiRequest, NextApiResponse} from "next";
import {createHmac, timingSafeEqual} from "node:crypto";

const COOKIE_NAME="bh_sales_session";
const SESSION_SECONDS=60*60*12;

type RequestLike=Pick<IncomingMessage,"headers">;
type ResponseLike=Pick<ServerResponse,"setHeader">;
type SessionPayload={sub:string;email:string;role:"ADMIN";iat:number;exp:number};

function equalSecret(a:string,b:string){const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function configuredEmail(){return String(process.env.SALES_STUDIO_ADMIN_EMAIL||"").trim().toLowerCase();}
function sessionSecret(){const value=String(process.env.SALES_STUDIO_SESSION_SECRET||"");if(value.length<32)throw Object.assign(new Error("Sales Studio session secret is not configured"),{statusCode:503});return value;}
function encode(value:unknown){return Buffer.from(JSON.stringify(value)).toString("base64url");}
function sign(encoded:string){return createHmac("sha256",sessionSecret()).update(encoded).digest("base64url");}
function cookies(req:RequestLike){return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));}

export function isProductionAuthenticationConfigured(){return Boolean(configuredEmail()&&String(process.env.SALES_STUDIO_ADMIN_PASSWORD||"")&&String(process.env.SALES_STUDIO_SESSION_SECRET||"").length>=32);}

export function authenticateSingleAdmin(email:string,password:string){
  const expectedEmail=configuredEmail(),expectedPassword=String(process.env.SALES_STUDIO_ADMIN_PASSWORD||"");
  if(!expectedEmail||!expectedPassword||!sessionSecret())throw Object.assign(new Error("Sales Studio authentication is not configured"),{statusCode:503});
  if(email.trim().toLowerCase()!==expectedEmail||!equalSecret(password,expectedPassword))throw Object.assign(new Error("Invalid email or password"),{statusCode:401});
  const now=Math.floor(Date.now()/1000);const payload:SessionPayload={sub:`admin:${expectedEmail}`,email:expectedEmail,role:"ADMIN",iat:now,exp:now+SESSION_SECONDS};const encoded=encode(payload);return `${encoded}.${sign(encoded)}`;
}

export function actorFromRequest(req:RequestLike){
  if(process.env.SALES_STUDIO_AUTH_MODE==="single_admin_dev"&&process.env.NODE_ENV!=="production"){
    const email=String(process.env.SALES_STUDIO_SINGLE_ADMIN_EMAIL||"").trim().toLowerCase();if(!email)return null;return {userId:`dev:${email}`,email,role:"ADMIN" as const};
  }
  if(process.env.SALES_STUDIO_AUTH_MODE!=="single_admin_password")return null;
  try{const token=cookies(req)[COOKIE_NAME];if(!token)return null;const [encoded,suppliedSignature]=token.split(".");if(!encoded||!suppliedSignature||!equalSecret(suppliedSignature,sign(encoded)))return null;const payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as SessionPayload;const now=Math.floor(Date.now()/1000);if(payload.exp<=now||payload.email!==configuredEmail()||payload.role!=="ADMIN")return null;const {salesAuthPolicy}=require("@bht/product-os/v2");return salesAuthPolicy.normalizeActor({userId:payload.sub,email:payload.email,role:payload.role});}catch{return null;}
}

export function requireSalesStudioActor(req:NextApiRequest){const actor=actorFromRequest(req);if(!actor)throw Object.assign(new Error("Unauthorized"),{statusCode:401});return actor;}
export function setSessionCookie(res:NextApiResponse|ResponseLike,token:string){res.setHeader("Set-Cookie",`${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${process.env.NODE_ENV==="production"?"; Secure":""}`);}
export function clearSessionCookie(res:NextApiResponse|ResponseLike){res.setHeader("Set-Cookie",`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`);}
